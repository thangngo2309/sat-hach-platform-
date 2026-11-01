import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { DataSource, QueryFailedError } from 'typeorm';

import { User, UserRole, UserStatus } from '../../entities/user.entity.js';

export const ORGANIZATION_ROLES = [
  UserRole.TRAINING_SCHOOL,
  UserRole.PC08_STAFF,
  UserRole.EXAM_CENTER,
  UserRole.EXAM_SECRETARY,
] as const;

export type OrganizationAccountRole = (typeof ORGANIZATION_ROLES)[number];

export type CreateOrganizationAccountInput = {
  username: string;
  fullName: string;
  password: string;
  role: OrganizationAccountRole;
  trainingSchoolId?: number | null;
  examinationCenterId?: number | null;
};

export type UpdateOrganizationAccountInput = {
  fullName?: string;
  password?: string;
  status?: UserStatus;
  trainingSchoolId?: number | null;
  examinationCenterId?: number | null;
};

type AccountRow = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  trainingSchoolId: number | null;
  trainingSchoolCode: string | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterCode: string | null;
  examinationCenterName: string | null;
};

@Injectable()
export class OrganizationAccountService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private validateUsername(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('Vui lòng nhập tên đăng nhập.');
    }

    const value = raw.trim().toLowerCase();

    if (!/^[a-z0-9._-]{4,100}$/.test(value)) {
      throw new BadRequestException(
        'Tên đăng nhập phải từ 4 đến 100 ký tự và chỉ chứa chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.',
      );
    }

    return value;
  }

  private validateFullName(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException(
        'Vui lòng nhập tên tài khoản hoặc người phụ trách.',
      );
    }

    const value = raw.trim().replace(/\s+/g, ' ');

    if (value.length < 2 || value.length > 255) {
      throw new BadRequestException('Tên phải từ 2 đến 255 ký tự.');
    }

    return value;
  }

  private validatePassword(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length < 8 || raw.length > 128) {
      throw new BadRequestException('Mật khẩu phải từ 8 đến 128 ký tự.');
    }

    return raw;
  }

  private validateRole(raw: unknown): OrganizationAccountRole {
    if (!ORGANIZATION_ROLES.includes(raw as OrganizationAccountRole)) {
      throw new BadRequestException(
        'Vai trò tài khoản nghiệp vụ không hợp lệ.',
      );
    }

    return raw as OrganizationAccountRole;
  }

  private organizationId(raw: unknown): number | null {
    if (raw === undefined || raw === null || raw === '') {
      return null;
    }

    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
      throw new BadRequestException('ID đơn vị phải là số nguyên dương.');
    }

    return raw;
  }

  private validateOrganization(
    role: OrganizationAccountRole,
    schoolId: number | null,
    centerId: number | null,
  ): void {
    if (role === UserRole.TRAINING_SCHOOL) {
      if (!schoolId || centerId !== null) {
        throw new BadRequestException(
          'Tài khoản CSĐT phải chọn đúng một cơ sở đào tạo.',
        );
      }

      return;
    }

    if (role === UserRole.EXAM_CENTER) {
      if (!centerId || schoolId !== null) {
        throw new BadRequestException(
          'Tài khoản TTSH phải chọn đúng một trung tâm sát hạch.',
        );
      }

      return;
    }

    if (schoolId !== null || centerId !== null) {
      throw new BadRequestException(
        'Tài khoản PC08 hoặc Thư ký không gắn trực tiếp với CSĐT hay TTSH ở giai đoạn này.',
      );
    }
  }

  private async validateExistingOrganization(
    schoolId: number | null,
    centerId: number | null,
  ): Promise<void> {
    if (schoolId !== null) {
      const rows: Array<{ id: number }> = await this.db.query(
        `SELECT id FROM training_schools WHERE id = $1`,
        [schoolId],
      );

      if (!rows.length) {
        throw new NotFoundException('Không tìm thấy cơ sở đào tạo.');
      }
    }

    if (centerId !== null) {
      const rows: Array<{ id: number }> = await this.db.query(
        `
              SELECT id
              FROM examination_centers
              WHERE id = $1 AND is_active = TRUE
            `,
        [centerId],
      );

      if (!rows.length) {
        throw new BadRequestException(
          'Trung tâm sát hạch không tồn tại hoặc đã ngừng hoạt động.',
        );
      }
    }
  }

  private readonly accountSql = `
      SELECT
        u.id,
        u.username,
        u.full_name AS "fullName",
        u.role,
        u.status,
        u.last_login_at AS "lastLoginAt",
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt",
  
        a.training_school_id AS "trainingSchoolId",
        ts.code AS "trainingSchoolCode",
        ts.name AS "trainingSchoolName",
  
        a.examination_center_id AS "examinationCenterId",
        ec.code AS "examinationCenterCode",
        ec.name AS "examinationCenterName"
  
      FROM users u
  
      LEFT JOIN user_organization_assignments a
        ON a.user_id = u.id
  
      LEFT JOIN training_schools ts
        ON ts.id = a.training_school_id
  
      LEFT JOIN examination_centers ec
        ON ec.id = a.examination_center_id
    `;

  async options() {
    const [trainingSchools, examinationCenters] = await Promise.all([
      this.db.query(`
            SELECT id, code, name
            FROM training_schools
            ORDER BY name ASC, id ASC
          `),

      this.db.query(`
            SELECT id, code, name
            FROM examination_centers
            WHERE is_active = TRUE
            ORDER BY name ASC NULLS LAST, id ASC
          `),
    ]);

    return {
      trainingSchools,
      examinationCenters,
    };
  }

  async list(search = ''): Promise<AccountRow[]> {
    const keyword = search.trim().slice(0, 150);

    return this.db.query(
      `
          ${this.accountSql}
  
          WHERE u.role = ANY($1::text[])
            AND (
              $2::text = ''
              OR u.username ILIKE '%' || $2::text || '%'
              OR u.full_name ILIKE '%' || $2::text || '%'
              OR COALESCE(ts.name, '') ILIKE
                '%' || $2::text || '%'
              OR COALESCE(ec.name, '') ILIKE
                '%' || $2::text || '%'
            )
  
          ORDER BY u.created_at DESC, u.id DESC
        `,
      [[...ORGANIZATION_ROLES], keyword],
    );
  }

  async detail(id: number): Promise<AccountRow> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('ID tài khoản không hợp lệ.');
    }

    const rows: AccountRow[] = await this.db.query(
      `
          ${this.accountSql}
  
          WHERE u.id = $1
            AND u.role = ANY($2::text[])
  
          LIMIT 1
        `,
      [id, [...ORGANIZATION_ROLES]],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy tài khoản nghiệp vụ.');
    }

    return rows[0];
  }

  async create(input: CreateOrganizationAccountInput): Promise<AccountRow> {
    const username = this.validateUsername(input?.username);
    const fullName = this.validateFullName(input?.fullName);
    const password = this.validatePassword(input?.password);
    const role = this.validateRole(input?.role);

    const schoolId = this.organizationId(input?.trainingSchoolId);
    const centerId = this.organizationId(input?.examinationCenterId);

    this.validateOrganization(role, schoolId, centerId);

    await this.validateExistingOrganization(schoolId, centerId);

    let newId = 0;

    try {
      newId = await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(User);

        const existing = await repo.findOneBy({
          username,
        });

        if (existing) {
          throw new ConflictException('Tên đăng nhập đã được sử dụng.');
        }

        const account = repo.create({
          username,
          fullName,
          passwordHash: await hash(password, 12),
          role,
          status: UserStatus.ACTIVE,
          lastLoginAt: null,
        });

        const saved = await repo.save(account);

        if (schoolId !== null || centerId !== null) {
          await manager.query(
            `
                INSERT INTO user_organization_assignments (
                  user_id,
                  training_school_id,
                  examination_center_id
                )
                VALUES ($1, $2, $3)
              `,
            [saved.id, schoolId, centerId],
          );
        }

        return saved.id;
      });
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        throw new ConflictException('Tên đăng nhập đã được sử dụng.');
      }

      throw error;
    }

    if (newId <= 0) {
      throw new Error('Không tạo được tài khoản.');
    }
    
    return this.detail(newId);
  }

  async update(
    id: number,
    input: UpdateOrganizationAccountInput,
  ): Promise<AccountRow> {
    const current = await this.detail(id);

    const role = this.validateRole(current.role);

    const schoolId =
      input.trainingSchoolId === undefined
        ? current.trainingSchoolId
        : this.organizationId(input.trainingSchoolId);

    const centerId =
      input.examinationCenterId === undefined
        ? current.examinationCenterId
        : this.organizationId(input.examinationCenterId);

    this.validateOrganization(role, schoolId, centerId);

    await this.validateExistingOrganization(schoolId, centerId);

    let fullName: string | undefined;
    let passwordHash: string | undefined;

    if (input.fullName !== undefined) {
      fullName = this.validateFullName(input.fullName);
    }

    if (input.password !== undefined) {
      passwordHash = await hash(this.validatePassword(input.password), 12);
    }

    if (
      input.status !== undefined &&
      !Object.values(UserStatus).includes(input.status)
    ) {
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ.');
    }

    await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(User);

      const account = await repo.findOneBy({
        id,
        role,
      });

      if (!account) {
        throw new NotFoundException('Không tìm thấy tài khoản nghiệp vụ.');
      }

      if (fullName !== undefined) {
        account.fullName = fullName;
      }

      if (passwordHash !== undefined) {
        account.passwordHash = passwordHash;
      }

      if (input.status !== undefined) {
        account.status = input.status;
      }

      await repo.save(account);

      await manager.query(
        `
            DELETE FROM user_organization_assignments
            WHERE user_id = $1
          `,
        [id],
      );

      if (schoolId !== null || centerId !== null) {
        await manager.query(
          `
              INSERT INTO user_organization_assignments (
                user_id,
                training_school_id,
                examination_center_id
              )
              VALUES ($1, $2, $3)
            `,
          [id, schoolId, centerId],
        );
      }
    });

    return this.detail(id);
  }
}
