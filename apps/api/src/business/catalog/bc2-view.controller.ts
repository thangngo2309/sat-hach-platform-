
import {
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

import {
  Bc2ViewService,
  type Bc2ViewQuery,
} from './bc2-view.service.js';

@Controller('bc2-view')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SYSTEM_ADMIN,
)
export class Bc2ViewController {
  constructor(
    private readonly service: Bc2ViewService,
  ) {}

  @Get('students')
  students(
    @CurrentUser() user: AuthUser,
    @Query() query: Bc2ViewQuery,
  ) {
    return this.service.students(query, user);
  }

  @Get('students/:id')
  studentDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.studentDetail(id, user);
  }

  @Get('courses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  courses(@Query() query: Bc2ViewQuery) {
    return this.service.courseSummary(query);
  }
}
