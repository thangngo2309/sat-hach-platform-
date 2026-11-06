import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { createHash, randomUUID } from 'node:crypto';

import { createReadStream } from 'node:fs';

import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';

import { basename, extname, join, resolve } from 'node:path';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

export const MAX_EXAM_SCAN_BYTES = 25 * 1024 * 1024;

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

const SCAN_DIR = join(STORAGE_ROOT, 'secretary-scans');

export type ExamSessionScanFile = {
  id: number;
  examinationSessionId: number;
  uploadedByUserId: number;
  uploaderName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  note: string | null;
  createdAt: string;
};

function positiveId(value: unknown): number {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    throw new BadRequestException('ID không hợp lệ.');
  }

  return number;
}

function safeName(value: string): string {
  return (
    basename(value.replace(/\\/g, '/'))
      .replace(/[\x00-\x1f\x7f]/g, '_')
      .slice(0, 255) || 'scan'
  );
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function validateScan(file?: Express.Multer.File): Promise<{
  extension: string;
  mimeType: string;
  originalName: string;
  size: number;
}> {
  if (!file?.path) {
    throw new BadRequestException('Vui lòng chọn file scan.');
  }

  const info = await stat(file.path);

  if (!info.isFile() || info.size <= 0 || info.size > MAX_EXAM_SCAN_BYTES) {
    throw new BadRequestException(
      'File scan phải có dung lượng từ 1 byte đến 25 MB.',
    );
  }

  const originalName = safeName(file.originalname);
  const extension = extname(originalName).toLowerCase();

  if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) {
    throw new BadRequestException('Chỉ hỗ trợ PDF, JPG, JPEG hoặc PNG.');
  }

  const handle = await open(file.path, 'r');
  let header: Buffer;

  try {
    header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
  } finally {
    await handle.close();
  }

  const isPdf = header.subarray(0, 5).toString('ascii') === '%PDF-';

  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const isPng = header.subarray(0, 8).equals(pngSignature);

  if (
    (extension === '.pdf' && !isPdf) ||
    (['.jpg', '.jpeg'].includes(extension) && !isJpeg) ||
    (extension === '.png' && !isPng)
  ) {
    throw new BadRequestException(
      'Nội dung file không khớp định dạng khai báo.',
    );
  }

  return {
    extension,
    originalName,
    size: info.size,
    mimeType:
      extension === '.pdf'
        ? 'application/pdf'
        : extension === '.png'
          ? 'image/png'
          : 'image/jpeg',
  };
}

@Injectable()
export class ExaminationSessionScansService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertViewer(user: AuthUser) {
    if (
      user.role !== UserRole.EXAM_SECRETARY &&
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Không có quyền truy cập hồ sơ scan.');
    }
  }

  /**
   * Thư ký chỉ có quyền trên kỳ
   * đang được phân công cho chính mình.
   *
   * PC08 và SUPER_ADMIN có quyền xem.
   */
  private async assertCanView(
    user: AuthUser,
    sessionId: number,
  ): Promise<void> {
    this.assertViewer(user);

    const rows: Array<{
      id: number;
      secretaryUserId: number | null;
    }> = await this.db.query(
      `
          SELECT
            es.id,
            a.secretary_user_id AS "secretaryUserId"
  
          FROM examination_sessions es
  
          LEFT JOIN examination_session_secretary_assignments a
            ON a.examination_session_id = es.id
           AND a.revoked_at IS NULL
  
          WHERE es.id = $1
          LIMIT 1
        `,
      [sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
    }

    if (
      user.role === UserRole.EXAM_SECRETARY &&
      Number(rows[0].secretaryUserId) !== user.sub
    ) {
      throw new ForbiddenException('Bạn không được phân công kỳ sát hạch này.');
    }
  }

  async list(
    user: AuthUser,
    sessionIdInput: number,
  ): Promise<ExamSessionScanFile[]> {
    const sessionId = positiveId(sessionIdInput);

    await this.assertCanView(user, sessionId);

    return this.db.query(
      `
          SELECT
            f.id,
            f.examination_session_id AS "examinationSessionId",
            f.uploaded_by_user_id AS "uploadedByUserId",
            u.full_name AS "uploaderName",
            f.original_name AS "originalName",
            f.mime_type AS "mimeType",
            f.size_bytes::text AS "sizeBytes",
            f.sha256,
            f.note,
            f.created_at AS "createdAt"
  
          FROM examination_session_scan_files f
  
          JOIN users u
            ON u.id = f.uploaded_by_user_id
  
          WHERE f.examination_session_id = $1
  
          ORDER BY f.created_at DESC, f.id DESC
        `,
      [sessionId],
    );
  }

  async upload(
    user: AuthUser,
    sessionIdInput: number,
    file?: Express.Multer.File,
    noteInput?: string,
  ): Promise<ExamSessionScanFile> {
    let destination: string | null = null;

    try {
      if (user.role !== UserRole.EXAM_SECRETARY) {
        throw new ForbiddenException('Chỉ thư ký được upload file scan.');
      }

      const sessionId = positiveId(sessionIdInput);
      const validated = await validateScan(file);

      if (noteInput !== undefined && typeof noteInput !== 'string') {
        throw new BadRequestException('Ghi chú không hợp lệ.');
      }

      const note = noteInput?.normalize('NFC').trim() || null;

      if (note && note.length > 2000) {
        throw new BadRequestException(
          'Ghi chú không được vượt quá 2000 ký tự.',
        );
      }

      await mkdir(SCAN_DIR, { recursive: true });

      const storageKey = `${randomUUID()}${validated.extension}`;

      destination = join(SCAN_DIR, storageKey);

      const sha256 = await fileSha256(file!.path);

      try {
        await rename(file!.path, destination);
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'EXDEV'
        ) {
          throw error;
        }

        await copyFile(file!.path, destination);
        await unlink(file!.path);
      }

      const scanId = await this.db.transaction(async (manager) => {
        /**
         * Khóa kỳ để đồng bộ với thao tác
         * thu hồi hoặc đổi thư ký từ PC08.
         */
        const sessions: Array<{
          id: number;
          completedAt: Date | null;
          secretaryUserId: number | null;
        }> = await manager.query(
          `
                SELECT
                  es.id,
                  es.completed_at AS "completedAt",
                  a.secretary_user_id AS "secretaryUserId"
  
                FROM examination_sessions es
  
                LEFT JOIN examination_session_secretary_assignments a
                  ON a.examination_session_id = es.id
                 AND a.revoked_at IS NULL
  
                WHERE es.id = $1
                FOR UPDATE OF es
              `,
          [sessionId],
        );

        if (!sessions.length) {
          throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
        }

        if (Number(sessions[0].secretaryUserId) !== user.sub) {
          throw new ForbiddenException('Bạn không còn được phân công kỳ này.');
        }

        if (!sessions[0].completedAt) {
          throw new ConflictException('PC08 chưa xác nhận kỳ đã tổ chức xong.');
        }

        const rows: Array<{ id: number }> = await manager.query(
          `
                  INSERT INTO examination_session_scan_files (
                    examination_session_id,
                    uploaded_by_user_id,
                    original_name,
                    storage_key,
                    mime_type,
                    size_bytes,
                    sha256,
                    note
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                  RETURNING id
                `,
          [
            sessionId,
            user.sub,
            validated.originalName,
            storageKey,
            validated.mimeType,
            validated.size,
            sha256,
            note,
          ],
        );

        return Number(rows[0].id);
      });

      destination = null;

      const files = await this.list(user, sessionId);

      const created = files.find((item) => item.id === scanId);

      if (!created) {
        throw new NotFoundException(
          'Đã lưu file nhưng không tải được thông tin.',
        );
      }

      return created;
    } finally {
      if (file?.path) {
        await unlink(file.path).catch(() => undefined);
      }

      if (destination) {
        await unlink(destination).catch(() => undefined);
      }
    }
  }

  async download(
    user: AuthUser,
    sessionIdInput: number,
    scanIdInput: number,
  ): Promise<{
    absolutePath: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const sessionId = positiveId(sessionIdInput);
    const scanId = positiveId(scanIdInput);

    await this.assertCanView(user, sessionId);

    const rows: Array<{
      storageKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: string;
      sha256: string;
    }> = await this.db.query(
      `
          SELECT
            storage_key AS "storageKey",
            original_name AS "originalName",
            mime_type AS "mimeType",
            size_bytes::text AS "sizeBytes",
            sha256
          FROM examination_session_scan_files
          WHERE id = $1
            AND examination_session_id = $2
          LIMIT 1
        `,
      [scanId, sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy file scan.');
    }

    const selected = rows[0];

    if (!/^[a-f0-9-]{36}\.(pdf|jpg|jpeg|png)$/i.test(selected.storageKey)) {
      throw new ConflictException('Khóa lưu trữ file không hợp lệ.');
    }

    const absolutePath = join(SCAN_DIR, selected.storageKey);

    let info: Awaited<ReturnType<typeof stat>>;

    try {
      info = await stat(absolutePath);
    } catch {
      throw new NotFoundException('File scan không tồn tại trên máy chủ.');
    }

    if (!info.isFile() || info.size !== Number(selected.sizeBytes)) {
      throw new ConflictException('Kích thước file scan không khớp.');
    }

    const hash = await fileSha256(absolutePath);

    if (hash !== selected.sha256) {
      throw new ConflictException('File scan không vượt qua kiểm tra SHA-256.');
    }

    return {
      absolutePath,
      filename: selected.originalName,
      mimeType: selected.mimeType,
      sizeBytes: Number(selected.sizeBytes),
    };
  }
}
