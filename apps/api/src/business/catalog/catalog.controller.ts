import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('schools')
  schools(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.catalogService.schools({
      page,
      limit,
      search,
    });
  }

  @Get('courses')
  courses(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.catalogService.courses({
      page,
      limit,
      search,
      schoolId,
    });
  }

  @Get('students')
  students(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('schoolId') schoolId?: string,
    @Query('courseId') courseId?: string,
  ) {
    return this.catalogService.students({
      page,
      limit,
      search,
      schoolId,
      courseId,
    });
  }
}
