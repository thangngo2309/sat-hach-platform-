import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';

import { Bc2ViewService, type Bc2ViewQuery } from './bc2-view.service.js';

@Controller('bc2-view')
@UseGuards(JwtAuthGuard)
export class Bc2ViewController {
  constructor(private readonly service: Bc2ViewService) {}

  @Get('students')
  students(@Query() query: Bc2ViewQuery) {
    return this.service.students(query);
  }

  @Get('students/:id')
  studentDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.studentDetail(id);
  }

  @Get('courses')
  courses(@Query() query: Bc2ViewQuery) {
    return this.service.courseSummary(query);
  }
}
