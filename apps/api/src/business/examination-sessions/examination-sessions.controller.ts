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

import { UserRole } from '../../entities/user.entity.js';

import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

import type { AuthUser } from '../../shared/types/auth-user.type.js';

import {
  ExaminationSessionsService,
  type CreateExaminationSessionInput,
  type ExaminationSessionQuery,
} from './examination-sessions.service.js';

@Controller('examination-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PC08_STAFF,
  UserRole.EXAM_CENTER,
)
export class ExaminationSessionsController {
  constructor(private readonly service: ExaminationSessionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ExaminationSessionQuery) {
    return this.service.list(user, query);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body() input: CreateExaminationSessionInput,
  ) {
    return this.service.create(user, input);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(user, id);
  }
}
