import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { StudentPhotoService } from './student-photo.service.js';

@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentPhotoController {
  constructor(private readonly photoService: StudentPhotoService) {}

  @Get(':id/photo')
  async getPhoto(
    @Param('id', ParseIntPipe) studentId: number,
    @Res() response: Response,
  ) {
    const photo = await this.photoService.getStudentPhoto(studentId);

    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Content-Length', photo.content.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.status(200).end(photo.content);
  }
}
