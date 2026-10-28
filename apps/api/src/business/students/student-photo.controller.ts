import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { StudentPhotoService } from './student-photo.service.js';
import { StudentAccessService } from './student-access.service.js';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
export class StudentPhotoController {
  constructor(
    private readonly photoService: StudentPhotoService,
    private readonly access: StudentAccessService,
  ) {}

  @Get(':id/photo')
  async getPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) studentId: number,
    @Res() response: Response,
  ) {
    await this.access.assertCanView(studentId, user);

    const photo = await this.photoService.getStudentPhoto(studentId);

    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Content-Length', photo.content.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.status(200).end(photo.content);
  }
}
