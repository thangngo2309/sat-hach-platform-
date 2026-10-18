import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { UserRole } from '../../entities/user.entity.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { ExamListImportService } from './exam-list-import.service.js';

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
    files: 1,
  },
};

@Controller('imports/exam-list')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ExamListImportController {
  constructor(private readonly service: ExamListImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirm(file, user.sub);
  }

  @Get('history')
  history(@Query('limit') limit?: string) {
    return this.service.history(limit ? Number(limit) : 50);
  }
}
