import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DataSource, type EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { ExamListImportService } from '../imports/exam-list-import.service.js';
import { ExamResultImportService } from '../imports/exam-result-import.service.js';

type ExamFileType = 'exam_48' | 'exam_result';

type SourceRow = {
  id: number;
  fileType: ExamFileType;
  status: string;
  currentVersion: number;
  examinationCenterId: number | null;
  examinationCenterCode: string | null;
  examinationSessionId: number | null;
  originalName: string;
  storageKey: string;
  sizeBytes: string;
  sha256: string;
};

type ImportResult = {
  id: number;
  [key: string]: unknown;
};

type ImportOutcome = {
  id: number;
  status: 'approved' | 'pending';
  importStatus: 'completed' | 'failed';
  importBatchId: number | null;
  importResult: Record<string, unknown> | null;
  importError: string | null;
};

type SelectedSession = {
  id: number;
  code: string;
  officialCode: string | null;
  examinationCenterId: number;
  centerCode: string;
  examDate: string | null;
};

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

function maxImportBytes(): number {
  const configured = Number(process.env.FILE_IMPORT_MAX_MB ?? 64);

  if (!Number.isFinite(configured) || configured <= 0 || configured > 1024) {
    throw new Error('FILE_IMPORT_MAX_MB phải lớn hơn 0 và không quá 1024.');
  }

  return Math.floor(configured * 1024 * 1024);
}

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 4000);
  }

  return 'Không thể xử lý XML sát hạch.';
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

@Injectable()
export class ExamFileApprovalService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly examListImport: ExamListImportService,
    private readonly examResultImport: ExamResultImportService,
  ) {}

  private assertSuperAdmin(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN được phê duyệt hồ sơ.');
    }
  }

  private async loadSource(id: number): Promise<SourceRow> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Mã hồ sơ không hợp lệ.');
    }

    const rows: SourceRow[] = await this.db.query(
      `
        SELECT
          s.id,
          s.file_type AS "fileType",
          s.status,
          s.current_version AS "currentVersion",
          s.examination_center_id AS "examinationCenterId",
          s.examination_session_id AS "examinationSessionId",
          ec.code AS "examinationCenterCode",
          v.original_name AS "originalName",
          v.storage_key AS "storageKey",
          v.size_bytes::text AS "sizeBytes",
          v.sha256

        FROM file_submissions s

        JOIN file_submission_versions v
          ON v.submission_id = s.id
         AND v.version = s.current_version

        LEFT JOIN examination_centers ec
          ON ec.id = s.examination_center_id

        WHERE s.id = $1
          AND s.file_type IN ('exam_48', 'exam_result')

        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ dự thi hoặc kết quả sát hạch.',
      );
    }

    return rows[0];
  }

  /**
   * Khóa trạng thái hồ sơ trước khi import.
   */
  private async claim(source: SourceRow): Promise<void> {
    await this.db.transaction(async (manager) => {
      const rows: Array<{
        status: string;
        currentVersion: number;
        examinationSessionId: number | null;
      }> = await manager.query(
        `
          SELECT
            status,
            current_version AS "currentVersion",
            examination_session_id AS "examinationSessionId"
          FROM file_submissions
          WHERE id = $1
          FOR UPDATE
        `,
        [source.id],
      );

      if (!rows.length) {
        throw new NotFoundException('Không tìm thấy hồ sơ.');
      }

      if (rows[0].status !== 'pending') {
        throw new ConflictException('Hồ sơ đã được xử lý hoặc đang import.');
      }

      if (Number(rows[0].currentVersion) !== source.currentVersion) {
        throw new ConflictException(
          'File vừa được cập nhật. Vui lòng tải lại danh sách.',
        );
      }

      if (
        Number(rows[0].examinationSessionId) !==
        Number(source.examinationSessionId)
      ) {
        throw new ConflictException('Kỳ sát hạch của hồ sơ đã thay đổi.');
      }

      await manager.query(
        `
          UPDATE file_submissions
          SET
            status = 'processing',
            import_status = 'processing',
            import_error = NULL,
            processing_started_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [source.id],
      );
    });
  }

  private async addEvent(
    manager: EntityManager,
    submissionId: number,
    userId: number,
    action: string,
    detail: Record<string, unknown>,
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
      [submissionId, userId, action, JSON.stringify(detail)],
    );
  }

  private async markCompleted(
    source: SourceRow,
    reviewerId: number,
    result: ImportResult,
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      /**
       * 1. Đánh dấu file đã được duyệt
       * và import thành công.
       */
      const updated: Array<{ id: number }> = await manager.query(
        `
          UPDATE file_submissions
          SET
            status = 'approved',
            import_status = 'completed',
            import_batch_id = $3,
            import_result = $4::jsonb,
            import_error = NULL,
            reviewed_by_user_id = $2,
            reviewed_at = NOW(),
            import_completed_at = NOW(),
            processing_started_at = NULL,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'processing'
            AND current_version = $5
            AND examination_session_id
                IS NOT DISTINCT FROM $6::integer
          RETURNING id
        `,
        [
          source.id,
          reviewerId,
          result.id,
          JSON.stringify(result),
          source.currentVersion,
          source.examinationSessionId,
        ],
      );

      if (!updated.length) {
        throw new ConflictException(
          'Trạng thái hoặc kỳ sát hạch của hồ sơ đã thay đổi.',
        );
      }

      /**
       * 2. Riêng file KQSH:
       * Duyệt và import thành công => hoàn tất kỳ.
       *
       * Không áp dụng cho BC1, BC2 hoặc 48_.
       */
      if (source.fileType === 'exam_result') {
        const sessionCode =
          typeof result.sessionCode === 'string'
            ? result.sessionCode.trim()
            : '';

        if (!sessionCode) {
          throw new ConflictException(
            'KQSH import thành công nhưng không trả về mã kỳ sát hạch.',
          );
        }

        /**
         * Xác minh kỳ chính thức từ kết quả import,
         * đồng thời đối chiếu với kỳ và TTSH
         * được liên kết ở file_submissions.
         */
        const sessions: Array<{
          id: number;
          completedAt: Date | null;
        }> = await manager.query(
          `
          SELECT
            es.id,
            es.completed_at AS "completedAt"
          FROM examination_sessions es
          WHERE UPPER(TRIM(es.official_code)) =
                UPPER(TRIM($1::text))
            AND (
              $2::integer IS NULL
              OR es.id = $2::integer
            )
            AND (
              $3::integer IS NULL
              OR es.examination_center_id = $3::integer
            )
          FOR UPDATE
        `,
          [
            sessionCode,
            source.examinationSessionId,
            source.examinationCenterId,
          ],
        );

        if (sessions.length !== 1) {
          throw new ConflictException(
            'Không xác định được duy nhất kỳ sát hạch ' +
              'tương ứng với KQSH đã import.',
          );
        }

        const sessionId = Number(sessions[0].id);

        /**
         * Chỉ ghi thời gian hoàn tất lần đầu.
         *
         * Nếu PC08 đã xác nhận kỳ trước đó,
         * giữ nguyên thông tin xác nhận cũ.
         */
        await manager.query(
          `
          UPDATE examination_sessions
          SET
            completed_by_user_id = CASE
              WHEN completed_at IS NULL
                THEN $2
              ELSE completed_by_user_id
            END,
            completed_at = COALESCE(
              completed_at,
              NOW()
            ),
            updated_at = NOW()
          WHERE id = $1
        `,
          [sessionId, reviewerId],
        );

        /**
         * Ghi lịch sử tự động hoàn tất kỳ.
         */
        await this.addEvent(
          manager,
          source.id,
          reviewerId,
          'exam_session_completed',
          {
            examinationSessionId: sessionId,
            sessionCode,
            importBatchId: result.id,
            completedBy: 'exam_result_approval',
            alreadyCompleted: Boolean(sessions[0].completedAt),
          },
        );
      }

      /**
       * 3. Ghi lịch sử duyệt hồ sơ.
       *
       * Các thay đổi file và trạng thái kỳ
       * cùng nằm trong transaction này.
       */
      await this.addEvent(manager, source.id, reviewerId, 'approved', {
        fileType: source.fileType,
        examinationSessionId: source.examinationSessionId,
        importStatus: 'completed',
        importBatchId: result.id,
        result,
      });
    });
  }

  private async markFailed(id: number, message: string): Promise<void> {
    await this.db.query(
      `
        UPDATE file_submissions
        SET
          status = 'pending',
          import_status = 'failed',
          import_error = $2,
          processing_started_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'processing'
      `,
      [id, message],
    );
  }

  private async findImportedBatch(sha256: string): Promise<number | null> {
    const rows: Array<{ id: number }> = await this.db.query(
      `
          SELECT id
          FROM import_batches
          WHERE file_sha256 = $1
          LIMIT 1
        `,
      [sha256],
    );

    return rows.length ? Number(rows[0].id) : null;
  }

  private async verifySourceFile(source: SourceRow): Promise<{
    path: string;
    buffer: Buffer;
  }> {
    if (!/^[a-f0-9-]{36}\.xml$/i.test(source.storageKey)) {
      throw new BadRequestException(
        'File dự sát hạch và kết quả sát hạch phải là XML.',
      );
    }

    if (extname(source.originalName).toLowerCase() !== '.xml') {
      throw new BadRequestException('Tên file phải có phần mở rộng .xml.');
    }

    const path = join(STORAGE_ROOT, source.storageKey);

    const fileInfo = await stat(path);

    if (!fileInfo.isFile() || fileInfo.size !== Number(source.sizeBytes)) {
      throw new ConflictException(
        'Dung lượng file không khớp dữ liệu lưu trên server.',
      );
    }

    if (fileInfo.size > maxImportBytes()) {
      throw new BadRequestException(
        `File vượt giới hạn import ${process.env.FILE_IMPORT_MAX_MB ?? 64} MB.`,
      );
    }

    const actualHash = await sha256File(path);

    if (actualHash !== source.sha256) {
      throw new ConflictException('SHA-256 của file không khớp metadata.');
    }

    return {
      path,
      buffer: await readFile(path),
    };
  }

  /**
   * Truy xuất kỳ dựa trên ID lưu trong
   * file_submissions, không dựa trên mã từ FE.
   */
  private async getSelectedSession(
    source: SourceRow,
  ): Promise<SelectedSession> {
    if (
      !Number.isSafeInteger(Number(source.examinationSessionId)) ||
      !source.examinationSessionId ||
      Number(source.examinationSessionId) <= 0
    ) {
      throw new BadRequestException(
        'Hồ sơ chưa gắn với kỳ sát hạch. ' + 'Phải chọn kỳ khi gửi file.',
      );
    }

    const rows: SelectedSession[] = await this.db.query(
      `
          SELECT
            es.id,
            es.code,
            es.official_code AS "officialCode",
            es.examination_center_id
              AS "examinationCenterId",
            ec.code AS "centerCode",
            es.exam_date::text AS "examDate"

          FROM examination_sessions es

          JOIN examination_centers ec
            ON ec.id = es.examination_center_id

          WHERE es.id = $1
          LIMIT 1
        `,
      [source.examinationSessionId],
    );

    if (!rows.length) {
      throw new BadRequestException('Kỳ sát hạch đã chọn không còn tồn tại.');
    }

    const session = rows[0];

    if (
      source.examinationCenterId !== null &&
      Number(source.examinationCenterId) !== Number(session.examinationCenterId)
    ) {
      throw new BadRequestException(
        'TTSH được chỉ định trên hồ sơ ' +
          'không khớp TTSH quản lý kỳ sát hạch.',
      );
    }

    if (
      source.examinationCenterCode &&
      normalizeCode(source.examinationCenterCode) !==
        normalizeCode(session.centerCode)
    ) {
      throw new BadRequestException(
        'Mã TTSH trên hồ sơ không khớp kỳ sát hạch.',
      );
    }

    return session;
  }

  /**
   * Import file sau khi kiểm tra mã kỳ,
   * trung tâm và nội dung XML.
   */
  private async importFile(
    source: SourceRow,
    userId: number,
  ): Promise<ImportResult> {
    const selectedSession = await this.getSelectedSession(source);

    const { path, buffer } = await this.verifySourceFile(source);

    const file = {
      fieldname: 'file',
      originalname: source.originalName,
      encoding: '7bit',
      mimetype: 'application/xml',
      size: buffer.byteLength,
      buffer,
      destination: STORAGE_ROOT,
      filename: source.storageKey,
      path,
      stream: createReadStream(path),
    } as Express.Multer.File;

    if (source.fileType === 'exam_48') {
      const preview = await this.examListImport.preview(file);

      const xmlCenterCode = preview.session.examinationCenterCode;

      if (
        normalizeCode(xmlCenterCode) !==
        normalizeCode(selectedSession.centerCode)
      ) {
        throw new BadRequestException(
          `Mã TTSH trong file 48_ (${xmlCenterCode}) ` +
            `không khớp TTSH kỳ đã chọn ` +
            `(${selectedSession.centerCode}).`,
        );
      }

      if (
        selectedSession.examDate &&
        preview.session.examDate &&
        selectedSession.examDate.slice(0, 10) !==
          preview.session.examDate.slice(0, 10)
      ) {
        throw new BadRequestException(
          'Ngày sát hạch trong file 48_ ' + 'không khớp ngày của kỳ đã chọn.',
        );
      }

      if (
        selectedSession.officialCode &&
        normalizeCode(selectedSession.officialCode) !==
          normalizeCode(preview.session.code)
      ) {
        throw new ConflictException(
          `Kỳ đã có mã chính thức ` +
            `${selectedSession.officialCode}, ` +
            `khác mã trong file 48_ ` +
            `${preview.session.code}.`,
        );
      }

      if (preview.alreadyImported) {
        throw new ConflictException(
          `File 48_ đã được import trước đó ` +
            `(batch #${preview.existingImportId}).`,
        );
      }

      /**
       * confirm() đã được cập nhật ở Bước 3:
       * nhận examinationSessionId ở tham số 3.
       */
      return this.examListImport.confirm(file, userId, selectedSession.id);
    }

    /**
     * KQSH chỉ được import sau khi file 48_
     * đã cung cấp mã kỳ chính thức.
     */
    if (!selectedSession.officialCode) {
      throw new BadRequestException(
        'Kỳ sát hạch chưa có mã chính thức. ' +
          'Cần duyệt và import file 48_ trước.',
      );
    }

    const preview = await this.examResultImport.preview(file);

    if (
      normalizeCode(preview.sessionCode) !==
      normalizeCode(selectedSession.officialCode)
    ) {
      throw new BadRequestException(
        `Mã kỳ trong KQSH (${preview.sessionCode}) ` +
          `không khớp mã kỳ đã chọn ` +
          `(${selectedSession.officialCode}).`,
      );
    }

    if (preview.alreadyImported) {
      throw new ConflictException(
        `File kết quả sát hạch đã được import ` +
          `(batch #${preview.existingImportId}).`,
      );
    }

    if (!preview.canImport) {
      throw new ConflictException(
        'Dữ liệu KQSH chưa khớp danh sách dự sát hạch.',
      );
    }

    return this.examResultImport.confirm(file, userId);
  }

  /**
   * SUPER_ADMIN phê duyệt và import.
   *
   * Giữ nguyên response để không làm
   * ảnh hưởng các panel trạng thái hiện có.
   */
  async approve(
    user: AuthUser,
    id: number,
    selectedFileIds?: number[],
  ): Promise<ImportOutcome> {
    this.assertSuperAdmin(user);

    const source = await this.loadSource(id);

    if (source.fileType === 'exam_48') {
      if (!Array.isArray(selectedFileIds)) {
        throw new BadRequestException(
          'Vui lòng chọn danh sách BC1, BC2 trước khi duyệt file 48_.',
        );
      }

      if (
        selectedFileIds.length > 500 ||
        selectedFileIds.some(
          (fileId) => !Number.isSafeInteger(fileId) || fileId <= 0,
        )
      ) {
        throw new BadRequestException('Danh sách BC1, BC2 không hợp lệ.');
      }
    }

    if (source.status !== 'pending') {
      throw new ConflictException('Hồ sơ không còn ở trạng thái chờ duyệt.');
    }

    await this.claim(source);

    try {
      const existingBatch = await this.findImportedBatch(source.sha256);

      if (existingBatch) {
        throw new ConflictException(
          `Nội dung file đã tồn tại trong import batch ` + `#${existingBatch}.`,
        );
      }

      const result = await this.importFile(source, user.sub);

      const batchId = Number(result.id);

      if (!Number.isSafeInteger(batchId) || batchId <= 0) {
        throw new ConflictException(
          'Service import không trả về batch ID hợp lệ.',
        );
      }

      await this.markCompleted(source, user.sub, result);

      return {
        id,
        status: 'approved',
        importStatus: 'completed',
        importBatchId: batchId,
        importResult: result,
        importError: null,
      };
    } catch (error) {
      const message = errorText(error);

      await this.markFailed(id, message);

      return {
        id,
        status: 'pending',
        importStatus: 'failed',
        importBatchId: null,
        importResult: null,
        importError: message,
      };
    }
  }
}
