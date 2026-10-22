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
import { UserRole } from '../../entities/user.entity.js';

import {
  StudentManagementService,
  type StudentInput,
} from './student-management.service.js';

const photoUpload = FileInterceptor('photo', {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 10 * 1024,
  },
});

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class StudentManagementController {
  constructor(private readonly service: StudentManagementService) {}

  @Post()
  @UseInterceptors(photoUpload)
  create(
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.create(body, photo);
  }

  @Patch(':id')
  @UseInterceptors(photoUpload)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: StudentInput,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.service.update(id, body, photo);
  }
}
