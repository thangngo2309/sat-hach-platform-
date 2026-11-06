import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

import { Exam48ApprovalOptionsService } from './exam48-approval-options.service.js';

@Controller('exam48-approval')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class Exam48ApprovalOptionsController {
  constructor(private readonly service: Exam48ApprovalOptionsService) {}

  /**
   * Xem thông tin file 48_ và danh sách
   * BC1, BC2 có thể liên kết.
   *
   * Chưa tạo kỳ hoặc import XML.
   */
  @Get(':submissionId/options')
  options(
    @CurrentUser() user: AuthUser,
    @Param('submissionId', ParseIntPipe)
    submissionId: number,
  ) {
    return this.service.options(user, submissionId);
  }
}
