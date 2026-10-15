import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserStatus } from '../../entities/user.entity.js';

import type { AuthUser } from '../types/auth-user.type.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      );
    }

    const token = authorization.substring(7).trim();

    if (!token) {
      throw new UnauthorizedException('Access Token không hợp lệ.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });

      if (
        payload.type !== 'access' ||
        !Number.isSafeInteger(payload.sub) ||
        payload.sub <= 0
      ) {
        throw new UnauthorizedException();
      }

      const user = await this.userRepository.findOneBy({
        id: payload.sub,
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException();
      }

      request.user = {
        sub: user.id,
        username: user.username,
        role: user.role,
        type: 'access',
      };

      return true;
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      );
    }
  }
}
