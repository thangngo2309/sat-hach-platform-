import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import {
  StudentManagementService,
  type StudentInput,
} from './student-management.service.js';

import { StudentScanService } from './student-scan.service.js';

const photoUpload = FileInterceptor('photo', {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 40,
    fieldSize: 50 * 1024,
  },
});

const scanUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 2,
    fieldSize: 1024,
  },
});

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
export class StudentManagementController {
  constructor(
    private readonly service: StudentManagementService,
    private readonly scanService: StudentScanService,
  ) {}

  @Post()
  @UseInterceptors(photoUpload)
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.create(user, body, photo);
  }

  @Patch(':id')
  @UseInterceptors(photoUpload)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.update(user, id, body, photo);
  }

  /**
   * Danh sách hồ sơ tiếp nhận tự do
   * mà tài khoản được phép truy cập.
   */
  @Get(':id/scans/intakes')
  scanIntakes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.scanService.intakes(user, id);
  }

  /**
   * Danh sách file scan của một hồ sơ tiếp nhận.
   */
  @Get(':id/scans')
  scans(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('intakeId', ParseIntPipe)
    intakeId: number,
  ) {
    return this.scanService.list(user, id, intakeId);
  }

  /**
   * Upload file scan mới.
   * File cũ vẫn được giữ trong lịch sử.
   */
  @Post(':id/scans')
  @UseInterceptors(scanUpload)
  uploadScan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('intakeId', ParseIntPipe)
    intakeId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.scanService.upload(user, id, intakeId, file);
  }

  /**
   * Tải file scan theo intake và attachment ID.
   */
  @Get(':id/scans/:attachmentId/download')
  async downloadScan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe)
    attachmentId: number,
    @Query('intakeId', ParseIntPipe)
    intakeId: number,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.scanService.download(
      user,
      id,
      intakeId,
      attachmentId,
    );

    const safeName = result.originalName
      .replace(/[\r\n"\\]/g, '_')
      .slice(0, 255);

    response.setHeader('Content-Type', 'application/octet-stream');

    response.setHeader('Content-Length', String(result.buffer.length));

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="student-scan-${attachmentId}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );

    response.setHeader('Cache-Control', 'private, no-store');

    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.end(result.buffer);
  }
}
