import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';

import { DashboardService, type DashboardQuery } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(@Query() query: DashboardQuery) {
    return this.dashboardService.overview(query);
  }
}
