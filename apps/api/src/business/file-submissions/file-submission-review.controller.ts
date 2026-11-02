import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { FileSubmissionReviewService } from './file-submission-review.service.js';

function parseVersion(value?: string): number | undefined {
  if (!value) return undefined;

  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException('Phiên bản file không hợp lệ.');
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new BadRequestException('Phiên bản file không hợp lệ.');
  }

  return number;
}

@Controller('file-review')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.TRAINING_SCHOOL,
  UserRole.PC08_STAFF,
  UserRole.EXAM_CENTER,
)
export class FileSubmissionReviewController {
  constructor(private readonly service: FileSubmissionReviewService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('fileType') fileType?: string,
    @Query('status') status?: string,
    @Query('trainingSchoolId') trainingSchoolId?: string,
    @Query('examinationCenterId') examinationCenterId?: string,
  ) {
    return this.service.list(user, {
      page,
      limit,
      search,
      fileType,
      status,
      trainingSchoolId,
      examinationCenterId,
    });
  }

  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.service.organizationOptions(user);
  }

  @Get(':id/overview')
  overview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('version') version?: string,
  ) {
    return this.service.overview(user, id, parseVersion(version));
  }

  @Get(':id/candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('version') version?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('matchStatus') matchStatus?: string,
  ) {
    return this.service.candidates(user, id, {
      version: parseVersion(version),
      page,
      limit,
      search,
      matchStatus,
    });
  }

  @Get(':id/related-files')
  relatedFiles(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('registrationCode') registrationCode?: string,
  ) {
    if (!registrationCode) {
      throw new BadRequestException('Vui lòng cung cấp mã đăng ký.');
    }

    return this.service.relatedFiles(user, id, registrationCode);
  }
}
