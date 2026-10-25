import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type CsdtReportQuery = {
  period?: 'month' | 'quarter' | 'year' | 'custom';
  year?: string;
  month?: string;
  quarter?: string;
  fromDate?: string;
  toDate?: string;
  schoolId?: string;
  sessionId?: string;
  vehicle?: 'all' | 'motorcycle' | 'car';
};

@Injectable()
export class CsdtReportsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private int(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (raw === undefined || raw === '') return fallback;

    if (!/^\d+$/.test(raw)) {
      throw new BadRequestException('Tham số số nguyên không hợp lệ');
    }

    const n = Number(raw);

    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new BadRequestException('Giá trị nằm ngoài phạm vi cho phép');
    }

    return n;
  }

  private validDate(s: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

    const d = new Date(`${s}T00:00:00.000Z`);

    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  private parse(q: CsdtReportQuery) {
    const year = this.int(q.year, new Date().getFullYear(), 2000, 2100);

    const month = this.int(q.month, 1, 1, 12);
    const quarter = this.int(q.quarter, 1, 1, 4);
    const period = q.period ?? 'month';

    if (!['month', 'quarter', 'year', 'custom'].includes(period)) {
      throw new BadRequestException('Loại thời gian không hợp lệ');
    }

    let fromDate: string;
    let toDate: string;

    if (period === 'custom') {
      fromDate = q.fromDate ?? '';
      toDate = q.toDate ?? '';
    } else {
      const begin =
        period === 'year'
          ? 1
          : period === 'quarter'
            ? (quarter - 1) * 3 + 1
            : month;

      const end =
        period === 'year' ? 12 : period === 'quarter' ? begin + 2 : month;

      fromDate = `${year}-${String(begin).padStart(2, '0')}-01`;

      // Ngày cuối tháng chính xác, kể cả tháng 12 và năm nhuận.
      toDate = new Date(Date.UTC(year, end, 0)).toISOString().slice(0, 10);
    }

    if (
      !this.validDate(fromDate) ||
      !this.validDate(toDate) ||
      fromDate > toDate
    ) {
      throw new BadRequestException('Khoảng ngày báo cáo không hợp lệ');
    }

    const vehicle = q.vehicle ?? 'all';

    if (!['all', 'motorcycle', 'car'].includes(vehicle)) {
      throw new BadRequestException('Loại phương tiện không hợp lệ');
    }

    return {
      period,
      year,
      month,
      quarter,
      fromDate,
      toDate,
      schoolId: q.schoolId ? this.int(q.schoolId, 0, 1, 2147483647) : null,
      sessionId: q.sessionId ? this.int(q.sessionId, 0, 1, 2147483647) : null,
      vehicle,
    };
  }

  async filters(query: CsdtReportQuery) {
    const f = this.parse(query);

    const [schools, sessions] = await Promise.all([
      this.db.query(
        `
          SELECT
            s.id,
            s.code,
            s.name
          FROM training_schools s
          WHERE EXISTS (
            SELECT 1
            FROM examination_candidates ec
            JOIN examination_sessions es
              ON es.id = ec.examination_session_id
            WHERE ec.training_school_id = s.id
              AND es.exam_date >= $1::date
              AND es.exam_date < ($2::date + INTERVAL '1 day')
          )
          ORDER BY s.name, s.code
        `,
        [f.fromDate, f.toDate],
      ),

      this.db.query(
        `
          SELECT
            es.id,
            es.code,
            es.exam_date AS "examDate",
            c.name AS "centerName",
            c.code AS "centerCode"
          FROM examination_sessions es
          LEFT JOIN examination_centers c
            ON c.id = es.examination_center_id
          WHERE es.exam_date >= $1::date
            AND es.exam_date < ($2::date + INTERVAL '1 day')
            AND (
              $3::int IS NULL
              OR EXISTS (
                SELECT 1
                FROM examination_candidates ec
                WHERE ec.examination_session_id = es.id
                  AND ec.training_school_id = $3::int
              )
            )
          ORDER BY es.exam_date DESC, es.id DESC
        `,
        [f.fromDate, f.toDate, f.schoolId],
      ),
    ]);

    return {
      filters: f,
      schools,
      sessions,
    };
  }

  private readonly cte = `
    WITH history AS (
      SELECT
        ec.id,
        ec.student_id,
        UPPER(TRIM(COALESCE(ec.license_class, ''))) AS class_code,

        ROW_NUMBER() OVER (
          PARTITION BY
            ec.student_id,
            UPPER(TRIM(COALESCE(ec.license_class, '')))
          ORDER BY es.exam_date, es.id, ec.id
        ) AS attempt_no

      FROM examination_candidates ec
      JOIN examination_sessions es
        ON es.id = ec.examination_session_id
    ),

    scoped AS (
      SELECT
        ec.id AS candidate_id,
        ec.student_id,
        ec.examination_session_id AS session_id,
        ec.training_school_id AS school_id,
        ec.license_class,
        ec.result_status,
        ec.result_import_id,
        ec.candidate_type,
        es.exam_date,
        h.attempt_no,

        CASE
          WHEN UPPER(TRIM(COALESCE(ec.license_class, '')))
            ~ '^(A|A1|A2|A3|A4)$'
          THEN 'motorcycle'
          ELSE 'car'
        END AS vehicle,

        EXISTS (
          SELECT 1
          FROM examination_candidate_results r
          WHERE r.examination_candidate_id = ec.id
            AND r.result_status = 'VA'
        ) AS absent_part

      FROM examination_candidates ec
      JOIN examination_sessions es
        ON es.id = ec.examination_session_id
      JOIN history h
        ON h.id = ec.id

      WHERE es.exam_date >= $1::date
        AND es.exam_date < ($2::date + INTERVAL '1 day')
        AND (
          $3::int IS NULL
          OR ec.training_school_id = $3::int
        )
        AND (
          $4::int IS NULL
          OR es.id = $4::int
        )
    ),

    base AS (
      SELECT
        *,
        (
          COALESCE(result_status, '') = 'VA'
          OR absent_part
        ) AS absent,

        (result_import_id IS NOT NULL) AS has_result,

        CASE
          WHEN attempt_no = 1 THEN 'first'
          ELSE 'retake'
        END AS exam_mode

      FROM scoped
      WHERE (
        $5::text = 'all'
        OR vehicle = $5::text
      )
    ),

    school_modes AS (
      SELECT
        school_id,
        exam_mode,

        COUNT(*)::int AS scheduled,

        COUNT(DISTINCT session_id)::int AS sessions,

        COUNT(*) FILTER (
          WHERE vehicle = 'motorcycle'
        )::int AS motorcycle,

        COUNT(*) FILTER (
          WHERE vehicle = 'car'
        )::int AS car,

        COUNT(*) FILTER (
          WHERE absent
        )::int AS absent,

        COUNT(*) FILTER (
          WHERE vehicle = 'motorcycle'
            AND absent
        )::int AS absent_motorcycle,

        COUNT(*) FILTER (
          WHERE vehicle = 'car'
            AND absent
        )::int AS absent_car,

        COUNT(*) FILTER (
          WHERE NOT absent
        )::int AS attended,

        COUNT(*) FILTER (
          WHERE result_status = 'DA'
        )::int AS passed,

        COUNT(*) FILTER (
          WHERE vehicle = 'motorcycle'
            AND result_status = 'DA'
        )::int AS passed_motorcycle,

        COUNT(*) FILTER (
          WHERE vehicle = 'car'
            AND result_status = 'DA'
        )::int AS passed_car,

        COUNT(*) FILTER (
          WHERE result_status = 'RO'
        )::int AS failed,

        COUNT(*) FILTER (
          WHERE NOT has_result
        )::int AS pending

      FROM base
      GROUP BY school_id, exam_mode
    ),

    part_modes AS (
      SELECT
        b.school_id,
        b.exam_mode,
        b.vehicle,
        UPPER(TRIM(r.exam_type)) AS exam_type,

        COUNT(*) FILTER (
          WHERE r.result_status = 'DA'
        )::int AS passed,

        COUNT(*) FILTER (
          WHERE r.result_status = 'RO'
        )::int AS failed,

        COUNT(*) FILTER (
          WHERE r.result_status = 'VA'
        )::int AS absent,

        COUNT(*)::int AS total

      FROM base b
      JOIN examination_candidate_results r
        ON r.examination_candidate_id = b.candidate_id

      GROUP BY
        b.school_id,
        b.exam_mode,
        b.vehicle,
        UPPER(TRIM(r.exam_type))
    )
  `;

  async report(query: CsdtReportQuery) {
    const filters = this.parse(query);

    const params = [
      filters.fromDate,
      filters.toDate,
      filters.schoolId,
      filters.sessionId,
      filters.vehicle,
    ];

    const [schoolRows, partRows, totalRows, typeRows, distinctRows] =
      await Promise.all([
        this.db.query(
          `
          ${this.cte}

          SELECT
            sm.*,
            ts.code AS "schoolCode",
            ts.name AS "schoolName"

          FROM school_modes sm
          LEFT JOIN training_schools ts
            ON ts.id = sm.school_id

          ORDER BY
            ts.name NULLS LAST,
            sm.school_id,
            sm.exam_mode
        `,
          params,
        ),

        this.db.query(
          `
          ${this.cte}

          SELECT
            pm.*,
            ts.name AS "schoolName"

          FROM part_modes pm
          LEFT JOIN training_schools ts
            ON ts.id = pm.school_id

          ORDER BY
            ts.name NULLS LAST,
            pm.school_id,
            pm.exam_mode,
            pm.vehicle,
            pm.exam_type
        `,
          params,
        ),

        this.db.query(
          `
          ${this.cte}

          SELECT
            COUNT(*)::int AS scheduled,

            COUNT(DISTINCT session_id)::int AS sessions,

            COUNT(*) FILTER (
              WHERE absent
            )::int AS absent,

            COUNT(*) FILTER (
              WHERE NOT absent
            )::int AS attended,

            COUNT(*) FILTER (
              WHERE result_status = 'DA'
            )::int AS passed,

            COUNT(*) FILTER (
              WHERE result_status = 'RO'
            )::int AS failed,

            COUNT(*) FILTER (
              WHERE NOT has_result
            )::int AS pending,

            COUNT(*) FILTER (
              WHERE exam_mode = 'retake'
            )::int AS retake,

            COUNT(DISTINCT student_id)::int AS "uniqueStudents",

            COUNT(DISTINCT session_id) FILTER (
              WHERE vehicle = 'motorcycle'
            )::int AS "motorcycleSessions",

            COUNT(DISTINCT session_id) FILTER (
              WHERE vehicle = 'car'
            )::int AS "carSessions"

          FROM base
        `,
          params,
        ),

        this.db.query(
          `
          ${this.cte}

          SELECT
            vehicle,
            COUNT(DISTINCT session_id)::int AS sessions,
            COUNT(*)::int AS scheduled,

            COUNT(*) FILTER (
              WHERE absent
            )::int AS absent,

            COUNT(*) FILTER (
              WHERE NOT absent
            )::int AS attended,

            COUNT(*) FILTER (
              WHERE result_status = 'DA'
            )::int AS passed

          FROM base
          GROUP BY vehicle
          ORDER BY vehicle
        `,
          params,
        ),

        this.db.query(
          `
          ${this.cte}

          SELECT
            school_id,

            COUNT(DISTINCT session_id)::int AS sessions,

            COUNT(DISTINCT session_id) FILTER (
              WHERE vehicle = 'motorcycle'
            )::int AS moto_sessions,

            COUNT(DISTINCT session_id) FILTER (
              WHERE vehicle = 'car'
            )::int AS car_sessions

          FROM base
          GROUP BY school_id
        `,
          params,
        ),
      ]);

    return {
      filters,
      total: totalRows[0],
      vehicles: typeRows,
      schools: schoolRows,
      parts: partRows,
      distinctSessions: distinctRows,

      quality: {
        deviceErrors: null,
        networkErrors: null,
        centerType: null,
        note:
          'Chưa có dữ liệu ghi nhận sự cố thiết bị, ' +
          'đường truyền và phân loại trung tâm trong nguồn hiện tại.',
      },

      methodology: {
        unit: 'Lượt thí sinh tham dự kỳ sát hạch',
        mode:
          'Lần đầu/thi lại được ước định từ thứ tự kỳ ' +
          'của cùng student_id và hạng GPLX trong lịch sử đã import.',
        attendance:
          'Vắng khi kết quả tổng hoặc bất kỳ phần thi có VA; ' +
          'tham dự thực tế = lượt được xếp - lượt có VA.',
        ratio:
          'Tỷ lệ phần thi = Đạt / (Đạt + Không đạt), ' +
          'không gồm Vắng và trạng thái khác.',
        caution:
          'Nếu thiếu kỳ thi cũ hoặc dữ liệu loại lần đầu/thi lại ' +
          'khác quy tắc thứ tự thì chỉ tiêu phân loại có thể lệch.',
      },
    };
  }
}
