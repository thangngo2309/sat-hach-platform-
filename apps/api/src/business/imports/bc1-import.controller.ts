import {
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

import { Bc1ImportService } from './bc1-import.service.js';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 1,
  },
};

@Controller('imports/bc1')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class Bc1ImportController {
  constructor(private readonly importService: Bc1ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(file);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.importService.confirm(file, user.sub);
  }

  @Get('history')
  history(@Query('limit') limit?: string) {
    return this.importService.history(limit ? Number(limit) : 50);
  }
}
