import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';

import { User, UserRole, UserStatus } from '../../entities/user.entity.js';

@Injectable()
export class SuperAdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const username = process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase();

    const password = process.env.SUPER_ADMIN_PASSWORD;
    const fullName =
      process.env.SUPER_ADMIN_FULL_NAME?.trim() || 'System Administrator';

    if (!username || !password) {
      throw new Error(
        'SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD are required.',
      );
    }

    if (username.length < 3 || username.length > 100) {
      throw new Error('Invalid SUPER_ADMIN_USERNAME.');
    }

    if (password.length < 12 || password.length > 72) {
      throw new Error('SUPER_ADMIN_PASSWORD must have 12-72 characters.');
    }

    const existing = await this.userRepository.findOneBy({
      username,
    });

    if (existing) {
      if (existing.role !== UserRole.SUPER_ADMIN) {
        throw new Error(
          'SUPER_ADMIN_USERNAME is already assigned to another role.',
        );
      }

      this.logger.log('Super Admin account already exists.');
      return;
    }

    const passwordHash = await hash(password, 12);

    await this.userRepository
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({
        username,
        passwordHash,
        fullName,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      })
      .orIgnore()
      .execute();

    this.logger.log('Super Admin bootstrap verified.');
  }
}
