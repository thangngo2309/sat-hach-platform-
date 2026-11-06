import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

import {
  ExaminationSessionSecretariesService,
  type AssignSessionSecretaryInput,
  type UpdateSessionTrackingInput,
} from './examination-session-secretaries.service.js';

@Controller('examination-session-secretaries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.PC08_STAFF, UserRole.EXAM_SECRETARY)
export class ExaminationSessionSecretariesController {
  constructor(private readonly service: ExaminationSessionSecretariesService) {}

  @Get('secretaries')
  @Roles(UserRole.PC08_STAFF)
  secretaries(@CurrentUser() user: AuthUser) {
    return this.service.secretaries(user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.service.list(user, search);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(user, id);
  }

  @Post(':id/assign')
  @Roles(UserRole.PC08_STAFF)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: AssignSessionSecretaryInput,
  ) {
    return this.service.assign(user, id, input);
  }

  @Post(':id/unassign')
  @Roles(UserRole.PC08_STAFF)
  unassign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.unassign(user, id);
  }

  @Post(':id/complete')
  @Roles(UserRole.PC08_STAFF)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.complete(user, id);
  }

  @Patch(':id/tracking-code')
  @Roles(UserRole.EXAM_SECRETARY)
  updateTracking(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: UpdateSessionTrackingInput,
  ) {
    return this.service.updateTracking(user, id, input);
  }
}
