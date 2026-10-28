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

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  private publicUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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

    return rows.map((user) => this.publicUser(user));
  }

  async detail(id: number) {
    const user = await this.getSystemAdmin(id);

    return this.publicUser(user);
  }

  private async getSystemAdmin(id: number) {
    const user = await this.users.findOneBy({
      id,
      role: UserRole.SYSTEM_ADMIN,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân viên.');
    }

    return user;
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
      return this.publicUser(saved);
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

    return this.publicUser(saved);
  }
}
