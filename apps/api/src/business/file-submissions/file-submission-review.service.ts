import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { parseBc1 } from '../imports/bc1-parser.js';
import { parseBc2 } from '../imports/bc2-parser.js';
import { parseExamList } from '../imports/exam-list-parser.js';
import { parseExamResult } from '../imports/exam-result-parser.js';

type FileType = 'bc1' | 'bc2' | 'bc2_result' | 'exam_48' | 'exam_result';

type FileRow = {
  id: number;
  fileType: FileType;
  status: string;
  importStatus: string;
  currentVersion: number;
  version: number;
  originalName: string;
  storageKey: string;
  sizeBytes: string;
  sha256: string;
  uploadedByUserId: number;
  uploaderName: string;
  trainingSchoolId: number | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterName: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type ParsedCandidate = {
  order: number;
  registrationCode: string;
  fullName: string | null;
  dateOfBirth: string | null;
  identityNumber: string | null;
  examinationNumber: string | null;
  fileNumber: string | null;
  details: Record<string, unknown>;
};

type ParsedContent = {
  supported: boolean;
  message: string | null;
  metadata: Record<string, unknown>;
  candidates: ParsedCandidate[];
};

type DbStudent = {
  id: number;
  registrationCode: string;
  fullName: string;
  identityNumber: string | null;
  dateOfBirth: string | null;
  sourceType: string;
};

type ReviewCandidate = ParsedCandidate & {
  matchStatus: 'new' | 'matched' | 'conflict' | 'possible_match';
  matchedStudents: DbStudent[];
  differences: string[];
};

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

function maxReviewBytes() {
  const configured = Number(process.env.FILE_REVIEW_MAX_MB ?? 64);

  if (!Number.isFinite(configured) || configured <= 0 || configured > 256) {
    return 64 * 1024 * 1024;
  }

  return Math.floor(configured * 1024 * 1024);
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('vi-VN');
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function positiveInt(value: unknown, fallback: number, max: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, max)
    : fallback;
}

function parseDocument(fileType: FileType, buffer: Buffer): ParsedContent {
  if (fileType === 'bc2_result') {
    return {
      supported: false,
      message: 'Chưa có parser cho file kết quả BC2 từ PC08.',
      metadata: {},
      candidates: [],
    };
  }

  if (fileType === 'bc1') {
    const document = parseBc1(buffer);

    return {
      supported: true,
      message: null,
      metadata: {
        transactionCode: document.transactionCode,
        reportCode: document.reportCode,
        school: document.school,
        course: document.course,
        totalCandidates: document.students.length,
      },
      candidates: document.students.map((item, index) => ({
        order: item.order ?? index + 1,
        registrationCode: item.registrationCode,
        fullName: item.fullName,
        dateOfBirth: item.dateOfBirth,
        identityNumber: item.identityNumber,
        examinationNumber: null,
        fileNumber: item.fileNumber,
        details: {
          familyName: item.familyName,
          givenName: item.givenName,
          gender: item.gender,
          nationalityCode: item.nationalityCode,
          nationalityName: item.nationalityName,
          permanentAddress: item.permanentAddress,
          currentAddress: item.currentAddress,
        },
      })),
    };
  }

  if (fileType === 'bc2') {
    const document = parseBc2(buffer);

    return {
      supported: true,
      message: null,
      metadata: {
        transactionCode: document.transactionCode,
        senderName: document.senderName,
        report: document.report,
        totalCandidates: document.students.length,
      },
      candidates: document.students.map((item) => ({
        order: item.order,
        registrationCode: item.registrationCode,
        fullName: item.fullName,
        dateOfBirth: item.dateOfBirth,
        identityNumber: item.identityNumber,
        examinationNumber: null,
        fileNumber: item.fileNumber,
        details: {
          requestedLicenseClass: item.requestedLicenseClass,
          previousLicenseNumber: item.previousLicenseNumber,
          previousLicenseClass: item.previousLicenseClass,
          completionCertificateNumber: item.completionCertificateNumber,
          certificateNumber: item.certificateNumber,
          medicalCertificate: item.medicalCertificate,
          examContentCode: item.examContentCode,
          note: item.note,
        },
      })),
    };
  }

  if (fileType === 'exam_48') {
    const document = parseExamList(buffer);

    return {
      supported: true,
      message: null,
      metadata: {
        transactionCode: document.transactionCode,
        sourceUnitCode: document.sourceUnitCode,
        sourceUnitName: document.sourceUnitName,
        session: document.session,
        totalCandidates: document.candidates.length,
      },
      candidates: document.candidates.map((item, index) => ({
        order: index + 1,
        registrationCode: item.registrationCode,
        fullName: item.fullName,
        dateOfBirth: item.dateOfBirth,
        identityNumber: item.identityNumber,
        examinationNumber: item.examinationNumber,
        fileNumber: item.fileNumber,
        details: {
          schoolCode: item.schoolCode,
          courseCode: item.courseCode,
          licenseClass: item.licenseClass,
          examinationContent: item.examinationContent,
          candidateType: item.candidateType,
          gender: item.gender,
        },
      })),
    };
  }

  const document = parseExamResult(buffer);

  return {
    supported: true,
    message: null,
    metadata: {
      transactionCode: document.transactionCode,
      sourceUnitCode: document.sourceUnitCode,
      sessionCode: document.sessionCode,
      totalCandidates: document.candidates.length,
    },
    candidates: document.candidates.map((item, index) => ({
      order: index + 1,
      registrationCode: item.registrationCode,
      fullName: item.fullName,
      dateOfBirth: null,
      identityNumber: item.identityNumber,
      examinationNumber: item.examinationNumber,
      fileNumber: item.fileNumber,
      details: {
        resultStatus: item.resultStatus,
        theoryScore: item.theoryScore,
        practicalScore: item.practicalScore,
        roadScore: item.roadScore,
        parts: item.parts,
      },
    })),
  };
}

@Injectable()
export class FileSubmissionReviewService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertRole(user: AuthUser) {
    const roles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.TRAINING_SCHOOL,
      UserRole.PC08_STAFF,
      UserRole.EXAM_CENTER,
    ];

    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Không có quyền xem hồ sơ file.');
    }
  }

  /**
   * SQL dùng chung cho danh sách và chi tiết.
   * Quyền đọc được kiểm tra trực tiếp trong WHERE.
   */
  private visibleCondition(alias = 's') {
    return `
      (
        $1::text = 'super_admin'
        OR ${alias}.uploaded_by_user_id = $2::int
        OR (
          ${alias}.status = 'approved'
          AND EXISTS (
            SELECT 1
            FROM user_organization_assignments ua
            WHERE ua.user_id = $2::int
              AND (
                (
                  $1::text = 'training_school'
                  AND ${alias}.file_type = 'bc2_result'
                  AND ua.training_school_id =
                    ${alias}.training_school_id
                )
                OR (
                  $1::text = 'exam_center'
                  AND ${alias}.file_type = 'exam_48'
                  AND ua.examination_center_id =
                    ${alias}.examination_center_id
                )
              )
          )
        )
      )
    `;
  }

  private async findFile(
    user: AuthUser,
    submissionId: number,
    version?: number,
  ): Promise<FileRow> {
    this.assertRole(user);

    if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
      throw new BadRequestException('Mã hồ sơ không hợp lệ.');
    }

    if (
      version !== undefined &&
      (!Number.isSafeInteger(version) || version <= 0)
    ) {
      throw new BadRequestException('Phiên bản không hợp lệ.');
    }

    const rows: FileRow[] = await this.db.query(
      `
          SELECT
            s.id,
            s.file_type AS "fileType",
            s.status,
            s.import_status AS "importStatus",
            s.current_version AS "currentVersion",
            v.version,
            v.original_name AS "originalName",
            v.storage_key AS "storageKey",
            v.size_bytes::text AS "sizeBytes",
            v.sha256,
            s.uploaded_by_user_id AS "uploadedByUserId",
            COALESCE(u.full_name, u.username) AS "uploaderName",
            s.training_school_id AS "trainingSchoolId",
            ts.name AS "trainingSchoolName",
            s.examination_center_id AS "examinationCenterId",
            ec.name AS "examinationCenterName",
            s.note,
            s.created_at AS "createdAt",
            s.reviewed_at AS "reviewedAt"
  
          FROM file_submissions s
  
          JOIN file_submission_versions v
            ON v.submission_id = s.id
            AND v.version = COALESCE($4::int, s.current_version)
  
          JOIN users u
            ON u.id = s.uploaded_by_user_id
  
          LEFT JOIN training_schools ts
            ON ts.id = s.training_school_id
  
          LEFT JOIN examination_centers ec
            ON ec.id = s.examination_center_id
  
          WHERE s.id = $3::int
            AND ${this.visibleCondition()}
          
            AND (
              $1::text = 'super_admin'
              OR s.uploaded_by_user_id = $2::int
              OR v.version = s.current_version
            )
  
          LIMIT 1
        `,
      [user.role, user.sub, submissionId, version ?? null],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy file được phép xem.');
    }

    return rows[0];
  }

  /**
   * Danh sách file thuộc phạm vi tài khoản.
   */
  async list(
    user: AuthUser,
    options: {
      page?: string;
      limit?: string;
      search?: string;
      fileType?: string;
      status?: string;
    },
  ) {
    this.assertRole(user);

    const page = positiveInt(options.page, 1, 100000);
    const limit = positiveInt(options.limit, 20, 100);
    const search = (options.search ?? '').trim().slice(0, 150);
    const fileType = (options.fileType ?? '').trim();
    const status = (options.status ?? '').trim();

    const validTypes = [
      '',
      'bc1',
      'bc2',
      'bc2_result',
      'exam_48',
      'exam_result',
    ];

    if (!validTypes.includes(fileType)) {
      throw new BadRequestException('Loại file không hợp lệ.');
    }

    if (
      !['', 'pending', 'processing', 'approved', 'rejected'].includes(status)
    ) {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    const baseSql = `
        FROM file_submissions s
        JOIN file_submission_versions v
          ON v.submission_id = s.id
         AND v.version = s.current_version
        JOIN users u ON u.id = s.uploaded_by_user_id
        LEFT JOIN training_schools ts
          ON ts.id = s.training_school_id
        LEFT JOIN examination_centers ec
          ON ec.id = s.examination_center_id
        WHERE ${this.visibleCondition()}
          AND (
            $3::text = ''
            OR v.original_name ILIKE '%' || $3::text || '%'
            OR COALESCE(ts.name, '') ILIKE '%' || $3::text || '%'
            OR COALESCE(ec.name, '') ILIKE '%' || $3::text || '%'
            OR COALESCE(u.full_name, '') ILIKE '%' || $3::text || '%'
          )
          AND ($4::text = '' OR s.file_type = $4::text)
          AND ($5::text = '' OR s.status = $5::text)
      `;

    const params = [user.role, user.sub, search, fileType, status];

    const [countRows, rows] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS total ${baseSql}`, params),
      this.db.query(
        `
            SELECT
              s.id,
              s.file_type AS "fileType",
              s.status,
              s.import_status AS "importStatus",
              s.current_version AS "currentVersion",
              v.original_name AS "originalName",
              v.size_bytes::text AS "sizeBytes",
              s.uploaded_by_user_id AS "uploadedByUserId",
              COALESCE(u.full_name, u.username) AS "uploaderName",
              s.training_school_id AS "trainingSchoolId",
              ts.name AS "trainingSchoolName",
              s.examination_center_id AS "examinationCenterId",
              ec.name AS "examinationCenterName",
              s.created_at AS "createdAt"
            ${baseSql}
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT $6 OFFSET $7
          `,
        [...params, limit, (page - 1) * limit],
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async readParsed(file: FileRow): Promise<ParsedContent> {
    if (file.fileType === 'bc2_result' || !/\.xml$/i.test(file.originalName)) {
      return {
        supported: false,
        message: 'Loại file này chưa hỗ trợ trích xuất nội dung.',
        metadata: {},
        candidates: [],
      };
    }

    // storage_key là định danh do server tạo.
    // Tuyệt đối không lấy path từ tên file người dùng.
    if (
      !/^[a-f0-9-]{36}\.(xml|xlsx|xls|pdf)$/i.test(file.storageKey) ||
      basename(file.storageKey) !== file.storageKey
    ) {
      throw new BadRequestException('Đường dẫn file lưu trữ không hợp lệ.');
    }

    const path = join(STORAGE_ROOT, file.storageKey);
    const info = await stat(path).catch(() => null);

    if (!info?.isFile()) {
      throw new NotFoundException('File không còn tồn tại trên server.');
    }

    if (info.size !== Number(file.sizeBytes)) {
      throw new BadRequestException(
        'Dung lượng file không khớp dữ liệu lưu trữ.',
      );
    }

    if (info.size > maxReviewBytes()) {
      return {
        supported: false,
        message:
          `File vượt giới hạn Review trực tiếp ` +
          `${process.env.FILE_REVIEW_MAX_MB ?? 64} MB.`,
        metadata: {},
        candidates: [],
      };
    }

    const buffer = await readFile(path);

    const hash = createHash('sha256').update(buffer).digest('hex');

    if (hash !== file.sha256) {
      throw new BadRequestException('File không khớp SHA-256 đã lưu.');
    }

    return parseDocument(file.fileType, buffer);
  }

  private async lookupStudents(
    candidates: ParsedCandidate[],
  ): Promise<Map<string, DbStudent[]>> {
    const codes = [...new Set(candidates.map((c) => c.registrationCode))];

    const identities = [
      ...new Set(
        candidates
          .map((c) => c.identityNumber)
          .filter((c): c is string => Boolean(c)),
      ),
    ];

    const rows: DbStudent[] = await this.db.query(
      `
          SELECT
            id,
            registration_code AS "registrationCode",
            full_name AS "fullName",
            identity_number AS "identityNumber",
            date_of_birth::text AS "dateOfBirth",
            source_type AS "sourceType"
          FROM students
          WHERE registration_code = ANY($1::text[])
             OR (
               identity_number IS NOT NULL
               AND identity_number = ANY($2::text[])
             )
        `,
      [codes, identities],
    );

    const byKey = new Map<string, DbStudent[]>();

    for (const row of rows) {
      for (const key of [
        `code:${row.registrationCode}`,
        row.identityNumber ? `identity:${row.identityNumber}` : null,
      ]) {
        if (!key) continue;

        const items = byKey.get(key) ?? [];
        items.push(row);
        byKey.set(key, items);
      }
    }

    return byKey;
  }

  private compare(
    candidate: ParsedCandidate,
    matches: Map<string, DbStudent[]>,
  ): ReviewCandidate {
    const byRegistration =
      matches.get(`code:${candidate.registrationCode}`) ?? [];

    const byIdentity = candidate.identityNumber
      ? (matches.get(`identity:${candidate.identityNumber}`) ?? [])
      : [];

    const unique = new Map<number, DbStudent>();

    for (const item of [...byRegistration, ...byIdentity]) {
      unique.set(item.id, item);
    }

    const matchedStudents = [...unique.values()];
    const primary = byRegistration[0] ?? null;

    const differences: string[] = [];

    if (primary) {
      if (
        candidate.identityNumber &&
        primary.identityNumber &&
        candidate.identityNumber !== primary.identityNumber
      ) {
        differences.push('CCCD khác database');
      }

      if (
        candidate.dateOfBirth &&
        primary.dateOfBirth &&
        candidate.dateOfBirth !== primary.dateOfBirth
      ) {
        differences.push('Ngày sinh khác database');
      }

      if (
        candidate.fullName &&
        normalizeText(candidate.fullName) !== normalizeText(primary.fullName)
      ) {
        differences.push('Họ tên khác database');
      }

      if (byIdentity.some((item) => item.id !== primary.id)) {
        differences.push('CCCD xuất hiện ở hồ sơ có mã đăng ký khác');
      }

      return {
        ...candidate,
        matchStatus: differences.length ? 'conflict' : 'matched',
        matchedStudents,
        differences,
      };
    }

    if (byIdentity.length) {
      return {
        ...candidate,
        matchStatus: 'possible_match',
        matchedStudents,
        differences: [
          'CCCD đã tồn tại nhưng mã đăng ký khác.',
          'Cần xác minh trước khi nhập hoặc gộp học viên.',
        ],
      };
    }

    return {
      ...candidate,
      matchStatus: 'new',
      matchedStudents: [],
      differences: [],
    };
  }

  private async reviewedContent(user: AuthUser, id: number, version?: number) {
    const file = await this.findFile(user, id, version);
    const parsed = await this.readParsed(file);

    return { file, parsed };
  }

  async overview(user: AuthUser, id: number, version?: number) {
    const { file, parsed } = await this.reviewedContent(user, id, version);

    if (!parsed.supported) {
      return {
        file,
        supported: false,
        message: parsed.message,
        metadata: parsed.metadata,
        summary: null,
      };
    }

    const known = await this.lookupStudents(parsed.candidates);

    const summary = {
      totalCandidates: parsed.candidates.length,
      matched: 0,
      new: 0,
      conflict: 0,
      possibleMatch: 0,
    };

    for (const candidate of parsed.candidates) {
      const item = this.compare(candidate, known);

      if (item.matchStatus === 'matched') summary.matched++;
      if (item.matchStatus === 'new') summary.new++;
      if (item.matchStatus === 'conflict') summary.conflict++;
      if (item.matchStatus === 'possible_match') {
        summary.possibleMatch++;
      }
    }

    return {
      file,
      supported: true,
      message: null,
      metadata: parsed.metadata,
      summary,
    };
  }

  async candidates(
    user: AuthUser,
    id: number,
    query: {
      version?: number;
      page?: string;
      limit?: string;
      search?: string;
      matchStatus?: string;
    },
  ) {
    const { file, parsed } = await this.reviewedContent(
      user,
      id,
      query.version,
    );

    const page = positiveInt(query.page, 1, 100000);
    const limit = positiveInt(query.limit, 20, 100);
    const keyword = normalizeText((query.search ?? '').slice(0, 150));
    const filter = (query.matchStatus ?? '').trim();

    if (
      !['', 'new', 'matched', 'conflict', 'possible_match'].includes(filter)
    ) {
      throw new BadRequestException('Bộ lọc đối chiếu không hợp lệ.');
    }

    if (!parsed.supported) {
      return {
        fileId: id,
        supported: false,
        message: parsed.message,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const known = await this.lookupStudents(parsed.candidates);

    const all = parsed.candidates
      .filter((candidate) => {
        if (!keyword) return true;

        return [
          candidate.registrationCode,
          candidate.fullName,
          candidate.identityNumber,
          candidate.examinationNumber,
          candidate.fileNumber,
        ].some((item) => normalizeText(item).includes(keyword));
      })
      .map((candidate) => this.compare(candidate, known))
      .filter((candidate) => !filter || candidate.matchStatus === filter);

    const total = all.length;

    return {
      fileId: id,
      supported: true,
      message: null,
      data: all.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Tra cứu file khác chứa cùng MA_DK.
   *
   * Không lập chỉ mục DB: chỉ đọc tối đa 30 file
   * mới nhất mà tài khoản có quyền xem.
   * Các file vượt giới hạn Review được bỏ qua.
   */
  async relatedFiles(user: AuthUser, id: number, registrationCode: string) {
    const current = await this.reviewedContent(user, id);
    const code = cleanText(registrationCode);

    if (!code || code.length > 150) {
      throw new BadRequestException('Mã đăng ký không hợp lệ.');
    }

    if (
      !current.parsed.supported ||
      !current.parsed.candidates.some(
        (candidate) => candidate.registrationCode === code,
      )
    ) {
      throw new NotFoundException(
        'Không tìm thấy mã học viên trong file hiện tại.',
      );
    }

    const fileRows: FileRow[] = await this.db.query(
      `
          SELECT
            s.id,
            s.file_type AS "fileType",
            s.status,
            s.import_status AS "importStatus",
            s.current_version AS "currentVersion",
            v.version,
            v.original_name AS "originalName",
            v.storage_key AS "storageKey",
            v.size_bytes::text AS "sizeBytes",
            v.sha256,
            s.uploaded_by_user_id AS "uploadedByUserId",
            COALESCE(u.full_name, u.username) AS "uploaderName",
            s.training_school_id AS "trainingSchoolId",
            ts.name AS "trainingSchoolName",
            s.examination_center_id AS "examinationCenterId",
            ec.name AS "examinationCenterName",
            s.note,
            s.created_at AS "createdAt",
            s.reviewed_at AS "reviewedAt"
          FROM file_submissions s
          JOIN file_submission_versions v
            ON v.submission_id = s.id
           AND v.version = s.current_version
          JOIN users u ON u.id = s.uploaded_by_user_id
          LEFT JOIN training_schools ts
            ON ts.id = s.training_school_id
          LEFT JOIN examination_centers ec
            ON ec.id = s.examination_center_id
          WHERE ${this.visibleCondition()}
            AND s.id <> $3::int
            AND s.file_type IN (
              'bc1', 'bc2', 'exam_48', 'exam_result'
            )
          ORDER BY s.id DESC
          LIMIT 30
        `,
        [user.role, user.sub, id]
    );

    const related: Array<{
      id: number;
      fileType: FileType;
      originalName: string;
      status: string;
      version: number;
      uploaderName: string;
    }> = [];

    for (const item of fileRows) {
      try {
        const parsed = await this.readParsed(item);

        if (
          parsed.candidates.some(
            (candidate) => candidate.registrationCode === code,
          )
        ) {
          related.push({
            id: item.id,
            fileType: item.fileType,
            originalName: item.originalName,
            status: item.status,
            version: item.version,
            uploaderName: item.uploaderName,
          });
        }
      } catch {
        // File không hợp lệ/không đọc được:
        // bỏ qua, không tiết lộ metadata riêng.
      }
    }

    return {
      registrationCode: code,
      related,
      scannedFiles: fileRows.length,
      scanLimit: 30,
      exhaustive: false,
      message:
        'Chỉ kiểm tra tối đa 30 file gần nhất có quyền truy cập. ' +
        'Kết quả không đảm bảo đầy đủ lịch sử.',
    };
  }
}
