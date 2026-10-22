import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type Bc2ViewQuery = {
  page?: string;
  limit?: string;
  search?: string;
  schoolId?: string;
  courseId?: string;
  bc2Status?: string;
  examStatus?: string;
};

type StudentExamSummary = {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  notExamined: number;
  everAbsent: number;
  retake: number;
};

@Injectable()
export class Bc2ViewService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private positiveInt(value: string | undefined, fallback: number) {
    if (!value) return fallback;

    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException('Tham số số nguyên không hợp lệ.');
    }

    const result = Number(value);

    if (!Number.isSafeInteger(result)) {
      throw new BadRequestException('Tham số vượt giới hạn.');
    }

    return result;
  }

  private filters(query: Bc2ViewQuery) {
    const status = query.bc2Status || 'all';
    const examStatus = query.examStatus || 'all';

    if (!['all', 'has_bc2', 'no_bc2'].includes(status)) {
      throw new BadRequestException('Trạng thái BC2 không hợp lệ.');
    }

    if (
      ![
        'all',
        'passed',
        'failed',
        'pending',
        'not_examined',
        'absent',
        'retake',
      ].includes(examStatus)
    ) {
      throw new BadRequestException('Trạng thái sát hạch không hợp lệ.');
    }

    return {
      page: this.positiveInt(query.page, 1),
      limit: Math.min(this.positiveInt(query.limit, 20), 100),
      search: (query.search || '').trim().slice(0, 150),
      schoolId: query.schoolId ? this.positiveInt(query.schoolId, 1) : null,
      courseId: query.courseId ? this.positiveInt(query.courseId, 1) : null,
      status,
      examStatus,
    };
  }

  /**
   * Truy vấn thống kê theo studentId.
   *
   * Không phụ thuộc BC1, BC2 hay enrollments.
   * Một dòng examination_candidates tương ứng
   * với một học viên trong một kỳ sát hạch.
   */
  private readonly examStatsLateral = `
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT ec.examination_session_id)::int
          AS "examSessionCount",

        COUNT(DISTINCT ec.examination_session_id)
          FILTER (
            WHERE ec.result_import_id IS NOT NULL
          )::int AS "examResultCount",

        COUNT(DISTINCT ec.examination_session_id)
          FILTER (
            WHERE ec.result_status = 'DA'
          )::int AS "passedSessionCount",

        BOOL_OR(ec.result_status = 'DA')
          AS "hasPassed",

        BOOL_OR(
          ec.result_status = 'VA'
          OR EXISTS (
            SELECT 1
            FROM examination_candidate_results ab
            WHERE ab.examination_candidate_id = ec.id
              AND ab.result_status = 'VA'
          )
        ) AS "everAbsent",

        (
          SELECT jsonb_build_object(
            'id', last_ec.id,
            'sessionId', last_es.id,
            'sessionCode', last_es.code,
            'examDate', last_es.exam_date,
            'examinationNumber', last_ec.examination_number,
            'resultStatus', last_ec.result_status,
            'hasResult', last_ec.result_import_id IS NOT NULL
          )
          FROM examination_candidates last_ec
          JOIN examination_sessions last_es
            ON last_es.id =
               last_ec.examination_session_id
          WHERE last_ec.student_id = s.id
          ORDER BY
            last_es.exam_date DESC NULLS LAST,
            last_es.id DESC,
            last_ec.id DESC
          LIMIT 1
        ) AS "latestExam"

      FROM examination_candidates ec
      WHERE ec.student_id = s.id
    ) exam ON TRUE
  `;

  private studentExamStatusSql = `
    CASE
      WHEN COALESCE(exam."hasPassed", FALSE)
        THEN 'passed'
      WHEN COALESCE(exam."examResultCount", 0) > 0
        THEN 'failed'
      WHEN COALESCE(exam."examSessionCount", 0) > 0
        THEN 'pending'
      ELSE 'not_examined'
    END
  `;

  private studentWhere = `
    WHERE (
      $1 = ''
      OR s.registration_code ILIKE '%' || $1 || '%'
      OR s.full_name ILIKE '%' || $1 || '%'
      OR COALESCE(s.identity_number, '') ILIKE '%' || $1 || '%'
    )

    AND (
      $2::int IS NULL
      OR EXISTS (
        SELECT 1
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = s.id
          AND c.school_id = $2::int
      )
    )

    AND (
      $3::int IS NULL
      OR EXISTS (
        SELECT 1
        FROM enrollments e
        WHERE e.student_id = s.id
          AND e.course_id = $3::int
          AND (
            $2::int IS NULL
            OR EXISTS (
              SELECT 1
              FROM courses c
              WHERE c.id = e.course_id
                AND c.school_id = $2::int
            )
          )
      )
    )

    AND (
      $4 = 'all'
      OR (
        $4 = 'has_bc2'
        AND EXISTS (
          SELECT 1
          FROM bc2_candidates bc
          WHERE bc.student_id = s.id
        )
      )
      OR (
        $4 = 'no_bc2'
        AND NOT EXISTS (
          SELECT 1
          FROM bc2_candidates bc
          WHERE bc.student_id = s.id
        )
      )
    )
  `;

  private readonly examFilter = `
    AND (
      $5 = 'all'
      OR (
        $5 IN (
          'passed',
          'failed',
          'pending',
          'not_examined'
        )
        AND (
          CASE
            WHEN COALESCE(exam."hasPassed", FALSE)
              THEN 'passed'
            WHEN COALESCE(exam."examResultCount", 0) > 0
              THEN 'failed'
            WHEN COALESCE(exam."examSessionCount", 0) > 0
              THEN 'pending'
            ELSE 'not_examined'
          END
        ) = $5
      )
      OR (
        $5 = 'absent'
        AND COALESCE(exam."everAbsent", FALSE)
      )
      OR (
        $5 = 'retake'
        AND COALESCE(exam."examSessionCount", 0) >= 2
      )
    )
  `;

  async students(query: Bc2ViewQuery) {
    const f = this.filters(query);

    const params: unknown[] = [
      f.search,
      f.schoolId,
      f.courseId,
      f.status,
      f.examStatus,
    ];

    const from = `
      FROM students s
      ${this.examStatsLateral}
    `;

    const where = `
      ${this.studentWhere}
      ${this.examFilter}
    `;

    const [countRows, data, summaryRows] = await Promise.all([
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
              s.id,
              (s.photo_id IS NOT NULL) AS "hasPhoto",
              s.registration_code AS "registrationCode",
              s.full_name AS "fullName",
              s.date_of_birth AS "dateOfBirth",
              s.identity_number AS "identityNumber",

              (
                SELECT COUNT(*)::int
                FROM enrollments e
                WHERE e.student_id = s.id
              ) AS "courseCount",

              EXISTS (
                SELECT 1
                FROM bc2_candidates bc
                WHERE bc.student_id = s.id
              ) AS "hasBc2",

              (
                SELECT COUNT(*)::int
                FROM bc2_candidates bc
                WHERE bc.student_id = s.id
              ) AS "bc2Count",

              COALESCE(
                exam."examSessionCount", 0
              ) AS "examSessionCount",

              COALESCE(
                exam."examResultCount", 0
              ) AS "examResultCount",

              COALESCE(
                exam."passedSessionCount", 0
              ) AS "passedSessionCount",

              COALESCE(
                exam."everAbsent", FALSE
              ) AS "everAbsent",

              ${this.studentExamStatusSql}
                AS "examStatus",

              exam."latestExam" AS "latestExam",

              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', c.id,
                    'code', c.code,
                    'schoolName', sc.name,
                    'fileNumber', e.file_number
                  )
                  ORDER BY c.id
                )
                FROM enrollments e
                JOIN courses c
                  ON c.id = e.course_id
                JOIN training_schools sc
                  ON sc.id = c.school_id
                WHERE e.student_id = s.id
              ), '[]'::jsonb) AS courses,

              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'reportId', r.id,
                    'bc2Code', r.bc2_code,
                    'bc1Code', r.bc1_code,
                    'schoolName', sc.name,
                    'schoolCode', sc.code,
                    'fileNumber', bc.file_number,
                    'requestedLicenseClass',
                      bc.requested_license_class
                  )
                  ORDER BY r.id
                )
                FROM bc2_candidates bc
                JOIN bc2_reports r
                  ON r.id = bc.report_id
                JOIN training_schools sc
                  ON sc.id = r.school_id
                WHERE bc.student_id = s.id
              ), '[]'::jsonb) AS "bc2Reports"

            ${from}
            ${where}

            ORDER BY s.id DESC
            LIMIT $6 OFFSET $7
          `,
        [...params, f.limit, (f.page - 1) * f.limit],
      ),

      /**
       * Tổng quan dựa trên tất cả học viên
       * phù hợp tìm kiếm/trường/khóa/BC2.
       * Không chịu ảnh hưởng bởi bộ lọc examStatus
       * để các ô thống kê không thay đổi khi lọc.
       */
      this.db.query(
        `
            SELECT
              COUNT(*)::int AS total,

              COUNT(*) FILTER (
                WHERE COALESCE(
                  exam."hasPassed", FALSE
                )
              )::int AS passed,

              COUNT(*) FILTER (
                WHERE NOT COALESCE(
                  exam."hasPassed", FALSE
                )
                  AND COALESCE(
                    exam."examResultCount", 0
                  ) > 0
              )::int AS failed,

              COUNT(*) FILTER (
                WHERE NOT COALESCE(
                  exam."hasPassed", FALSE
                )
                  AND COALESCE(
                    exam."examResultCount", 0
                  ) = 0
                  AND COALESCE(
                    exam."examSessionCount", 0
                  ) > 0
              )::int AS pending,

              COUNT(*) FILTER (
                WHERE COALESCE(
                  exam."examSessionCount", 0
                ) = 0
              )::int AS "notExamined",

              COUNT(*) FILTER (
                WHERE COALESCE(
                  exam."everAbsent", FALSE
                )
              )::int AS "everAbsent",

              COUNT(*) FILTER (
                WHERE COALESCE(
                  exam."examSessionCount", 0
                ) >= 2
              )::int AS retake

            ${from}
            ${this.studentWhere}
          `,
        params.slice(0, 4),
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    const summary: StudentExamSummary = summaryRows[0] ?? {
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
      notExamined: 0,
      everAbsent: 0,
      retake: 0,
    };

    return {
      data,
      summary,
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.ceil(total / f.limit),
      },
    };
  }

  async studentDetail(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('ID học viên không hợp lệ.');
    }

    const students = await this.db.query(
      `
        SELECT
          s.id,
          (s.photo_id IS NOT NULL) AS "hasPhoto",
          s.registration_code AS "registrationCode",
          s.full_name AS "fullName",
          s.family_name AS "familyName",
          s.given_name AS "givenName",
          s.date_of_birth AS "dateOfBirth",
          s.gender,
          s.identity_number AS "identityNumber",
          s.nationality_code AS "nationalityCode",
          s.nationality_name AS "nationalityName",
          s.permanent_address AS "permanentAddress",
          s.current_address AS "currentAddress",

          COALESCE(
            exam."examSessionCount", 0
          ) AS "examSessionCount",

          COALESCE(
            exam."examResultCount", 0
          ) AS "examResultCount",

          COALESCE(
            exam."passedSessionCount", 0
          ) AS "passedSessionCount",

          COALESCE(
            exam."everAbsent", FALSE
          ) AS "everAbsent",

          ${this.studentExamStatusSql}
            AS "examStatus",

          exam."latestExam" AS "latestExam"

        FROM students s
        ${this.examStatsLateral}
        WHERE s.id = $1
      `,
      [id],
    );

    if (!students.length) {
      throw new NotFoundException('Không tìm thấy học viên.');
    }

    const [courses, bc2Reports, examHistory, partStats] = await Promise.all([
      this.db.query(
        `
          SELECT
            c.id,
            c.code,
            c.name,
            c.bc1_code AS "bc1Code",
            c.license_class AS "licenseClass",
            sc.code AS "schoolCode",
            sc.name AS "schoolName",
            e.file_number AS "fileNumber"
          FROM enrollments e
          JOIN courses c
            ON c.id = e.course_id
          JOIN training_schools sc
            ON sc.id = c.school_id
          WHERE e.student_id = $1
          ORDER BY c.id
        `,
        [id],
      ),

      this.db.query(
        `
          SELECT
            r.id AS "reportId",
            r.bc2_code AS "bc2Code",
            r.bc1_code AS "bc1Code",
            sc.code AS "schoolCode",
            sc.name AS "schoolName",
            r.document_date AS "documentDate",
            bc.source_order AS "sourceOrder",
            bc.file_number AS "fileNumber",
            bc.requested_license_class
              AS "requestedLicenseClass",
            bc.previous_license_number
              AS "previousLicenseNumber",
            bc.previous_license_class
              AS "previousLicenseClass",
            bc.exam_content_code AS "examContentCode",
            bc.source_data AS "sourceData"
          FROM bc2_candidates bc
          JOIN bc2_reports r
            ON r.id = bc.report_id
          JOIN training_schools sc
            ON sc.id = r.school_id
          WHERE bc.student_id = $1
          ORDER BY r.id DESC
        `,
        [id],
      ),

      /**
       * Mỗi phần tử examHistory là một kỳ sát hạch.
       * Đã có file 48 nhưng chưa KQSH:
       * hasResult = false, parts = [].
       */
      this.db.query(
        `
          SELECT
            ec.id,
            es.id AS "sessionId",
            es.code AS "sessionCode",
            es.exam_date AS "examDate",
            es.exam_time AS "examTime",
            center.code AS "centerCode",
            center.name AS "centerName",
            ec.registration_code AS "registrationCode",
            ec.examination_number AS "examinationNumber",
            ec.license_class AS "licenseClass",
            ec.examination_content AS "examinationContent",
            ec.result_status AS "resultStatus",

            (
              ec.result_import_id IS NOT NULL
            ) AS "hasResult",

            (
              ec.result_status = 'VA'
              OR EXISTS (
                SELECT 1
                FROM examination_candidate_results va
                WHERE va.examination_candidate_id = ec.id
                  AND va.result_status = 'VA'
              )
            ) AS "hasAbsentPart",

            ec.theory_score AS "theoryScore",
            ec.practical_score AS "practicalScore",
            ec.road_score AS "roadScore",

            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', r.id,
                  'partOrder', r.part_order,
                  'examType', r.exam_type,
                  'resultStatus', r.result_status,
                  'examDate', r.exam_date,
                  'score', r.score,
                  'maximumScore', r.maximum_score
                )
                ORDER BY r.part_order, r.id
              )
              FROM examination_candidate_results r
              WHERE r.examination_candidate_id = ec.id
            ), '[]'::jsonb) AS parts

          FROM examination_candidates ec
          JOIN examination_sessions es
            ON es.id = ec.examination_session_id
          JOIN examination_centers center
            ON center.id = es.examination_center_id

          WHERE ec.student_id = $1

          ORDER BY
            es.exam_date ASC NULLS LAST,
            es.id ASC,
            ec.id ASC
        `,
        [id],
      ),

      /**
       * Đếm số bản ghi kết quả từng phần thi.
       * Dùng examType thực tế trong DB, không
       * giả định tất cả hạng đều có cùng bài thi.
       */
      this.db.query(
        `
          SELECT
            r.exam_type AS "examType",
            COUNT(*)::int AS "attemptCount",
            COUNT(*) FILTER (
              WHERE r.result_status = 'DA'
            )::int AS "passedCount",
            COUNT(*) FILTER (
              WHERE r.result_status = 'RO'
            )::int AS "failedCount",
            COUNT(*) FILTER (
              WHERE r.result_status = 'VA'
            )::int AS "absentCount"

          FROM examination_candidates ec
          JOIN examination_candidate_results r
            ON r.examination_candidate_id = ec.id

          WHERE ec.student_id = $1

          GROUP BY r.exam_type
          ORDER BY r.exam_type
        `,
        [id],
      ),
    ]);

    return {
      ...students[0],
      courses,
      bc2Reports,
      examHistory,
      partStats,
    };
  }

  async courseSummary(query: Bc2ViewQuery) {
    const f = this.filters(query);

    const params = [f.search, f.schoolId];

    const where = `
      WHERE (
        $1 = ''
        OR c.code ILIKE '%' || $1 || '%'
        OR c.name ILIKE '%' || $1 || '%'
        OR sc.name ILIKE '%' || $1 || '%'
      )
      AND (
        $2::int IS NULL
        OR c.school_id = $2::int
      )
    `;

    const countRows = await this.db.query(
      `
        SELECT COUNT(*)::int AS total
        FROM courses c
        JOIN training_schools sc
          ON sc.id = c.school_id
        ${where}
      `,
      params,
    );

    const data = await this.db.query(
      `
        SELECT
          c.id,
          c.code,
          c.name,
          c.bc1_code AS "bc1Code",
          c.license_class AS "licenseClass",
          c.opening_date AS "openingDate",
          c.school_id AS "schoolId",
          sc.name AS "schoolName",

          (
            SELECT COUNT(*)::int
            FROM enrollments e
            WHERE e.course_id = c.id
          ) AS "studentCount",

          (
            SELECT COUNT(*)::int
            FROM enrollments e
            WHERE e.course_id = c.id
              AND EXISTS (
                SELECT 1
                FROM bc2_candidates bc
                JOIN bc2_reports r
                  ON r.id = bc.report_id
                WHERE bc.student_id = e.student_id
                  AND r.school_id = c.school_id
                  AND r.bc1_code = c.bc1_code
                  AND c.bc1_code IS NOT NULL
              )
          ) AS "bc2MatchedCount"

        FROM courses c

        JOIN training_schools sc
          ON sc.id = c.school_id

        ${where}

        ORDER BY c.id DESC
        LIMIT $3 OFFSET $4
      `,
      [...params, f.limit, (f.page - 1) * f.limit],
    );

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: data.map(
        (row: { studentCount: number; bc2MatchedCount: number }) => ({
          ...row,
          noBc2Count: row.studentCount - row.bc2MatchedCount,
        }),
      ),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.ceil(total / f.limit),
      },
    };
  }
}
