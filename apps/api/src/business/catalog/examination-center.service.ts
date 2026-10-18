import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import {
  ExaminationCenter,
  ExaminationCenterNameSource,
} from '../../entities/examination-center.entity.js';

import {
  CreateExaminationCenterDto,
  UpdateExaminationCenterDto,
} from './dto/examination-center.dto.js';

type ListParams = {
  page?: string;
  limit?: string;
  search?: string;
  isActive?: string;
};

@Injectable()
export class ExaminationCenterService {
  constructor(
    @InjectRepository(ExaminationCenter)
    private readonly repository: Repository<ExaminationCenter>,
  ) {}

  private normalizeText(value: string): string {
    return value.trim();
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private normalizePage(value: string | undefined, fallback: number) {
    const numberValue = Number(value);

    return Number.isSafeInteger(numberValue) && numberValue > 0
      ? numberValue
      : fallback;
  }

  private async ensureCodeAvailable(
    code: string,
    excludedId?: number,
  ): Promise<void> {
    const existing = await this.repository.findOneBy({ code });

    if (existing && existing.id !== excludedId) {
      throw new ConflictException(
        `Mã trung tâm sát hạch "${code}" đã tồn tại.`,
      );
    }
  }

  private handleSaveError(error: unknown): never {
    const dbError = error as { code?: string };

    if (dbError.code === '23505') {
      throw new ConflictException('Mã trung tâm sát hạch đã tồn tại.');
    }

    throw error;
  }

  async findAll(params: ListParams) {
    const page = Math.min(this.normalizePage(params.page, 1), 1_000_000);
    const limit = Math.min(this.normalizePage(params.limit, 20), 100);
    const search = (params.search ?? '').trim().slice(0, 150);

    if (
      params.isActive !== undefined &&
      !['true', 'false', ''].includes(params.isActive)
    ) {
      throw new BadRequestException('isActive phải là true hoặc false.');
    }

    const qb = this.repository.createQueryBuilder('center');

    if (search) {
      qb.andWhere(
        '(center.code ILIKE :search OR center.name ILIKE :search OR center.address ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (params.isActive === 'true') {
      qb.andWhere('center.isActive = :active', { active: true });
    } else if (params.isActive === 'false') {
      qb.andWhere('center.isActive = :active', { active: false });
    }

    const [data, total] = await qb
      .orderBy('center.createdAt', 'DESC')
      .addOrderBy('center.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<ExaminationCenter> {
    const center = await this.repository.findOneBy({ id });

    if (!center) {
      throw new NotFoundException('Không tìm thấy trung tâm sát hạch.');
    }

    return center;
  }

  async create(dto: CreateExaminationCenterDto): Promise<ExaminationCenter> {
    const code = this.normalizeText(dto.code);
    const name = this.normalizeText(dto.name);

    if (!code || !name) {
      throw new BadRequestException(
        'Mã và tên trung tâm sát hạch không được để trống.',
      );
    }

    await this.ensureCodeAvailable(code);

    const center = this.repository.create({
      code,
      name,
      address: this.normalizeNullable(dto.address),
      phone: this.normalizeNullable(dto.phone),
      note: this.normalizeNullable(dto.note),
      nameSource: ExaminationCenterNameSource.MANUAL,
      isActive: dto.isActive ?? true,
      lastSeenAt: null,
    });

    try {
      return await this.repository.save(center);
    } catch (error) {
      return this.handleSaveError(error);
    }
  }

  async update(
    id: number,
    dto: UpdateExaminationCenterDto,
  ): Promise<ExaminationCenter> {
    const center = await this.findOne(id);

    if (dto.code !== undefined) {
      const code = this.normalizeText(dto.code);

      if (!code) {
        throw new BadRequestException('Mã trung tâm không được để trống.');
      }

      await this.ensureCodeAvailable(code, id);
      center.code = code;
    }

    if (dto.name !== undefined) {
      const name = this.normalizeText(dto.name);

      if (!name) {
        throw new BadRequestException('Tên trung tâm không được để trống.');
      }

      center.name = name;
      center.nameSource = ExaminationCenterNameSource.MANUAL;
    }

    if (dto.address !== undefined) {
      center.address = this.normalizeNullable(dto.address);
    }

    if (dto.phone !== undefined) {
      center.phone = this.normalizeNullable(dto.phone);
    }

    if (dto.note !== undefined) {
      center.note = this.normalizeNullable(dto.note);
    }

    if (dto.isActive !== undefined) {
      center.isActive = dto.isActive;
    }

    try {
      return await this.repository.save(center);
    } catch (error) {
      return this.handleSaveError(error);
    }
  }
}
