import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { StudentAccessService } from './student-access.service.js';
import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

const MAX_SCAN_BYTES = 20 * 1024 * 1024;

const STORAGE_ROOT = resolve(
  process.env.STUDENT_SCAN_STORAGE_DIR ||
    join(process.cwd(), 'storage', 'student-scans'),
);

type IntakeRow = {
  id: number;
  studentId: number;
  createdByUserId: number;
  createdByName: string;
  createdAt: Date;
};

type ScanRow = {
  id: number;
  studentIntakeId: number;
  uploadedByUserId: number;
  uploadedByName: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  createdAt: Date;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeOriginalName(name: string): string {
  return basename(name.replace(/\\/g, '/'))
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 255);
}

function getFileType(file: Express.Multer.File): {
  extension: string;
  mimeType: string;
} {
  const extension = extname(file.originalname ?? '').toLowerCase();

  const bytes = file.buffer;

  if (!bytes || bytes.length === 0) {
    throw new BadRequestException('File hồ sơ scan bị rỗng.');
  }

  if (bytes.length > MAX_SCAN_BYTES) {
    throw new BadRequestException(
      'Dung lượng hồ sơ scan không được vượt quá 20 MB.',
    );
  }

  if (extension === '.pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('Nội dung file PDF không hợp lệ.');
    }

    return {
      extension,
      mimeType: 'application/pdf',
    };
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    if (
      bytes.length < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    ) {
      throw new BadRequestException('Nội dung ảnh JPEG không hợp lệ.');
    }

    return {
      extension: '.jpg',
      mimeType: 'image/jpeg',
    };
  }

  if (extension === '.png') {
    const signature = Buffer.from('89504e470d0a1a0a', 'hex');

    if (!bytes.subarray(0, 8).equals(signature)) {
      throw new BadRequestException('Nội dung ảnh PNG không hợp lệ.');
    }

    return {
      extension,
      mimeType: 'image/png',
    };
  }

  throw new BadRequestException('Hồ sơ scan chỉ hỗ trợ PDF, JPG, JPEG và PNG.');
}

@Injectable()
export class StudentScanService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly access: StudentAccessService,
  ) {}

  private async visibleIntakes(
    user: AuthUser,
    studentId: number,
  ): Promise<IntakeRow[]> {
    await this.access.assertCanView(studentId, user);

    return this.db.query(
      `
          SELECT
            si.id,
            si.student_id AS "studentId",
            si.created_by_user_id AS "createdByUserId",
            u.full_name AS "createdByName",
            si.created_at AS "createdAt"
          FROM student_intakes si
          JOIN users u
            ON u.id = si.created_by_user_id
          WHERE si.student_id = $1
            AND si.intake_type = 'independent'
            AND (
              $2::boolean = FALSE
              OR si.created_by_user_id = $3
            )
          ORDER BY si.created_at DESC, si.id DESC
        `,
      [studentId, user.role === UserRole.SYSTEM_ADMIN, user.sub],
    );
  }

  async intakes(user: AuthUser, studentId: number) {
    const rows = await this.visibleIntakes(user, studentId);

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      createdByUserId: row.createdByUserId,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
    }));
  }

  private async ensureIntake(
    user: AuthUser,
    studentId: number,
    intakeId: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(intakeId) || intakeId <= 0) {
      throw new BadRequestException('ID hồ sơ tiếp nhận không hợp lệ.');
    }

    const rows = await this.visibleIntakes(user, studentId);

    if (!rows.some((row) => row.id === intakeId)) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ tiếp nhận thí sinh tự do.',
      );
    }
  }

  private async findScans(intakeId: number): Promise<ScanRow[]> {
    return this.db.query(
      `
          SELECT
            a.id,
            a.student_intake_id AS "studentIntakeId",
            a.uploaded_by_user_id AS "uploadedByUserId",
            u.full_name AS "uploadedByName",
            a.original_name AS "originalName",
            a.storage_key AS "storageKey",
            a.mime_type AS "mimeType",
            a.size_bytes::text AS "sizeBytes",
            a.sha256,
            a.created_at AS "createdAt"
          FROM student_intake_attachments a
          JOIN users u
            ON u.id = a.uploaded_by_user_id
          WHERE a.student_intake_id = $1
          ORDER BY a.created_at DESC, a.id DESC
        `,
      [intakeId],
    );
  }

  async list(user: AuthUser, studentId: number, intakeId: number) {
    await this.ensureIntake(user, studentId, intakeId);

    const rows = await this.findScans(intakeId);

    // Không trả đường dẫn lưu trữ của server.
    return rows.map(({ storageKey, ...row }) => row);
  }

  async upload(
    user: AuthUser,
    studentId: number,
    intakeId: number,
    file?: Express.Multer.File,
  ) {
    await this.ensureIntake(user, studentId, intakeId);

    if (!file?.buffer) {
      throw new BadRequestException('Vui lòng chọn file hồ sơ scan.');
    }

    const { extension, mimeType } = getFileType(file);

    const originalName = safeOriginalName(file.originalname);

    if (!originalName) {
      throw new BadRequestException('Tên file không hợp lệ.');
    }

    const storageKey = `${randomUUID()}${extension}`;
    const absolutePath = join(STORAGE_ROOT, storageKey);

    const hash = sha256(file.buffer);

    await mkdir(STORAGE_ROOT, {
      recursive: true,
    });

    await writeFile(absolutePath, file.buffer, { flag: 'wx', mode: 0o600 });

    try {
      // Kiểm tra lại phạm vi ngay trước khi lưu DB.
      await this.ensureIntake(user, studentId, intakeId);

      const inserted: Array<{ id: number }> = await this.db.query(
        `
              INSERT INTO student_intake_attachments (
                student_intake_id,
                uploaded_by_user_id,
                original_name,
                storage_key,
                mime_type,
                size_bytes,
                sha256
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id
            `,
        [
          intakeId,
          user.sub,
          originalName,
          storageKey,
          mimeType,
          file.buffer.length,
          hash,
        ],
      );

      return {
        id: inserted[0].id,
        studentIntakeId: intakeId,
        originalName,
        mimeType,
        sizeBytes: String(file.buffer.length),
        sha256: hash,
      };
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);

      throw error;
    }
  }

  async download(
    user: AuthUser,
    studentId: number,
    intakeId: number,
    attachmentId: number,
  ) {
    await this.ensureIntake(user, studentId, intakeId);

    const rows: ScanRow[] = await this.db.query(
      `
            SELECT
              a.id,
              a.student_intake_id AS "studentIntakeId",
              a.uploaded_by_user_id AS "uploadedByUserId",
              u.full_name AS "uploadedByName",
              a.original_name AS "originalName",
              a.storage_key AS "storageKey",
              a.mime_type AS "mimeType",
              a.size_bytes::text AS "sizeBytes",
              a.sha256,
              a.created_at AS "createdAt"
            FROM student_intake_attachments a
            JOIN users u
              ON u.id = a.uploaded_by_user_id
            WHERE a.id = $1
              AND a.student_intake_id = $2
            LIMIT 1
          `,
      [attachmentId, intakeId],
    );

    const attachment = rows[0];

    if (!attachment) {
      throw new NotFoundException('Không tìm thấy file hồ sơ scan.');
    }

    if (!/^[a-f0-9-]{36}\.(pdf|jpg|png)$/i.test(attachment.storageKey)) {
      throw new ForbiddenException('Khóa lưu trữ file không hợp lệ.');
    }

    const absolutePath = join(STORAGE_ROOT, attachment.storageKey);

    let info: Awaited<ReturnType<typeof stat>>;

    try {
      info = await stat(absolutePath);
    } catch {
      throw new NotFoundException('Không tìm thấy file trên máy chủ.');
    }

    if (!info.isFile() || info.size !== Number(attachment.sizeBytes)) {
      throw new ForbiddenException(
        'Kích thước file không khớp dữ liệu lưu trữ.',
      );
    }

    const buffer = await readFile(absolutePath);

    if (sha256(buffer) !== attachment.sha256) {
      throw new ForbiddenException('File không vượt qua kiểm tra SHA-256.');
    }

    return {
      buffer,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }
}
