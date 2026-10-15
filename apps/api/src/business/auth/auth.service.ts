import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

import { EntityManager, Repository } from 'typeorm';

import { User, UserStatus } from '../../entities/user.entity.js';

import { RefreshToken } from '../../entities/refresh-token.entity.js';

import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,

    private readonly jwtService: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getAccessExpiresSeconds(): number {
    return 15 * 60;
  }

  private getRefreshDays(): number {
    const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7);

    return Number.isFinite(days) && days > 0 ? days : 7;
  }

  getRefreshMaxAge(): number {
    return this.getRefreshDays() * 24 * 60 * 60 * 1000;
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };
  }

  private async generateAccessToken(user: User) {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }

    const payload: AuthUser = {
      sub: user.id,
      username: user.username,
      role: user.role,
      type: 'access',
    };

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: this.getAccessExpiresSeconds(),
      algorithm: 'HS256',
    });
  }

  private async createSession(user: User, manager?: EntityManager) {
    const accessToken = await this.generateAccessToken(user);

    const refreshToken = randomBytes(48).toString('hex');

    const repository = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokenRepository;

    const tokenEntity = repository.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
      revokedAt: null,
      deviceName: 'Web Admin',
    });

    await repository.save(tokenEntity);

    return {
      accessToken,
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  async login(dto: LoginDto) {
    const username = dto.username.trim().toLowerCase();

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', {
        username,
      })
      .getOne();

    if (!user) {
      throw new UnauthorizedException(
        'Tên đăng nhập hoặc mật khẩu không chính xác.',
      );
    }

    const valid = await compare(dto.password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException(
        'Tên đăng nhập hoặc mật khẩu không chính xác.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Tài khoản đã bị vô hiệu hóa hoặc tạm khóa.',
      );
    }

    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    return this.createSession(user);
  }

  async refresh(rawRefreshToken?: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    return this.refreshTokenRepository.manager.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(RefreshToken);

      const userRepository = manager.getRepository(User);

      // Lock the token row until the transaction commits.
      // A concurrent refresh cannot rotate the same token twice.
      const storedToken = await tokenRepository
        .createQueryBuilder('token')
        .setLock('pessimistic_write')
        .where('token.tokenHash = :tokenHash', {
          tokenHash,
        })
        .getOne();

      if (
        !storedToken ||
        storedToken.revokedAt !== null ||
        storedToken.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException(
          'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
        );
      }

      const user = await userRepository.findOneBy({
        id: storedToken.userId,
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException(
          'Tài khoản không còn được phép đăng nhập.',
        );
      }

      // Revoke current refresh token.
      storedToken.revokedAt = new Date();

      await tokenRepository.save(storedToken);

      // Create the replacement token within the same transaction.
      return this.createSession(user, manager);
    });
  }

  async logout(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);

      await this.refreshTokenRepository
        .createQueryBuilder()
        .update(RefreshToken)
        .set({
          revokedAt: new Date(),
        })
        .where('token_hash = :tokenHash', {
          tokenHash,
        })
        .andWhere('revoked_at IS NULL')
        .execute();
    }

    return {
      message: 'Đăng xuất thành công.',
    };
  }

  async me(userId: number) {
    const user = await this.userRepository.findOneBy({
      id: userId,
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    }

    return this.toPublicUser(user);
  }
}
