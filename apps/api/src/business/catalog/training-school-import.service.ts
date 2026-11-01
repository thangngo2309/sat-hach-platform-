import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type ExcelSchool = {
  rowNumber: number;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

type CurrentSchool = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  infoSource: string;
};

type PreviewRow = ExcelSchool & {
  action: 'create' | 'update' | 'unchanged';
  current: CurrentSchool | null;
};

const MAX_EXCEL_SIZE = 10 * 1024 * 1024;
const MAX_RECORDS = 5000;

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value.trim();

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      return String(value.result ?? '').trim();
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }

    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
  }

  return cell.text?.trim() ?? '';
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseStatus(raw: string, row: number): boolean {
  const value = normalizeHeader(raw);

  const activeStatuses = new Set([
    'hieuluc',
    'danghieuluc',
    'conhieuluc',
    'cohieuluc',
    'hoatdong',
    'danghoatdong',
    'active',
    'true',
    '1',
  ]);

  const inactiveStatuses = new Set([
    'hethieuluc',
    'khongconhieuluc',
    'mat hieuluc'.replace(/\s/g, ''),
    'ngunghoatdong',
    'khonghoatdong',
    'tamngung',
    'dung hoat dong'.replace(/\s/g, ''),
    'inactive',
    'false',
    '0',
  ]);

  if (activeStatuses.has(value)) {
    return true;
  }

  if (inactiveStatuses.has(value)) {
    return false;
  }

  throw new BadRequestException(
    `Dòng ${row}: Trạng thái "${raw}" không được nhận diện. ` +
      'Các giá trị hợp lệ: Hiệu lực, Hết hiệu lực, ' +
      'Đang hoạt động, Ngừng hoạt động.',
  );
}

function normalizedText(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function schoolChanged(current: CurrentSchool, incoming: ExcelSchool): boolean {
  return (
    normalizedText(current.name) !== normalizedText(incoming.name) ||
    normalizedText(current.address) !== normalizedText(incoming.address) ||
    current.isActive !== incoming.isActive
  );
}

@Injectable()
export class TrainingSchoolImportService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private validateFile(file?: Express.Multer.File): Buffer {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel.');
    }

    if (!/\.(xlsx|xlsm)$/i.test(file.originalname)) {
      throw new BadRequestException('Chỉ hỗ trợ Excel .xlsx hoặc .xlsm.');
    }

    if (file.buffer.length > MAX_EXCEL_SIZE) {
      throw new BadRequestException('File danh mục không được vượt quá 10 MB.');
    }

    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('File không đúng định dạng Excel XLSX.');
    }

    return file.buffer;
  }

  private async parse(file?: Express.Multer.File): Promise<{
    rows: ExcelSchool[];
    hash: string;
    fileName: string;
  }> {
    const buffer = this.validateFile(file);

    const workbook = new ExcelJS.Workbook();

    // Đọc Excel qua file tạm để tránh xung đột
    // giữa các định nghĩa Buffer của Node.js và ExcelJS.
    const tempDir = await mkdtemp(join(tmpdir(), 'sat-hach-school-import-'));

    const tempFilePath = join(tempDir, `${randomUUID()}.xlsx`);

    try {
      await writeFile(tempFilePath, buffer);

      await workbook.xlsx.readFile(tempFilePath);
    } catch {
      throw new BadRequestException(
        'Không thể đọc file Excel. Vui lòng kiểm tra định dạng.',
      );
    } finally {
      // Dọn file và thư mục tạm kể cả khi đọc Excel lỗi.
      await rm(tempDir, {
        recursive: true,
        force: true,
      });
    }

    const acceptedCodes = ['macsdt', 'macosodaotao', 'matruong'];
    const acceptedNames = ['tencsdt', 'tencosodaotao', 'tentruong'];
    const acceptedAddresses = ['diadiemdaotao', 'diachidaotao', 'diachi'];
    const acceptedStatuses = ['trangthai', 'tinhtrang'];

    let rows: ExcelSchool[] | null = null;

    for (const sheet of workbook.worksheets) {
      let headerRow = 0;
      let codeColumn = 0;
      let nameColumn = 0;
      let addressColumn = 0;
      let statusColumn = 0;

      const scanLimit = Math.min(sheet.rowCount, 30);

      for (let index = 1; index <= scanLimit; index++) {
        const line = sheet.getRow(index);
        const columns = new Map<string, number>();

        line.eachCell({ includeEmpty: false }, (cell, number) => {
          columns.set(normalizeHeader(cellText(cell)), number);
        });

        const lookup = (variants: string[]) =>
          variants
            .map((key) => columns.get(key) ?? 0)
            .find((value) => value > 0) ?? 0;

        const c = lookup(acceptedCodes);
        const n = lookup(acceptedNames);
        const a = lookup(acceptedAddresses);
        const s = lookup(acceptedStatuses);

        if (c && n && a && s) {
          headerRow = index;
          codeColumn = c;
          nameColumn = n;
          addressColumn = a;
          statusColumn = s;
          break;
        }
      }

      if (!headerRow) continue;

      const collected: ExcelSchool[] = [];
      const codes = new Set<string>();

      for (
        let rowNumber = headerRow + 1;
        rowNumber <= sheet.rowCount;
        rowNumber++
      ) {
        const line = sheet.getRow(rowNumber);

        const code = cellText(line.getCell(codeColumn)).trim();
        const name = cellText(line.getCell(nameColumn)).trim();
        const address = cellText(line.getCell(addressColumn)).trim();
        const rawStatus = cellText(line.getCell(statusColumn)).trim();

        if (!code && !name && !address && !rawStatus) {
          continue;
        }

        if (!code || !name || !rawStatus) {
          throw new BadRequestException(
            `Dòng ${rowNumber}: Thiếu mã, tên hoặc trạng thái CSĐT.`,
          );
        }

        if (code.length > 50 || name.length > 255) {
          throw new BadRequestException(
            `Dòng ${rowNumber}: Mã hoặc tên CSĐT quá dài.`,
          );
        }

        if (!/^[A-Za-z0-9._-]+$/.test(code)) {
          throw new BadRequestException(
            `Dòng ${rowNumber}: Mã CSĐT không hợp lệ.`,
          );
        }

        if (codes.has(code.toUpperCase())) {
          throw new BadRequestException(
            `Mã CSĐT "${code}" bị lặp trong file Excel.`,
          );
        }

        codes.add(code.toUpperCase());

        collected.push({
          rowNumber,
          code,
          name,
          address: address || null,
          isActive: parseStatus(rawStatus, rowNumber),
        });

        if (collected.length > MAX_RECORDS) {
          throw new BadRequestException(
            `Chỉ hỗ trợ tối đa ${MAX_RECORDS} CSĐT mỗi file.`,
          );
        }
      }

      rows = collected;
      break;
    }

    if (!rows) {
      throw new BadRequestException(
        'Không tìm thấy các cột Mã CSDT, Tên CSDT, ' +
          'Địa điểm đào tạo và Trạng thái.',
      );
    }

    if (!rows.length) {
      throw new BadRequestException('File Excel không có dữ liệu CSĐT.');
    }

    return {
      rows,
      hash: createHash('sha256').update(buffer).digest('hex'),
      fileName: file!.originalname.slice(0, 255),
    };
  }

  private async currentSchools(
    codes: string[],
    executor: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    } = this.db,
  ): Promise<Map<string, CurrentSchool>> {
    const result = (await executor.query(
      `
          SELECT
            id, code, name, address,
            is_active AS "isActive",
            info_source AS "infoSource"
          FROM training_schools
          WHERE UPPER(code) = ANY($1::text[])
        `,
      [codes.map((code) => code.toUpperCase())],
    )) as CurrentSchool[];

    return new Map(result.map((school) => [school.code.toUpperCase(), school]));
  }

  private compare(
    incoming: ExcelSchool[],
    existing: Map<string, CurrentSchool>,
  ): PreviewRow[] {
    return incoming.map((item) => {
      const current = existing.get(item.code.toUpperCase()) ?? null;

      return {
        ...item,
        current,
        action: !current
          ? 'create'
          : schoolChanged(current, item)
            ? 'update'
            : 'unchanged',
      };
    });
  }

  async preview(file?: Express.Multer.File) {
    const parsed = await this.parse(file);

    const existing = await this.currentSchools(
      parsed.rows.map((item) => item.code),
    );

    const preview = this.compare(parsed.rows, existing);

    return {
      fileName: parsed.fileName,
      sha256: parsed.hash,
      totalRows: preview.length,
      createCount: preview.filter((item) => item.action === 'create').length,
      updateCount: preview.filter((item) => item.action === 'update').length,
      unchangedCount: preview.filter((item) => item.action === 'unchanged')
        .length,
      rows: preview,
    };
  }

  async confirm(
    file: Express.Multer.File | undefined,
    userId: number,
    expectedSha256?: string,
  ) {
    const parsed = await this.parse(file);

    if (
      !expectedSha256 ||
      parsed.hash !== expectedSha256.trim().toLowerCase()
    ) {
      throw new ConflictException(
        'File xác nhận không khớp file đã xem trước. ' +
          'Vui lòng xem trước lại trước khi import.',
      );
    }

    return this.db.transaction(async (manager) => {
      // Serialize những lượt import danh mục chạy đồng thời.
      await manager.query(`SELECT pg_advisory_xact_lock(1793555, 1)`);

      const existing = await this.currentSchools(
        parsed.rows.map((item) => item.code),
        manager,
      );

      const compared = this.compare(parsed.rows, existing);

      const insertedImport: Array<{ id: string }> = await manager.query(
        `
            INSERT INTO training_school_imports (
              file_name, file_sha256, total_rows, imported_by
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id::text AS id
          `,
        [parsed.fileName, parsed.hash, parsed.rows.length, userId],
      );

      const importId = insertedImport[0].id;
      let created = 0;
      let updated = 0;
      let unchanged = 0;

      for (const row of compared) {
        if (row.action === 'unchanged') {
          unchanged++;
          continue;
        }

        let schoolId: number;
        const oldData = row.current;

        if (row.action === 'create') {
          const inserted: Array<{ id: number }> = await manager.query(
            `
                INSERT INTO training_schools (
                  code, name, address, is_active,
                  info_source, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, 'excel', NOW(), NOW())
                RETURNING id
              `,
            [row.code, row.name, row.address, row.isActive],
          );

          schoolId = Number(inserted[0].id);
          created++;
        } else {
          schoolId = row.current!.id;

          await manager.query(
            `
                UPDATE training_schools
                SET name = $2,
                    address = $3,
                    is_active = $4,
                    info_source = 'excel',
                    updated_at = NOW()
                WHERE id = $1
              `,
            [schoolId, row.name, row.address, row.isActive],
          );

          updated++;
        }

        await manager.query(
          `
              INSERT INTO training_school_change_logs (
                school_id, actor_user_id, action,
                old_data, new_data, import_id
              )
              VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
            `,
          [
            schoolId,
            userId,
            'imported',
            oldData ? JSON.stringify(oldData) : null,
            JSON.stringify({
              code: row.code,
              name: row.name,
              address: row.address,
              isActive: row.isActive,
              infoSource: 'excel',
            }),
            importId,
          ],
        );
      }

      await manager.query(
        `
            UPDATE training_school_imports
            SET created_count = $2,
                updated_count = $3,
                unchanged_count = $4
            WHERE id = $1
          `,
        [importId, created, updated, unchanged],
      );

      return {
        id: importId,
        fileName: parsed.fileName,
        totalRows: parsed.rows.length,
        createdCount: created,
        updatedCount: updated,
        unchangedCount: unchanged,
      };
    });
  }

  async history() {
    return this.db.query(
      `
          SELECT
            i.id::text AS id,
            i.file_name AS "fileName",
            i.total_rows AS "totalRows",
            i.created_count AS "createdCount",
            i.updated_count AS "updatedCount",
            i.unchanged_count AS "unchangedCount",
            i.created_at AS "createdAt",
            u.full_name AS "importedBy"
          FROM training_school_imports i
          LEFT JOIN users u ON u.id = i.imported_by
          ORDER BY i.id DESC
          LIMIT 50
        `,
    );
  }
}
