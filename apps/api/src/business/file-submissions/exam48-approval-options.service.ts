import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { parseExamList } from '../imports/exam-list-parser.js';

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

type Exam48Row = {
  id: number;
  status: string;
  fileType: string;
  originalName: string;
  storageKey: string;
  sha256: string;
  examinationCenterId: number | null;
  centerCode: string | null;
};

export type ApprovalFileOption = {
  id: number;
  fileType: 'bc1' | 'bc2';
  fileName: string;
  schoolId: number | null;
  schoolCode: string | null;
  schoolName: string | null;
  importBatchId: number | null;
  importStatus: string;
  examinationSessionId: number | null;
  reportCode: string | null;
  createdAt: string;
};

@Injectable()
export class Exam48ApprovalOptionsService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertSuperAdmin(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Chỉ SUPER_ADMIN được lựa chọn hồ sơ liên kết.',
      );
    }
  }

  private async getExam48(submissionId: number): Promise<Exam48Row> {
    if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
      throw new BadRequestException('ID file 48_ không hợp lệ.');
    }

    const rows: Exam48Row[] = await this.db.query(
      `
          SELECT
            s.id,
            s.status,
            s.file_type AS "fileType",
            s.examination_center_id AS "examinationCenterId",
            ec.code AS "centerCode",
            v.original_name AS "originalName",
            v.storage_key AS "storageKey",
            v.sha256
  
          FROM file_submissions s
  
          JOIN file_submission_versions v
            ON v.submission_id = s.id
           AND v.version = s.current_version
  
          LEFT JOIN examination_centers ec
            ON ec.id = s.examination_center_id
  
          WHERE s.id = $1
            AND s.file_type = 'exam_48'
  
          LIMIT 1
        `,
      [submissionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy file 48_ cần phê duyệt.');
    }

    if (rows[0].status !== 'pending') {
      throw new ConflictException('File 48_ không còn ở trạng thái chờ duyệt.');
    }

    return rows[0];
  }

  /**
   * Xem trước kỳ sát hạch trong XML và
   * danh sách BC1, BC2 đã import thành công.
   */
  async options(user: AuthUser, submissionId: number) {
    this.assertSuperAdmin(user);

    const source = await this.getExam48(submissionId);

    if (!/^[a-f0-9-]{36}\.xml$/i.test(source.storageKey)) {
      throw new BadRequestException(
        'File 48_ không có định danh lưu trữ hợp lệ.',
      );
    }

    const buffer = await readFile(join(STORAGE_ROOT, source.storageKey));

    const hash = createHash('sha256').update(buffer).digest('hex');

    if (hash !== source.sha256) {
      throw new ConflictException('File 48_ không vượt qua kiểm tra SHA-256.');
    }

    const document = parseExamList(buffer);

    if (
      !source.centerCode ||
      source.centerCode.trim().toUpperCase() !==
        document.session.examinationCenterCode.trim().toUpperCase()
    ) {
      throw new ConflictException(
        'TTSH trong XML không khớp TTSH nhận file 48_.',
      );
    }

    const existingSessions: Array<{ id: number }> = await this.db.query(
      `
            SELECT id
            FROM examination_sessions
            WHERE code = $1
               OR official_code = $1
            LIMIT 2
          `,
      [document.session.code],
    );

    if (existingSessions.length) {
      throw new ConflictException(
        `Kỳ sát hạch ${document.session.code} đã tồn tại. ` +
          'Không được tạo trùng kỳ.',
      );
    }

    const files: ApprovalFileOption[] = await this.db.query(
      `
            SELECT
              fs.id,
              fs.file_type AS "fileType",
              v.original_name AS "fileName",
  
              fs.training_school_id AS "schoolId",
              ts.code AS "schoolCode",
              ts.name AS "schoolName",
  
              fs.import_batch_id AS "importBatchId",
              fs.import_status AS "importStatus",
  
              fs.examination_session_id
                AS "examinationSessionId",
  
              ib.report_code AS "reportCode",
  
              fs.created_at AS "createdAt"
  
            FROM file_submissions fs
  
            JOIN file_submission_versions v
              ON v.submission_id = fs.id
             AND v.version = fs.current_version
  
            JOIN import_batches ib
              ON ib.id = fs.import_batch_id
             AND ib.file_sha256 = v.sha256
  
            LEFT JOIN training_schools ts
              ON ts.id = fs.training_school_id
  
            WHERE fs.file_type IN ('bc1', 'bc2')
              AND fs.status = 'approved'
              AND fs.import_status = 'completed'
              AND fs.examination_session_id IS NULL
  
            ORDER BY
              ts.code ASC NULLS LAST,
              fs.file_type ASC,
              fs.created_at DESC,
              fs.id DESC
  
            LIMIT 1000
          `,
    );

    const candidateSchoolCodes = [
      ...new Set(
        document.candidates
          .map((candidate) => candidate.schoolCode)
          .filter(
            (code): code is string =>
              typeof code === 'string' &&
              code.length > 0 &&
              code !== '48099' &&
              code !== 'UNASSIGNED',
          ),
      ),
    ].sort();

    return {
      submissionId,
      session: {
        code: document.session.code,
        examinationCenterCode: document.session.examinationCenterCode,
        examDate: document.session.examDate,
        examTime: document.session.examTime,
        decisionNumber: document.session.decisionNumber,
        totalCandidates: document.candidates.length,
      },
      candidateSchoolCodes,
      files: files.map((item) => ({
        ...item,
        suggested:
          item.schoolCode !== null &&
          candidateSchoolCodes.includes(item.schoolCode),
      })),
    };
  }

  /**
   * Xác minh các BC1, BC2 được chọn trước
   * khi gắn với kỳ sát hạch.
   *
   * Dùng chính EntityManager của transaction
   * duyệt 48_, không mở transaction riêng.
   */
  async validateSelection(
    manager: EntityManager,
    ids: number[],
  ): Promise<ApprovalFileOption[]> {
    if (
      !Array.isArray(ids) ||
      ids.length > 500 ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new BadRequestException('Danh sách BC1, BC2 không hợp lệ.');
    }

    const uniqueIds = [...new Set(ids)];

    if (!uniqueIds.length) {
      return [];
    }

    const rows: ApprovalFileOption[] = await manager.query(
      `
            SELECT
              fs.id,
              fs.file_type AS "fileType",
              v.original_name AS "fileName",
  
              fs.training_school_id AS "schoolId",
              ts.code AS "schoolCode",
              ts.name AS "schoolName",
  
              fs.import_batch_id AS "importBatchId",
              fs.import_status AS "importStatus",
  
              fs.examination_session_id
                AS "examinationSessionId",
  
              ib.report_code AS "reportCode",
  
              fs.created_at AS "createdAt"
  
            FROM file_submissions fs
  
            JOIN file_submission_versions v
              ON v.submission_id = fs.id
             AND v.version = fs.current_version
  
            JOIN import_batches ib
              ON ib.id = fs.import_batch_id
             AND ib.file_sha256 = v.sha256
  
            LEFT JOIN training_schools ts
              ON ts.id = fs.training_school_id
  
            WHERE fs.id = ANY($1::int[])
              AND fs.file_type IN ('bc1', 'bc2')
              AND fs.status = 'approved'
              AND fs.import_status = 'completed'
              AND fs.examination_session_id IS NULL
  
            ORDER BY fs.id ASC
  
            FOR UPDATE OF fs
          `,
      [uniqueIds],
    );

    if (rows.length !== uniqueIds.length) {
      throw new ConflictException(
        'Một hoặc nhiều BC1, BC2 không hợp lệ, ' +
          'chưa import thành công hoặc đã thuộc kỳ khác.',
      );
    }

    return rows;
  }

  /**
   * Gắn nhiều BC1, BC2 với kỳ vừa tạo.
   *
   * Hàm này phải chạy trong transaction
   * import file 48_.
   */
  async linkSelectedFiles(
    manager: EntityManager,
    examinationSessionId: number,
    fileIds: number[],
    actorUserId: number,
  ): Promise<number> {
    const selected = await this.validateSelection(manager, fileIds);

    if (!selected.length) {
      return 0;
    }

    const ids = selected.map((item) => item.id);

    const updated: Array<{ id: number }> = await manager.query(
      `
            UPDATE file_submissions
            SET
              examination_session_id = $2,
              updated_at = NOW()
  
            WHERE id = ANY($1::int[])
              AND examination_session_id IS NULL
  
            RETURNING id
          `,
      [ids, examinationSessionId],
    );

    if (updated.length !== ids.length) {
      throw new ConflictException('Không thể liên kết đầy đủ BC1, BC2 vào kỳ.');
    }

    for (const file of selected) {
      await manager.query(
        `
            INSERT INTO file_submission_events (
              submission_id,
              actor_user_id,
              action,
              detail
            )
            VALUES ($1, $2, 'session_linked', $3::jsonb)
          `,
        [
          file.id,
          actorUserId,
          JSON.stringify({
            examinationSessionId,
            source: 'exam_48_approval',
            fileType: file.fileType,
            importBatchId: file.importBatchId,
          }),
        ],
      );
    }

    return updated.length;
  }
}
