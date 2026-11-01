import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import {
  IndependentExamAssignmentService,
  type AssignmentQuery,
  type AssignIndependentStudentsInput,
} from './independent-exam-assignment.service.js';

@Controller('independent-exam-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.EXAM_SECRETARY)
export class IndependentExamAssignmentController {
  constructor(private readonly service: IndependentExamAssignmentService) {}

  @Get('secretaries')
  @Roles(UserRole.SUPER_ADMIN)
  secretaries(@CurrentUser() user: AuthUser) {
    return this.service.secretaries(user);
  }

  @Get('candidates')
  @Roles(UserRole.SUPER_ADMIN)
  candidates(@CurrentUser() user: AuthUser, @Query() query: AssignmentQuery) {
    return this.service.candidates(user, query);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AssignmentQuery) {
    return this.service.list(user, query);
  }

  @Post('assign')
  @Roles(UserRole.SUPER_ADMIN)
  assign(
    @CurrentUser() user: AuthUser,
    @Body() body: AssignIndependentStudentsInput,
  ) {
    return this.service.assign(user, body);
  }

  @Get(':id/history')
  @Roles(UserRole.SUPER_ADMIN)
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.history(user, id);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(user, id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(user, id);
  }
}
