import {
  BadRequestException,
  Body,
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

  /**
   * Xem trước file 48_.
   *
   * Chỉ đọc và phân tích XML,
   * chưa ghi dữ liệu vào database.
   */
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file);
  }

  /**
   * Xác nhận import file 48_.
   *
   * Bắt buộc chọn kỳ sát hạch đã tạo.
   * Không tự tạo kỳ mới từ file XML.
   */
  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Body('examinationSessionId') rawSessionId?: string,
  ) {
    if (!rawSessionId || !/^[1-9]\d*$/.test(rawSessionId)) {
      throw new BadRequestException(
        'Vui lòng chọn kỳ sát hạch trước khi import file 48_.',
      );
    }

    const examinationSessionId = Number(rawSessionId);

    if (!Number.isSafeInteger(examinationSessionId)) {
      throw new BadRequestException('ID kỳ sát hạch không hợp lệ.');
    }

    return this.service.confirm(file, user.sub, examinationSessionId);
  }

  /**
   * Lịch sử import file 48_.
   */
  @Get('history')
  history(@Query('limit') limit?: string) {
    return this.service.history(limit ? Number(limit) : 50);
  }
}
