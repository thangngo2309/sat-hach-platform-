import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

export type AssignIndependentStudentsInput = {
  studentIds: number[];
  secretaryUserId: number;
  examDate: string;
  examSessionCode?: string | null;
  note?: string | null;
};

export type AssignmentQuery = {
  page?: string;
  limit?: string;
  search?: string;
  examDate?: string;
  secretaryUserId?: string;
  status?: string;
};

function positiveId(value: unknown, name: string): number {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    value === null ||
    value === undefined ||
    value === ''
  ) {
    throw new BadRequestException(`${name} không hợp lệ.`);
  }

  return number;
}

function examDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(
      'Ngày sát hạch phải có định dạng YYYY-MM-DD.',
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Ngày sát hạch không hợp lệ.');
  }

  return value;
}

function pageParams(query: AssignmentQuery) {
  const page = Math.max(
    1,
    Math.min(100000, Math.trunc(Number(query.page)) || 1),
  );

  const limit = Math.max(
    1,
    Math.min(100, Math.trunc(Number(query.limit)) || 20),
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function textValue(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'string') {
    throw new BadRequestException('Giá trị nhập không hợp lệ.');
  }

  return value.trim().slice(0, maxLength) || null;
}

@Injectable()
export class IndependentExamAssignmentService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertSuperAdmin(user: AuthUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN được phân công thí sinh.');
    }
  }

  private assertViewer(user: AuthUser) {
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.EXAM_SECRETARY
    ) {
      throw new ForbiddenException('Không có quyền xem danh sách phân công.');
    }
  }

  private async event(
    manager: EntityManager,
    assignmentId: number,
    actorId: number,
    action: string,
    detail: Record<string, unknown>,
  ) {
    await manager.query(
      `
          INSERT INTO independent_exam_assignment_events (
            assignment_id,
            actor_user_id,
            action,
            detail
          )
          VALUES ($1, $2, $3, $4::jsonb)
        `,
      [assignmentId, actorId, action, JSON.stringify(detail)],
    );
  }

  async secretaries(user: AuthUser) {
    this.assertSuperAdmin(user);

    return this.db.query(
      `
          SELECT
            id,
            username,
            full_name AS "fullName",
            status
          FROM users
          WHERE role = $1
          ORDER BY
            (status = 'active') DESC,
            full_name ASC,
            id ASC
        `,
      [UserRole.EXAM_SECRETARY],
    );
  }

  /**
   * SUPER_ADMIN tìm kiếm các thí sinh đã có
   * hồ sơ tiếp nhận thủ công.
   *
   * Không phụ thuộc source_type = manual vì
   * một thí sinh có thể đã được đối chiếu XML
   * sau khi SYSTEM_ADMIN tiếp nhận.
   */
  async candidates(user: AuthUser, query: AssignmentQuery) {
    this.assertSuperAdmin(user);

    const { page, limit, offset } = pageParams(query);
    const search = (query.search ?? '').trim().slice(0, 150);

    const where = `
        WHERE EXISTS (
          SELECT 1
          FROM student_intakes si
          WHERE si.student_id = s.id
        )
        AND (
          $1::text = ''
          OR s.full_name ILIKE '%' || $1 || '%'
          OR COALESCE(s.identity_number, '')
            ILIKE '%' || $1 || '%'
          OR COALESCE(s.registration_code, '')
            ILIKE '%' || $1 || '%'
        )
      `;

    const [countRows, rows] = await Promise.all([
      this.db.query(
        `
            SELECT COUNT(*)::int AS total
            FROM students s
            ${where}
          `,
        [search],
      ),
      this.db.query(
        `
            SELECT
              s.id,
              s.full_name AS "fullName",
              s.identity_number AS "identityNumber",
              s.registration_code AS "registrationCode",
              s.date_of_birth::text AS "dateOfBirth",
              s.source_type AS "sourceType",
  
              (
                SELECT COUNT(*)::int
                FROM independent_exam_assignments a
                WHERE a.student_id = s.id
                  AND a.status = 'assigned'
              ) AS "activeAssignmentCount",
  
              (
                SELECT MAX(si.created_at)
                FROM student_intakes si
                WHERE si.student_id = s.id
              ) AS "intakeCreatedAt"
  
            FROM students s
            ${where}
            ORDER BY s.id DESC
            LIMIT $2 OFFSET $3
          `,
        [search, limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Gán nhiều học viên trong một transaction.
   * Cùng học viên + cùng ngày = cập nhật phân công.
   */
  async assign(user: AuthUser, input: AssignIndependentStudentsInput) {
    this.assertSuperAdmin(user);

    if (
      !Array.isArray(input?.studentIds) ||
      input.studentIds.length === 0 ||
      input.studentIds.length > 200
    ) {
      throw new BadRequestException(
        'Mỗi lượt chỉ được phân từ 1 đến 200 thí sinh.',
      );
    }

    const studentIds = [
      ...new Set(input.studentIds.map((id) => positiveId(id, 'ID thí sinh'))),
    ];

    const secretaryUserId = positiveId(input.secretaryUserId, 'ID thư ký');

    const date = examDate(input.examDate);
    const sessionCode = textValue(input.examSessionCode, 100);
    const note = textValue(input.note, 2000);

    return this.db.transaction(async (manager) => {
      const secretaryRows: Array<{ id: number }> = await manager.query(
        `
              SELECT id
              FROM users
              WHERE id = $1
                AND role = $2
                AND status = 'active'
              LIMIT 1
            `,
        [secretaryUserId, UserRole.EXAM_SECRETARY],
      );

      if (!secretaryRows.length) {
        throw new BadRequestException(
          'Thư ký không tồn tại hoặc không hoạt động.',
        );
      }

      const validRows: Array<{ id: number }> = await manager.query(
        `
              SELECT s.id
              FROM students s
              WHERE s.id = ANY($1::int[])
                AND EXISTS (
                  SELECT 1
                  FROM student_intakes si
                  WHERE si.student_id = s.id
                )
            `,
        [studentIds],
      );

      const validIds = new Set(validRows.map((row) => Number(row.id)));

      const invalidIds = studentIds.filter((id) => !validIds.has(id));

      if (invalidIds.length) {
        throw new BadRequestException(
          `Các thí sinh không có hồ sơ tiếp nhận: ${invalidIds.join(', ')}.`,
        );
      }

      const results: Array<{
        id: number;
        studentId: number;
        action: string;
      }> = [];

      for (const studentId of studentIds) {
        // Khóa thí sinh để tuần tự hóa việc phân
        // cùng một thí sinh trong các request đồng thời.
        await manager.query(
          `
              SELECT id
              FROM students
              WHERE id = $1
              FOR UPDATE
            `,
          [studentId],
        );

        const existing: Array<{
          id: number;
          secretaryUserId: number;
          status: string;
        }> = await manager.query(
          `
              SELECT
                id,
                secretary_user_id AS "secretaryUserId",
                status
              FROM independent_exam_assignments
              WHERE student_id = $1
                AND exam_date = $2::date
              FOR UPDATE
            `,
          [studentId, date],
        );

        if (!existing.length) {
          const created: Array<{ id: number }> = await manager.query(
            `
                  INSERT INTO independent_exam_assignments (
                    student_id,
                    secretary_user_id,
                    assigned_by_user_id,
                    exam_date,
                    exam_session_code,
                    note,
                    status
                  )
                  VALUES (
                    $1, $2, $3, $4::date, $5, $6, 'assigned'
                  )
                  RETURNING id
                `,
            [studentId, secretaryUserId, user.sub, date, sessionCode, note],
          );

          const id = Number(created[0].id);

          await this.event(manager, id, user.sub, 'assigned', {
            studentId,
            secretaryUserId,
            examDate: date,
            examSessionCode: sessionCode,
          });

          results.push({ id, studentId, action: 'assigned' });
          continue;
        }

        const previous = existing[0];
        const action =
          previous.status === 'cancelled' ? 'reactivated' : 'reassigned';

        await manager.query(
          `
              UPDATE independent_exam_assignments
              SET secretary_user_id = $2,
                  assigned_by_user_id = $3,
                  exam_session_code = $4,
                  note = $5,
                  status = 'assigned',
                  updated_at = NOW()
              WHERE id = $1
            `,
          [previous.id, secretaryUserId, user.sub, sessionCode, note],
        );

        await this.event(manager, previous.id, user.sub, action, {
          oldSecretaryUserId: Number(previous.secretaryUserId),
          secretaryUserId,
          examDate: date,
        });

        results.push({
          id: Number(previous.id),
          studentId,
          action,
        });
      }

      return {
        examDate: date,
        secretaryUserId,
        total: results.length,
        assignments: results,
      };
    });
  }

  async list(user: AuthUser, query: AssignmentQuery) {
    this.assertViewer(user);

    const { page, limit, offset } = pageParams(query);
    const search = (query.search ?? '').trim().slice(0, 150);

    const date = query.examDate ? examDate(query.examDate) : null;

    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

    let secretaryId: number | null = null;

    if (isSuperAdmin && query.secretaryUserId) {
      secretaryId = positiveId(query.secretaryUserId, 'Thư ký');
    }

    const status =
      isSuperAdmin && query.status === 'cancelled' ? 'cancelled' : 'assigned';

    const where = `
        WHERE a.status = $1
          AND ($2::date IS NULL OR a.exam_date = $2::date)
          AND (
            $3::text = ''
            OR s.full_name ILIKE '%' || $3 || '%'
            OR COALESCE(s.identity_number, '')
              ILIKE '%' || $3 || '%'
            OR COALESCE(s.registration_code, '')
              ILIKE '%' || $3 || '%'
          )
          AND ($4::boolean OR a.secretary_user_id = $5)
          AND ($6::int IS NULL OR a.secretary_user_id = $6)
      `;

    const params = [status, date, search, isSuperAdmin, user.sub, secretaryId];

    const from = `
        FROM independent_exam_assignments a
        JOIN students s ON s.id = a.student_id
        JOIN users secretary ON secretary.id = a.secretary_user_id
        JOIN users assigner ON assigner.id = a.assigned_by_user_id
      `;

    const [countRows, rows] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS total ${from} ${where}`, params),
      this.db.query(
        `
            SELECT
              a.id,
              a.student_id AS "studentId",
              s.full_name AS "fullName",
              s.identity_number AS "identityNumber",
              s.registration_code AS "registrationCode",
              s.date_of_birth::text AS "dateOfBirth",
              a.exam_date::text AS "examDate",
              a.exam_session_code AS "examSessionCode",
              a.note,
              a.status,
              a.secretary_user_id AS "secretaryUserId",
              secretary.full_name AS "secretaryName",
              assigner.full_name AS "assignedByName",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
            ${from}
            ${where}
            ORDER BY a.exam_date DESC, a.id DESC
            LIMIT $7 OFFSET $8
          `,
        [...params, limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async detail(user: AuthUser, id: number) {
    this.assertViewer(user);

    const assignmentId = positiveId(id, 'ID phân công');

    const rows: Array<{
      id: number;
      studentId: number;
      secretaryUserId: number;
      examDate: string;
      examSessionCode: string | null;
      note: string | null;
      status: string;
      fullName: string;
      identityNumber: string | null;
      registrationCode: string | null;
      dateOfBirth: string | null;
      permanentAddress: string | null;
      currentAddress: string | null;
    }> = await this.db.query(
      `
          SELECT
            a.id,
            a.student_id AS "studentId",
            a.secretary_user_id AS "secretaryUserId",
            a.exam_date::text AS "examDate",
            a.exam_session_code AS "examSessionCode",
            a.note,
            a.status,
            s.full_name AS "fullName",
            s.identity_number AS "identityNumber",
            s.registration_code AS "registrationCode",
            s.date_of_birth::text AS "dateOfBirth",
            s.permanent_address AS "permanentAddress",
            s.current_address AS "currentAddress"
          FROM independent_exam_assignments a
          JOIN students s ON s.id = a.student_id
          WHERE a.id = $1
            AND ($2::boolean OR a.secretary_user_id = $3)
            AND ($2::boolean OR a.status = 'assigned')
          LIMIT 1
        `,
      [assignmentId, user.role === UserRole.SUPER_ADMIN, user.sub],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy phân công được phép xem.');
    }

    const assignment = rows[0];

    const intakes = await this.db.query(
      `
          SELECT
            si.id,
            si.application_type AS "applicationType",
            si.requested_license_class AS "requestedLicenseClass",
            si.training_license_class AS "trainingLicenseClass",
            si.examination_content AS "examinationContent",
            si.certificate_issuer AS "certificateIssuer",
            si.identity_issued_date::text AS "identityIssuedDate",
            si.note,
            si.documents,
            si.existing_licenses AS "existingLicenses",
            si.created_at AS "createdAt",
            u.full_name AS "intakeEmployeeName"
          FROM student_intakes si
          LEFT JOIN users u ON u.id = si.created_by_user_id
          WHERE si.student_id = $1
          ORDER BY si.created_at DESC, si.id DESC
        `,
      [assignment.studentId],
    );

    return {
      ...assignment,
      intakes,
    };
  }

  async cancel(user: AuthUser, id: number) {
    this.assertSuperAdmin(user);

    const assignmentId = positiveId(id, 'ID phân công');

    await this.db.transaction(async (manager) => {
      const rows: Array<{ status: string }> = await manager.query(
        `
              SELECT status
              FROM independent_exam_assignments
              WHERE id = $1
              FOR UPDATE
            `,
        [assignmentId],
      );

      if (!rows.length) {
        throw new NotFoundException('Không tìm thấy phân công.');
      }

      if (rows[0].status === 'cancelled') {
        throw new BadRequestException('Phân công đã được hủy trước đó.');
      }

      await manager.query(
        `
            UPDATE independent_exam_assignments
            SET status = 'cancelled',
                updated_at = NOW()
            WHERE id = $1
          `,
        [assignmentId],
      );

      await this.event(manager, assignmentId, user.sub, 'cancelled', {});
    });

    return {
      id: assignmentId,
      status: 'cancelled',
    };
  }

  async history(user: AuthUser, id: number) {
    this.assertSuperAdmin(user);
    const assignmentId = positiveId(id, 'ID phân công');

    return this.db.query(
      `
          SELECT
            e.id,
            e.action,
            e.detail,
            e.created_at AS "createdAt",
            u.full_name AS "actorName"
          FROM independent_exam_assignment_events e
          JOIN users u ON u.id = e.actor_user_id
          WHERE e.assignment_id = $1
          ORDER BY e.created_at DESC, e.id DESC
        `,
      [assignmentId],
    );
  }
}
