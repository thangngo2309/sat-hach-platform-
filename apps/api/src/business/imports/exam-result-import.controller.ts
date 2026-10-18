import {
  Controller,
  Get,
  Param,
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

import { ExamResultImportService } from './exam-result-import.service.js';

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
    files: 1,
  },
};

@Controller('imports/exam-result')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamResultImportController {
  constructor(private readonly service: ExamResultImportService) {}

  @Post('preview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file);
  }

  @Post('confirm')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirm(file, user.sub);
  }

  @Get('history')
  history() {
    return this.service.history();
  }

  @Get('sessions')
  sessions() {
    return this.service.sessions();
  }

  @Get('sessions/:code/results')
  results(
    @Param('code') code: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('candidateType') candidateType?: string,
  ) {
    return this.service.results(code, {
      page,
      limit,
      search,
      status,
      candidateType,
    });
  }
}
