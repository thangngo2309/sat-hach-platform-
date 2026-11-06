import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parseBc1 } from '../imports/bc1-parser.js';
import { parseBc2 } from '../imports/bc2-parser.js';
import { parseExamList } from '../imports/exam-list-parser.js';
import { ExamResultImportService } from '../imports/exam-result-import.service.js';

import type { FileType } from './file-submissions.service.js';

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

const MAX_XML_BYTES = 64 * 1024 * 1024;

type Bc1Match = {
  id: number;
  storageKey: string;
  reportCode: string | null;
};

type SessionMatch = {
  id: number;
  code: string;
  centerCode: string;
  examDate: string | null;
};

export type ResolvedXmlLink = {
  examinationSessionId: number | null;
  metadata: Record<string, string>;
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim();
}

function normalizeCode(value: unknown): string {
  return normalize(value).toUpperCase();
}

function optionalSessionId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    throw new BadRequestException('ID kỳ sát hạch không hợp lệ.');
  }

  return parsed;
}

@Injectable()
export class FileSubmissionXmlLinkService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly examResultImport: ExamResultImportService,
  ) {}

  private async readXml(file?: Express.Multer.File): Promise<Buffer> {
    if (!file?.path || !/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('BC1, BC2, 48_ và KQSH phải là file XML.');
    }

    const info = await stat(file.path);

    if (!info.isFile() || info.size <= 0 || info.size > MAX_XML_BYTES) {
      throw new BadRequestException(
        'File XML rỗng hoặc vượt giới hạn phân tích 64 MB.',
      );
    }

    return readFile(file.path);
  }

  private async schoolCode(schoolId: number | null) {
    if (!schoolId) {
      throw new BadRequestException('Tài khoản chưa được gắn cơ sở đào tạo.');
    }

    const rows: Array<{ code: string }> = await this.db.query(
      `
            SELECT code
            FROM training_schools
            WHERE id = $1
            LIMIT 1
          `,
      [schoolId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy cơ sở đào tạo.');
    }

    return normalizeCode(rows[0].code);
  }

  private async centerCode(centerId: number | null) {
    if (!centerId) {
      throw new BadRequestException('Chưa xác định trung tâm sát hạch.');
    }

    const rows: Array<{ code: string }> = await this.db.query(
      `
            SELECT code
            FROM examination_centers
            WHERE id = $1
            LIMIT 1
          `,
      [centerId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy trung tâm sát hạch.');
    }

    return normalizeCode(rows[0].code);
  }

  private async findBc1(schoolId: number, bc1Code: string): Promise<Bc1Match> {
    const rows: Bc1Match[] = await this.db.query(
      `
          SELECT
            fs.id,
            v.storage_key AS "storageKey",
            ib.report_code AS "reportCode"
          FROM file_submissions fs
  
          JOIN file_submission_versions v
            ON v.submission_id = fs.id
           AND v.version = fs.current_version
  
          JOIN import_batches ib
            ON ib.id = fs.import_batch_id
           AND ib.file_sha256 = v.sha256
  
          WHERE fs.file_type = 'bc1'
            AND fs.training_school_id = $1
            AND fs.status = 'approved'
            AND fs.import_status = 'completed'
            AND UPPER(TRIM(ib.report_code)) = $2
  
          ORDER BY fs.id DESC
          LIMIT 2
        `,
      [schoolId, bc1Code],
    );

    if (!rows.length) {
      throw new BadRequestException(
        `Chưa tìm thấy BC1 mã ${bc1Code} đã được duyệt ` +
          'và import thành công tại CSĐT này. ' +
          'Vui lòng hoàn tất BC1 trước khi gửi BC2.',
      );
    }

    if (rows.length > 1) {
      throw new ConflictException(
        `Có nhiều hồ sơ BC1 cùng mã ${bc1Code}. ` +
          'Cần đối soát dữ liệu trước khi gửi BC2.',
      );
    }

    return rows[0];
  }

  private async findOfficialSession(code: string): Promise<SessionMatch> {
    const rows: SessionMatch[] = await this.db.query(
      `
          SELECT
            es.id,
            es.code,
            ec.code AS "centerCode",
            es.exam_date::text AS "examDate"
          FROM examination_sessions es
  
          JOIN examination_centers ec
            ON ec.id = es.examination_center_id
  
          JOIN file_submissions fs
            ON fs.examination_session_id = es.id
           AND fs.file_type = 'exam_48'
           AND fs.status = 'approved'
           AND fs.import_status = 'completed'
  
          WHERE UPPER(TRIM(es.official_code)) = $1
  
          ORDER BY es.id DESC
          LIMIT 2
        `,
      [code],
    );

    if (!rows.length) {
      throw new BadRequestException(
        `Chưa có kỳ sát hạch chính thức mã ${code} ` +
          'được tạo từ file 48_ đã duyệt.',
      );
    }

    if (rows.length > 1) {
      throw new ConflictException(
        `Mã kỳ ${code} không xác định được duy nhất.`,
      );
    }

    return rows[0];
  }

  async resolve(
    type: FileType,
    schoolId: number | null,
    centerId: number | null,
    selectedSessionRaw: string | undefined,
    file?: Express.Multer.File,
  ): Promise<ResolvedXmlLink> {
    const selectedSessionId = optionalSessionId(selectedSessionRaw);

    if (type === 'bc2_result') {
      // Giữ nghiệp vụ BC2_RESULT hiện tại.
      return {
        examinationSessionId: selectedSessionId,
        metadata: {},
      };
    }

    const buffer = await this.readXml(file);

    if (type === 'bc1') {
      if (selectedSessionId !== null) {
        throw new BadRequestException(
          'BC1 không cần chọn kỳ sát hạch khi upload.',
        );
      }

      const doc = parseBc1(buffer);
      const assignedSchoolCode = await this.schoolCode(schoolId);

      if (normalizeCode(doc.school.code) !== assignedSchoolCode) {
        throw new ConflictException(
          'Mã CSĐT trong BC1 không khớp tài khoản gửi.',
        );
      }

      return {
        examinationSessionId: null,
        metadata: {
          xmlSchoolCode: assignedSchoolCode,
          xmlBc1Code: normalize(doc.reportCode),
          xmlCourseCode: normalize(doc.course.code),
        },
      };
    }

    if (type === 'bc2') {
      if (selectedSessionId !== null) {
        throw new BadRequestException(
          'BC2 không cần chọn kỳ sát hạch khi upload.',
        );
      }

      const doc = parseBc2(buffer);
      const assignedSchoolCode = await this.schoolCode(schoolId);

      if (normalizeCode(doc.report.schoolCode) !== assignedSchoolCode) {
        throw new ConflictException(
          'Mã CSĐT trong BC2 không khớp tài khoản gửi.',
        );
      }

      const bc1Code = normalizeCode(doc.report.bc1Code);

      if (!bc1Code) {
        throw new BadRequestException(
          'File BC2 thiếu MA_BCI tham chiếu đến BC1.',
        );
      }

      const bc1 = await this.findBc1(schoolId!, bc1Code);

      if (!/^[a-f0-9-]{36}\.xml$/i.test(bc1.storageKey)) {
        throw new ConflictException('Khóa lưu trữ BC1 không hợp lệ.');
      }

      const bc1Path = join(STORAGE_ROOT, bc1.storageKey);

      const bc1Stat = await stat(bc1Path);

      if (
        !bc1Stat.isFile() ||
        bc1Stat.size <= 0 ||
        bc1Stat.size > MAX_XML_BYTES
      ) {
        throw new ConflictException('Không thể đối chiếu nội dung file BC1.');
      }

      const bc1Document = parseBc1(await readFile(bc1Path));

      if (
        normalizeCode(bc1Document.reportCode) !== bc1Code ||
        normalizeCode(bc1Document.school.code) !== assignedSchoolCode
      ) {
        throw new ConflictException(
          'BC1 đã lưu không khớp mã BC1 hoặc CSĐT của BC2.',
        );
      }

      // BC2 có thể là danh sách con của BC1,
      // không yêu cầu số lượng hai file bằng nhau.
      const bc1Registrations = new Set(
        bc1Document.students.map((student) =>
          normalizeCode(student.registrationCode),
        ),
      );

      const unmatched = doc.students.filter(
        (student) =>
          !bc1Registrations.has(normalizeCode(student.registrationCode)),
      );

      if (unmatched.length > 0) {
        throw new ConflictException(
          `BC2 có ${unmatched.length} thí sinh ` +
            'không tồn tại trong BC1 tham chiếu. ' +
            `Ví dụ: ${unmatched
              .slice(0, 5)
              .map((student) => student.registrationCode)
              .join(', ')}`,
        );
      }

      return {
        examinationSessionId: null,
        metadata: {
          xmlSchoolCode: assignedSchoolCode,
          xmlBc1Code: bc1Code,
          xmlBc2Code: normalize(doc.report.bc2Code),
          linkedBc1SubmissionId: String(bc1.id),
        },
      };
    }

    if (type === 'exam_48') {
      if (selectedSessionId !== null) {
        throw new BadRequestException(
          'File 48_ không chọn kỳ tạm. ' +
            'Kỳ chính thức được tạo khi SUPER_ADMIN duyệt.',
        );
      }

      const doc = parseExamList(buffer);
      const assignedCenterCode = await this.centerCode(centerId);

      if (
        normalizeCode(doc.session.examinationCenterCode) !== assignedCenterCode
      ) {
        throw new ConflictException(
          'Mã MATTSH trong 48_ không khớp TTSH đã chọn.',
        );
      }

      const officialCode = normalizeCode(doc.session.code);

      const duplicates: Array<{ id: number }> = await this.db.query(
        `
              SELECT id
              FROM examination_sessions
              WHERE UPPER(TRIM(code)) = $1
                 OR UPPER(TRIM(official_code)) = $1
              LIMIT 1
            `,
        [officialCode],
      );

      if (duplicates.length) {
        throw new ConflictException(`Kỳ sát hạch ${officialCode} đã được tạo.`);
      }

      return {
        examinationSessionId: null,
        metadata: {
          xmlSessionCode: normalize(doc.session.code),
          xmlCenterCode: assignedCenterCode,
          xmlExamDate: normalize(doc.session.examDate),
        },
      };
    }

    if (type === 'exam_result') {
      const previewFile = {
        fieldname: 'file',
        originalname: file!.originalname,
        encoding: '7bit',
        mimetype: 'application/xml',
        size: buffer.length,
        buffer,
        destination: '',
        filename: file!.filename,
        path: file!.path,
        stream: createReadStream(file!.path),
      } as Express.Multer.File;

      const preview = await this.examResultImport.preview(previewFile);

      const officialCode = normalizeCode(preview.sessionCode);

      if (!officialCode) {
        throw new BadRequestException('KQSH không có mã kỳ sát hạch hợp lệ.');
      }

      const session = await this.findOfficialSession(officialCode);

      const assignedCenterCode = await this.centerCode(centerId);

      if (normalizeCode(session.centerCode) !== assignedCenterCode) {
        throw new ConflictException(
          'KQSH không thuộc trung tâm sát hạch của tài khoản.',
        );
      }

      if (
        selectedSessionId !== null &&
        selectedSessionId !== Number(session.id)
      ) {
        throw new ConflictException(
          'Kỳ sát hạch đã chọn không khớp ' + 'MAKYSH trong KQSH.',
        );
      }

      return {
        examinationSessionId: Number(session.id),
        metadata: {
          examinationSessionId: String(session.id),
          examinationDate: session.examDate ?? '',
          xmlSessionCode: officialCode,
          xmlCenterCode: assignedCenterCode,
        },
      };
    }

    throw new BadRequestException('Loại file không được hỗ trợ.');
  }

  /**
   * So sánh bản XML hiện tại với bản thay thế
   * để tránh đổi định danh nghiệp vụ.
   */
  async assertSameDocument(
    type: FileType,
    previousStorageKey: string,
    newFile: Express.Multer.File,
  ): Promise<void> {
    if (type === 'bc2_result') return;

    if (!/^[a-f0-9-]{36}\.xml$/i.test(previousStorageKey)) {
      throw new ConflictException('Không thể xác minh phiên bản XML trước đó.');
    }

    const previousPath = join(STORAGE_ROOT, previousStorageKey);

    const previousInfo = await stat(previousPath);

    if (
      !previousInfo.isFile() ||
      previousInfo.size <= 0 ||
      previousInfo.size > MAX_XML_BYTES
    ) {
      throw new ConflictException('Phiên bản XML trước đó không hợp lệ.');
    }

    const previous = await readFile(previousPath);
    const current = await this.readXml(newFile);

    let previousIdentity: string;
    let currentIdentity: string;

    if (type === 'bc1') {
      const oldDoc = parseBc1(previous);
      const newDoc = parseBc1(current);

      previousIdentity = [
        oldDoc.school.code,
        oldDoc.reportCode,
        oldDoc.course.code,
      ]
        .map(normalizeCode)
        .join('|');

      currentIdentity = [
        newDoc.school.code,
        newDoc.reportCode,
        newDoc.course.code,
      ]
        .map(normalizeCode)
        .join('|');
    } else if (type === 'bc2') {
      const oldDoc = parseBc2(previous);
      const newDoc = parseBc2(current);

      previousIdentity = [
        oldDoc.report.schoolCode,
        oldDoc.report.bc1Code,
        oldDoc.report.bc2Code,
      ]
        .map(normalizeCode)
        .join('|');

      currentIdentity = [
        newDoc.report.schoolCode,
        newDoc.report.bc1Code,
        newDoc.report.bc2Code,
      ]
        .map(normalizeCode)
        .join('|');
    } else if (type === 'exam_48') {
      const oldDoc = parseExamList(previous);
      const newDoc = parseExamList(current);

      previousIdentity = [
        oldDoc.session.code,
        oldDoc.session.examinationCenterCode,
      ]
        .map(normalizeCode)
        .join('|');

      currentIdentity = [
        newDoc.session.code,
        newDoc.session.examinationCenterCode,
      ]
        .map(normalizeCode)
        .join('|');
    } else {
      // KQSH sẽ được đối chiếu sessionId bằng resolve()
      // và xác minh mã kỳ trước khi thay phiên bản.
      return;
    }

    if (previousIdentity !== currentIdentity) {
      throw new ConflictException(
        'XML thay thế không cùng mã nghiệp vụ ' +
          'với phiên bản hồ sơ trước đó. ' +
          'Vui lòng tạo hồ sơ mới nếu cần đổi mã.',
      );
    }
  }
}
