import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

export type AssignSessionSecretaryInput = {
  secretaryUserId: number;
  note?: string | null;
};

export type UpdateSessionTrackingInput = {
  trackingCode: string;
};

type SessionRow = {
  id: number;
  code: string;
  tempCode: string | null;
  officialCode: string | null;
  trackingCode: string | null;
  examinationCenterId: number;
  centerCode: string;
  centerName: string;
  examDate: string | null;
  completedAt: string | null;
  secretaryUserId: number | null;
  secretaryName: string | null;
  secretaryUsername: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  assignmentNote: string | null;
  candidateCount: number;
  fileCount: number;
};

function positiveId(value: unknown, label: string): number {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    throw new BadRequestException(`${label} không hợp lệ.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new BadRequestException(`${label} không hợp lệ.`);
  }

  return number;
}

function normalizeNote(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Ghi chú không hợp lệ.');
  }

  const note = value.normalize('NFC').trim();

  if (note.length > 2000) {
    throw new BadRequestException('Ghi chú không được quá 2000 ký tự.');
  }

  return note || null;
}

@Injectable()
export class ExaminationSessionSecretariesService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertPc08(user: AuthUser): void {
    if (user.role !== UserRole.PC08_STAFF) {
      throw new ForbiddenException('Chỉ IT PC08 được phân công thư ký.');
    }
  }

  private assertSecretary(user: AuthUser): void {
    if (user.role !== UserRole.EXAM_SECRETARY) {
      throw new ForbiddenException(
        'Chỉ thư ký sát hạch được cập nhật mã theo dõi.',
      );
    }
  }

  private assertViewer(user: AuthUser): void {
    if (
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.EXAM_SECRETARY &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Không có quyền truy cập phân công kỳ sát hạch.',
      );
    }
  }

  private readonly baseQuery = `
      SELECT
        es.id,
        es.code,
        es.temp_code AS "tempCode",
        es.official_code AS "officialCode",
        es.tracking_code AS "trackingCode",
        es.examination_center_id AS "examinationCenterId",
        ec.code AS "centerCode",
        ec.name AS "centerName",
        es.exam_date::text AS "examDate",
        es.completed_at AS "completedAt",
  
        a.secretary_user_id AS "secretaryUserId",
        secretary.full_name AS "secretaryName",
        secretary.username AS "secretaryUsername",
        assigner.full_name AS "assignedByName",
        a.assigned_at AS "assignedAt",
        a.note AS "assignmentNote",
  
        (
          SELECT COUNT(*)::int
          FROM examination_candidates c
          WHERE c.examination_session_id = es.id
        ) AS "candidateCount",
  
        (
          SELECT COUNT(*)::int
          FROM file_submissions fs
          WHERE fs.examination_session_id = es.id
        ) AS "fileCount"
  
      FROM examination_sessions es
  
      JOIN examination_centers ec
        ON ec.id = es.examination_center_id
  
      LEFT JOIN examination_session_secretary_assignments a
        ON a.examination_session_id = es.id
       AND a.revoked_at IS NULL
  
      LEFT JOIN users secretary
        ON secretary.id = a.secretary_user_id
  
      LEFT JOIN users assigner
        ON assigner.id = a.assigned_by_user_id
    `;

  async secretaries(user: AuthUser) {
    this.assertPc08(user);

    return this.db.query(
      `
          SELECT
            id,
            username,
            full_name AS "fullName"
          FROM users
          WHERE role = $1
            AND status = 'active'
          ORDER BY full_name, username, id
        `,
      [UserRole.EXAM_SECRETARY],
    );
  }

  async list(user: AuthUser, searchInput?: string): Promise<SessionRow[]> {
    this.assertViewer(user);

    const search = String(searchInput ?? '')
      .trim()
      .slice(0, 150);

    return this.db.query(
      `
          ${this.baseQuery}
  
          WHERE (
            $1::text = ''
            OR es.code ILIKE '%' || $1 || '%'
            OR COALESCE(es.tracking_code, '')
               ILIKE '%' || $1 || '%'
            OR ec.code ILIKE '%' || $1 || '%'
            OR ec.name ILIKE '%' || $1 || '%'
            OR COALESCE(secretary.full_name, '')
               ILIKE '%' || $1 || '%'
          )
  
          AND (
            $2::text <> 'exam_secretary'
            OR a.secretary_user_id = $3
          )
  
          ORDER BY
            es.exam_date DESC NULLS LAST,
            es.id DESC
  
          LIMIT 500
        `,
      [search, user.role, user.sub],
    );
  }

  async detail(user: AuthUser, sessionIdInput: number) {
    this.assertViewer(user);

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    const rows: SessionRow[] = await this.db.query(
      `
          ${this.baseQuery}
  
          WHERE es.id = $1
            AND (
              $2::text <> 'exam_secretary'
              OR a.secretary_user_id = $3
            )
  
          LIMIT 1
        `,
      [sessionId, user.role, user.sub],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch được phép xem.');
    }

    const history = await this.db.query(
      `
          SELECT
            a.id,
            a.secretary_user_id AS "secretaryUserId",
            secretary.full_name AS "secretaryName",
            a.assigned_by_user_id AS "assignedByUserId",
            assigner.full_name AS "assignedByName",
            a.assigned_at AS "assignedAt",
            a.revoked_at AS "revokedAt",
            a.note
          FROM examination_session_secretary_assignments a
          JOIN users secretary
            ON secretary.id = a.secretary_user_id
          JOIN users assigner
            ON assigner.id = a.assigned_by_user_id
          WHERE a.examination_session_id = $1
          ORDER BY a.assigned_at DESC, a.id DESC
        `,
      [sessionId],
    );

    return {
      ...rows[0],
      assignmentHistory: history,
    };
  }

  async assign(
    user: AuthUser,
    sessionIdInput: number,
    input: AssignSessionSecretaryInput,
  ) {
    this.assertPc08(user);

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    const secretaryId = positiveId(input?.secretaryUserId, 'ID thư ký');

    const note = normalizeNote(input?.note);

    await this.db.transaction(async (manager: EntityManager) => {
      // Khóa kỳ để tránh phân công đồng thời.
      const sessions = await manager.query(
        `
            SELECT id
            FROM examination_sessions
            WHERE id = $1
            FOR UPDATE
          `,
        [sessionId],
      );

      if (!sessions.length) {
        throw new NotFoundException('Kỳ sát hạch không tồn tại.');
      }

      const secretaries = await manager.query(
        `
            SELECT id
            FROM users
            WHERE id = $1
              AND role = $2
              AND status = 'active'
            LIMIT 1
          `,
        [secretaryId, UserRole.EXAM_SECRETARY],
      );

      if (!secretaries.length) {
        throw new BadRequestException(
          'Thư ký không tồn tại hoặc không hoạt động.',
        );
      }

      const existing: Array<{
        id: number;
        secretaryUserId: number;
      }> = await manager.query(
        `
            SELECT
              id,
              secretary_user_id AS "secretaryUserId"
            FROM examination_session_secretary_assignments
            WHERE examination_session_id = $1
              AND revoked_at IS NULL
            FOR UPDATE
          `,
        [sessionId],
      );

      if (
        existing.length &&
        Number(existing[0].secretaryUserId) === secretaryId
      ) {
        return;
      }

      if (existing.length) {
        await manager.query(
          `
              UPDATE examination_session_secretary_assignments
              SET
                revoked_at = NOW(),
                revoked_by_user_id = $2
              WHERE id = $1
                AND revoked_at IS NULL
            `,
          [existing[0].id, user.sub],
        );
      }

      await manager.query(
        `
            INSERT INTO examination_session_secretary_assignments (
              examination_session_id,
              secretary_user_id,
              assigned_by_user_id,
              note
            )
            VALUES ($1, $2, $3, $4)
          `,
        [sessionId, secretaryId, user.sub, note],
      );
    });

    return this.detail(user, sessionId);
  }

  async unassign(user: AuthUser, sessionIdInput: number) {
    this.assertPc08(user);

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    await this.db.transaction(async (manager) => {
      const session = await manager.query(
        `
            SELECT id
            FROM examination_sessions
            WHERE id = $1
            FOR UPDATE
          `,
        [sessionId],
      );

      if (!session.length) {
        throw new NotFoundException('Kỳ sát hạch không tồn tại.');
      }

      const updated = await manager.query(
        `
            UPDATE examination_session_secretary_assignments
            SET
              revoked_at = NOW(),
              revoked_by_user_id = $2
            WHERE examination_session_id = $1
              AND revoked_at IS NULL
            RETURNING id
          `,
        [sessionId, user.sub],
      );

      if (!updated.length) {
        throw new ConflictException('Kỳ chưa được phân công thư ký.');
      }
    });

    return this.detail(user, sessionId);
  }

  async complete(user: AuthUser, sessionIdInput: number) {
    this.assertPc08(user);

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    const rows: Array<{ id: number }> = await this.db.query(
      `
        SELECT id
        FROM examination_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Kỳ sát hạch không tồn tại.');
    }

    /**
     * Nghiệp vụ mới:
     *
     * IT PC08 không còn được phép
     * đánh dấu hoàn tất kỳ thủ công.
     *
     * Chỉ quy trình duyệt và phát hành
     * đầy đủ KQSH cuối cùng của các CSĐT
     * mới được cập nhật completed_at.
     */
    throw new ConflictException(
      'Không thể hoàn tất kỳ sát hạch thủ công. ' +
        'IT PC08 phải gửi đầy đủ KQSH cuối cùng ' +
        'cho các CSĐT và xác nhận đã gửi đủ. ' +
        'Kỳ chỉ kết thúc sau khi SUPER_ADMIN ' +
        'phê duyệt và phát hành toàn bộ kết quả.',
    );
  }

  async updateTracking(
    user: AuthUser,
    sessionIdInput: number,
    input: UpdateSessionTrackingInput,
  ) {
    this.assertSecretary(user);

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    if (typeof input?.trackingCode !== 'string') {
      throw new BadRequestException('Vui lòng nhập mã theo dõi.');
    }

    const trackingCode = input.trackingCode.normalize('NFC').trim();

    if (!trackingCode || trackingCode.length > 150) {
      throw new BadRequestException('Mã theo dõi phải có từ 1 đến 150 ký tự.');
    }

    try {
      await this.db.transaction(async (manager) => {
        const rows: Array<{
          completedAt: Date | null;
          secretaryUserId: number | null;
        }> = await manager.query(
          `
              SELECT
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

        if (!rows.length || Number(rows[0].secretaryUserId) !== user.sub) {
          throw new NotFoundException('Không tìm thấy kỳ được phân công.');
        }

        if (!rows[0].completedAt) {
          throw new ConflictException('PC08 chưa xác nhận kỳ đã tổ chức xong.');
        }

        await manager.query(
          `
              UPDATE examination_sessions
              SET
                tracking_code = $2,
                updated_at = NOW()
              WHERE id = $1
            `,
          [sessionId, trackingCode],
        );
      });
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('Mã theo dõi đã được sử dụng cho kỳ khác.');
      }

      throw error;
    }

    return this.detail(user, sessionId);
  }
}
