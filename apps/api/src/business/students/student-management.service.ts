import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { StudentPhotoService } from './student-photo.service.js';

export type StudentInput = {
  registrationCode?: string;
  fullName?: string;
  familyName?: string;
  givenName?: string;
  dateOfBirth?: string;
  gender?: string;
  identityNumber?: string;
  nationalityCode?: string;
  nationalityName?: string;
  permanentAddress?: string;
  currentAddress?: string;
};

type StudentValues = {
  registrationCode: string;
  fullName: string;
  familyName: string | null;
  givenName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  identityNumber: string | null;
  nationalityCode: string | null;
  nationalityName: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
};

type StudentRow = StudentValues & {
  id: number;
  hasPhoto: boolean;
};

@Injectable()
export class StudentManagementService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly photoService: StudentPhotoService,
  ) {}

  private optionalString(
    value: unknown,
    label: string,
    maxLength: number,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }

    const normalized = value.normalize('NFC').trim();

    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `${label} không được vượt quá ${maxLength} ký tự.`,
      );
    }

    return normalized || null;
  }

  private requiredString(
    value: unknown,
    label: string,
    maxLength: number,
  ): string {
    const normalized = this.optionalString(value, label, maxLength);

    if (!normalized) {
      throw new BadRequestException(`Vui lòng nhập ${label}.`);
    }

    return normalized;
  }

  private validateDate(value: unknown): string | null {
    const normalized = this.optionalString(value, 'Ngày sinh', 10);

    if (!normalized) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('Ngày sinh phải có định dạng YYYY-MM-DD.');
    }

    const parsed = new Date(`${normalized}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException('Ngày sinh không hợp lệ.');
    }

    if (parsed.getTime() > Date.now()) {
      throw new BadRequestException(
        'Ngày sinh không được lớn hơn ngày hiện tại.',
      );
    }

    return normalized;
  }

  private normalize(input: StudentInput): StudentValues {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Thông tin học viên không hợp lệ.');
    }

    const gender = this.optionalString(input.gender, 'Giới tính', 10);

    if (gender && !['1', '2', 'M', 'F', 'Nam', 'Nữ', 'Khác'].includes(gender)) {
      throw new BadRequestException('Giới tính không hợp lệ.');
    }

    return {
      registrationCode: this.requiredString(
        input.registrationCode,
        'mã đăng ký',
        150,
      ),
      fullName: this.requiredString(input.fullName, 'họ và tên', 255),
      familyName: this.optionalString(input.familyName, 'Họ và tên đệm', 255),
      givenName: this.optionalString(input.givenName, 'Tên', 100),
      dateOfBirth: this.validateDate(input.dateOfBirth),
      gender,
      identityNumber: this.optionalString(
        input.identityNumber,
        'CCCD/CMND',
        50,
      ),
      nationalityCode: this.optionalString(
        input.nationalityCode,
        'Mã quốc tịch',
        20,
      ),
      nationalityName: this.optionalString(
        input.nationalityName,
        'Quốc tịch',
        100,
      ),
      permanentAddress: this.optionalString(
        input.permanentAddress,
        'Địa chỉ thường trú',
        5000,
      ),
      currentAddress: this.optionalString(
        input.currentAddress,
        'Địa chỉ cư trú',
        5000,
      ),
    };
  }

  private validatePhoto(file?: Express.Multer.File) {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Ảnh không được vượt quá 5 MB.');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('File ảnh rỗng.');
    }

    // Kiểm tra nội dung thực tế tiếp tục được thực hiện
    // trong StudentPhotoService, không chỉ dựa vào MIME.
  }

  private async checkDuplicates(
    manager: EntityManager,
    data: StudentValues,
    excludingId?: number,
  ) {
    const registrationMatches: Array<{ id: number }> = await manager.query(
      `
            SELECT id
            FROM students
            WHERE registration_code = $1
              AND ($2::int IS NULL OR id <> $2::int)
            LIMIT 1
          `,
      [data.registrationCode, excludingId ?? null],
    );

    if (registrationMatches.length) {
      throw new ConflictException(
        `Mã đăng ký ${data.registrationCode} đã tồn tại.`,
      );
    }

    // Không coi CCCD là duy nhất tuyệt đối vì dữ liệu XML
    // có thể có bản ghi trùng người cần đối chiếu.
    // Tuy nhiên, ngăn tạo hồ sơ trùng cùng CCCD,
    // ngày sinh và họ tên khi đã đủ thông tin.
    if (data.identityNumber && data.dateOfBirth) {
      const matches: Array<{ id: number }> = await manager.query(
        `
            SELECT id
            FROM students
            WHERE identity_number = $1
              AND date_of_birth = $2::date
              AND UPPER(TRIM(full_name)) = UPPER(TRIM($3))
              AND ($4::int IS NULL OR id <> $4::int)
            LIMIT 1
          `,
        [
          data.identityNumber,
          data.dateOfBirth,
          data.fullName,
          excludingId ?? null,
        ],
      );

      if (matches.length) {
        throw new ConflictException(
          'Đã có học viên trùng CCCD, ngày sinh và họ tên.',
        );
      }
    }
  }

  private async find(manager: EntityManager, id: number): Promise<StudentRow> {
    const rows: StudentRow[] = await manager.query(
      `
          SELECT
            id,
            registration_code AS "registrationCode",
            full_name AS "fullName",
            family_name AS "familyName",
            given_name AS "givenName",
            date_of_birth::text AS "dateOfBirth",
            gender,
            identity_number AS "identityNumber",
            nationality_code AS "nationalityCode",
            nationality_name AS "nationalityName",
            permanent_address AS "permanentAddress",
            current_address AS "currentAddress",
            (photo_id IS NOT NULL) AS "hasPhoto"
          FROM students
          WHERE id = $1
        `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy học viên.');
    }

    return rows[0];
  }

  async create(input: StudentInput, file?: Express.Multer.File) {
    const data = this.normalize(input);
    this.validatePhoto(file);

    return this.db.transaction(async (manager) => {
      await this.checkDuplicates(manager, data);

      const rows: Array<{ id: number }> = await manager.query(
        `
            INSERT INTO students (
              registration_code,
              full_name,
              family_name,
              given_name,
              date_of_birth,
              gender,
              identity_number,
              nationality_code,
              nationality_name,
              permanent_address,
              current_address
            )
            VALUES (
              $1, $2, $3, $4, $5::date, $6,
              $7, $8, $9, $10, $11
            )
            ON CONFLICT (registration_code) DO NOTHING
            RETURNING id
          `,
        [
          data.registrationCode,
          data.fullName,
          data.familyName,
          data.givenName,
          data.dateOfBirth,
          data.gender,
          data.identityNumber,
          data.nationalityCode,
          data.nationalityName,
          data.permanentAddress,
          data.currentAddress,
        ],
      );

      if (!rows.length) {
        throw new ConflictException('Mã đăng ký đã tồn tại.');
      }

      const id = Number(rows[0].id);

      if (file) {
        await this.photoService.saveBase64(manager, {
          studentId: id,
          base64: file.buffer.toString('base64'),
          sourceType: 'MANUAL',
        });
      }

      return this.find(manager, id);
    });
  }

  async update(id: number, input: StudentInput, file?: Express.Multer.File) {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('ID học viên không hợp lệ.');
    }

    this.validatePhoto(file);

    return this.db.transaction(async (manager) => {
      // Khóa hồ sơ trong lúc cập nhật, tránh hai người sửa
      // cùng một học viên tại cùng thời điểm.
      const existing: Array<{ id: number }> = await manager.query(
        'SELECT id FROM students WHERE id = $1 FOR UPDATE',
        [id],
      );

      if (!existing.length) {
        throw new NotFoundException('Không tìm thấy học viên.');
      }

      const current = await this.find(manager, id);

      if (
        input.registrationCode !== undefined &&
        input.registrationCode.trim() !== current.registrationCode
      ) {
        throw new BadRequestException(
          'Không được thay đổi mã đăng ký của học viên đã tồn tại.',
        );
      }

      // Khi sửa, field không được gửi sẽ giữ giá trị cũ.
      // Field gửi chuỗi rỗng sẽ được xóa nếu không bắt buộc.
      const data = this.normalize({
        registrationCode: input.registrationCode ?? current.registrationCode,
        fullName: input.fullName ?? current.fullName,
        familyName: input.familyName ?? current.familyName ?? '',
        givenName: input.givenName ?? current.givenName ?? '',
        dateOfBirth: input.dateOfBirth ?? current.dateOfBirth ?? '',
        gender: input.gender ?? current.gender ?? '',
        identityNumber: input.identityNumber ?? current.identityNumber ?? '',
        nationalityCode: input.nationalityCode ?? current.nationalityCode ?? '',
        nationalityName: input.nationalityName ?? current.nationalityName ?? '',
        permanentAddress:
          input.permanentAddress ?? current.permanentAddress ?? '',
        currentAddress: input.currentAddress ?? current.currentAddress ?? '',
      });

      await this.checkDuplicates(manager, data, id);

      try {
        await manager.query(
          `
              UPDATE students
              SET
                registration_code = $2,
                full_name = $3,
                family_name = $4,
                given_name = $5,
                date_of_birth = $6::date,
                gender = $7,
                identity_number = $8,
                nationality_code = $9,
                nationality_name = $10,
                permanent_address = $11,
                current_address = $12,
                updated_at = NOW()
              WHERE id = $1
            `,
          [
            id,
            data.registrationCode,
            data.fullName,
            data.familyName,
            data.givenName,
            data.dateOfBirth,
            data.gender,
            data.identityNumber,
            data.nationalityCode,
            data.nationalityName,
            data.permanentAddress,
            data.currentAddress,
          ],
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          throw new ConflictException('Mã đăng ký đã tồn tại.');
        }

        throw error;
      }

      // Không upload ảnh mới thì giữ nguyên ảnh cũ.
      if (file) {
        await this.photoService.saveBase64(manager, {
          studentId: id,
          base64: file.buffer.toString('base64'),
          sourceType: 'MANUAL',
        });
      }

      return this.find(manager, id);
    });
  }
}
