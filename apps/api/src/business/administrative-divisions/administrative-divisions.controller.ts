import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';

import { UserRole } from '../../entities/user.entity.js';

import {
  AdministrativeDivisionsService,
  type AdministrativeImportInput,
} from './administrative-divisions.service.js';

@Controller('administrative-divisions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
export class AdministrativeDivisionsController {
  constructor(private readonly service: AdministrativeDivisionsService) {}

  @Get('provinces')
  provinces(@Query('search') search?: string) {
    return this.service.provinces(search);
  }

  @Get('provinces/:code/wards')
  wards(@Param('code') code: string, @Query('search') search?: string) {
    return this.service.wards(code, search);
  }

  @Get('wards/:code')
  wardDetail(@Param('code') code: string) {
    return this.service.wardDetail(code);
  }

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Post('import')
  @Roles(UserRole.SUPER_ADMIN)
  importData(@Body() body: AdministrativeImportInput) {
    return this.service.importData(body);
  }
}
