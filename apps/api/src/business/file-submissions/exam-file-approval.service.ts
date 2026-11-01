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
   * Khóa trạng thái và phiên bản trong transaction.
   * Không cho phép thay file khi đang import.
   */
  private async claim(source: SourceRow): Promise<void> {
    await this.db.transaction(async (manager) => {
      const rows: Array<{
        status: string;
        currentVersion: number;
      }> = await manager.query(
        `
            SELECT
              status,
              current_version AS "currentVersion"
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

      await manager.query(
        `
            UPDATE file_submissions
            SET status = 'processing',
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
      const updated: Array<{ id: number }> = await manager.query(
        `
              UPDATE file_submissions
              SET status = 'approved',
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
              RETURNING id
            `,
        [
          source.id,
          reviewerId,
          result.id,
          JSON.stringify(result),
          source.currentVersion,
        ],
      );

      if (!updated.length) {
        throw new ConflictException(
          'Trạng thái hồ sơ thay đổi trong khi import.',
        );
      }

      await this.addEvent(manager, source.id, reviewerId, 'approved', {
        fileType: source.fileType,
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
          SET status = 'pending',
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

  /**
   * Nếu import đã commit DB nhưng cập nhật trạng thái
   * hồ sơ chưa thành công, đối soát theo SHA-256.
   *
   * import_batches.file_sha256 có unique constraint.
   */
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
        `File vượt giới hạn import ${
          process.env.FILE_IMPORT_MAX_MB ?? 64
        } MB. Cần tối ưu parser XML trước khi import file lớn hơn.`,
      );
    }

    const actualHash = await sha256File(path);

    if (actualHash !== source.sha256) {
      throw new ConflictException('SHA-256 của file không khớp metadata.');
    }

    const buffer = await readFile(path);

    return { path, buffer };
  }

  private async validateExamResultCenter(
    sessionCode: string,
    centerCode: string,
  ): Promise<void> {
    const rows: Array<{
      examinationCenterCode: string;
    }> = await this.db.query(
      `
          SELECT
            ec.code AS "examinationCenterCode"
          FROM examination_sessions es
          JOIN examination_centers ec
            ON ec.id = es.examination_center_id
          WHERE es.code = $1
          LIMIT 1
        `,
      [sessionCode],
    );

    if (!rows.length) {
      throw new BadRequestException(
        `Chưa có kỳ sát hạch ${sessionCode}. ` +
          'Phải duyệt và import file 48_ trước.',
      );
    }

    if (
      normalizeCode(rows[0].examinationCenterCode) !== normalizeCode(centerCode)
    ) {
      throw new BadRequestException(
        'Trung tâm sát hạch của file KQSH không khớp ' +
          'với trung tâm quản lý kỳ sát hạch.',
      );
    }
  }

  private async importFile(
    source: SourceRow,
    userId: number,
  ): Promise<ImportResult> {
    if (!source.examinationCenterCode) {
      throw new BadRequestException('Hồ sơ chưa có trung tâm sát hạch hợp lệ.');
    }

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
        normalizeCode(source.examinationCenterCode)
      ) {
        throw new BadRequestException(
          `Mã TTSH trong file 48_ (${xmlCenterCode}) ` +
            `không khớp TTSH được chỉ định ` +
            `(${source.examinationCenterCode}).`,
        );
      }

      if (preview.alreadyImported) {
        throw new ConflictException(
          `File 48_ đã được import trước đó ` +
            `(batch #${preview.existingImportId}).`,
        );
      }

      return this.examListImport.confirm(file, userId);
    }

    const preview = await this.examResultImport.preview(file);

    await this.validateExamResultCenter(
      preview.sessionCode,
      source.examinationCenterCode,
    );

    if (preview.alreadyImported) {
      throw new ConflictException(
        `File kết quả sát hạch đã được import ` +
          `(batch #${preview.existingImportId}).`,
      );
    }

    return this.examResultImport.confirm(file, userId);
  }

  async approve(user: AuthUser, id: number): Promise<ImportOutcome> {
    this.assertSuperAdmin(user);

    const source = await this.loadSource(id);

    if (source.status !== 'pending') {
      throw new ConflictException('Hồ sơ không còn ở trạng thái chờ duyệt.');
    }

    await this.claim(source);

    try {
      /**
       * Chặn import trùng trước khi chạy parser.
       * Nếu bản file đã được import từ luồng cũ,
       * không tự tuyên bố đây là lần import mới.
       */
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
