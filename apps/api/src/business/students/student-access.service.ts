import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

@Injectable()
export class StudentAccessService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  isSystemAdmin(user: AuthUser): boolean {
    return user.role === UserRole.SYSTEM_ADMIN;
  }

  isSuperAdmin(user: AuthUser): boolean {
    return user.role === UserRole.SUPER_ADMIN;
  }

  canManageStudents(user: AuthUser): boolean {
    return [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SYSTEM_ADMIN,
    ].includes(user.role);
  }

  ensureStudentRole(user: AuthUser): void {
    if (!this.canManageStudents(user)) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập hồ sơ học viên.',
      );
    }
  }

  /**
   * SQL dùng trong truy vấn danh sách.
   *
   * Chỉ sử dụng sau khi đã xác thực user bằng JwtAuthGuard.
   * Tham số userId là ID lấy từ JWT, không lấy từ query string.
   */
  getOwnershipCondition(
    user: AuthUser,
    studentAlias = 's',
    parameterIndex = 1,
  ): { sql: string; params: unknown[] } {
    this.ensureStudentRole(user);

    if (!this.isSystemAdmin(user)) {
      return { sql: 'TRUE', params: [] };
    }

    return {
      sql: `
          EXISTS (
            SELECT 1
            FROM student_intakes intake_access
            WHERE intake_access.student_id = ${studentAlias}.id
              AND intake_access.created_by_user_id = $${parameterIndex}::int
          )
        `,
      params: [user.sub],
    };
  }

  async assertCanView(
    studentId: number,
    user: AuthUser,
    manager?: EntityManager,
  ): Promise<void> {
    this.ensureStudentRole(user);

    const executor = manager ?? this.db;

    const rows: Array<{ id: number }> = await executor.query(
      `
          SELECT s.id
          FROM students s
          WHERE s.id = $1
            AND (
              $2::boolean = FALSE
              OR EXISTS (
                SELECT 1
                FROM student_intakes si
                WHERE si.student_id = s.id
                  AND si.created_by_user_id = $3::int
              )
            )
          LIMIT 1
        `,
      [studentId, this.isSystemAdmin(user), user.sub],
    );

    if (!rows.length) {
      // Không tiết lộ sự tồn tại của hồ sơ thuộc nhân viên khác.
      throw new NotFoundException('Không tìm thấy hồ sơ học viên.');
    }
  }

  async assertCanEdit(
    studentId: number,
    user: AuthUser,
    manager?: EntityManager,
  ): Promise<void> {
    await this.assertCanView(studentId, user, manager);

    const executor = manager ?? this.db;

    const rows: Array<{ has_bc2: boolean }> = await executor.query(
      `
          SELECT EXISTS (
            SELECT 1
            FROM bc2_candidates
            WHERE student_id = $1
          ) AS has_bc2
        `,
      [studentId],
    );

    if (rows[0]?.has_bc2) {
      throw new ForbiddenException(
        'Học viên đã có BC2, không được chỉnh sửa thông tin.',
      );
    }

    if (this.isSystemAdmin(user)) {
      const rows: Array<{ source_type: string }> = await executor.query(
        'SELECT source_type FROM students WHERE id = $1',
        [studentId],
      );

      if (rows[0]?.source_type !== 'manual') {
        throw new ForbiddenException(
          'Hồ sơ đã có dữ liệu nguồn. Vui lòng liên hệ quản trị viên để điều chỉnh.',
        );
      }
    }
  }
}
