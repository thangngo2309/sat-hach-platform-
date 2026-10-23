import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type DashboardQuery = {
  year?: string;
  courseId?: string;
  sessionId?: string;
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private positiveInt(
    raw: string | undefined,
    fallback: number,
    max = 2147483647,
  ): number {
    if (!raw) return fallback;

    if (!/^[1-9]\d*$/.test(raw)) {
      throw new BadRequestException('Tham số số nguyên không hợp lệ.');
    }

    const value = Number(raw);

    if (!Number.isSafeInteger(value) || value > max) {
      throw new BadRequestException('Tham số vượt giới hạn cho phép.');
    }

    return value;
  }

  private parse(query: DashboardQuery) {
    const year = this.positiveInt(query.year, new Date().getFullYear(), 2100);

    if (year < 2000) {
      throw new BadRequestException('Năm không hợp lệ.');
    }

    return {
      year,
      courseId: query.courseId ? this.positiveInt(query.courseId, 1) : null,
      sessionId: query.sessionId ? this.positiveInt(query.sessionId, 1) : null,
    };
  }

  /**
   * Scoped candidates:
   * - Theo năm thực tế của kỳ sát hạch.
   * - Theo khóa trên examination_candidates.
   * - Theo kỳ khi người dùng lựa chọn.
   *
   * Không JOIN enrollments hoặc BC2:
   * học viên chỉ có file 48/KQSH vẫn được tính.
   */
  private readonly scope = `
      WITH scoped AS (
        SELECT
          ec.id AS candidate_id,
          ec.student_id,
          ec.examination_session_id AS session_id,
          ec.course_id,
          ec.result_status,
          ec.result_import_id,
          ec.candidate_type,
          es.code AS session_code,
          es.exam_date
        FROM examination_candidates ec
        JOIN examination_sessions es
          ON es.id = ec.examination_session_id
        WHERE es.exam_date >= make_date($1::int, 1, 1)
          AND es.exam_date < make_date($1::int + 1, 1, 1)
          AND ($2::int IS NULL OR ec.course_id = $2::int)
          AND ($3::int IS NULL OR es.id = $3::int)
      )
    `;

  private readonly profiles = `
      , profiles AS (
        SELECT
          sc.student_id,
  
          COUNT(DISTINCT sc.session_id)::int
            AS session_count,
  
          COUNT(DISTINCT sc.session_id)
            FILTER (WHERE sc.result_import_id IS NOT NULL)::int
            AS result_count,
  
          BOOL_OR(sc.result_status = 'DA')
            AS has_passed,
  
          BOOL_OR(
            sc.result_status = 'VA'
            OR EXISTS (
              SELECT 1
              FROM examination_candidate_results r
              WHERE r.examination_candidate_id =
                sc.candidate_id
                AND r.result_status = 'VA'
            )
          ) AS has_absent
  
        FROM scoped sc
        GROUP BY sc.student_id
      )
    `;

  async overview(query: DashboardQuery) {
    const f = this.parse(query);

    const params: unknown[] = [f.year, f.courseId, f.sessionId];

    const [
      summaryRows,
      monthlyRows,
      partRows,
      sessionRows,
      courseRows,
      importRows,
    ] = await Promise.all([
      this.db.query(
        `
            ${this.scope}
            ${this.profiles}
  
            , history AS (
              SELECT
                ec.student_id,
                COUNT(DISTINCT ec.examination_session_id)::int
                  AS all_time_sessions
              FROM examination_candidates ec
              JOIN profiles p
                ON p.student_id = ec.student_id
              GROUP BY ec.student_id
            )
  
            SELECT
              COUNT(*)::int AS "totalStudents",
  
              COUNT(*) FILTER (
                WHERE COALESCE(p.has_passed, FALSE)
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE NOT COALESCE(p.has_passed, FALSE)
                  AND p.result_count > 0
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE NOT COALESCE(p.has_passed, FALSE)
                  AND p.result_count = 0
              )::int AS pending,
  
              COUNT(*) FILTER (
                WHERE COALESCE(p.has_absent, FALSE)
              )::int AS absent,
  
              COUNT(*) FILTER (
                WHERE h.all_time_sessions >= 2
              )::int AS "retakeStudents",
  
              COALESCE(SUM(p.session_count), 0)::int
                AS "totalStudentSessions",
  
              COALESCE(SUM(p.result_count), 0)::int
                AS "totalResultSessions",
  
              (
                SELECT COUNT(DISTINCT session_id)::int
                FROM scoped
              ) AS "totalSessions",
  
              (
                SELECT COUNT(DISTINCT course_id)::int
                FROM scoped
                WHERE course_id IS NOT NULL
              ) AS "totalCourses"
  
            FROM profiles p
            JOIN history h
              ON h.student_id = p.student_id
          `,
        params,
      ),

      /**
       * Mỗi học viên được tính một trạng thái
       * trong từng tháng có dự kỳ sát hạch.
       *
       * Một học viên có thể xuất hiện ở hai tháng.
       */
      this.db.query(
        `
            ${this.scope}
  
            , monthly_profiles AS (
              SELECT
                EXTRACT(MONTH FROM sc.exam_date)::int AS month,
                sc.student_id,
                BOOL_OR(sc.result_status = 'DA') AS has_passed,
                BOOL_OR(sc.result_import_id IS NOT NULL)
                  AS has_result,
                BOOL_OR(
                  sc.result_status = 'VA'
                  OR EXISTS (
                    SELECT 1
                    FROM examination_candidate_results r
                    WHERE r.examination_candidate_id =
                      sc.candidate_id
                      AND r.result_status = 'VA'
                  )
                ) AS has_absent
              FROM scoped sc
              GROUP BY
                EXTRACT(MONTH FROM sc.exam_date)::int,
                sc.student_id
            )
  
            SELECT
              month,
  
              COUNT(*) FILTER (
                WHERE has_passed
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE NOT has_passed AND has_result
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE NOT has_result
              )::int AS pending,
  
              COUNT(*) FILTER (
                WHERE has_absent
              )::int AS absent
  
            FROM monthly_profiles
            GROUP BY month
            ORDER BY month
          `,
        params,
      ),

      this.db.query(
        `
            ${this.scope}
  
            SELECT
              r.exam_type AS "examType",
  
              COUNT(*)::int AS "totalRecords",
  
              COUNT(DISTINCT sc.student_id)::int
                AS "studentCount",
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'DA'
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'RO'
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE r.result_status = 'VA'
              )::int AS absent
  
            FROM scoped sc
            JOIN examination_candidate_results r
              ON r.examination_candidate_id = sc.candidate_id
  
            GROUP BY r.exam_type
            ORDER BY r.exam_type
          `,
        params,
      ),

      /**
       * Chỉ các kỳ thuộc bộ lọc hiện tại.
       * Nếu chọn một kỳ, trả một bản ghi.
       */
      this.db.query(
        `
            ${this.scope}
  
            SELECT
              es.id,
              es.code,
              es.exam_date AS "examDate",
              center.code AS "centerCode",
              center.name AS "centerName",
  
              COUNT(DISTINCT sc.student_id)::int
                AS "totalCandidates",
  
              COUNT(DISTINCT sc.student_id)
                FILTER (
                  WHERE sc.result_import_id IS NOT NULL
                )::int AS "withResults",
  
              COUNT(DISTINCT sc.student_id)
                FILTER (
                  WHERE sc.result_status = 'DA'
                )::int AS passed,
  
              COUNT(DISTINCT sc.student_id)
                FILTER (
                  WHERE sc.result_status = 'RO'
                )::int AS failed,
  
              COUNT(DISTINCT sc.student_id)
                FILTER (
                  WHERE sc.result_status = 'VA'
                  OR EXISTS (
                    SELECT 1
                    FROM examination_candidate_results r
                    WHERE r.examination_candidate_id =
                      sc.candidate_id
                      AND r.result_status = 'VA'
                  )
                )::int AS absent
  
            FROM scoped sc
            JOIN examination_sessions es
              ON es.id = sc.session_id
            JOIN examination_centers center
              ON center.id = es.examination_center_id
  
            GROUP BY es.id, center.id
  
            ORDER BY
              es.exam_date DESC NULLS LAST,
              es.id DESC
  
            LIMIT 6
          `,
        params,
      ),

      /**
       * Thống kê theo khóa dùng ec.course_id.
       * Không nhân dòng theo enrollments.
       */
      this.db.query(
        `
            ${this.scope}
  
            , per_student_course AS (
              SELECT
                sc.course_id,
                sc.student_id,
                BOOL_OR(sc.result_status = 'DA') AS has_passed,
                BOOL_OR(sc.result_import_id IS NOT NULL)
                  AS has_result,
                COUNT(DISTINCT sc.session_id)::int
                  AS session_count
              FROM scoped sc
              WHERE sc.course_id IS NOT NULL
              GROUP BY sc.course_id, sc.student_id
            )
  
            SELECT
              c.id AS "courseId",
              c.code AS "courseCode",
              c.name AS "courseName",
              school.name AS "schoolName",
  
              COUNT(*)::int AS "totalStudents",
  
              COUNT(*) FILTER (
                WHERE p.has_passed
              )::int AS passed,
  
              COUNT(*) FILTER (
                WHERE NOT p.has_passed AND p.has_result
              )::int AS failed,
  
              COUNT(*) FILTER (
                WHERE NOT p.has_result
              )::int AS pending
  
            FROM per_student_course p
            JOIN courses c ON c.id = p.course_id
            JOIN training_schools school
              ON school.id = c.school_id
  
            GROUP BY c.id, school.id
            ORDER BY COUNT(*) DESC, c.code
            LIMIT 6
          `,
        params,
      ),

      this.db.query(
        `
            SELECT
              id,
              type,
              file_name AS "fileName",
              report_code AS "reportCode",
              total_records AS "totalRecords",
              imported_at AS "importedAt"
            FROM import_batches
            ORDER BY imported_at DESC, id DESC
            LIMIT 6
          `,
      ),
    ]);

    const summary = summaryRows[0] ?? {
      totalStudents: 0,
      passed: 0,
      failed: 0,
      pending: 0,
      absent: 0,
      retakeStudents: 0,
      totalStudentSessions: 0,
      totalResultSessions: 0,
      totalSessions: 0,
      totalCourses: 0,
    };

    const monthMap = new Map<
      number,
      {
        month: number;
        passed: number;
        failed: number;
        pending: number;
        absent: number;
      }
    >(
      monthlyRows.map(
        (item: {
          month: number;
          passed: number;
          failed: number;
          pending: number;
          absent: number;
        }) => [Number(item.month), item],
      ),
    );

    const monthlyResults = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return (
        monthMap.get(month) ?? {
          month,
          passed: 0,
          failed: 0,
          pending: 0,
          absent: 0,
        }
      );
    });

    return {
      filters: f,
      summary,
      monthlyResults,
      partResults: partRows,
      recentSessions: sessionRows,
      coursePerformance: courseRows,
      recentImports: importRows,
    };
  }
}
