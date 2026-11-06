import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
  FileSubmissionsService,
  getFileUploadMaxBytes,
} from './file-submissions.service.js';

import { FileSubmissionImportService } from './file-submission-import.service.js';
import { ExamFileApprovalService } from './exam-file-approval.service.js';

const FILE_ACCOUNT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.TRAINING_SCHOOL,
  UserRole.PC08_STAFF,
  UserRole.EXAM_CENTER,
];

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

const TEMP_DIR = join(STORAGE_ROOT, '_tmp');

const uploadOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      try {
        mkdirSync(TEMP_DIR, { recursive: true });
        callback(null, TEMP_DIR);
      } catch (error) {
        callback(
          error instanceof Error
            ? error
            : new Error('Không tạo được thư mục upload tạm.'),
          TEMP_DIR,
        );
      }
    },
    filename: (_request, _file, callback) => {
      callback(null, `${randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: getFileUploadMaxBytes(),
    files: 1,
    fields: 7,
    fieldSize: 16 * 1024,
    parts: 8,
  },
};

type ItOfficerOption = {
  id: number;
  username: string;
  fullName: string;
};

@Controller('file-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FILE_ACCOUNT_ROLES)
export class FileSubmissionsController {
  constructor(
    private readonly service: FileSubmissionsService,
    private readonly importService: FileSubmissionImportService,
    private readonly examApproval: ExamFileApprovalService,
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user);
  }

  /**
   * Danh sách tài khoản IT phục vụ khai báo KQSH.
   *
   * Sử dụng tài khoản SYSTEM_ADMIN hiện có.
   * Không cấp thêm quyền cho các tài khoản này.
   */

  @Get('it-officers')
  @Roles(UserRole.EXAM_CENTER, UserRole.SUPER_ADMIN)
  async itOfficers(): Promise<ItOfficerOption[]> {
    return this.db.query(
      `
      SELECT
        id,
        username,
        full_name AS "fullName"
      FROM users
      WHERE role = $1
        AND status = 'active'
      ORDER BY
        full_name ASC,
        username ASC,
        id ASC
    `,
      [UserRole.PC08_STAFF],
    );
  }

  @Get('exam-sessions')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.TRAINING_SCHOOL,
    UserRole.PC08_STAFF,
    UserRole.EXAM_CENTER,
  )
  examSessions(@CurrentUser() user: AuthUser) {
    return this.service.examSessionOptions(user);
  }

  @Get('import-states')
  importStates(@CurrentUser() user: AuthUser, @Query('ids') ids: string) {
    return this.importService.states(user, ids ?? '');
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.list(user, status);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      fileType: string;
      trainingSchoolId?: string;
      examinationCenterId?: string;
      note?: string;
      documentMetadata?: string;
      examinationSessionId?: string;
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user, body, file);
  }

  @Post(':id/replace')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { documentMetadata?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.replace(user, id, file, body?.documentMetadata);
  }

  @Get(':id/versions')
  versions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.versions(user, id);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('version') version: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.service.download(user, id, version);

    const safeName = file.filename.replace(/[\r\n"\\]/g, '_').slice(0, 255);

    response.setHeader('Content-Type', 'application/octet-stream');

    response.setHeader('Content-Length', String(file.sizeBytes));

    response.setHeader('Cache-Control', 'private, no-store');

    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="submission-${id}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );

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

  @Post(':id/review')
  @Roles(UserRole.SUPER_ADMIN)
  async review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      action?: 'approve' | 'reject';
      reason?: string;
      selectedFileIds?: number[];
    },
  ) {
    if (body?.action !== 'approve' && body?.action !== 'reject') {
      throw new BadRequestException('Thao tác duyệt không hợp lệ.');
    }

    if (body.action === 'reject') {
      return this.service.review(user, id, 'reject', body.reason);
    }

    const fileType = await this.importService.getFileType(user, id);

    if (fileType === 'bc1' || fileType === 'bc2') {
      return this.importService.approve(user, id);
    }

    if (fileType === 'exam_48') {
      if (!Array.isArray(body?.selectedFileIds)) {
        throw new BadRequestException(
          'Vui lòng chọn danh sách BC1, BC2 trước khi duyệt file 48_.',
        );
      }

      const selectedFileIds = [...new Set(body.selectedFileIds)];

      if (
        selectedFileIds.length > 500 ||
        selectedFileIds.some(
          (fileId) => !Number.isSafeInteger(fileId) || fileId <= 0,
        )
      ) {
        throw new BadRequestException('Danh sách BC1, BC2 không hợp lệ.');
      }

      return this.examApproval.approve(user, id, selectedFileIds);
    }

    if (fileType === 'exam_result') {
      return this.examApproval.approve(user, id);
    }

    if (fileType === 'bc2_result') {
      return this.service.review(user, id, 'approve');
    }

    throw new BadRequestException('Loại hồ sơ không được hỗ trợ.');
  }
}
