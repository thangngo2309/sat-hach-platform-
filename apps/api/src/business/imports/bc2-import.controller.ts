import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { UserRole } from '../../entities/user.entity.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

import { Bc2ImportService } from './bc2-import.service.js';

const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 1,
  },
};

@Controller('imports/bc2')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class Bc2ImportController {
  constructor(private readonly service: Bc2ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.service.preview(file);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirm(file, user.sub);
  }

  @Get('history')
  history() {
    return this.service.history();
  }

  @Get(':id/candidates')
  candidates(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.candidates(
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
