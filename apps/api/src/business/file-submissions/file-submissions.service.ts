import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { DataSource, type EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';
import {
  parseDocumentMetadata,
  type DocumentMetadata,
} from './file-document-metadata.js';
import { FileSubmissionXmlLinkService } from './file-submission-xml-link.service.js';

export const FILE_TYPES = [
  'bc1',
  'bc2',
  'bc2_result',
  'exam_48',
  'exam_result',
] as const;

export type FileType = (typeof FILE_TYPES)[number];

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

type UploadInput = {
  fileType: string;
  trainingSchoolId?: string;
  examinationCenterId?: string;
  note?: string;
  documentMetadata?: string;
  examinationSessionId?: string;
};

type SubmissionRow = {
  id: number;
  fileType: FileType;
  status: SubmissionStatus;
  uploadedByUserId: number;
  uploaderName: string;
  trainingSchoolId: number | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterName: string | null;
  note: string | null;
  rejectionReason: string | null;
  currentVersion: number;
  importStatus: string;
  documentMetadata: DocumentMetadata;
  originalName: string;
  sizeBytes: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  examinationSessionId: number | null;
  examinationSessionCode: string | null;
};

type VersionRow = {
  id: number;
  submissionId: number;
  version: number;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  documentMetadata: DocumentMetadata;
  createdAt: Date;
};

type AssignmentRow = {
  trainingSchoolId: number | null;
  examinationCenterId: number | null;
};

type StoredFile = {
  storageKey: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
  originalName: string;
  mimeType: string;
};

const ALLOWED_ROLES: Partial<Record<UserRole, FileType[]>> = {
  [UserRole.TRAINING_SCHOOL]: ['bc1', 'bc2'],
  [UserRole.PC08_STAFF]: ['bc2_result', 'exam_48'],
  [UserRole.EXAM_CENTER]: ['exam_result'],
};

const ALLOWED_EXTENSIONS = new Set(['.xml', '.xlsx', '.xls', '.pdf']);

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

export function getFileUploadMaxBytes(): number {
  const configured = Number(process.env.FILE_UPLOAD_MAX_MB ?? 500);

  if (!Number.isFinite(configured) || configured <= 0 || configured > 2048) {
    throw new Error(
      'FILE_UPLOAD_MAX_MB phải lớn hơn 0 và không vượt quá 2048.',
    );
  }

  return Math.floor(configured * 1024 * 1024);
}

function parsePositiveId(value: unknown, name: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${name} không hợp lệ.`);
  }

  return parsed;
}

function optionalId(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parsePositiveId(value, name);
}

function getOriginalName(file: Express.Multer.File): string {
  const name = basename((file.originalname || 'upload').replace(/\\/g, '/'))
    .replace(/[\x00-\x1F\x7F]/g, '_')
    .trim();

  return name.slice(0, 255) || 'upload';
}

async function readHeader(path: string, length = 8192): Promise<Buffer> {
  const handle = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);

    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function validateDiskFile(
  file: Express.Multer.File | undefined,
): Promise<{
  file: Express.Multer.File;
  originalName: string;
  extension: string;
  sizeBytes: number;
}> {
  if (!file?.path) {
    throw new BadRequestException('Vui lòng chọn file cần tải lên.');
  }

  const info = await stat(file.path);

  if (!info.isFile() || info.size <= 0) {
    throw new BadRequestException('File rỗng hoặc không hợp lệ.');
  }

  if (info.size > getFileUploadMaxBytes()) {
    throw new BadRequestException('File vượt quá dung lượng cho phép.');
  }

  const originalName = getOriginalName(file);
  const extension = extname(originalName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException('Chỉ hỗ trợ XML, XLS, XLSX và PDF.');
  }

  const header = await readHeader(file.path);

  if (extension === '.pdf') {
    if (header.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('Nội dung không phải file PDF hợp lệ.');
    }
  }

  if (extension === '.xlsx') {
    const isZip =
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(header[2]);

    if (!isZip) {
      throw new BadRequestException('File XLSX không có định dạng ZIP hợp lệ.');
    }
  }

  if (extension === '.xls') {
    const oleSignature = Buffer.from('D0CF11E0A1B11AE1', 'hex');

    if (!header.subarray(0, 8).equals(oleSignature)) {
      throw new BadRequestException('File XLS không đúng định dạng.');
    }
  }

  if (extension === '.xml') {
    const utf8Bom = header
      .subarray(0, 3)
      .equals(Buffer.from([0xef, 0xbb, 0xbf]));

    const isUtf16Le = header[0] === 0xff && header[1] === 0xfe;
    const isUtf16Be = header[0] === 0xfe && header[1] === 0xff;

    let start: string;

    if (isUtf16Le) {
      start = header.subarray(2).toString('utf16le');
    } else if (isUtf16Be) {
      const payload = header.subarray(2);
      const swapped = Buffer.from(payload);

      for (let index = 0; index + 1 < swapped.length; index += 2) {
        const byte = swapped[index];
        swapped[index] = swapped[index + 1];
        swapped[index + 1] = byte;
      }

      start = swapped.toString('utf16le');
    } else {
      start = header.subarray(utf8Bom ? 3 : 0).toString('utf8');
    }

    start = start.replace(/^\uFEFF/, '').trimStart();

    if (!start.startsWith('<')) {
      throw new BadRequestException(
        'File XML không có cấu trúc mở đầu hợp lệ.',
      );
    }
  }

  return {
    file,
    originalName,
    extension,
    sizeBytes: info.size,
  };
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? String(error.code) : '';

    if (code !== 'EXDEV') {
      throw error;
    }

    try {
      await copyFile(source, destination);
      await unlink(source);
    } catch (copyError) {
      await unlink(destination).catch(() => undefined);
      throw copyError;
    }
  }
}

@Injectable()
export class FileSubmissionsService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly xmlLinks: FileSubmissionXmlLinkService,
  ) {}

  private async validateExaminationSession(
    type: FileType,
    sessionIdRaw: string | undefined,
    schoolId: number | null,
    centerId: number | null,
    user: AuthUser,
  ): Promise<number | null> {
    /**
     * BC1, BC2 và 48_ chưa có kỳ sát hạch.
     * Kỳ sẽ được tạo khi SUPER_ADMIN duyệt 48_.
     */
    if (type === 'bc1' || type === 'bc2' || type === 'exam_48') {
      if (sessionIdRaw) {
        throw new BadRequestException(
          'Loại hồ sơ này không chọn kỳ sát hạch khi gửi.',
        );
      }

      return null;
    }

    /**
     * KQSH được xác định bằng MAKYSH trong XML.
     * Hàm này không xử lý KQSH nữa.
     */
    if (type === 'exam_result') {
      throw new BadRequestException(
        'Kỳ sát hạch của KQSH phải được xác định từ XML.',
      );
    }

    /**
     * Giữ nguyên cơ chế chọn kỳ đối với BC2_RESULT
     * vì đây là nghiệp vụ khác.
     */
    const sessionId = parsePositiveId(sessionIdRaw, 'Kỳ sát hạch');

    const rows: Array<{
      id: number;
      examinationCenterId: number;
    }> = await this.db.query(
      `
        SELECT
          id,
          examination_center_id AS "examinationCenterId"
        FROM examination_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    if (!rows.length) {
      throw new BadRequestException('Kỳ sát hạch không tồn tại.');
    }

    if (centerId !== null && Number(rows[0].examinationCenterId) !== centerId) {
      throw new BadRequestException('TTSH không khớp kỳ sát hạch.');
    }

    if (user.role === UserRole.TRAINING_SCHOOL && schoolId === null) {
      throw new BadRequestException('Tài khoản chưa được gắn cơ sở đào tạo.');
    }

    return sessionId;
  }

  private ensureUploader(user: AuthUser, type: FileType) {
    if (!ALLOWED_ROLES[user.role]?.includes(type)) {
      throw new ForbiddenException(
        'Tài khoản không có quyền gửi loại file này.',
      );
    }
  }

  private async getAssignment(userId: number): Promise<AssignmentRow> {
    const rows: AssignmentRow[] = await this.db.query(
      `
        SELECT
          training_school_id AS "trainingSchoolId",
          examination_center_id AS "examinationCenterId"
        FROM user_organization_assignments
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId],
    );

    return (
      rows[0] ?? {
        trainingSchoolId: null,
        examinationCenterId: null,
      }
    );
  }

  async options(user: AuthUser) {
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.PC08_STAFF
    ) {
      throw new ForbiddenException('Không được truy cập danh mục đơn vị.');
    }

    const [trainingSchools, examinationCenters] = await Promise.all([
      this.db.query(`
        SELECT id, code, name
        FROM training_schools
        ORDER BY name ASC, id ASC
      `),
      this.db.query(`
        SELECT id, code, name
        FROM examination_centers
        WHERE is_active = TRUE
        ORDER BY name ASC NULLS LAST, id ASC
      `),
    ]);

    return {
      trainingSchools,
      examinationCenters,
    };
  }

  async examSessionOptions(user: AuthUser) {
    if (
      user.role !== UserRole.TRAINING_SCHOOL &&
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.EXAM_CENTER &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Không được truy cập danh sách kỳ sát hạch.',
      );
    }

    const assignment = await this.getAssignment(user.sub);

    if (user.role === UserRole.EXAM_CENTER && !assignment.examinationCenterId) {
      throw new ForbiddenException('Tài khoản chưa được gắn TTSH.');
    }

    /**
     * TTSH chỉ thấy kỳ thuộc trung tâm mình.
     *
     * CSĐT và PC08 có thể tra cứu kỳ
     * để gửi BC2, BC2_RESULT, EXAM_48.
     *
     * Khi upload Backend vẫn phải kiểm tra
     * quyền và quan hệ kỳ - TTSH - CSĐT.
     */
    return this.db.query(
      `
      SELECT
        es.id,
        es.code,
        es.official_code AS "officialCode",
        es.exam_date::text AS "examDate",
        es.examination_center_id AS "examinationCenterId",
        ec.code AS "centerCode",
        ec.name AS "centerName"

      FROM examination_sessions es

      JOIN examination_centers ec
        ON ec.id = es.examination_center_id

      WHERE (
        $1::boolean = FALSE
        OR es.examination_center_id = $2::int
      )

      ORDER BY
        es.exam_date DESC NULLS LAST,
        es.id DESC

      LIMIT 500
    `,
      [user.role === UserRole.EXAM_CENTER, assignment.examinationCenterId],
    );
  }

  private async validateMetadataSession(
    type: FileType,
    metadata: DocumentMetadata,
    centerId: number | null,
    resolvedSessionId?: number | null,
  ): Promise<void> {
    if (type !== 'exam_result') return;

    if (!centerId) {
      throw new BadRequestException('Tài khoản chưa được gắn TTSH.');
    }

    if (!resolvedSessionId) {
      throw new BadRequestException('Không xác định được kỳ sát hạch từ KQSH.');
    }

    const rows: Array<{
      id: number;
      examDate: string | null;
      centerId: number;
    }> = await this.db.query(
      `
        SELECT
          id,
          exam_date::text AS "examDate",
          examination_center_id AS "centerId"
        FROM examination_sessions
        WHERE id = $1
          AND examination_center_id = $2
        LIMIT 1
      `,
      [resolvedSessionId, centerId],
    );

    if (!rows.length) {
      throw new BadRequestException(
        'Kỳ sát hạch không thuộc TTSH của tài khoản.',
      );
    }

    const actualDate = rows[0].examDate?.slice(0, 10) ?? '';

    if (!actualDate || actualDate !== metadata.examinationDate) {
      throw new BadRequestException(
        'Ngày sát hạch của KQSH không khớp kỳ đã xác định.',
      );
    }

    if (Number(metadata.examinationSessionId) !== resolvedSessionId) {
      throw new BadRequestException('Metadata KQSH không khớp kỳ sát hạch.');
    }
  }

  private parseUploadMetadata(
    type: FileType,
    rawMetadata: string | undefined,
    verifiedMetadata: Record<string, string>,
  ): DocumentMetadata {
    let supplied: Record<string, unknown>;

    try {
      const parsed = JSON.parse(rawMetadata || '{}');

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid metadata');
      }

      supplied = parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        'Thông tin khai báo không đúng định dạng JSON.',
      );
    }

    /**
     * Metadata đã xác minh từ XML luôn
     * ghi đè dữ liệu người gửi tự khai báo.
     */
    const merged = {
      ...supplied,
      ...verifiedMetadata,
    };

    return parseDocumentMetadata(type, JSON.stringify(merged));
  }

  private async validateScope(
    user: AuthUser,
    type: FileType,
    input: UploadInput,
  ): Promise<{
    schoolId: number | null;
    centerId: number | null;
  }> {
    this.ensureUploader(user, type);

    const assignment = await this.getAssignment(user.sub);

    let schoolId: number | null = null;
    let centerId: number | null = null;

    if (user.role === UserRole.TRAINING_SCHOOL) {
      schoolId = assignment.trainingSchoolId;

      if (!schoolId) {
        throw new BadRequestException('Tài khoản chưa được gắn CSĐT.');
      }
    }

    if (user.role === UserRole.EXAM_CENTER) {
      centerId = assignment.examinationCenterId;

      if (!centerId) {
        throw new BadRequestException('Tài khoản chưa được gắn TTSH.');
      }
    }

    if (user.role === UserRole.PC08_STAFF) {
      if (type === 'bc2_result') {
        schoolId = optionalId(input.trainingSchoolId, 'Cơ sở đào tạo');

        if (!schoolId) {
          throw new BadRequestException('Vui lòng chọn CSĐT nhận kết quả BC2.');
        }
      } else {
        centerId = optionalId(input.examinationCenterId, 'Trung tâm sát hạch');

        if (!centerId) {
          throw new BadRequestException('Vui lòng chọn TTSH nhận file 48_.');
        }
      }
    }

    if (schoolId !== null) {
      const school: Array<{ id: number }> = await this.db.query(
        `
          SELECT id
          FROM training_schools
          WHERE id = $1
        `,
        [schoolId],
      );

      if (!school.length) {
        throw new BadRequestException('CSĐT không tồn tại.');
      }
    }

    if (centerId !== null) {
      const center: Array<{ id: number }> = await this.db.query(
        `
          SELECT id
          FROM examination_centers
          WHERE id = $1
            AND is_active = TRUE
        `,
        [centerId],
      );

      if (!center.length) {
        throw new BadRequestException(
          'TTSH không tồn tại hoặc đã ngừng hoạt động.',
        );
      }
    }

    return { schoolId, centerId };
  }

  private async prepareStoredFile(
    file: Express.Multer.File,
  ): Promise<StoredFile> {
    const validated = await validateDiskFile(file);

    await mkdir(STORAGE_ROOT, {
      recursive: true,
    });

    const sha256 = await hashFile(file.path);
    const storageKey = `${randomUUID()}${validated.extension}`;
    const absolutePath = join(STORAGE_ROOT, storageKey);

    await moveFile(file.path, absolutePath);

    return {
      storageKey,
      absolutePath,
      sha256,
      sizeBytes: validated.sizeBytes,
      originalName: validated.originalName,
      mimeType: file.mimetype || 'application/octet-stream',
    };
  }

  private async addEvent(
    manager: EntityManager,
    submissionId: number,
    actorId: number,
    action: string,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO file_submission_events (
          submission_id,
          actor_user_id,
          action,
          detail
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [submissionId, actorId, action, JSON.stringify(detail)],
    );
  }

  private readonly baseQuery = `
    SELECT
      s.id,
      s.file_type AS "fileType",
      s.status,
      s.uploaded_by_user_id AS "uploadedByUserId",
      u.full_name AS "uploaderName",
      s.training_school_id AS "trainingSchoolId",
      ts.name AS "trainingSchoolName",
      s.examination_center_id AS "examinationCenterId",
      ec.name AS "examinationCenterName",
      s.note,
      s.rejection_reason AS "rejectionReason",
      s.current_version AS "currentVersion",
      s.import_status AS "importStatus",
      v.original_name AS "originalName",
      v.size_bytes::text AS "sizeBytes",
      COALESCE(v.document_metadata, '{}'::jsonb) AS "documentMetadata",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      s.reviewed_at AS "reviewedAt",
      s.examination_session_id AS "examinationSessionId",
      es.code AS "examinationSessionCode"

    FROM file_submissions s

    JOIN users u
      ON u.id = s.uploaded_by_user_id

    LEFT JOIN training_schools ts
      ON ts.id = s.training_school_id

    LEFT JOIN examination_centers ec
      ON ec.id = s.examination_center_id
    
    LEFT JOIN examination_sessions es
      ON es.id = s.examination_session_id

    JOIN file_submission_versions v
      ON v.submission_id = s.id
     AND v.version = s.current_version
  `;

  private async findOne(id: number): Promise<SubmissionRow> {
    const rows: SubmissionRow[] = await this.db.query(
      `
        ${this.baseQuery}
        WHERE s.id = $1
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy hồ sơ.');
    }

    return rows[0];
  }

  private ensureVisible(user: AuthUser, submission: SubmissionRow): void {
    if (user.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (submission.uploadedByUserId !== user.sub) {
      throw new ForbiddenException('Không có quyền truy cập hồ sơ này.');
    }
  }

  async list(user: AuthUser, status?: string): Promise<SubmissionRow[]> {
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    if (!isSuperAdmin && !ALLOWED_ROLES[user.role]) {
      throw new ForbiddenException('Không có quyền xem hồ sơ.');
    }

    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    return this.db.query(
      `
        ${this.baseQuery}

        WHERE (
          $1::boolean = TRUE
          OR s.uploaded_by_user_id = $2
        )
        AND (
          $3::text IS NULL
          OR s.status = $3::text
        )

        ORDER BY
          s.created_at DESC,
          s.id DESC

        LIMIT 500
      `,
      [isSuperAdmin, user.sub, status || null],
    );
  }

  /**
   * Xác thực người phụ trách KQSH.
   *
   * Frontend hiện gửi:
   * "Nguyễn Văn A (@it01)"
   *
   * Backend xác minh:
   * - Username tồn tại
   * - Role là PC08_STAFF
   * - Tài khoản đang active
   *
   * Chỉ lưu user ID đã được xác minh.
   */
  private async resolveItPc08(metadata: DocumentMetadata): Promise<number> {
    const display = String(metadata.itOfficer ?? '').trim();

    const match = /^(.+)\s+\(@([^()]+)\)$/.exec(display);

    if (!match) {
      throw new BadRequestException(
        'Vui lòng chọn IT PC08 phụ trách từ danh sách.',
      );
    }

    const fullName = match[1].trim();
    const username = match[2].trim();

    const rows: Array<{
      id: number;
      fullName: string;
    }> = await this.db.query(
      `
      SELECT
        id,
        full_name AS "fullName"
      FROM users
      WHERE username = $1
        AND role = $2
        AND status = 'active'
      LIMIT 1
    `,
      [username, UserRole.PC08_STAFF],
    );

    if (!rows.length) {
      throw new BadRequestException(
        'IT phụ trách không tồn tại, ' +
          'không thuộc PC08 hoặc đã ngừng hoạt động.',
      );
    }

    if (rows[0].fullName !== fullName) {
      throw new BadRequestException(
        'Thông tin IT phụ trách đã thay đổi. ' +
          'Vui lòng chọn lại từ danh sách.',
      );
    }

    return Number(rows[0].id);
  }

  async create(
    user: AuthUser,
    input: UploadInput,
    uploadedFile?: Express.Multer.File,
  ): Promise<SubmissionRow> {
    let stored: StoredFile | null = null;

    try {
      const type = input?.fileType as FileType;

      if (!FILE_TYPES.includes(type)) {
        throw new BadRequestException('Loại file không hợp lệ.');
      }

      if (!uploadedFile?.path) {
        throw new BadRequestException('Vui lòng chọn file.');
      }

      /**
       * 1. Xác thực người gửi và đơn vị.
       *
       * CSĐT: BC1, BC2.
       * PC08: 48_, BC2_RESULT.
       * TTSH: KQSH.
       */
      const scope = await this.validateScope(user, type, input);

      /**
       * 2. Đọc XML và xác định liên kết.
       *
       * BC1: xác minh MA_CSDT.
       * BC2: MA_BCI + MA_CSDT + MA_DK.
       * 48_: MAKYSH + MATTSH, chưa tạo kỳ.
       * KQSH: MAKYSH -> kỳ đã được duyệt.
       *
       * BC2_RESULT giữ cơ chế hiện có.
       */
      const resolved = await this.xmlLinks.resolve(
        type,
        scope.schoolId,
        scope.centerId,
        input.examinationSessionId,
        uploadedFile,
      );

      let examinationSessionId = resolved.examinationSessionId;

      if (type === 'bc2_result') {
        examinationSessionId = await this.validateExaminationSession(
          type,
          input.examinationSessionId,
          scope.schoolId,
          scope.centerId,
          user,
        );
      }

      /**
       * 3. Metadata từ XML có độ ưu tiên cao nhất.
       *
       * Không tin examinationSessionId do FE gửi
       * đối với KQSH.
       */
      const metadata = this.parseUploadMetadata(
        type,
        input.documentMetadata,
        resolved.metadata,
      );

      /**
       * 4. Kiểm tra TTSH và ngày sát hạch
       * đã xác minh từ XML.
       */
      await this.validateMetadataSession(
        type,
        metadata,
        scope.centerId,
        examinationSessionId,
      );

      /**
       * 5. Người phụ trách KQSH bắt buộc
       * phải là tài khoản IT PC08 hợp lệ.
       */
      const storedMetadata =
        type === 'exam_result'
          ? {
              ...metadata,
              itOfficerUserId: await this.resolveItPc08(metadata),
            }
          : metadata;

      const note = input.note?.trim().slice(0, 2000) || null;

      /**
       * 6. Chỉ lưu file sau khi đã xác minh XML.
       */
      stored = await this.prepareStoredFile(uploadedFile);

      /**
       * 7. Tạo hồ sơ, phiên bản và sự kiện
       * trong cùng transaction PostgreSQL.
       */
      const submissionId = await this.db.transaction(async (manager) => {
        const created: Array<{ id: number }> = await manager.query(
          `
              INSERT INTO file_submissions (
                file_type,
                uploaded_by_user_id,
                training_school_id,
                examination_center_id,
                examination_session_id,
                note
              )
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id
            `,
          [
            type,
            user.sub,
            scope.schoolId,
            scope.centerId,
            examinationSessionId,
            note,
          ],
        );

        const id = Number(created[0].id);

        await manager.query(
          `
            INSERT INTO file_submission_versions (
              submission_id,
              version,
              original_name,
              storage_key,
              mime_type,
              size_bytes,
              sha256,
              uploaded_by_user_id,
              document_metadata
            )
            VALUES (
              $1, 1, $2, $3, $4, $5, $6, $7,
              $8::jsonb
            )
          `,
          [
            id,
            stored!.originalName,
            stored!.storageKey,
            stored!.mimeType,
            stored!.sizeBytes,
            stored!.sha256,
            user.sub,
            JSON.stringify(storedMetadata),
          ],
        );

        await this.addEvent(manager, id, user.sub, 'created', {
          fileType: type,
          filename: stored!.originalName,
          examinationSessionId,
          documentMetadata: storedMetadata,
        });

        /**
         * Ghi nhận thông tin liên kết XML
         * để phục vụ kiểm tra lịch sử.
         *
         * Không tạo kỳ và không import ở đây.
         */
        if (type === 'bc2' || type === 'exam_48' || type === 'exam_result') {
          await this.addEvent(manager, id, user.sub, 'xml_link_verified', {
            fileType: type,
            examinationSessionId,
            verifiedMetadata: resolved.metadata,
          });
        }

        return id;
      });

      stored = null;

      return this.findOne(submissionId);
    } finally {
      /**
       * Dọn file upload tạm.
       * Nếu DB transaction thất bại,
       * dọn file đã chuyển vào storage.
       */
      if (uploadedFile?.path) {
        await unlink(uploadedFile.path).catch(() => undefined);
      }

      if (stored) {
        await unlink(stored.absolutePath).catch(() => undefined);
      }
    }
  }

  async replace(
    user: AuthUser,
    id: number,
    uploadedFile?: Express.Multer.File,
    rawMetadata?: string,
  ): Promise<SubmissionRow> {
    let stored: StoredFile | null = null;

    try {
      if (!uploadedFile?.path) {
        throw new BadRequestException('Vui lòng chọn file.');
      }

      const submission = await this.findOne(id);

      if (submission.uploadedByUserId !== user.sub) {
        throw new ForbiddenException(
          'Không được thay file của tài khoản khác.',
        );
      }

      if (submission.status !== 'pending') {
        throw new ConflictException('Chỉ được thay file khi chưa được duyệt.');
      }

      /**
       * 1. Đọc phiên bản XML hiện tại.
       *
       * Không sử dụng storageKey do FE truyền.
       */
      const existingVersions: Array<{
        storageKey: string;
      }> = await this.db.query(
        `
        SELECT
          storage_key AS "storageKey"
        FROM file_submission_versions
        WHERE submission_id = $1
          AND version = $2
        LIMIT 1
      `,
        [id, submission.currentVersion],
      );

      if (!existingVersions.length) {
        throw new NotFoundException('Không tìm thấy phiên bản hiện tại.');
      }

      /**
       * 2. Chặn việc thay XML bằng hồ sơ
       * mang mã nghiệp vụ khác.
       *
       * BC1: MA_CSDT + MA_BCI + MA_KHOA_HOC.
       * BC2: MA_CSDT + MA_BCI + MA_BCII.
       * 48_: MAKYSH + MATTSH.
       */
      await this.xmlLinks.assertSameDocument(
        submission.fileType,
        existingVersions[0].storageKey,
        uploadedFile,
      );

      /**
       * 3. Xác minh lại dữ liệu XML mới.
       */
      const resolved = await this.xmlLinks.resolve(
        submission.fileType,
        submission.trainingSchoolId,
        submission.examinationCenterId,
        submission.fileType === 'bc2_result'
          ? String(submission.examinationSessionId ?? '')
          : undefined,
        uploadedFile,
      );

      let resolvedSessionId = resolved.examinationSessionId;

      if (submission.fileType === 'bc2_result') {
        resolvedSessionId = submission.examinationSessionId;
      }

      /**
       * 4. Không cho chuyển một hồ sơ
       * sang kỳ khác bằng thao tác thay file.
       */
      if (resolvedSessionId !== submission.examinationSessionId) {
        throw new ConflictException(
          'File thay thế thuộc kỳ sát hạch khác. ' +
            'Vui lòng gửi một hồ sơ mới.',
        );
      }

      /**
       * 5. Xây dựng lại metadata.
       *
       * Các giá trị được kiểm tra từ XML
       * phải ghi đè dữ liệu do FE gửi.
       */
      const metadata = this.parseUploadMetadata(
        submission.fileType,
        rawMetadata,
        resolved.metadata,
      );

      await this.validateMetadataSession(
        submission.fileType,
        metadata,
        submission.examinationCenterId,
        resolvedSessionId,
      );

      const storedMetadata =
        submission.fileType === 'exam_result'
          ? {
              ...metadata,
              itOfficerUserId: await this.resolveItPc08(metadata),
            }
          : metadata;

      /**
       * 6. Kiểm tra file và lưu vật lý.
       */
      stored = await this.prepareStoredFile(uploadedFile);

      /**
       * 7. Thay phiên bản bên trong transaction.
       */
      await this.db.transaction(async (manager) => {
        const locked: Array<{
          status: SubmissionStatus;
          current_version: number;
          uploaded_by_user_id: number;
          examination_session_id: number | null;
        }> = await manager.query(
          `
          SELECT
            status,
            current_version,
            uploaded_by_user_id,
            examination_session_id
          FROM file_submissions
          WHERE id = $1
          FOR UPDATE
        `,
          [id],
        );

        if (
          !locked.length ||
          locked[0].status !== 'pending' ||
          Number(locked[0].uploaded_by_user_id) !== user.sub
        ) {
          throw new ConflictException(
            'Hồ sơ đã được xử lý, không thể thay file.',
          );
        }

        if (Number(locked[0].current_version) !== submission.currentVersion) {
          throw new ConflictException(
            'Phiên bản hồ sơ đã thay đổi. Vui lòng tải lại.',
          );
        }

        if (locked[0].examination_session_id !== resolvedSessionId) {
          throw new ConflictException('Liên kết kỳ sát hạch đã thay đổi.');
        }

        const nextVersion = Number(locked[0].current_version) + 1;

        await manager.query(
          `
          INSERT INTO file_submission_versions (
            submission_id,
            version,
            original_name,
            storage_key,
            mime_type,
            size_bytes,
            sha256,
            uploaded_by_user_id,
            document_metadata
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb
          )
        `,
          [
            id,
            nextVersion,
            stored!.originalName,
            stored!.storageKey,
            stored!.mimeType,
            stored!.sizeBytes,
            stored!.sha256,
            user.sub,
            JSON.stringify(storedMetadata),
          ],
        );

        await manager.query(
          `
          UPDATE file_submissions
          SET
            current_version = $2,
            import_status = 'not_processed',
            import_error = NULL,
            import_result = NULL,
            import_batch_id = NULL,
            import_completed_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
          [id, nextVersion],
        );

        await this.addEvent(manager, id, user.sub, 'version_uploaded', {
          version: nextVersion,
          filename: stored!.originalName,
          examinationSessionId: resolvedSessionId,
          documentMetadata: storedMetadata,
        });
      });

      stored = null;

      return this.findOne(id);
    } finally {
      if (uploadedFile?.path) {
        await unlink(uploadedFile.path).catch(() => undefined);
      }

      if (stored) {
        await unlink(stored.absolutePath).catch(() => undefined);
      }
    }
  }

  async review(
    user: AuthUser,
    id: number,
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<SubmissionRow> {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException();
    }

    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('Thao tác phê duyệt không hợp lệ.');
    }

    const cleanedReason = reason?.trim().slice(0, 2000) || null;

    if (action === 'reject' && !cleanedReason) {
      throw new BadRequestException('Phải nhập lý do từ chối.');
    }

    await this.db.transaction(async (manager) => {
      const locked: Array<{
        status: SubmissionStatus;
      }> = await manager.query(
        `
          SELECT status
          FROM file_submissions
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      if (!locked.length) {
        throw new NotFoundException('Không tìm thấy hồ sơ.');
      }

      if (locked[0].status !== 'pending') {
        throw new ConflictException('Hồ sơ đã được xử lý trước đó.');
      }

      const status = action === 'approve' ? 'approved' : 'rejected';

      await manager.query(
        `
          UPDATE file_submissions
          SET status = $2,
              rejection_reason = $3,
              reviewed_by_user_id = $4,
              reviewed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [id, status, action === 'reject' ? cleanedReason : null, user.sub],
      );

      await this.addEvent(manager, id, user.sub, status, {
        reason: cleanedReason,
        importStatus: 'not_processed',
      });
    });

    return this.findOne(id);
  }

  async versions(user: AuthUser, id: number) {
    const submission = await this.findOne(id);

    this.ensureVisible(user, submission);

    const rows: VersionRow[] = await this.db.query(
      `
        SELECT
          id,
          submission_id AS "submissionId",
          version,
          original_name AS "originalName",
          storage_key AS "storageKey",
          mime_type AS "mimeType",
          size_bytes::text AS "sizeBytes",
          sha256,
          COALESCE(document_metadata, '{}'::jsonb) AS "documentMetadata",
          created_at AS "createdAt"
        FROM file_submission_versions
        WHERE submission_id = $1
        ORDER BY version DESC
      `,
      [id],
    );

    return rows.map(({ storageKey, ...version }) => version);
  }

  async download(
    user: AuthUser,
    id: number,
    version?: string,
  ): Promise<{
    absolutePath: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const submission = await this.findOne(id);

    this.ensureVisible(user, submission);

    const selectedVersion =
      version === undefined
        ? submission.currentVersion
        : parsePositiveId(version, 'Phiên bản');

    const rows: VersionRow[] = await this.db.query(
      `
        SELECT
          id,
          submission_id AS "submissionId",
          version,
          original_name AS "originalName",
          storage_key AS "storageKey",
          mime_type AS "mimeType",
          size_bytes::text AS "sizeBytes",
          sha256,
          COALESCE(document_metadata, '{}'::jsonb) AS "documentMetadata",
          created_at AS "createdAt"
        FROM file_submission_versions
        WHERE submission_id = $1
          AND version = $2
        LIMIT 1
      `,
      [id, selectedVersion],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy phiên bản file.');
    }

    const selected = rows[0];

    if (!/^[a-f0-9-]{36}\.(xml|xlsx|xls|pdf)$/i.test(selected.storageKey)) {
      throw new ConflictException('Khóa lưu trữ file không hợp lệ.');
    }

    const absolutePath = join(STORAGE_ROOT, selected.storageKey);

    let fileInfo: Awaited<ReturnType<typeof stat>>;

    try {
      fileInfo = await stat(absolutePath);
    } catch {
      throw new NotFoundException('File không tồn tại trên máy chủ.');
    }

    const expectedSize = Number(selected.sizeBytes);

    if (!fileInfo.isFile() || fileInfo.size !== expectedSize) {
      throw new ConflictException(
        'Kích thước file không khớp dữ liệu lưu trữ.',
      );
    }

    let currentHash: string;

    try {
      currentHash = await hashFile(absolutePath);
    } catch {
      throw new NotFoundException('Không thể đọc file trên máy chủ.');
    }

    if (currentHash !== selected.sha256) {
      throw new ConflictException('File không vượt qua kiểm tra SHA-256.');
    }

    await this.addEvent(this.db.manager, id, user.sub, 'downloaded', {
      version: selectedVersion,
    });

    return {
      absolutePath,
      filename: selected.originalName,
      mimeType: selected.mimeType,
      sizeBytes: expectedSize,
    };
  }
}
