import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../../entities/user.entity.js';

export type CreateSystemAdminInput = {
  username: string;
  fullName: string;
  password: string;
};

export type UpdateSystemAdminInput = {
  fullName?: string;
  status?: UserStatus;
  password?: string;
};

export type ManagedStudentsQuery = {
  page?: string;
  limit?: string;
  search?: string;
};

export type MultipleStudentsQuery = ManagedStudentsQuery & {
  userIds?: string;
  filterUserId?: string;
};

type StudentCountRow = {
  userId: number;
  studentCount: number;
};

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  private publicUser(user: User, studentCount = 0) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      studentCount,
    };
  }

  private validateUsername(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('Vui lòng nhập tên đăng nhập.');
    }

    const username = raw.trim().toLowerCase();

    if (!/^[a-z0-9._-]{4,100}$/.test(username)) {
      throw new BadRequestException(
        'Tên đăng nhập phải có 4–100 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.',
      );
    }

    return username;
  }

  private validateFullName(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('Vui lòng nhập họ và tên.');
    }

    const fullName = raw.trim().replace(/\s+/g, ' ');

    if (fullName.length < 2 || fullName.length > 255) {
      throw new BadRequestException('Họ và tên phải có từ 2 đến 255 ký tự.');
    }

    return fullName;
  }

  private validatePassword(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length < 8 || raw.length > 128) {
      throw new BadRequestException('Mật khẩu phải có từ 8 đến 128 ký tự.');
    }

    return raw;
  }

  private positiveInt(raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw === '') return fallback;

    if (!/^[1-9]\d*$/.test(raw)) {
      throw new BadRequestException('Tham số số nguyên không hợp lệ.');
    }

    const result = Number(raw);

    if (!Number.isSafeInteger(result)) {
      throw new BadRequestException('Tham số vượt giới hạn.');
    }

    return result;
  }

  private parseUserIds(raw: string | undefined): number[] {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new BadRequestException('Vui lòng chọn tài khoản nhân viên.');
    }

    const parts = raw.split(',');

    if (parts.length > 100) {
      throw new BadRequestException('Chỉ được chọn tối đa 100 tài khoản.');
    }

    const ids = parts.map((part) => {
      const text = part.trim();

      if (!/^[1-9]\d*$/.test(text)) {
        throw new BadRequestException('Danh sách tài khoản không hợp lệ.');
      }

      const id = Number(text);

      if (!Number.isSafeInteger(id)) {
        throw new BadRequestException('ID tài khoản vượt giới hạn.');
      }

      return id;
    });

    return [...new Set(ids)];
  }

  private async getStudentCounts(
    userIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (!userIds.length) return counts;

    const rows: StudentCountRow[] = await this.users.manager.query(
      `
          SELECT
            created_by_user_id AS "userId",
            COUNT(DISTINCT student_id)::int AS "studentCount"
          FROM student_intakes
          WHERE created_by_user_id = ANY($1::int[])
          GROUP BY created_by_user_id
        `,
      [userIds],
    );

    for (const row of rows) {
      counts.set(Number(row.userId), Number(row.studentCount));
    }

    return counts;
  }

  async list(search?: string) {
    const qb = this.users.createQueryBuilder('u').where('u.role = :role', {
      role: UserRole.SYSTEM_ADMIN,
    });

    const keyword = search?.trim();

    if (keyword) {
      qb.andWhere('(u.username ILIKE :search OR u.fullName ILIKE :search)', {
        search: `%${keyword}%`,
      });
    }

    const rows = await qb
      .orderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .getMany();

    const counts = await this.getStudentCounts(rows.map((user) => user.id));

    return rows.map((user) => this.publicUser(user, counts.get(user.id) ?? 0));
  }

  async detail(id: number) {
    const user = await this.getSystemAdmin(id);
    const counts = await this.getStudentCounts([id]);

    return this.publicUser(user, counts.get(id) ?? 0);
  }

  private async getSystemAdmin(id: number): Promise<User> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('ID tài khoản không hợp lệ.');
    }

    const user = await this.users.findOneBy({
      id,
      role: UserRole.SYSTEM_ADMIN,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân viên.');
    }

    return user;
  }

  /**
   * Xem thí sinh của một hoặc nhiều SYSTEM_ADMIN.
   *
   * Quyền gọi endpoint được kiểm soát trong Controller.
   * Luôn đối chiếu userIds với bảng users.
   *
   * Khi một học viên được nhiều người tiếp nhận:
   * - Chỉ xuất hiện một dòng trong chế độ "Tất cả".
   * - intakeUsers chứa các nhân viên liên quan.
   */
  async listStudentsOfUsers(query: MultipleStudentsQuery = {}) {
    const userIds = this.parseUserIds(query.userIds);

    const employees = await this.users
      .createQueryBuilder('u')
      .where('u.id IN (:...ids)', { ids: userIds })
      .andWhere('u.role = :role', {
        role: UserRole.SYSTEM_ADMIN,
      })
      .orderBy('u.fullName', 'ASC')
      .getMany();

    if (employees.length !== userIds.length) {
      throw new BadRequestException(
        'Có tài khoản không tồn tại hoặc không phải SYSTEM_ADMIN.',
      );
    }

    let filterUserId: number | null = null;

    if (query.filterUserId !== undefined && query.filterUserId !== '') {
      filterUserId = this.positiveInt(query.filterUserId, 1);

      if (!userIds.includes(filterUserId)) {
        throw new BadRequestException(
          'Tài khoản lọc không nằm trong danh sách đã chọn.',
        );
      }
    }

    const page = this.positiveInt(query.page, 1);
    const limit = Math.min(this.positiveInt(query.limit, 20), 100);

    const search =
      typeof query.search === 'string' ? query.search.trim().slice(0, 150) : '';

    const offset = (page - 1) * limit;

    // Các tham số chung:
    // $1: userIds
    // $2: search
    // $3: filterUserId (null = tất cả)
    const baseParams = [userIds, search, filterUserId];

    /**
     * Chỉ chứa WHERE, không chứa FROM hoặc JOIN.
     *
     * $1: Danh sách tài khoản SYSTEM_ADMIN
     * $2: Từ khóa tìm kiếm
     * $3: Tài khoản được lọc, null là tất cả
     */
    const studentWhere = `
      WHERE (
        $2::text = ''
        OR s.registration_code ILIKE '%' || $2::text || '%'
        OR s.full_name ILIKE '%' || $2::text || '%'
        OR COALESCE(s.identity_number, '')
          ILIKE '%' || $2::text || '%'
      )
      AND EXISTS (
        SELECT 1
        FROM student_intakes si_filter
        WHERE si_filter.student_id = s.id
          AND si_filter.created_by_user_id = ANY($1::int[])
          AND (
            $3::int IS NULL
            OR si_filter.created_by_user_id = $3::int
          )
      )
    `;

    const [countRows, rows] = await Promise.all([
      /**
       * Đếm học viên không trùng lặp.
       */
      this.users.manager.query(
        `
          SELECT COUNT(*)::int AS total
          FROM students s
          ${studentWhere}
        `,
        baseParams,
      ),

      /**
       * Danh sách học viên theo nhiều nhân viên.
       */
      this.users.manager.query(
        `
          SELECT
            s.id,
            s.registration_code AS "registrationCode",
            s.full_name AS "fullName",
            s.date_of_birth::text AS "dateOfBirth",
            s.identity_number AS "identityNumber",
            s.source_type AS "sourceType",
            (s.photo_id IS NOT NULL) AS "hasPhoto",

            intake_info."intakeCreatedAt",
            intake_info."intakeUpdatedAt",
            intake_info."requestedLicenseClass",
            intake_info."applicationType",
            intake_info."intakeUsers",

            EXISTS (
              SELECT 1
              FROM bc2_candidates bc
              WHERE bc.student_id = s.id
            ) AS "hasBc2"

          FROM students s

          LEFT JOIN LATERAL (
            SELECT
              MAX(si.created_at) AS "intakeCreatedAt",
              MAX(si.updated_at) AS "intakeUpdatedAt",

              (
                ARRAY_AGG(
                  si.requested_license_class
                  ORDER BY si.created_at DESC, si.id DESC
                )
              )[1] AS "requestedLicenseClass",

              (
                ARRAY_AGG(
                  si.application_type
                  ORDER BY si.created_at DESC, si.id DESC
                )
              )[1] AS "applicationType",

              COALESCE(
                JSONB_AGG(
                  jsonb_build_object(
                    'id', u.id,
                    'fullName', u.full_name,
                    'username', u.username,
                    'intakeId', si.id,
                    'createdAt', si.created_at
                  )
                  ORDER BY si.created_at ASC, si.id ASC
                ),
                '[]'::jsonb
              ) AS "intakeUsers"

            FROM student_intakes si

            JOIN users u
              ON u.id = si.created_by_user_id

            WHERE si.student_id = s.id
              AND si.created_by_user_id = ANY($1::int[])
              AND (
                $3::int IS NULL
                OR si.created_by_user_id = $3::int
              )
          ) intake_info ON TRUE

          ${studentWhere}

          ORDER BY
            intake_info."intakeCreatedAt" DESC NULLS LAST,
            s.id DESC

          LIMIT $4::int
          OFFSET $5::int
        `,
        [...baseParams, limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      employees: employees.map((item) => ({
        id: item.id,
        username: item.username,
        fullName: item.fullName,
        status: item.status,
      })),
      selectedUserIds: userIds,
      filterUserId,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Giữ API cũ để tương thích với Frontend
   * hoặc các màn hình đang dùng một tài khoản.
   */
  async listStudentsOfUser(id: number, query: ManagedStudentsQuery = {}) {
    const employee = await this.getSystemAdmin(id);

    const result = await this.listStudentsOfUsers({
      ...query,
      userIds: String(id),
    });

    return {
      employee: {
        id: employee.id,
        username: employee.username,
        fullName: employee.fullName,
        status: employee.status,
      },
      ...result,
    };
  }

  async create(input: CreateSystemAdminInput) {
    const username = this.validateUsername(input?.username);
    const fullName = this.validateFullName(input?.fullName);
    const password = this.validatePassword(input?.password);

    const existing = await this.users.findOneBy({ username });

    if (existing) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng.');
    }

    const user = this.users.create({
      username,
      fullName,
      passwordHash: await hash(password, 12),
      role: UserRole.SYSTEM_ADMIN,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
    });

    try {
      const saved = await this.users.save(user);
      return this.publicUser(saved, 0);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('Tên đăng nhập đã được sử dụng.');
      }

      throw error;
    }
  }

  async update(id: number, input: UpdateSystemAdminInput) {
    const user = await this.getSystemAdmin(id);

    if (input.fullName !== undefined) {
      user.fullName = this.validateFullName(input.fullName);
    }

    if (input.status !== undefined) {
      if (!Object.values(UserStatus).includes(input.status)) {
        throw new BadRequestException('Trạng thái tài khoản không hợp lệ.');
      }

      user.status = input.status;
    }

    if (input.password !== undefined) {
      user.passwordHash = await hash(this.validatePassword(input.password), 12);
    }

    const saved = await this.users.save(user);
    const counts = await this.getStudentCounts([id]);

    return this.publicUser(saved, counts.get(id) ?? 0);
  }
}
