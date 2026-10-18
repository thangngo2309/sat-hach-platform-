import {
  Body,
  ConflictException,
  Controller,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';

export class CreateTrainingSchoolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  provinceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  provinceName?: string;
}

@Controller('catalog/schools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainingSchoolManagementController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async create(@Body() dto: CreateTrainingSchoolDto) {
    const code = dto.code.trim();
    const name = dto.name.trim();

    const provinceCode = dto.provinceCode?.trim() || null;
    const provinceName = dto.provinceName?.trim() || null;

    if (!code || !name) {
      throw new ConflictException(
        'Mã và tên cơ sở đào tạo không được để trống.',
      );
    }

    try {
      const rows: Array<{
        id: number;
        code: string;
        name: string;
        provinceCode: string | null;
        provinceName: string | null;
        createdAt: Date;
      }> = await this.dataSource.query(
        `
            INSERT INTO training_schools (
              code,
              name,
              province_code,
              province_name,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, NOW(), NOW()
            )
            RETURNING
              id,
              code,
              name,
              province_code AS "provinceCode",
              province_name AS "provinceName",
              created_at AS "createdAt"
          `,
        [code, name, provinceCode, provinceName],
      );

      return rows[0];
    } catch (error) {
      const dbError = error as {
        code?: string;
        constraint?: string;
      };

      if (dbError.code === '23505') {
        throw new ConflictException(`Mã cơ sở đào tạo "${code}" đã tồn tại.`);
      }

      throw new InternalServerErrorException('Không thể tạo cơ sở đào tạo.');
    }
  }
}
