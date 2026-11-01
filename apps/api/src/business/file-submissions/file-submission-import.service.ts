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
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { Bc1ImportService } from '../imports/bc1-import.service.js';
import { Bc2ImportService } from '../imports/bc2-import.service.js';
import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

type ImportType = 'bc1' | 'bc2';

type ImportSource = {
  id: number;
  fileType: ImportType;
  status: string;
  importStatus: string;
  currentVersion: number;
  trainingSchoolId: number | null;
  schoolCode: string | null;
  originalName: string;
  storageKey: string;
  sizeBytes: string;
  sha256: string;
};

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

/**
 * Parser BC1/BC2 hiện tại vẫn nhận Buffer.
 * Giới hạn import độc lập với giới hạn upload.
 */
function maxImportBytes(): number {
  const mb = Number(process.env.FILE_IMPORT_MAX_MB ?? 64);

  if (!Number.isFinite(mb) || mb <= 0 || mb > 1024) {
    throw new Error('FILE_IMPORT_MAX_MB không hợp lệ.');
  }

  return Math.floor(mb * 1024 * 1024);
}

/**
 * Tính SHA-256 bằng stream,
 * không đọc toàn bộ file để tính hash.
 */
async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 4000);
  }

  return 'Không thể xử lý file XML.';
}

@Injectable()
export class FileSubmissionImportService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly bc1Import: Bc1ImportService,
    private readonly bc2Import: Bc2ImportService,
  ) {}

  private checkSuperAdmin(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN được phê duyệt import.');
    }
  }

  /**
   * =====================================================
   * XÁC ĐỊNH LOẠI FILE
   * =====================================================
   *
   * Được FileSubmissionsController sử dụng
   * để điều phối:
   *
   * - bc1, bc2: FileSubmissionImportService
   * - exam_48, exam_result: ExamFileApprovalService
   * - bc2_result: FileSubmissionsService
   *
   * Chỉ SUPER_ADMIN được gọi.
   */
  async getFileType(user: AuthUser, id: number): Promise<string> {
    this.checkSuperAdmin(user);

    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('ID hồ sơ không hợp lệ.');
    }

    const rows: Array<{
      fileType: string;
    }> = await this.db.query(
      `
        SELECT
          file_type AS "fileType"
        FROM file_submissions
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy hồ sơ.');
    }

    return rows[0].fileType;
  }

  /**
   * =====================================================
   * LẤY THÔNG TIN FILE BC1 / BC2
   * =====================================================
   */
  private async source(id: number): Promise<ImportSource> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('ID hồ sơ không hợp lệ.');
    }

    const rows: ImportSource[] = await this.db.query(
      `
          SELECT
            s.id,
            s.file_type AS "fileType",
            s.status,
            s.import_status AS "importStatus",
            s.current_version AS "currentVersion",
            s.training_school_id AS "trainingSchoolId",
            ts.code AS "schoolCode",

            v.original_name AS "originalName",
            v.storage_key AS "storageKey",
            v.size_bytes::text AS "sizeBytes",
            v.sha256

          FROM file_submissions s

          JOIN file_submission_versions v
            ON v.submission_id = s.id
           AND v.version = s.current_version

          LEFT JOIN training_schools ts
            ON ts.id = s.training_school_id

          WHERE s.id = $1
          LIMIT 1
        `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy hồ sơ hoặc phiên bản file.');
    }

    return rows[0];
  }

  /**
   * =====================================================
   * CLAIM HỒ SƠ TRƯỚC KHI IMPORT
   * =====================================================
   *
   * Khóa dòng PostgreSQL để:
   * - Chống hai admin duyệt đồng thời.
   * - Không duyệt nhầm phiên bản vừa thay.
   * - Chuyển pending -> processing.
   */
  private async claim(id: number, expectedVersion: number): Promise<void> {
    await this.db.transaction(async (manager) => {
      const rows: Array<{
        status: string;
        current_version: number;
      }> = await manager.query(
        `
            SELECT
              status,
              current_version
            FROM file_submissions
            WHERE id = $1
            FOR UPDATE
          `,
        [id],
      );

      if (!rows.length) {
        throw new NotFoundException('Không tìm thấy hồ sơ.');
      }

      if (rows[0].status !== 'pending') {
        throw new ConflictException('Hồ sơ không còn ở trạng thái chờ duyệt.');
      }

      const actualVersion = Number(rows[0].current_version);

      if (actualVersion !== expectedVersion) {
        throw new ConflictException(
          'File vừa được thay phiên bản. ' +
            'Vui lòng tải lại danh sách trước khi duyệt.',
        );
      }

      await manager.query(
        `
            UPDATE file_submissions
            SET status = 'processing',
                import_status = 'processing',
                import_error = NULL,
                import_result = NULL,
                processing_started_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
        [id],
      );
    });
  }

  /**
   * =====================================================
   * ĐÁNH DẤU IMPORT THÀNH CÔNG
   * =====================================================
   */
  private async complete(
    id: number,
    reviewerId: number,
    result: Record<string, unknown>,
    importBatchId: number,
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      const updated: Array<{
        id: number;
      }> = await manager.query(
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
            RETURNING id
          `,
        [id, reviewerId, importBatchId, JSON.stringify(result)],
      );

      if (!updated.length) {
        throw new ConflictException(
          'Trạng thái hồ sơ thay đổi trong khi import.',
        );
      }

      await manager.query(
        `
            INSERT INTO file_submission_events (
              submission_id,
              actor_user_id,
              action,
              detail
            )
            VALUES (
              $1,
              $2,
              'approved',
              $3::jsonb
            )
          `,
        [
          id,
          reviewerId,
          JSON.stringify({
            importStatus: 'completed',
            importBatchId,
            result,
          }),
        ],
      );
    });
  }

  /**
   * =====================================================
   * ĐÁNH DẤU IMPORT THẤT BẠI
   * =====================================================
   *
   * Hồ sơ quay về pending để có thể thay
   * file hoặc thử xử lý lại.
   */
  private async fail(id: number, message: string): Promise<void> {
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
   * =====================================================
   * SUPER_ADMIN DUYỆT VÀ IMPORT BC1 / BC2
   * =====================================================
   */
  async approve(user: AuthUser, submissionId: number) {
    this.checkSuperAdmin(user);

    const source = await this.source(submissionId);

    if (source.fileType !== 'bc1' && source.fileType !== 'bc2') {
      throw new BadRequestException('Service này chỉ xử lý BC1 và BC2.');
    }

    if (source.status !== 'pending') {
      throw new ConflictException('Hồ sơ không còn chờ duyệt.');
    }

    // Khóa hồ sơ và xác nhận đúng phiên bản.
    await this.claim(submissionId, source.currentVersion);

    try {
      if (!source.schoolCode) {
        throw new BadRequestException('Hồ sơ chưa liên kết với CSĐT hợp lệ.');
      }

      if (!/^[a-f0-9-]{36}\.xml$/i.test(source.storageKey)) {
        throw new BadRequestException('BC1 và BC2 phải là file XML.');
      }

      if (!/\.xml$/i.test(source.originalName)) {
        throw new BadRequestException(
          'Tên file BC1 hoặc BC2 không đúng định dạng XML.',
        );
      }

      const absolutePath = join(STORAGE_ROOT, source.storageKey);

      const info = await stat(absolutePath);

      if (!info.isFile() || info.size !== Number(source.sizeBytes)) {
        throw new ConflictException('File trên server không khớp metadata.');
      }

      if (info.size > maxImportBytes()) {
        throw new BadRequestException(
          `File vượt giới hạn import ` +
            `${process.env.FILE_IMPORT_MAX_MB ?? 64} MB. ` +
            'Upload đã thành công nhưng parser BC1/BC2 ' +
            'hiện tại chưa hỗ trợ import streaming.',
        );
      }

      const actualHash = await sha256OfFile(absolutePath);

      if (actualHash !== source.sha256) {
        throw new ConflictException(
          'SHA-256 không khớp. ' + 'File có thể đã bị thay đổi.',
        );
      }

      /**
       * Adapter file trên disk sang Multer File.
       *
       * Bc1ImportService và Bc2ImportService
       * hiện sử dụng file.buffer.
       *
       * Chỉ đọc Buffer sau khi đã kiểm tra
       * dung lượng và tính toàn vẹn.
       */
      const buffer = await readFile(absolutePath);

      const multerFile = {
        fieldname: 'file',
        originalname: source.originalName,
        encoding: '7bit',
        mimetype: 'application/xml',
        size: buffer.length,
        buffer,
        destination: '',
        filename: source.storageKey,
        path: absolutePath,
        stream: createReadStream(absolutePath),
      } as Express.Multer.File;

      let importResult: Record<string, unknown>;

      if (source.fileType === 'bc1') {
        /**
         * BC1: kiểm tra mã CSĐT của XML
         * trước khi ghi dữ liệu.
         */
        const preview = await this.bc1Import.preview(multerFile);

        const xmlSchoolCode = preview.school.code?.trim();

        const assignedSchoolCode = source.schoolCode.trim();

        if (xmlSchoolCode !== assignedSchoolCode) {
          throw new BadRequestException(
            'Mã CSĐT trong BC1 không khớp ' + 'với CSĐT của tài khoản gửi.',
          );
        }

        importResult = await this.bc1Import.confirm(multerFile, user.sub);
      } else {
        /**
         * BC2: giữ nguyên logic import cũ.
         */
        const preview = await this.bc2Import.preview(multerFile);

        const xmlSchoolCode = preview.report.schoolCode?.trim();

        const assignedSchoolCode = source.schoolCode.trim();

        if (xmlSchoolCode !== assignedSchoolCode) {
          throw new BadRequestException(
            'Mã CSĐT trong BC2 không khớp ' + 'với CSĐT của tài khoản gửi.',
          );
        }

        importResult = await this.bc2Import.confirm(multerFile, user.sub);
      }

      const importBatchId = Number(importResult.id);

      if (!Number.isSafeInteger(importBatchId) || importBatchId <= 0) {
        throw new Error(
          'Service import không trả về ' + 'ImportBatch ID hợp lệ.',
        );
      }

      await this.complete(submissionId, user.sub, importResult, importBatchId);

      return {
        id: submissionId,
        status: 'approved' as const,
        importStatus: 'completed' as const,
        importBatchId,
        importResult,
        importError: null,
      };
    } catch (error) {
      const message = errorMessage(error);

      await this.fail(submissionId, message);

      return {
        id: submissionId,
        status: 'pending' as const,
        importStatus: 'failed' as const,
        importBatchId: null,
        importResult: null,
        importError: message,
      };
    }
  }

  /**
   * =====================================================
   * TRA CỨU TRẠNG THÁI IMPORT
   * =====================================================
   *
   * SUPER_ADMIN: xem tất cả.
   * CSĐT, PC08, TTSH: chỉ xem file của mình.
   */
  async states(user: AuthUser, idsText: string) {
    const values = idsText.split(',').filter(Boolean);

    if (values.length === 0 || values.length > 100) {
      throw new BadRequestException('Chỉ truy vấn từ 1 đến 100 hồ sơ.');
    }

    const ids = [
      ...new Set(
        values.map((value) => {
          const trimmed = value.trim();

          if (!/^[1-9]\d*$/.test(trimmed)) {
            throw new BadRequestException('ID hồ sơ không hợp lệ.');
          }

          const id = Number(trimmed);

          if (!Number.isSafeInteger(id)) {
            throw new BadRequestException('ID hồ sơ vượt giới hạn.');
          }

          return id;
        }),
      ),
    ];

    const superAdmin = user.role === UserRole.SUPER_ADMIN;

    if (
      !superAdmin &&
      user.role !== UserRole.TRAINING_SCHOOL &&
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.EXAM_CENTER
    ) {
      throw new ForbiddenException('Không có quyền xem trạng thái import.');
    }

    return this.db.query(
      `
        SELECT
          id,
          status,
          import_status AS "importStatus",
          import_error AS "importError",
          import_result AS "importResult",
          import_batch_id AS "importBatchId",
          processing_started_at AS "processingStartedAt",
          import_completed_at AS "importCompletedAt"

        FROM file_submissions

        WHERE id = ANY($1::int[])
          AND (
            $2::boolean = TRUE
            OR uploaded_by_user_id = $3
          )

        ORDER BY id DESC
      `,
      [ids, superAdmin, user.sub],
    );
  }
}
