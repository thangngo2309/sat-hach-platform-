import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type ListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  schoolId?: string;
  courseId?: string;
};

@Injectable()
export class CatalogService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private pagination(query: ListQuery) {
    const normalize = (value: string | undefined, defaultValue: number) => {
      if (!value || !/^\d+$/.test(value)) return defaultValue;
      const result = Number(value);
      return Number.isSafeInteger(result) && result > 0 ? result : defaultValue;
    };

    const page = Math.min(normalize(query.page, 1), 1000000);
    const limit = Math.min(normalize(query.limit, 20), 100);

    return {
      page,
      limit,
      offset: (page - 1) * limit,
    };
  }

  private normalizeSearch(search?: string) {
    return (search ?? '').trim().slice(0, 150);
  }

  private normalizeId(raw?: string) {
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
  }

  private async paginate<T>(
    countSql: string,
    dataSql: string,
    params: unknown[],
    query: ListQuery,
  ) {
    const { page, limit, offset } = this.pagination(query);

    const countRows: Array<{ total: string }> = await this.dataSource.query(
      countSql,
      params,
    );

    const data: T[] = await this.dataSource.query(
      `${dataSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const total = Number(countRows[0]?.total ?? 0);

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

  async schools(query: ListQuery) {
    const search = this.normalizeSearch(query.search);

    const where = `
      WHERE (
        $1 = '' OR
        s.code ILIKE '%' || $1 || '%' OR
        s.name ILIKE '%' || $1 || '%' OR
        COALESCE(s.province_name, '') ILIKE '%' || $1 || '%'
      )
    `;

    return this.paginate(
      `SELECT COUNT(*)::text AS total
       FROM training_schools s
       ${where}`,
      `SELECT
         s.id,
         s.code,
         s.name,
         s.province_code AS "provinceCode",
         s.province_name AS "provinceName",
         COUNT(DISTINCT c.id)::int AS "courseCount",
         COUNT(e.id)::int AS "enrollmentCount",
         s.created_at AS "createdAt"
       FROM training_schools s
       LEFT JOIN courses c ON c.school_id = s.id
       LEFT JOIN enrollments e ON e.course_id = c.id
       ${where}
       GROUP BY s.id
       ORDER BY s.name ASC, s.id ASC`,
      [search],
      query,
    );
  }

  async courses(query: ListQuery) {
    const search = this.normalizeSearch(query.search);
    const schoolId = this.normalizeId(query.schoolId);

    const params = [search, schoolId];

    const where = `
      WHERE (
        $1 = '' OR
        c.code ILIKE '%' || $1 || '%' OR
        c.name ILIKE '%' || $1 || '%' OR
        s.name ILIKE '%' || $1 || '%' OR
        COALESCE(c.bc1_code, '') ILIKE '%' || $1 || '%'
      )
      AND ($2::int IS NULL OR c.school_id = $2::int)
    `;

    return this.paginate(
      `SELECT COUNT(*)::text AS total
       FROM courses c
       JOIN training_schools s ON s.id = c.school_id
       ${where}`,
      `SELECT
         c.id,
         c.code,
         c.name,
         c.school_id AS "schoolId",
         s.code AS "schoolCode",
         s.name AS "schoolName",
         c.bc1_code AS "bc1Code",
         c.license_class AS "licenseClass",
         c.training_class AS "trainingClass",
         c.opening_date AS "openingDate",
         c.closing_date AS "closingDate",
         c.declared_student_count AS "declaredStudentCount",
         COUNT(e.id)::int AS "studentCount"
       FROM courses c
       JOIN training_schools s ON s.id = c.school_id
       LEFT JOIN enrollments e ON e.course_id = c.id
       ${where}
       GROUP BY c.id, s.id
       ORDER BY c.created_at DESC, c.id DESC`,
      params,
      query,
    );
  }

  async students(query: ListQuery) {
    const search = this.normalizeSearch(query.search);
    const schoolId = this.normalizeId(query.schoolId);
    const courseId = this.normalizeId(query.courseId);

    const params = [search, schoolId, courseId];

    const where = `
      WHERE (
        $1 = '' OR
        st.registration_code ILIKE '%' || $1 || '%' OR
        st.full_name ILIKE '%' || $1 || '%' OR
        COALESCE(st.identity_number, '') ILIKE '%' || $1 || '%'
      )
      AND (
        $2::int IS NULL OR EXISTS (
          SELECT 1 FROM enrollments e2
          JOIN courses c2 ON c2.id = e2.course_id
          WHERE e2.student_id = st.id
            AND c2.school_id = $2::int
        )
      )
      AND (
        $3::int IS NULL OR EXISTS (
          SELECT 1 FROM enrollments e3
          WHERE e3.student_id = st.id
            AND e3.course_id = $3::int
        )
      )
    `;

    return this.paginate(
      `SELECT COUNT(*)::text AS total
       FROM students st
       ${where}`,
      `SELECT
         st.id,
         st.registration_code AS "registrationCode",
         st.full_name AS "fullName",
         st.date_of_birth AS "dateOfBirth",
         st.gender,
         st.identity_number AS "identityNumber",
         st.nationality_code AS "nationalityCode",
         st.permanent_address AS "permanentAddress",
         st.current_address AS "currentAddress",
         COUNT(e.id)::int AS "courseCount",
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', c.id,
               'code', c.code,
               'name', c.name,
               'schoolId', sc.id,
               'schoolName', sc.name,
               'fileNumber', e.file_number
             )
             ORDER BY c.id
           ) FILTER (WHERE e.id IS NOT NULL),
           '[]'::jsonb
         ) AS courses
       FROM students st
       LEFT JOIN enrollments e ON e.student_id = st.id
       LEFT JOIN courses c ON c.id = e.course_id
       LEFT JOIN training_schools sc ON sc.id = c.school_id
       ${where}
       GROUP BY st.id
       ORDER BY st.full_name ASC, st.id ASC`,
      params,
      query,
    );
  }
}
