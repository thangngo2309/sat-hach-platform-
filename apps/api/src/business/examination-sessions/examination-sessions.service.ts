import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';

export type CreateExaminationSessionInput = {
  examinationCenterId: number;
  examDate: string;
  examTime?: string | null;
  note?: string | null;
};

export type ExaminationSessionQuery = {
  page?: string;
  limit?: string;
  search?: string;
  examinationCenterId?: string;
  codeStatus?: 'all' | 'temporary' | 'official';
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class ExaminationSessionsService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private positiveInt(
    value: unknown,
    label: string,
    fallback?: number,
  ): number {
    if (
      (value === undefined || value === null || value === '') &&
      fallback !== undefined
    ) {
      return fallback;
    }

    const text = String(value ?? '');

    if (!/^[1-9]\d*$/.test(text)) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }

    const number = Number(text);

    if (!Number.isSafeInteger(number)) {
      throw new BadRequestException(`${label} vượt giới hạn.`);
    }

    return number;
  }

  private validDate(
    value: unknown,
    label: string,
    required = false,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`Vui lòng chọn ${label.toLowerCase()}.`);
      }

      return null;
    }

    const text = String(value);

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

    if (!match) {
      throw new BadRequestException(`${label} phải có định dạng YYYY-MM-DD.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }

    return text;
  }

  private validTime(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const text = String(value).trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
      throw new BadRequestException('Giờ sát hạch phải có định dạng HH:mm.');
    }

    return text;
  }

  private canManage(user: AuthUser): boolean {
    return user.role === UserRole.SUPER_ADMIN;
  }

  private canViewAll(user: AuthUser): boolean {
    return (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.PC08_STAFF
    );
  }

  private async getAssignedCenterId(user: AuthUser): Promise<number | null> {
    const rows: Array<{
      examinationCenterId: number | null;
    }> = await this.db.query(
      `
          SELECT
            examination_center_id AS "examinationCenterId"
          FROM user_organization_assignments
          WHERE user_id = $1
          LIMIT 1
        `,
      [user.sub],
    );

    return rows[0]?.examinationCenterId ?? null;
  }

  private async assertCanView(user: AuthUser, centerId: number): Promise<void> {
    if (this.canViewAll(user)) return;

    if (user.role === UserRole.TRAINING_SCHOOL) {
      // CSĐT chỉ được tra cứu danh mục kỳ cơ bản
      // để gắn BC2, không được xem chi tiết kỳ.
      throw new ForbiddenException(
        'Tài khoản không có quyền xem chi tiết kỳ sát hạch.',
      );
    }

    if (user.role === UserRole.EXAM_CENTER) {
      const assigned = await this.getAssignedCenterId(user);

      if (assigned === centerId) return;
    }

    throw new ForbiddenException('Không có quyền xem kỳ sát hạch này.');
  }

  /**
   * Tạo mã tạm có độ ngẫu nhiên cao.
   * Không phụ thuộc số lượng kỳ trong ngày.
   *
   * Không dùng mã XML khi chưa import file 48_.
   */
  private createTemporaryCode(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const suffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

    return `TEMP-${day}-${suffix}`;
  }

  /**
   * TẠO KỲ SÁT HẠCH
   *
   * Một kỳ gắn duy nhất một TTSH.
   * Các CSĐT sẽ liên kết qua hồ sơ/thí sinh.
   */
  async create(user: AuthUser, input: CreateExaminationSessionInput) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN được tạo kỳ sát hạch.');
    }

    const centerId = this.positiveInt(
      input?.examinationCenterId,
      'Trung tâm sát hạch',
    );

    const examDate = this.validDate(input?.examDate, 'Ngày sát hạch', true);

    const examTime = this.validTime(input?.examTime);
    const note =
      String(input?.note ?? '')
        .trim()
        .slice(0, 2000) || null;

    const centers: Array<{ id: number }> = await this.db.query(
      `
            SELECT id
            FROM examination_centers
            WHERE id = $1
              AND is_active = TRUE
            LIMIT 1
          `,
      [centerId],
    );

    if (!centers.length) {
      throw new BadRequestException(
        'Trung tâm sát hạch không tồn tại hoặc đã ngừng hoạt động.',
      );
    }

    const tempCode = this.createTemporaryCode();

    const rows: Array<{ id: number }> = await this.db.query(
      `
            INSERT INTO examination_sessions (
              code,
              temp_code,
              official_code,
              examination_center_id,
              exam_date,
              exam_time,
              note,
              created_by_user_id
            )
            VALUES (
              $1,
              $1,
              NULL,
              $2,
              $3::date,
              $4,
              $5,
              $6
            )
            RETURNING id
          `,
      [tempCode, centerId, examDate, examTime, note, user.sub],
    );

    return this.findOne(user, Number(rows[0].id));
  }

  /**
   * Danh sách kỳ sát hạch có phân trang.
   */
  async list(user: AuthUser, query: ExaminationSessionQuery) {
    const page = this.positiveInt(query.page, 'Trang', 1);

    const limit = Math.min(this.positiveInt(query.limit, 'Số dòng', 20), 100);

    const search = String(query.search ?? '')
      .trim()
      .slice(0, 150);

    const requestedCenterId = query.examinationCenterId
      ? this.positiveInt(query.examinationCenterId, 'Trung tâm sát hạch')
      : null;

    const codeStatus = query.codeStatus || 'all';

    if (!['all', 'temporary', 'official'].includes(codeStatus)) {
      throw new BadRequestException('Trạng thái mã kỳ không hợp lệ.');
    }

    const dateFrom = this.validDate(query.dateFrom, 'Từ ngày');

    const dateTo = this.validDate(query.dateTo, 'Đến ngày');

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('Từ ngày không được lớn hơn đến ngày.');
    }

    let centerId = requestedCenterId;

    if (!this.canViewAll(user)) {
      if (user.role !== UserRole.EXAM_CENTER) {
        throw new ForbiddenException(
          'Không có quyền xem danh sách kỳ sát hạch.',
        );
      }

      const assigned = await this.getAssignedCenterId(user);

      if (!assigned) {
        throw new ForbiddenException(
          'Tài khoản chưa được gắn trung tâm sát hạch.',
        );
      }

      if (centerId && centerId !== assigned) {
        throw new ForbiddenException('Không được xem kỳ của trung tâm khác.');
      }

      centerId = assigned;
    }

    const params: unknown[] = [search, centerId, codeStatus, dateFrom, dateTo];

    const where = `
        WHERE (
          $1::text = ''
          OR es.code ILIKE '%' || $1::text || '%'
          OR COALESCE(es.temp_code, '')
            ILIKE '%' || $1::text || '%'
          OR ec.code ILIKE '%' || $1::text || '%'
          OR COALESCE(ec.name, '')
            ILIKE '%' || $1::text || '%'
        )
  
        AND (
          $2::int IS NULL
          OR es.examination_center_id = $2::int
        )
  
        AND (
          $3::text = 'all'
          OR (
            $3::text = 'temporary'
            AND es.official_code IS NULL
          )
          OR (
            $3::text = 'official'
            AND es.official_code IS NOT NULL
          )
        )
  
        AND (
          $4::date IS NULL
          OR es.exam_date >= $4::date
        )
  
        AND (
          $5::date IS NULL
          OR es.exam_date <= $5::date
        )
      `;

    const from = `
        FROM examination_sessions es
        JOIN examination_centers ec
          ON ec.id = es.examination_center_id
      `;

    const [counts, data] = await Promise.all([
      this.db.query(
        `
            SELECT COUNT(*)::int AS total
            ${from}
            ${where}
          `,
        params,
      ),

      this.db.query(
        `
            SELECT
              es.id,
              es.code,
              es.temp_code AS "tempCode",
              es.official_code AS "officialCode",
              CASE
                WHEN es.official_code IS NULL
                  THEN 'temporary'
                ELSE 'official'
              END AS "codeStatus",
              es.examination_center_id
                AS "examinationCenterId",
              ec.code AS "centerCode",
              ec.name AS "centerName",
              es.exam_date::text AS "examDate",
              es.exam_time AS "examTime",
              es.decision_number AS "decisionNumber",
              es.decision_date::text AS "decisionDate",
              es.note,
              es.created_at AS "createdAt",
              es.updated_at AS "updatedAt",
  
              (
                SELECT COUNT(*)::int
                FROM examination_candidates c
                WHERE c.examination_session_id = es.id
              ) AS "candidateCount",
  
              (
                SELECT COUNT(DISTINCT c.training_school_id)::int
                FROM examination_candidates c
                WHERE c.examination_session_id = es.id
                  AND c.training_school_id IS NOT NULL
              ) AS "schoolCount",
  
              (
                SELECT COUNT(*)::int
                FROM file_submissions fs
                WHERE fs.examination_session_id = es.id
              ) AS "fileCount"
  
            ${from}
            ${where}
  
            ORDER BY
              es.exam_date DESC NULLS LAST,
              es.id DESC
  
            LIMIT $6 OFFSET $7
          `,
        [...params, limit, (page - 1) * limit],
      ),
    ]);

    const total = Number(counts[0]?.total ?? 0);

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

  /**
   * Chi tiết kỳ sát hạch:
   * - Thông tin chung
   * - Nhiều cơ sở đào tạo
   * - Các file liên kết
   */
  async findOne(user: AuthUser, id: number) {
    const sessionId = this.positiveInt(id, 'ID kỳ sát hạch');

    const rows = await this.db.query(
      `
          SELECT
            es.id,
            es.code,
            es.temp_code AS "tempCode",
            es.official_code AS "officialCode",
            CASE
              WHEN es.official_code IS NULL
                THEN 'temporary'
              ELSE 'official'
            END AS "codeStatus",
            es.examination_center_id
              AS "examinationCenterId",
            ec.code AS "centerCode",
            ec.name AS "centerName",
            es.exam_date::text AS "examDate",
            es.exam_time AS "examTime",
            es.decision_number AS "decisionNumber",
            es.decision_date::text AS "decisionDate",
            es.note,
            es.created_by_user_id AS "createdByUserId",
            es.created_at AS "createdAt",
            es.updated_at AS "updatedAt"
  
          FROM examination_sessions es
          JOIN examination_centers ec
            ON ec.id = es.examination_center_id
  
          WHERE es.id = $1
          LIMIT 1
        `,
      [sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
    }

    const session = rows[0];

    await this.assertCanView(user, Number(session.examinationCenterId));

    const [schools, files, counts] = await Promise.all([
      this.db.query(
        `
            SELECT
              ts.id,
              ts.code,
              ts.name,
              COUNT(ec.id)::int AS "candidateCount"
  
            FROM examination_candidates ec
  
            JOIN training_schools ts
              ON ts.id = ec.training_school_id
  
            WHERE ec.examination_session_id = $1
  
            GROUP BY ts.id, ts.code, ts.name
            ORDER BY ts.name ASC, ts.id ASC
          `,
        [sessionId],
      ),

      this.db.query(
        `
            SELECT
              fs.id,
              fs.file_type AS "fileType",
              fs.status,
              fs.import_status AS "importStatus",
              fs.training_school_id AS "trainingSchoolId",
              ts.name AS "schoolName",
              fs.created_at AS "createdAt",
              v.original_name AS "originalName"
  
            FROM file_submissions fs
  
            LEFT JOIN training_schools ts
              ON ts.id = fs.training_school_id
  
            JOIN file_submission_versions v
              ON v.submission_id = fs.id
             AND v.version = fs.current_version
  
            WHERE fs.examination_session_id = $1
  
            ORDER BY fs.created_at DESC, fs.id DESC
          `,
        [sessionId],
      ),

      this.db.query(
        `
            SELECT
              COUNT(*)::int AS "candidateCount",
              COUNT(*) FILTER (
                WHERE result_import_id IS NOT NULL
              )::int AS "withResults"
            FROM examination_candidates
            WHERE examination_session_id = $1
          `,
        [sessionId],
      ),
    ]);

    return {
      ...session,
      schools,
      files,
      summary: counts[0] ?? {
        candidateCount: 0,
        withResults: 0,
      },
    };
  }
}
