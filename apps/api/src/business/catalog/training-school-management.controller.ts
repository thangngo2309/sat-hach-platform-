import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DataSource } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { TrainingSchoolImportService } from './training-school-import.service.js';

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

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTrainingSchoolDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  provinceCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  provinceName?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

type SchoolRow = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  isActive: boolean;
  infoSource: string;
  createdAt: Date;
  updatedAt: Date;
};

const excelUploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
  },
};

function cleanRequired(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${name} không hợp lệ.`);
  }

  const cleaned = value.trim();

  if (!cleaned || cleaned.length > max) {
    throw new BadRequestException(`${name} phải có từ 1 đến ${max} ký tự.`);
  }

  return cleaned;
}

function cleanOptional(
  value: unknown,
  name: string,
  max: number,
): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length > max) {
    throw new BadRequestException(`${name} không hợp lệ.`);
  }

  return value.trim() || null;
}

@Controller('catalog/schools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class TrainingSchoolManagementController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly imports: TrainingSchoolImportService,
  ) {}

  private async getSchool(id: number): Promise<SchoolRow> {
    const rows: SchoolRow[] = await this.dataSource.query(
      `
        SELECT
          id, code, name, address,
          province_code AS "provinceCode",
          province_name AS "provinceName",
          is_active AS "isActive",
          info_source AS "infoSource",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM training_schools
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      throw new BadRequestException('Không tìm thấy cơ sở đào tạo.');
    }

    return rows[0];
  }

  @Get('manage')
  async listManage(
    @Query('search') search?: string,
    @Query('page') pageText?: string,
    @Query('limit') limitText?: string,
  ) {
    const page = Math.max(1, Math.trunc(Number(pageText)) || 1);
    const limit = Math.max(
      1,
      Math.min(100, Math.trunc(Number(limitText)) || 20),
    );
    const offset = (Math.min(page, 100000) - 1) * limit;
    const keyword = (search ?? '').trim().slice(0, 150);

    const where = `
      WHERE (
        $1::text = ''
        OR s.code ILIKE '%' || $1::text || '%'
        OR s.name ILIKE '%' || $1::text || '%'
        OR COALESCE(s.address, '') ILIKE '%' || $1::text || '%'
        OR COALESCE(s.province_name, '') ILIKE '%' || $1::text || '%'
      )
    `;

    const [countRows, rows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT COUNT(*)::int AS total
          FROM training_schools s
          ${where}
        `,
        [keyword],
      ),
      this.dataSource.query(
        `
          SELECT
            s.id, s.code, s.name, s.address,
            s.province_code AS "provinceCode",
            s.province_name AS "provinceName",
            s.is_active AS "isActive",
            s.info_source AS "infoSource",
            s.created_at AS "createdAt",
            s.updated_at AS "updatedAt",
            (
              SELECT COUNT(*)::int
              FROM courses c
              WHERE c.school_id = s.id
            ) AS "courseCount",
            (
              SELECT COUNT(*)::int
              FROM enrollments e
              JOIN courses c ON c.id = e.course_id
              WHERE c.school_id = s.id
            ) AS "enrollmentCount"
          FROM training_schools s
          ${where}
          ORDER BY s.code ASC, s.id ASC
          LIMIT $2 OFFSET $3
        `,
        [keyword, limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows,
      pagination: {
        page: Math.min(page, 100000),
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get('imports/history')
  @Roles(UserRole.SUPER_ADMIN)
  history() {
    return this.imports.history();
  }

  @Post('imports/preview')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  preview(@UploadedFile() file?: Express.Multer.File) {
    return this.imports.preview(file);
  }

  @Post('imports/confirm')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', excelUploadOptions))
  confirm(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('sha256') sha256: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.imports.confirm(file, user.sub, sha256);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.getSchool(id);
  }

  @Post()
  async create(
    @Body() dto: CreateTrainingSchoolDto,
    @CurrentUser() user: AuthUser,
  ) {
    const code = cleanRequired(dto.code, 'Mã CSĐT', 50);
    const name = cleanRequired(dto.name, 'Tên CSĐT', 255);

    const provinceCode = cleanOptional(dto.provinceCode, 'Mã tỉnh', 30);
    const provinceName = cleanOptional(dto.provinceName, 'Tên tỉnh', 255);
    const address = cleanOptional(dto.address, 'Địa điểm đào tạo', 10000);

    if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const rows: Array<{ id: number }> = await manager.query(
          `
            INSERT INTO training_schools (
              code, name, province_code, province_name,
              address, is_active, info_source,
              created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'manual', NOW(), NOW())
            RETURNING id
          `,
          [
            code,
            name,
            provinceCode,
            provinceName,
            address,
            dto.isActive ?? true,
          ],
        );

        const schoolId = Number(rows[0].id);

        await manager.query(
          `
            INSERT INTO training_school_change_logs (
              school_id, actor_user_id, action, new_data
            )
            VALUES ($1, $2, 'created', $3::jsonb)
          `,
          [
            schoolId,
            user.sub,
            JSON.stringify({
              code,
              name,
              provinceCode,
              provinceName,
              address,
              isActive: dto.isActive ?? true,
              infoSource: 'manual',
            }),
          ],
        );

        return schoolId;
      });

      return this.getSchool(id);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(`Mã CSĐT "${code}" đã tồn tại.`);
      }

      throw error;
    }
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingSchoolDto,
    @CurrentUser() user: AuthUser,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const originalRows: SchoolRow[] = await manager.query(
        `
          SELECT
            id, code, name, address,
            province_code AS "provinceCode",
            province_name AS "provinceName",
            is_active AS "isActive",
            info_source AS "infoSource",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM training_schools
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      if (!originalRows.length) {
        throw new BadRequestException('Không tìm thấy CSĐT.');
      }

      const original = originalRows[0];

      const next = {
        code:
          dto.code === undefined
            ? original.code
            : cleanRequired(dto.code, 'Mã CSĐT', 50),
        name:
          dto.name === undefined
            ? original.name
            : cleanRequired(dto.name, 'Tên CSĐT', 255),
        provinceCode:
          dto.provinceCode === undefined
            ? original.provinceCode
            : cleanOptional(dto.provinceCode, 'Mã tỉnh', 30),
        provinceName:
          dto.provinceName === undefined
            ? original.provinceName
            : cleanOptional(dto.provinceName, 'Tên tỉnh', 255),
        address:
          dto.address === undefined
            ? original.address
            : cleanOptional(dto.address, 'Địa điểm đào tạo', 10000),
        isActive: dto.isActive === undefined ? original.isActive : dto.isActive,
      };

      if (typeof next.isActive !== 'boolean') {
        throw new BadRequestException('Trạng thái không hợp lệ.');
      }

      const changed =
        original.code !== next.code ||
        original.name !== next.name ||
        original.provinceCode !== next.provinceCode ||
        original.provinceName !== next.provinceName ||
        original.address !== next.address ||
        original.isActive !== next.isActive ||
        original.infoSource !== 'manual';

      if (!changed) return id;

      try {
        await manager.query(
          `
            UPDATE training_schools
            SET code = $2,
                name = $3,
                province_code = $4,
                province_name = $5,
                address = $6,
                is_active = $7,
                info_source = 'manual',
                updated_at = NOW()
            WHERE id = $1
          `,
          [
            id,
            next.code,
            next.name,
            next.provinceCode,
            next.provinceName,
            next.address,
            next.isActive,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(`Mã CSĐT "${next.code}" đã tồn tại.`);
        }

        throw error;
      }

      await manager.query(
        `
          INSERT INTO training_school_change_logs (
            school_id, actor_user_id, action,
            old_data, new_data
          )
          VALUES ($1, $2, 'updated', $3::jsonb, $4::jsonb)
        `,
        [
          id,
          user.sub,
          JSON.stringify(original),
          JSON.stringify({ ...next, infoSource: 'manual' }),
        ],
      );

      return id;
    });

    return this.getSchool(updated);
  }
}
