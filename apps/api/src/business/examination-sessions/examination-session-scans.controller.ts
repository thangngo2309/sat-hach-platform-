import {
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

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

import {
  ExaminationSessionScansService,
  MAX_EXAM_SCAN_BYTES,
} from './examination-session-scans.service.js';

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
    fileSize: MAX_EXAM_SCAN_BYTES,
    files: 1,
    fields: 1,
    parts: 2,
    fieldSize: 8 * 1024,
  },
};

@Controller('examination-session-scans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.PC08_STAFF, UserRole.EXAM_SECRETARY)
export class ExaminationSessionScansController {
  constructor(private readonly service: ExaminationSessionScansService) {}

  @Get(':sessionId')
  list(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.service.list(user, sessionId);
  }

  @Post(':sessionId')
  @Roles(UserRole.EXAM_SECRETARY)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @UploadedFile() file?: Express.Multer.File,
    @Body('note') note?: string,
  ) {
    return this.service.upload(user, sessionId, file, note);
  }

  @Get(':sessionId/files/:scanId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('scanId', ParseIntPipe) scanId: number,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.service.download(user, sessionId, scanId);

    const safeName = file.filename.replace(/[\r\n"\\]/g, '_').slice(0, 255);

    response.setHeader('Content-Type', 'application/octet-stream');

    response.setHeader('Content-Length', String(file.sizeBytes));

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="scan-${scanId}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
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
