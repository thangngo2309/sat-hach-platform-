import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

type ReceivedFileRow = {
  id: number;
  fileType: 'bc2_result' | 'exam_48';
  status: string;
  importStatus: string;
  originalName: string;
  sizeBytes: string;
  currentVersion: number;
  sha256: string;
  uploadedByUserId: number;
  uploaderName: string;
  trainingSchoolId: number | null;
  trainingSchoolCode: string | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterCode: string | null;
  examinationCenterName: string | null;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

type StoredFileRow = {
  storageKey: string;
  originalName: string;
  sha256: string;
  sizeBytes: string;
};

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

function isAllowedReceiver(role: UserRole): boolean {
  return role === UserRole.TRAINING_SCHOOL || role === UserRole.EXAM_CENTER;
}

async function calculateSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

@Injectable()
export class ReceivedFilesService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertRole(user: AuthUser): void {
    if (!isAllowedReceiver(user.role)) {
      throw new ForbiddenException(
        'Tài khoản không có quyền nhận loại hồ sơ này.',
      );
    }
  }

  /**
   * Trả danh sách file đã duyệt thuộc đúng
   * đơn vị liên kết với tài khoản đăng nhập.
   *
   * Không nhận schoolId hoặc centerId từ client.
   */
  async list(user: AuthUser): Promise<ReceivedFileRow[]> {
    this.assertRole(user);

    return this.db.query(
      `
          SELECT
            s.id,
            s.file_type AS "fileType",
            s.status,
            s.import_status AS "importStatus",
            s.current_version AS "currentVersion",
            s.uploaded_by_user_id AS "uploadedByUserId",
            u.full_name AS "uploaderName",
            s.training_school_id AS "trainingSchoolId",
            ts.code AS "trainingSchoolCode",
            ts.name AS "trainingSchoolName",
            s.examination_center_id AS "examinationCenterId",
            ec.code AS "examinationCenterCode",
            ec.name AS "examinationCenterName",
            s.note,
            s.created_at AS "createdAt",
            s.reviewed_at AS "reviewedAt",
            v.original_name AS "originalName",
            v.size_bytes::text AS "sizeBytes",
            v.sha256
  
          FROM file_submissions s
  
          JOIN users u
            ON u.id = s.uploaded_by_user_id
  
          JOIN file_submission_versions v
            ON v.submission_id = s.id
           AND v.version = s.current_version
  
          LEFT JOIN training_schools ts
            ON ts.id = s.training_school_id
  
          LEFT JOIN examination_centers ec
            ON ec.id = s.examination_center_id
  
          JOIN user_organization_assignments a
            ON a.user_id = $1
  
          WHERE s.status = 'approved'
            AND (
              (
                $2::text = 'training_school'
                AND s.file_type = 'bc2_result'
                AND s.training_school_id = a.training_school_id
                AND a.training_school_id IS NOT NULL
              )
              OR
              (
                $2::text = 'exam_center'
                AND s.file_type = 'exam_48'
                AND s.examination_center_id = a.examination_center_id
                AND a.examination_center_id IS NOT NULL
              )
            )
  
          ORDER BY
            s.reviewed_at DESC NULLS LAST,
            s.id DESC
  
          LIMIT 500
        `,
      [user.sub, user.role],
    );
  }

  /**
   * Kiểm tra quyền lại ngay tại endpoint download.
   * Không được chỉ tin dữ liệu đã trả từ list().
   */
  private async findAccessible(
    user: AuthUser,
    id: number,
  ): Promise<ReceivedFileRow> {
    this.assertRole(user);

    const rows: ReceivedFileRow[] = await this.db.query(
      `
          SELECT
            s.id,
            s.file_type AS "fileType",
            s.status,
            s.import_status AS "importStatus",
            s.current_version AS "currentVersion",
            s.uploaded_by_user_id AS "uploadedByUserId",
            u.full_name AS "uploaderName",
            s.training_school_id AS "trainingSchoolId",
            ts.code AS "trainingSchoolCode",
            ts.name AS "trainingSchoolName",
            s.examination_center_id AS "examinationCenterId",
            ec.code AS "examinationCenterCode",
            ec.name AS "examinationCenterName",
            s.note,
            s.created_at AS "createdAt",
            s.reviewed_at AS "reviewedAt",
            v.original_name AS "originalName",
            v.size_bytes::text AS "sizeBytes",
            v.sha256
  
          FROM file_submissions s
  
          JOIN users u
            ON u.id = s.uploaded_by_user_id
  
          JOIN file_submission_versions v
            ON v.submission_id = s.id
           AND v.version = s.current_version
  
          LEFT JOIN training_schools ts
            ON ts.id = s.training_school_id
  
          LEFT JOIN examination_centers ec
            ON ec.id = s.examination_center_id
  
          JOIN user_organization_assignments a
            ON a.user_id = $2
  
          WHERE s.id = $1
            AND s.status = 'approved'
            AND (
              (
                $3::text = 'training_school'
                AND s.file_type = 'bc2_result'
                AND a.training_school_id IS NOT NULL
                AND s.training_school_id = a.training_school_id
              )
              OR
              (
                $3::text = 'exam_center'
                AND s.file_type = 'exam_48'
                AND a.examination_center_id IS NOT NULL
                AND s.examination_center_id = a.examination_center_id
              )
            )
  
          LIMIT 1
        `,
      [id, user.sub, user.role],
    );

    if (!rows.length) {
      // Không tiết lộ file ID thuộc đơn vị nào.
      throw new NotFoundException('Không tìm thấy file được phép tải.');
    }

    return rows[0];
  }

  async download(
    user: AuthUser,
    id: number,
  ): Promise<{
    path: string;
    filename: string;
    sizeBytes: number;
  }> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new NotFoundException('File không tồn tại.');
    }

    const accessible = await this.findAccessible(user, id);

    // Chỉ cho tải phiên bản đã được duyệt.
    // Không cho đơn vị nhận tải các phiên bản cũ
    // hoặc bản nháp chưa duyệt.
    const versions: StoredFileRow[] = await this.db.query(
      `
            SELECT
              storage_key AS "storageKey",
              original_name AS "originalName",
              sha256,
              size_bytes::text AS "sizeBytes"
            FROM file_submission_versions
            WHERE submission_id = $1
              AND version = $2
            LIMIT 1
          `,
      [id, accessible.currentVersion],
    );

    const version = versions[0];

    if (!version) {
      throw new NotFoundException('Không tìm thấy phiên bản đã duyệt.');
    }

    if (!/^[a-f0-9-]{36}\.(xml|xls|xlsx|pdf)$/i.test(version.storageKey)) {
      throw new ConflictException('Định danh file lưu trữ không hợp lệ.');
    }

    const filePath = join(STORAGE_ROOT, version.storageKey);

    let information: Awaited<ReturnType<typeof stat>>;

    try {
      const handle = await open(filePath, 'r');

      try {
        information = await handle.stat();

        if (!information.isFile() || information.isSymbolicLink()) {
          throw new ConflictException('File lưu trữ không hợp lệ.');
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new NotFoundException('File vật lý không tồn tại trên server.');
    }

    const expectedSize = Number(version.sizeBytes);

    if (
      !Number.isSafeInteger(expectedSize) ||
      expectedSize <= 0 ||
      information.size !== expectedSize
    ) {
      throw new ConflictException('Dung lượng file không khớp metadata.');
    }

    let hash: string;

    try {
      hash = await calculateSha256(filePath);
    } catch {
      throw new NotFoundException('Không thể đọc file vật lý.');
    }

    if (hash !== version.sha256) {
      throw new ConflictException('File không vượt qua kiểm tra SHA-256.');
    }

    await this.db.query(
      `
          INSERT INTO file_submission_events (
            submission_id,
            actor_user_id,
            action,
            detail
          )
          VALUES ($1, $2, 'downloaded', $3::jsonb)
        `,
      [
        id,
        user.sub,
        JSON.stringify({
          version: accessible.currentVersion,
          receiverRole: user.role,
          receivedFile: true,
        }),
      ],
    );

    return {
      path: filePath,
      filename: version.originalName,
      sizeBytes: expectedSize,
    };
  }
}
