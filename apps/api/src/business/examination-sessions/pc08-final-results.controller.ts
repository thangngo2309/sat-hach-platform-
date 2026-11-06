import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { Response } from 'express';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';
import { UserRole } from '../../entities/user.entity.js';

import {
  Pc08FinalResultsService,
  PC08_RESULT_MAX_BYTES,
} from './pc08-final-results.service.js';

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

const TEMP_DIR = join(STORAGE_ROOT, '_tmp');

const uploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      try {
        mkdirSync(TEMP_DIR, { recursive: true });
        callback(null, TEMP_DIR);
      } catch (error) {
        callback(
          error instanceof Error
            ? error
            : new Error('Không tạo được thư mục upload.'),
          TEMP_DIR,
        );
      }
    },
    filename: (_req, _file, callback) => {
      callback(null, `${randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: PC08_RESULT_MAX_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
  },
};

@Controller('pc08-final-results')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.PC08_STAFF, UserRole.TRAINING_SCHOOL)
export class Pc08FinalResultsController {
  constructor(private readonly service: Pc08FinalResultsService) {}

  @Get('received')
  @Roles(UserRole.TRAINING_SCHOOL)
  received(@CurrentUser() user: AuthUser) {
    return this.service.received(user);
  }

  @Get('sessions/:sessionId')
  @Roles(UserRole.PC08_STAFF, UserRole.SUPER_ADMIN)
  status(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.service.sessionStatus(user, sessionId);
  }

  @Post('sessions/:sessionId/schools/:schoolId/upload')
  @Roles(UserRole.PC08_STAFF)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('schoolId', ParseIntPipe) schoolId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.upload(user, sessionId, schoolId, file);
  }

  @Post('sessions/:sessionId/confirm')
  @Roles(UserRole.PC08_STAFF)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body()
    body: {
      confirmed?: boolean;
      note?: string;
    },
  ) {
    if (body?.confirmed !== true) {
      throw new BadRequestException(
        'Vui lòng xác nhận đã gửi đầy đủ KQSH cho CSĐT.',
      );
    }

    return this.service.confirm(user, sessionId, body.confirmed, body.note);
  }

  @Post('files/:deliveryId/review')
  @Roles(UserRole.SUPER_ADMIN)
  review(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @Body()
    body: {
      action?: 'approve' | 'reject';
      reason?: string;
    },
  ) {
    if (body?.action !== 'approve' && body?.action !== 'reject') {
      throw new BadRequestException('Thao tác duyệt không hợp lệ.');
    }

    return this.service.review(user, deliveryId, body.action, body.reason);
  }

  @Get('files/:deliveryId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.service.download(user, deliveryId);

    const safeName = file.filename.replace(/[\r\n"\\]/g, '_').slice(0, 255);

    response.setHeader('Content-Type', 'application/octet-stream');

    response.setHeader('Content-Length', String(file.sizeBytes));

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="kqsh-${deliveryId}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );

    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      await pipeline(createReadStream(file.absolutePath), response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }

      throw error;
    }
  }
}
