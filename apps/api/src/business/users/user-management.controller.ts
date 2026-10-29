
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

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { UserRole } from '../../entities/user.entity.js';

import {
  UserManagementService,
  type CreateSystemAdminInput,
  type UpdateSystemAdminInput,
  type ManagedStudentsQuery,
  type MultipleStudentsQuery,
} from './user-management.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UserManagementController {
  constructor(
    private readonly service: UserManagementService,
  ) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.service.list(search);
  }

  // Đặt route tĩnh trước các route có :id.
  @Get('students')
  studentsOfMultipleUsers(
    @Query() query: MultipleStudentsQuery,
  ) {
    return this.service.listStudentsOfUsers(query);
  }

  @Get(':id/students')
  studentsOfOneUser(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ManagedStudentsQuery,
  ) {
    return this.service.listStudentsOfUser(id, query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() body: CreateSystemAdminInput) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSystemAdminInput,
  ) {
    return this.service.update(id, body);
  }
}
