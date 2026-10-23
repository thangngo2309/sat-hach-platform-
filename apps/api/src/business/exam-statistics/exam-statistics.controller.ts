import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';

import {
  ExamStatisticsService,
  type ExamStatisticsQuery,
} from './exam-statistics.service.js';

@Controller('exam-statistics')
@UseGuards(JwtAuthGuard)
export class ExamStatisticsController {
  constructor(private readonly service: ExamStatisticsService) {}

  @Get('filters')
  filters(@Query() query: ExamStatisticsQuery) {
    return this.service.filters(query);
  }

  @Get('report')
  report(@Query() query: ExamStatisticsQuery) {
    return this.service.report(query);
  }

  @Get('students/:id')
  studentHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ExamStatisticsQuery,
  ) {
    return this.service.studentHistory(id, query);
  }
}
