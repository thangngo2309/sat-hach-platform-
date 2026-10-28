import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

import { StudentPhotoService } from './student-photo.service.js';
import { StudentAccessService } from './student-access.service.js';
import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

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

  applicationType?: string;
  requestedLicenseClass?: string;
  trainingLicenseClass?: string;
  examinationContent?: string;
  certificateIssuer?: string;
  identityIssuedDate?: string;
  note?: string;
  documents?: string | unknown[];
  existingLicenses?: string | unknown[];
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

type IntakeValues = {
  applicationType: string;
  requestedLicenseClass: string | null;
  trainingLicenseClass: string | null;
  examinationContent: string | null;
  certificateIssuer: string | null;
  identityIssuedDate: string | null;
  note: string | null;
  documents: string;
  existingLicenses: string;
};

@Injectable()
export class StudentManagementService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
    private readonly photoService: StudentPhotoService,
    private readonly access: StudentAccessService,
  ) {}

  private optional(
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

    const result = value.normalize('NFC').trim();

    if (result.length > maxLength) {
      throw new BadRequestException(
        `${label} không được vượt quá ${maxLength} ký tự.`,
      );
    }

    return result || null;
  }

  private required(value: unknown, label: string, maxLength: number): string {
    const result = this.optional(value, label, maxLength);

    if (!result) {
      throw new BadRequestException(`Vui lòng nhập ${label}.`);
    }

    return result;
  }

  private date(value: unknown, label: string): string | null {
    const result = this.optional(value, label, 10);

    if (!result) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
      throw new BadRequestException(`${label} phải có định dạng YYYY-MM-DD.`);
    }

    const parsed = new Date(`${result}T00:00:00.000Z`);

    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== result
    ) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }

    return result;
  }

  private jsonArray(value: unknown, label: string, maxItems: number): string {
    let parsed: unknown = value;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        throw new BadRequestException(`${label} không phải JSON hợp lệ.`);
      }
    }

    if (parsed === undefined || parsed === null) parsed = [];

    if (!Array.isArray(parsed) || parsed.length > maxItems) {
      throw new BadRequestException(
        `${label} phải là danh sách tối đa ${maxItems} mục.`,
      );
    }

    const json = JSON.stringify(parsed);

    if (json.length > 30000) {
      throw new BadRequestException(`${label} quá dài.`);
    }

    return json;
  }

  private normalizeStudent(
    input: StudentInput,
    registrationCode: string,
    requireIdentity: boolean,
  ): StudentValues {
    const gender = this.optional(input.gender, 'giới tính', 10);

    if (gender && !['1', '2', 'M', 'F', 'Nam', 'Nữ', 'Khác'].includes(gender)) {
      throw new BadRequestException('Giới tính không hợp lệ.');
    }

    const identityNumber = this.optional(input.identityNumber, 'CCCD/CMND', 50);

    const dateOfBirth = this.date(input.dateOfBirth, 'Ngày sinh');

    if (requireIdentity && (!identityNumber || !dateOfBirth)) {
      throw new BadRequestException(
        'Thí sinh tự do phải có CCCD và ngày sinh.',
      );
    }

    return {
      registrationCode,
      fullName: this.required(input.fullName, 'họ và tên', 255),
      familyName: this.optional(input.familyName, 'họ và tên đệm', 255),
      givenName: this.optional(input.givenName, 'tên', 100),
      dateOfBirth,
      gender,
      identityNumber,
      nationalityCode: this.optional(input.nationalityCode, 'mã quốc tịch', 20),
      nationalityName: this.optional(input.nationalityName, 'quốc tịch', 100),
      permanentAddress: this.optional(
        input.permanentAddress,
        'địa chỉ thường trú',
        5000,
      ),
      currentAddress: this.optional(
        input.currentAddress,
        'địa chỉ cư trú',
        5000,
      ),
    };
  }

  private normalizeIntake(input: StudentInput): IntakeValues {
    const applicationType =
      this.optional(input.applicationType, 'loại hồ sơ', 30) ?? 'new';

    if (!['new', 'upgrade', 'reissue'].includes(applicationType)) {
      throw new BadRequestException('Loại hồ sơ không hợp lệ.');
    }

    return {
      applicationType,
      requestedLicenseClass: this.optional(
        input.requestedLicenseClass,
        'hạng đề nghị sát hạch',
        30,
      ),
      trainingLicenseClass: this.optional(
        input.trainingLicenseClass,
        'hạng đào tạo',
        30,
      ),
      examinationContent: this.optional(
        input.examinationContent,
        'nội dung sát hạch',
        100,
      ),
      certificateIssuer: this.optional(
        input.certificateIssuer,
        'cơ quan cấp',
        255,
      ),
      identityIssuedDate: this.date(input.identityIssuedDate, 'Ngày cấp CCCD'),
      note: this.optional(input.note, 'ghi chú', 5000),
      documents: this.jsonArray(input.documents, 'Giấy tờ kèm theo', 30),
      existingLicenses: this.jsonArray(
        input.existingLicenses,
        'Giấy phép lái xe hiện có',
        20,
      ),
    };
  }

  private validatePhoto(photo?: Express.Multer.File): void {
    if (!photo) return;

    if (!photo.buffer?.length || photo.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Ảnh không hợp lệ hoặc vượt quá 5 MB.');
    }
  }

  private async find(manager: EntityManager, id: number) {
    const rows = await manager.query(
      `
        SELECT
          s.id,
          s.registration_code AS "registrationCode",
          s.full_name AS "fullName",
          s.family_name AS "familyName",
          s.given_name AS "givenName",
          s.date_of_birth::text AS "dateOfBirth",
          s.gender,
          s.identity_number AS "identityNumber",
          s.nationality_code AS "nationalityCode",
          s.nationality_name AS "nationalityName",
          s.permanent_address AS "permanentAddress",
          s.current_address AS "currentAddress",
          (s.photo_id IS NOT NULL) AS "hasPhoto",
          s.created_by_user_id AS "createdByUserId",
          s.updated_by_user_id AS "updatedByUserId",
          s.source_type AS "sourceType"
        FROM students s
        WHERE s.id = $1
      `,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy học viên.');
    }

    return rows[0];
  }

  private async saveIntake(
    manager: EntityManager,
    studentId: number,
    userId: number,
    values: IntakeValues,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO student_intakes (
          student_id,
          created_by_user_id,
          updated_by_user_id,
          intake_type,
          application_type,
          requested_license_class,
          training_license_class,
          examination_content,
          certificate_issuer,
          identity_issued_date,
          note,
          documents,
          existing_licenses
        )
        VALUES (
          $1, $2, $2, 'independent',
          $3, $4, $5, $6, $7, $8::date, $9,
          $10::jsonb, $11::jsonb
        )
        ON CONFLICT (
          student_id,
          created_by_user_id
        )
        DO UPDATE SET
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          application_type = EXCLUDED.application_type,
          requested_license_class = EXCLUDED.requested_license_class,
          training_license_class = EXCLUDED.training_license_class,
          examination_content = EXCLUDED.examination_content,
          certificate_issuer = EXCLUDED.certificate_issuer,
          identity_issued_date = EXCLUDED.identity_issued_date,
          note = EXCLUDED.note,
          documents = EXCLUDED.documents,
          existing_licenses = EXCLUDED.existing_licenses,
          updated_at = NOW()
      `,
      [
        studentId,
        userId,
        values.applicationType,
        values.requestedLicenseClass,
        values.trainingLicenseClass,
        values.examinationContent,
        values.certificateIssuer,
        values.identityIssuedDate,
        values.note,
        values.documents,
        values.existingLicenses,
      ],
    );
  }

  private async findExistingIdentity(
    manager: EntityManager,
    values: StudentValues,
  ): Promise<number | null> {
    if (!values.identityNumber || !values.dateOfBirth) {
      return null;
    }

    const rows: Array<{ id: number }> = await manager.query(
      `
        SELECT id
        FROM students
        WHERE identity_number = $1
          AND date_of_birth = $2::date
          AND UPPER(TRIM(full_name)) =
              UPPER(TRIM($3))
        ORDER BY id
        LIMIT 2
      `,
      [values.identityNumber, values.dateOfBirth, values.fullName],
    );

    if (rows.length > 1) {
      throw new ConflictException(
        'Có nhiều học viên trùng danh tính. Cần quản trị viên đối chiếu.',
      );
    }

    return rows[0]?.id ?? null;
  }

  async create(
    user: AuthUser,
    input: StudentInput,
    photo?: Express.Multer.File,
  ) {
    this.access.ensureStudentRole(user);
    this.validatePhoto(photo);

    const isIntake =
      user.role === UserRole.SYSTEM_ADMIN ||
      Boolean(input.applicationType || input.requestedLicenseClass);

    if (
      user.role === UserRole.SYSTEM_ADMIN &&
      !input.requestedLicenseClass?.trim()
    ) {
      throw new BadRequestException('Vui lòng chọn hạng đề nghị sát hạch.');
    }

    const code =
      this.optional(input.registrationCode, 'mã đăng ký', 150) ??
      (isIntake
        ? `TD-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
        : '');

    if (!code) {
      throw new BadRequestException('Vui lòng nhập mã đăng ký.');
    }

    const values = this.normalizeStudent(input, code, isIntake);

    const intake = this.normalizeIntake(input);

    return this.db.transaction(async (manager) => {
      const existingId = isIntake
        ? await this.findExistingIdentity(manager, values)
        : null;

      if (existingId !== null) {
        // Không ghi đè danh tính, ảnh hay người tạo từ XML.
        // Không cho nhân viên tự sửa hồ sơ gốc có sẵn.
        const previousIntake = await manager.query(
          `
            SELECT id
            FROM student_intakes
            WHERE student_id = $1
              AND created_by_user_id = $2
          `,
          [existingId, user.sub],
        );

        if (previousIntake.length) {
          throw new ConflictException(
            'Bạn đã tiếp nhận học viên này trước đó.',
          );
        }

        if (photo) {
          throw new ConflictException(
            'Học viên đã có dữ liệu. Không thể thay ảnh gốc khi liên kết hồ sơ.',
          );
        }

        await this.saveIntake(manager, existingId, user.sub, intake);

        return this.find(manager, existingId);
      }

      const inserted: Array<{ id: number }> = await manager.query(
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
              current_address,
              candidate_type,
              candidate_type_updated_at,
              created_by_user_id,
              updated_by_user_id,
              source_type
            )
            VALUES (
              $1, $2, $3, $4, $5::date, $6,
              $7, $8, $9, $10, $11,
              $12, NOW(), $13, $13, 'manual'
            )
            ON CONFLICT (registration_code)
            DO NOTHING
            RETURNING id
          `,
        [
          values.registrationCode,
          values.fullName,
          values.familyName,
          values.givenName,
          values.dateOfBirth,
          values.gender,
          values.identityNumber,
          values.nationalityCode,
          values.nationalityName,
          values.permanentAddress,
          values.currentAddress,
          isIntake ? 'independent' : 'unknown',
          user.sub,
        ],
      );

      if (!inserted.length) {
        throw new ConflictException('Mã đăng ký đã tồn tại.');
      }

      const id = Number(inserted[0].id);

      if (isIntake) {
        await this.saveIntake(manager, id, user.sub, intake);
      }

      if (photo) {
        await this.photoService.saveBase64(manager, {
          studentId: id,
          base64: photo.buffer.toString('base64'),
          sourceType: 'MANUAL',
        });
      }

      return this.find(manager, id);
    });
  }

  async update(
    user: AuthUser,
    id: number,
    input: StudentInput,
    photo?: Express.Multer.File,
  ) {
    this.access.ensureStudentRole(user);
    this.validatePhoto(photo);

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('ID học viên không hợp lệ.');
    }

    return this.db.transaction(async (manager) => {
      await manager.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [
        id,
      ]);

      await this.access.assertCanEdit(id, user, manager);

      const current = await this.find(manager, id);

      if (
        input.registrationCode !== undefined &&
        input.registrationCode.trim() !== current.registrationCode
      ) {
        throw new BadRequestException('Không được thay đổi mã đăng ký.');
      }

      const values = this.normalizeStudent(
        {
          ...current,
          ...input,
        },
        current.registrationCode,
        user.role === UserRole.SYSTEM_ADMIN,
      );

      const duplicates = await manager.query(
        `
          SELECT id
          FROM students
          WHERE identity_number = $1
            AND date_of_birth = $2::date
            AND UPPER(TRIM(full_name)) =
                UPPER(TRIM($3))
            AND id <> $4
          LIMIT 1
        `,
        [values.identityNumber, values.dateOfBirth, values.fullName, id],
      );

      if (duplicates.length) {
        throw new ConflictException(
          'Đã có học viên trùng CCCD, ngày sinh và họ tên.',
        );
      }

      await manager.query(
        `
          UPDATE students
          SET full_name = $2,
              family_name = $3,
              given_name = $4,
              date_of_birth = $5::date,
              gender = $6,
              identity_number = $7,
              nationality_code = $8,
              nationality_name = $9,
              permanent_address = $10,
              current_address = $11,
              updated_by_user_id = $12,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          id,
          values.fullName,
          values.familyName,
          values.givenName,
          values.dateOfBirth,
          values.gender,
          values.identityNumber,
          values.nationalityCode,
          values.nationalityName,
          values.permanentAddress,
          values.currentAddress,
          user.sub,
        ],
      );

      const containsIntakeFields = [
        'applicationType',
        'requestedLicenseClass',
        'trainingLicenseClass',
        'examinationContent',
        'certificateIssuer',
        'identityIssuedDate',
        'note',
        'documents',
        'existingLicenses',
      ].some((key) => Object.prototype.hasOwnProperty.call(input, key));

      if (containsIntakeFields) {
        const existing = await manager.query(
          `
            SELECT *
            FROM student_intakes
            WHERE student_id = $1
              AND created_by_user_id = $2
          `,
          [id, user.sub],
        );

        if (!existing.length) {
          throw new NotFoundException(
            'Không tìm thấy hồ sơ tiếp nhận của tài khoản.',
          );
        }

        const row = existing[0];

        const intake = this.normalizeIntake({
          applicationType: input.applicationType ?? row.application_type,
          requestedLicenseClass:
            input.requestedLicenseClass ?? row.requested_license_class ?? '',
          trainingLicenseClass:
            input.trainingLicenseClass ?? row.training_license_class ?? '',
          examinationContent:
            input.examinationContent ?? row.examination_content ?? '',
          certificateIssuer:
            input.certificateIssuer ?? row.certificate_issuer ?? '',
          identityIssuedDate:
            input.identityIssuedDate ?? row.identity_issued_date ?? '',
          note: input.note ?? row.note ?? '',
          documents: input.documents ?? row.documents,
          existingLicenses: input.existingLicenses ?? row.existing_licenses,
        });

        await this.saveIntake(manager, id, user.sub, intake);
      }

      if (photo) {
        await this.photoService.saveBase64(manager, {
          studentId: id,
          base64: photo.buffer.toString('base64'),
          sourceType: 'MANUAL',
        });
      }

      return this.find(manager, id);
    });
  }
}
