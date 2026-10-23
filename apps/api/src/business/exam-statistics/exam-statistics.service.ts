
import {
    BadRequestException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource } from 'typeorm';
  
  export type ExamStatisticsQuery = {
    year?: string;
    courseId?: string;
    sessionId?: string;
    page?: string;
    limit?: string;
    search?: string;
  };
  
  @Injectable()
  export class ExamStatisticsService {
    constructor(
      @InjectDataSource()
      private readonly db: DataSource,
    ) {}
  
    private positiveInt(
      value: string | undefined,
      fallback: number,
      max = 2147483647,
    ): number {
      if (!value) return fallback;
  
      if (!/^[1-9]\d*$/.test(value)) {
        throw new BadRequestException('Tham số số nguyên không hợp lệ.');
      }
  
      const result = Number(value);
  
      if (!Number.isSafeInteger(result) || result > max) {
        throw new BadRequestException('Tham số vượt giới hạn.');
      }
  
      return result;
    }
  
    private parseQuery(query: ExamStatisticsQuery) {
      const year = this.positiveInt(
        query.year,
        new Date().getFullYear(),
        2100,
      );
  
      if (year < 2000) {
        throw new BadRequestException('Năm sát hạch không hợp lệ.');
      }
  
      return {
        year,
        courseId: query.courseId
          ? this.positiveInt(query.courseId, 1)
          : null,
        sessionId: query.sessionId
          ? this.positiveInt(query.sessionId, 1)
          : null,
        page: this.positiveInt(query.page, 1, 1000000),
        limit: Math.min(this.positiveInt(query.limit, 20), 100),
        search: (query.search ?? '').trim().slice(0, 150),
      };
    }
  
    async filters(query: ExamStatisticsQuery = {}) {
      const year = query.year
        ? this.positiveInt(query.year, new Date().getFullYear(), 2100)
        : null;
  
      const courseId = query.courseId
        ? this.positiveInt(query.courseId, 1)
        : null;
  
      const [years, courses, sessions] = await Promise.all([
        this.db.query(
          `
            SELECT DISTINCT
              EXTRACT(YEAR FROM es.exam_date)::int AS year
            FROM examination_sessions es
            WHERE es.exam_date IS NOT NULL
            ORDER BY year DESC
          `,
        ),
  
        this.db.query(
          `
            SELECT DISTINCT
              c.id,
              c.code,
              c.name,
              sc.code AS "schoolCode",
              sc.name AS "schoolName"
            FROM courses c
            JOIN examination_candidates ec
              ON ec.course_id = c.id
            JOIN examination_sessions es
              ON es.id = ec.examination_session_id
            JOIN training_schools sc
              ON sc.id = c.school_id
            WHERE (
              $1::int IS NULL
              OR (
                es.exam_date >= make_date($1::int, 1, 1)
                AND es.exam_date < make_date($1::int + 1, 1, 1)
              )
            )
            ORDER BY sc.name, c.code
          `,
          [year],
        ),
  
        this.db.query(
          `
            SELECT
              es.id,
              es.code,
              es.exam_date AS "examDate",
              center.code AS "centerCode",
              center.name AS "centerName",
              COUNT(ec.id)::int AS "totalCandidates"
            FROM examination_sessions es
            JOIN examination_centers center
              ON center.id = es.examination_center_id
            JOIN examination_candidates ec
              ON ec.examination_session_id = es.id
            WHERE (
              $1::int IS NULL
              OR (
                es.exam_date >= make_date($1::int, 1, 1)
                AND es.exam_date < make_date($1::int + 1, 1, 1)
              )
            )
            AND (
              $2::int IS NULL
              OR ec.course_id = $2::int
            )
            GROUP BY es.id, center.id
            ORDER BY
              es.exam_date DESC NULLS LAST,
              es.id DESC
          `,
          [year, courseId],
        ),
      ]);
  
      return { years, courses, sessions };
    }
  
    private readonly scopedSql = `
      WITH scoped AS (
        SELECT
          ec.id AS candidate_id,
          ec.student_id,
          ec.examination_session_id,
          ec.course_id,
          ec.examination_number,
          ec.license_class,
          ec.result_status,
          ec.result_import_id,
          es.code AS session_code,
          es.exam_date
        FROM examination_candidates ec
        JOIN examination_sessions es
          ON es.id = ec.examination_session_id
        WHERE
          es.exam_date >= make_date($1::int, 1, 1)
          AND es.exam_date < make_date($1::int + 1, 1, 1)
          AND (
            $2::int IS NULL
            OR ec.course_id = $2::int
          )
          AND (
            $3::int IS NULL
            OR ec.examination_session_id = $3::int
          )
      )
    `;
  
    private readonly profilesSql = `
      , profiles AS (
        SELECT
          sc.student_id AS id,
  
          COUNT(DISTINCT sc.examination_session_id)::int
            AS "sessionCount",
  
          COUNT(DISTINCT sc.examination_session_id)
            FILTER (
              WHERE sc.result_import_id IS NOT NULL
            )::int AS "resultCount",
  
          BOOL_OR(sc.result_status = 'DA')
            AS "hasPassed",
  
          BOOL_OR(
            sc.result_status = 'VA'
            OR EXISTS (
              SELECT 1
              FROM examination_candidate_results r
              WHERE r.examination_candidate_id = sc.candidate_id
                AND r.result_status = 'VA'
            )
          ) AS "hasAbsent",
  
          CASE
            WHEN BOOL_OR(sc.result_status = 'DA')
              THEN 'passed'
            WHEN COUNT(*) FILTER (
              WHERE sc.result_import_id IS NOT NULL
            ) > 0
              THEN 'failed'
            ELSE 'pending'
          END AS "status"
  
        FROM scoped sc
        GROUP BY sc.student_id
      )
    `;
  
    private readonly latestSql = `
      , latest AS (
        SELECT DISTINCT ON (sc.student_id)
          sc.student_id,
          sc.session_code AS "sessionCode",
          sc.exam_date AS "examDate",
          sc.result_status AS "resultStatus",
          sc.examination_number AS "examinationNumber"
        FROM scoped sc
        ORDER BY
          sc.student_id,
          sc.exam_date DESC NULLS LAST,
          sc.examination_session_id DESC,
          sc.candidate_id DESC
      )
    `;
  
    private readonly allTimeSql = `
      , all_time AS (
        SELECT
          ec.student_id,
          COUNT(DISTINCT ec.examination_session_id)::int
            AS "allTimeSessionCount",
          COUNT(DISTINCT ec.examination_session_id)
            FILTER (
              WHERE ec.result_import_id IS NOT NULL
            )::int AS "allTimeResultCount"
        FROM examination_candidates ec
        JOIN profiles p ON p.id = ec.student_id
        GROUP BY ec.student_id
      )
    `;
  
    async report(query: ExamStatisticsQuery) {
      const f = this.parseQuery(query);
  
      const values: unknown[] = [
        f.year,
        f.courseId,
        f.sessionId,
      ];
  
      // Trường hợp chọn kỳ không thuộc năm hoặc khóa đang lọc,
      // truy vấn trả dữ liệu rỗng thay vì trộn dữ liệu ngoài phạm vi.
      const common = `
        ${this.scopedSql}
        ${this.profilesSql}
        ${this.latestSql}
        ${this.allTimeSql}
      `;
  
      const studentFrom = `
        FROM profiles p
        JOIN students s ON s.id = p.id
        JOIN latest l ON l.student_id = p.id
        JOIN all_time at ON at.student_id = p.id
      `;
  
      const searchWhere = `
        WHERE (
          $4 = ''
          OR s.registration_code ILIKE '%' || $4 || '%'
          OR s.full_name ILIKE '%' || $4 || '%'
          OR COALESCE(s.identity_number, '') ILIKE '%' || $4 || '%'
        )
      `;
  
      const [
        summaryRows,
        partRows,
        countRows,
        studentRows,
      ] = await Promise.all([
        this.db.query(
          `
            ${this.scopedSql}
            ${this.profilesSql}
  
            SELECT
              COUNT(*)::int AS "totalStudents",
  
              COUNT(*) FILTER (
                WHERE p."status" = 'passed'
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE p."status" = 'failed'
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE p."status" = 'pending'
              )::int AS pending,
  
              COUNT(*) FILTER (
                WHERE COALESCE(p."hasAbsent", FALSE)
              )::int AS absent,
  
              COUNT(*) FILTER (
                WHERE p."sessionCount" >= 2
              )::int AS "retakeStudents",
  
              COALESCE(SUM(p."sessionCount"), 0)::int
                AS "totalStudentSessions",
  
              COALESCE(SUM(p."resultCount"), 0)::int
                AS "totalResultSessions"
  
            FROM profiles p
          `,
          values,
        ),
  
        this.db.query(
          `
            ${this.scopedSql}
  
            SELECT
              r.exam_type AS "examType",
              COUNT(*)::int AS "totalRecords",
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'DA'
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'RO'
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'VA'
              )::int AS absent,
  
              COUNT(DISTINCT sc.student_id)::int
                AS "studentCount"
  
            FROM scoped sc
            JOIN examination_candidate_results r
              ON r.examination_candidate_id = sc.candidate_id
            GROUP BY r.exam_type
            ORDER BY r.exam_type
          `,
          values,
        ),
  
        this.db.query(
          `
            ${common}
            SELECT COUNT(*)::int AS total
            ${studentFrom}
            ${searchWhere}
          `,
          [...values, f.search],
        ),
  
        this.db.query(
          `
            ${common}
  
            SELECT
              s.id,
              (s.photo_id IS NOT NULL) AS "hasPhoto",
              s.registration_code AS "registrationCode",
              s.full_name AS "fullName",
              s.identity_number AS "identityNumber",
  
              p."sessionCount",
              p."resultCount",
              p."status",
              COALESCE(p."hasAbsent", FALSE) AS "hasAbsent",
  
              at."allTimeSessionCount",
              at."allTimeResultCount",
  
              l."sessionCode" AS "latestSessionCode",
              l."examDate" AS "latestExamDate",
              l."resultStatus" AS "latestResultStatus",
  
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'examType', part.exam_type,
                    'totalRecords', part.total,
                    'passed', part.passed,
                    'failed', part.failed,
                    'absent', part.absent
                  )
                  ORDER BY part.exam_type
                )
                FROM (
                  SELECT
                    r.exam_type,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (
                      WHERE r.result_status = 'DA'
                    )::int AS passed,
                    COUNT(*) FILTER (
                      WHERE r.result_status = 'RO'
                    )::int AS failed,
                    COUNT(*) FILTER (
                      WHERE r.result_status = 'VA'
                    )::int AS absent
                  FROM scoped sc2
                  JOIN examination_candidate_results r
                    ON r.examination_candidate_id = sc2.candidate_id
                  WHERE sc2.student_id = s.id
                  GROUP BY r.exam_type
                ) part
              ), '[]'::jsonb) AS parts
  
            ${studentFrom}
            ${searchWhere}
  
            ORDER BY
              l."examDate" DESC NULLS LAST,
              s.id DESC
  
            LIMIT $5 OFFSET $6
          `,
          [
            ...values,
            f.search,
            f.limit,
            (f.page - 1) * f.limit,
          ],
        ),
      ]);
  
      const total = Number(countRows[0]?.total ?? 0);
  
      return {
        filters: {
          year: f.year,
          courseId: f.courseId,
          sessionId: f.sessionId,
        },
        summary: summaryRows[0] ?? {
          totalStudents: 0,
          passed: 0,
          failed: 0,
          pending: 0,
          absent: 0,
          retakeStudents: 0,
          totalStudentSessions: 0,
          totalResultSessions: 0,
        },
        parts: partRows,
        students: studentRows,
        pagination: {
          page: f.page,
          limit: f.limit,
          total,
          totalPages: Math.ceil(total / f.limit),
        },
      };
    }
  
    async studentHistory(
      studentId: number,
      query: ExamStatisticsQuery,
    ) {
      if (!Number.isSafeInteger(studentId) || studentId < 1) {
        throw new BadRequestException('ID học viên không hợp lệ.');
      }
  
      const f = this.parseQuery(query);
  
      const existing: Array<{ id: number }> = await this.db.query(
        'SELECT id FROM students WHERE id = $1',
        [studentId],
      );
  
      if (!existing.length) {
        throw new NotFoundException('Không tìm thấy học viên.');
      }
  
      const history = await this.db.query(
        `
          SELECT
            ec.id,
            es.id AS "sessionId",
            es.code AS "sessionCode",
            es.exam_date AS "examDate",
            ec.examination_number AS "examinationNumber",
            ec.license_class AS "licenseClass",
            ec.result_status AS "resultStatus",
            (ec.result_import_id IS NOT NULL) AS "hasResult",
  
            (
              es.exam_date >= make_date($2::int, 1, 1)
              AND es.exam_date < make_date($2::int + 1, 1, 1)
            ) AS "inSelectedYear",
  
            (
              $3::int IS NULL
              OR ec.course_id = $3::int
            ) AS "inSelectedCourse",
  
            (
              $4::int IS NULL
              OR es.id = $4::int
            ) AS "inSelectedSession",
  
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', r.id,
                  'examType', r.exam_type,
                  'partOrder', r.part_order,
                  'resultStatus', r.result_status,
                  'score', r.score,
                  'maximumScore', r.maximum_score,
                  'examDate', r.exam_date
                )
                ORDER BY r.part_order, r.id
              )
              FROM examination_candidate_results r
              WHERE r.examination_candidate_id = ec.id
            ), '[]'::jsonb) AS parts
  
          FROM examination_candidates ec
          JOIN examination_sessions es
            ON es.id = ec.examination_session_id
          WHERE ec.student_id = $1
          ORDER BY
            es.exam_date ASC NULLS LAST,
            es.id ASC,
            ec.id ASC
        `,
        [
          studentId,
          f.year,
          f.courseId,
          f.sessionId,
        ],
      );
  
      return { studentId, history };
    }
  }
  