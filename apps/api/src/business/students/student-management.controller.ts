
import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import {
  StudentManagementService,
  type StudentInput,
} from './student-management.service.js';

const photoUpload = FileInterceptor('photo', {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 40,
    fieldSize: 50 * 1024,
  },
});

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SYSTEM_ADMIN,
)
export class StudentManagementController {
  constructor(
    private readonly service: StudentManagementService,
  ) {}

  @Post()
  @UseInterceptors(photoUpload)
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.create(user, body, photo);
  }

  @Patch(':id')
  @UseInterceptors(photoUpload)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.update(user, id, body, photo);
  }
}
