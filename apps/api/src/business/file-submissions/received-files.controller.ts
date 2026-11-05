import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';

import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import type { Response } from 'express';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { ReceivedFilesService } from './received-files.service.js';

@Controller('received-files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRAINING_SCHOOL, UserRole.EXAM_CENTER, UserRole.PC08_STAFF)
export class ReceivedFilesController {
  constructor(private readonly service: ReceivedFilesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.service.download(user, id);

    const safeName = file.filename.replace(/[\r\n"\\]/g, '_').slice(0, 255);

    response.setHeader('Content-Type', 'application/octet-stream');

    response.setHeader('Content-Length', String(file.sizeBytes));

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="received-${id}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );

    response.setHeader('Cache-Control', 'private, no-store');

    response.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      await pipeline(createReadStream(file.path), response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);

        return;
      }

      throw error;
    }
  }
}
