import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';

import {
  CsdtReportsService,
  type CsdtReportQuery,
} from './csdt-reports.service.js';

@Controller('csdt-reports')
@UseGuards(JwtAuthGuard)
export class CsdtReportsController {
  constructor(private readonly service: CsdtReportsService) {}

  @Get('filters')
  filters(@Query() query: CsdtReportQuery) {
    return this.service.filters(query);
  }

  @Get('report')
  report(@Query() query: CsdtReportQuery) {
    return this.service.report(query);
  }
}
