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
  OrganizationAccountService,
  type CreateOrganizationAccountInput,
  type UpdateOrganizationAccountInput,
} from './organization-account.service.js';

@Controller('organization-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class OrganizationAccountController {
  constructor(private readonly service: OrganizationAccountService) {}

  @Get('options')
  options() {
    return this.service.options();
  }

  @Get()
  list(@Query('search') search?: string) {
    return this.service.list(search);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() input: CreateOrganizationAccountInput) {
    return this.service.create(input);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() input: UpdateOrganizationAccountInput,
  ) {
    return this.service.update(id, input);
  }
}
