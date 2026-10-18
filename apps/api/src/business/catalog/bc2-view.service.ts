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

    if (!['all', 'has_bc2', 'no_bc2'].includes(status)) {
      throw new BadRequestException('Trạng thái BC2 không hợp lệ.');
    }

    return {
      page: this.positiveInt(query.page, 1),
      limit: Math.min(this.positiveInt(query.limit, 20), 100),
      search: (query.search || '').trim().slice(0, 150),
      schoolId: query.schoolId ? this.positiveInt(query.schoolId, 1) : null,
      courseId: query.courseId ? this.positiveInt(query.courseId, 1) : null,
      status,
    };
  }

  async students(query: Bc2ViewQuery) {
    const f = this.filters(query);
    const params = [f.search, f.schoolId, f.courseId, f.status];

    const where = `
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
              AND ($2::int IS NULL OR EXISTS (
                SELECT 1 FROM courses c
                WHERE c.id = e.course_id
                  AND c.school_id = $2::int
              ))
          )
        )
        AND (
          $4 = 'all'
          OR (
            $4 = 'has_bc2'
            AND EXISTS (
              SELECT 1 FROM bc2_candidates bc
              WHERE bc.student_id = s.id
            )
          )
          OR (
            $4 = 'no_bc2'
            AND NOT EXISTS (
              SELECT 1 FROM bc2_candidates bc
              WHERE bc.student_id = s.id
            )
          )
        )
      `;

    const countRows = await this.db.query(
      `SELECT COUNT(*)::int AS total
         FROM students s ${where}`,
      params,
    );

    const data = await this.db.query(
      `SELECT
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
             SELECT 1 FROM bc2_candidates bc
             WHERE bc.student_id = s.id
           ) AS "hasBc2",
           (
             SELECT COUNT(*)::int
             FROM bc2_candidates bc
             WHERE bc.student_id = s.id
           ) AS "bc2Count",
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
             JOIN courses c ON c.id = e.course_id
             JOIN training_schools sc ON sc.id = c.school_id
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
                 'requestedLicenseClass', bc.requested_license_class
               )
               ORDER BY r.id
             )
             FROM bc2_candidates bc
             JOIN bc2_reports r ON r.id = bc.report_id
             JOIN training_schools sc ON sc.id = r.school_id
             WHERE bc.student_id = s.id
           ), '[]'::jsonb) AS bc2Reports
         FROM students s
         ${where}
         ORDER BY s.id DESC
         LIMIT $5 OFFSET $6`,
      [...params, f.limit, (f.page - 1) * f.limit],
    );

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data,
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
      `SELECT
          id,
          (photo_id IS NOT NULL) AS "hasPhoto",
          registration_code AS "registrationCode",
          full_name AS "fullName",
          family_name AS "familyName",
          given_name AS "givenName",
          date_of_birth AS "dateOfBirth",
          gender,
          identity_number AS "identityNumber",
          nationality_code AS "nationalityCode",
          nationality_name AS "nationalityName",
          permanent_address AS "permanentAddress",
          current_address AS "currentAddress"
         FROM students
         WHERE id = $1`,
      [id],
    );

    if (!students.length) {
      throw new NotFoundException('Không tìm thấy học viên.');
    }

    const [courses, bc2Reports] = await Promise.all([
      this.db.query(
        `SELECT
            c.id,
            c.code,
            c.name,
            c.bc1_code AS "bc1Code",
            c.license_class AS "licenseClass",
            sc.code AS "schoolCode",
            sc.name AS "schoolName",
            e.file_number AS "fileNumber"
           FROM enrollments e
           JOIN courses c ON c.id = e.course_id
           JOIN training_schools sc ON sc.id = c.school_id
           WHERE e.student_id = $1
           ORDER BY c.id`,
        [id],
      ),
      this.db.query(
        `SELECT
            r.id AS "reportId",
            r.bc2_code AS "bc2Code",
            r.bc1_code AS "bc1Code",
            sc.code AS "schoolCode",
            sc.name AS "schoolName",
            r.document_date AS "documentDate",
            bc.source_order AS "sourceOrder",
            bc.file_number AS "fileNumber",
            bc.requested_license_class AS "requestedLicenseClass",
            bc.previous_license_number AS "previousLicenseNumber",
            bc.previous_license_class AS "previousLicenseClass",
            bc.exam_content_code AS "examContentCode",
            bc.source_data AS "sourceData"
           FROM bc2_candidates bc
           JOIN bc2_reports r ON r.id = bc.report_id
           JOIN training_schools sc ON sc.id = r.school_id
           WHERE bc.student_id = $1
           ORDER BY r.id DESC`,
        [id],
      ),
    ]);

    return {
      ...students[0],
      courses,
      bc2Reports,
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
        AND ($2::int IS NULL OR c.school_id = $2::int)
      `;

    const countRows = await this.db.query(
      `SELECT COUNT(*)::int AS total
         FROM courses c
         JOIN training_schools sc ON sc.id = c.school_id
         ${where}`,
      params,
    );

    const data = await this.db.query(
      `SELECT
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
                JOIN bc2_reports r ON r.id = bc.report_id
                WHERE bc.student_id = e.student_id
                  AND r.school_id = c.school_id
                  AND r.bc1_code = c.bc1_code
                  AND c.bc1_code IS NOT NULL
              )
          ) AS "bc2MatchedCount"
         FROM courses c
         JOIN training_schools sc ON sc.id = c.school_id
         ${where}
         ORDER BY c.id DESC
         LIMIT $3 OFFSET $4`,
      [...params, f.limit, (f.page - 1) * f.limit],
    );

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
        total: Number(countRows[0]?.total ?? 0),
        totalPages: Math.ceil(Number(countRows[0]?.total ?? 0) / f.limit),
      },
    };
  }
}
