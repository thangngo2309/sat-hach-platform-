import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { UserRole } from '../../entities/user.entity.js';

import {
  CreateExaminationCenterDto,
  UpdateExaminationCenterDto,
} from './dto/examination-center.dto.js';

import { ExaminationCenterService } from './examination-center.service.js';

@Controller('examination-centers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExaminationCenterController {
  constructor(private readonly service: ExaminationCenterService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.findAll({
      page,
      limit,
      search,
      isActive,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateExaminationCenterDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExaminationCenterDto,
  ) {
    return this.service.update(id, dto);
  }
}
