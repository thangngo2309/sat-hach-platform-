import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type ProvinceType = 'province' | 'city';
type WardType = 'ward' | 'commune' | 'special_zone';

type ProvinceInput = {
  code: string;
  name: string;
  type: ProvinceType;
};

type WardInput = {
  code: string;
  provinceCode: string;
  name: string;
  type: WardType;
};

export type AdministrativeImportInput = {
  provinces: ProvinceInput[];
  wards: WardInput[];
};

function normalizeCode(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]{1,30}$/.test(value.trim())
  ) {
    throw new BadRequestException('Mã đơn vị hành chính không hợp lệ.');
  }

  return value.trim();
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Tên đơn vị hành chính không hợp lệ.');
  }

  const name = value.normalize('NFC').trim();

  if (!name || name.length > 255) {
    throw new BadRequestException(
      'Tên đơn vị hành chính phải có từ 1 đến 255 ký tự.',
    );
  }

  return name;
}

@Injectable()
export class AdministrativeDivisionsService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  async provinces(search = '') {
    const keyword = search.trim().slice(0, 150);

    return this.db.query(
      `
          SELECT
            code,
            name,
            type
          FROM administrative_provinces
          WHERE is_active = TRUE
            AND (
              $1::text = ''
              OR code ILIKE '%' || $1::text || '%'
              OR name ILIKE '%' || $1::text || '%'
            )
          ORDER BY name ASC, code ASC
        `,
      [keyword],
    );
  }

  async wards(provinceCode: string, search = '') {
    const code = normalizeCode(provinceCode);
    const keyword = search.trim().slice(0, 150);

    const province = await this.db.query(
      `
          SELECT code
          FROM administrative_provinces
          WHERE code = $1
            AND is_active = TRUE
        `,
      [code],
    );

    if (!province.length) {
      throw new NotFoundException('Không tìm thấy tỉnh, thành phố.');
    }

    return this.db.query(
      `
          SELECT
            code,
            province_code AS "provinceCode",
            name,
            type
          FROM administrative_wards
          WHERE province_code = $1
            AND is_active = TRUE
            AND (
              $2::text = ''
              OR code ILIKE '%' || $2::text || '%'
              OR name ILIKE '%' || $2::text || '%'
            )
          ORDER BY name ASC, code ASC
        `,
      [code, keyword],
    );
  }

  async wardDetail(wardCode: string) {
    const rows = await this.db.query(
      `
          SELECT
            w.code,
            w.name,
            w.type,
            w.province_code AS "provinceCode",
            p.name AS "provinceName",
            p.type AS "provinceType"
          FROM administrative_wards w
          JOIN administrative_provinces p
            ON p.code = w.province_code
          WHERE w.code = $1
            AND w.is_active = TRUE
            AND p.is_active = TRUE
        `,
      [normalizeCode(wardCode)],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy xã, phường.');
    }

    return rows[0];
  }

  async summary() {
    const rows = await this.db.query(`
        SELECT
          (SELECT COUNT(*)::int
           FROM administrative_provinces
           WHERE is_active = TRUE) AS "activeProvinces",
  
          (SELECT COUNT(*)::int
           FROM administrative_wards
           WHERE is_active = TRUE) AS "activeWards",
  
          (SELECT COUNT(*)::int
           FROM administrative_provinces) AS "totalProvinces",
  
          (SELECT COUNT(*)::int
           FROM administrative_wards) AS "totalWards"
      `);

    return rows[0];
  }

  async importData(input: AdministrativeImportInput) {
    if (
      !input ||
      !Array.isArray(input.provinces) ||
      !Array.isArray(input.wards)
    ) {
      throw new BadRequestException('Dữ liệu phải có provinces và wards.');
    }

    if (
      input.provinces.length < 1 ||
      input.provinces.length > 100 ||
      input.wards.length > 10000
    ) {
      throw new BadRequestException(
        'Số lượng đơn vị hành chính vượt giới hạn.',
      );
    }

    const provinces = input.provinces.map((item) => {
      const type = item?.type;

      if (type !== 'province' && type !== 'city') {
        throw new BadRequestException('Loại tỉnh, thành phố không hợp lệ.');
      }

      return {
        code: normalizeCode(item.code),
        name: normalizeName(item.name),
        type,
      };
    });

    const wards = input.wards.map((item) => {
      const type = item?.type;

      if (type !== 'ward' && type !== 'commune' && type !== 'special_zone') {
        throw new BadRequestException('Loại xã, phường không hợp lệ.');
      }

      return {
        code: normalizeCode(item.code),
        provinceCode: normalizeCode(item.provinceCode),
        name: normalizeName(item.name),
        type,
      };
    });

    const provinceCodes = new Set(provinces.map((item) => item.code));

    const wardCodes = new Set(wards.map((item) => item.code));

    if (provinceCodes.size !== provinces.length) {
      throw new BadRequestException(
        'Danh sách có mã tỉnh, thành phố trùng nhau.',
      );
    }

    if (wardCodes.size !== wards.length) {
      throw new BadRequestException('Danh sách có mã xã, phường trùng nhau.');
    }

    for (const ward of wards) {
      if (!provinceCodes.has(ward.provinceCode)) {
        throw new BadRequestException(
          `Xã, phường ${ward.code} tham chiếu tỉnh không có trong dữ liệu import.`,
        );
      }
    }

    return this.db.transaction(async (manager) => {
      // Khóa các lần import chạy đồng thời.
      await manager.query(
        'SELECT pg_advisory_xact_lock($1::int, $2::int)',
        [2026, 1102],
      );

      // Chỉ thêm/cập nhật những đơn vị trong danh sách,
      // không tự xóa hay vô hiệu hóa đơn vị không xuất hiện.
      for (const province of provinces) {
        await manager.query(
          `
              INSERT INTO administrative_provinces (
                code, name, type
              )
              VALUES ($1, $2, $3)
              ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                is_active = TRUE,
                updated_at = NOW()
            `,
          [province.code, province.name, province.type],
        );
      }

      for (const ward of wards) {
        await manager.query(
          `
              INSERT INTO administrative_wards (
                code, province_code, name, type
              )
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (code) DO UPDATE SET
                province_code = EXCLUDED.province_code,
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                is_active = TRUE,
                updated_at = NOW()
            `,
          [ward.code, ward.provinceCode, ward.name, ward.type],
        );
      }

      return {
        success: true,
        processedProvinces: provinces.length,
        processedWards: wards.length,
      };
    });
  }
}
