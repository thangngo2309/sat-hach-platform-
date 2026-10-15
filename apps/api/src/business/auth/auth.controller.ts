import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Request, Response, CookieOptions } from 'express';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import type { AuthUser } from '../../shared/types/auth-user.type.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.AUTH_COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: this.authService.getRefreshMaxAge(),
    };
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie('sat_hach_refresh_token', token, this.getCookieOptions());
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto);

    this.setRefreshCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.sat_hach_refresh_token as
      string | undefined;

    const session = await this.authService.refresh(refreshToken);

    this.setRefreshCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.sat_hach_refresh_token as
      string | undefined;

    const result = await this.authService.logout(refreshToken);

    response.clearCookie('sat_hach_refresh_token', {
      ...this.getCookieOptions(),
      maxAge: undefined,
    });

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.sub);
  }
}
