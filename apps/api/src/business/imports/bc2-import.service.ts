import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';

import { parseBc2, type Bc2Document, type Bc2Student } from './bc2-parser.js';

type Bc1Course = {
  id: number;
  code: string;
  name: string;
  licenseClass: string | null;
};

type StudentMatch = {
  studentId: number;
  registrationCode: string;
  matchMethod: 'registration_code' | 'identity_number';
  courseId: number;
};

type StudentMatchResult = {
  student: Bc2Student;
  match: StudentMatch | null;
  error: string | null;
};

@Injectable()
export class Bc2ImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Đọc và kiểm tra file BC2.
   *
   * Không xử lý ghi database tại đây.
   */
  private read(file?: Express.Multer.File) {
    if (!file?.buffer?.length || !/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('Vui lòng chọn file XML hợp lệ.');
    }

    return {
      document: parseBc2(file.buffer),
      hash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  /**
   * Chuẩn hóa CCCD phục vụ đối chiếu.
   */
  private normalizeIdentity(value: string | null): string {
    return (value ?? '').replace(/\s+/g, '').trim();
  }

  /**
   * BC2 phải có mã BC1 tham chiếu.
   *
   * Mã lấy từ:
   * BAO_CAO2.DATA.BCII.MA_BCI
   */
  private requireBc1Code(document: Bc2Document): string {
    const bc1Code = document.report.bc1Code?.trim();

    if (!bc1Code) {
      throw new BadRequestException(
        'File BC2 chưa có mã BC1 tham chiếu (MA_BCI). ' +
          'Không thể import BC2 khi chưa xác định được BC1.',
      );
    }

    return bc1Code;
  }

  /**
   * Tìm các khóa học thuộc BC1 đã import.
   *
   * Không chỉ kiểm tra c.bc1_code.
   * Phải có import_batches loại BC1 tương ứng
   * với mã CSĐT, mã BC1 và mã khóa.
   *
   * Một BC1 có thể có nhiều khóa học, vì vậy
   * trả danh sách khóa để kiểm tra ghi danh.
   */
  private async findImportedBc1Courses(
    executor: DataSource | EntityManager,
    document: Bc2Document,
  ): Promise<Bc1Course[]> {
    const bc1Code = this.requireBc1Code(document);

    const rows: Bc1Course[] = await executor.query(
      `
        SELECT DISTINCT
          c.id,
          c.code,
          c.name,
          c.license_class AS "licenseClass"

        FROM courses c

        JOIN training_schools ts
          ON ts.id = c.school_id

        WHERE ts.code = $1
          AND c.bc1_code = $2

          AND EXISTS (
            SELECT 1
            FROM import_batches ib
            WHERE ib.type = 'BC1'
              AND ib.school_code = ts.code
              AND ib.report_code = c.bc1_code
              AND ib.course_code = c.code
          )

        ORDER BY c.id
      `,
      [document.report.schoolCode.trim(), bc1Code],
    );

    return rows;
  }

  /**
   * Kiểm tra BC1 bắt buộc phải có trước BC2.
   *
   * Không tạo khóa học hoặc CSĐT mới
   * trong quá trình import BC2.
   */
  private async requireImportedBc1(
    executor: DataSource | EntityManager,
    document: Bc2Document,
  ): Promise<Bc1Course[]> {
    const courses = await this.findImportedBc1Courses(executor, document);

    if (courses.length === 0) {
      throw new BadRequestException(
        `Chưa tìm thấy BC1 đã import thành công ` +
          `có mã ${this.requireBc1Code(document)} ` +
          `thuộc cơ sở đào tạo ${document.report.schoolCode}. ` +
          'Vui lòng import BC1 trước khi import BC2.',
      );
    }

    return courses;
  }

  /**
   * Tìm học viên BC2 trong các khóa học BC1.
   *
   * Ưu tiên:
   * 1. Mã đăng ký MA_DK khớp trực tiếp.
   * 2. CCCD khớp học viên nhập tay đã được
   *    ghi danh vào khóa BC1 tương ứng.
   *
   * Tuyệt đối không chọn một học viên
   * chỉ vì trùng CCCD nhưng chưa có
   * quan hệ ghi danh với BC1.
   */
  private async findStudentMatch(
    executor: DataSource | EntityManager,
    student: Bc2Student,
    courseIds: number[],
  ): Promise<StudentMatchResult> {
    const identity = this.normalizeIdentity(student.identityNumber);

    type CandidateRow = {
      id: number;
      registrationCode: string;
      identityNumber: string | null;
      sourceType: string | null;
      courseId: number;
    };

    const rows: CandidateRow[] = await executor.query(
      `
        SELECT DISTINCT
          s.id,
          s.registration_code AS "registrationCode",
          s.identity_number AS "identityNumber",
          s.source_type AS "sourceType",
          e.course_id AS "courseId"

        FROM enrollments e

        JOIN students s
          ON s.id = e.student_id

        WHERE e.course_id = ANY($1::int[])

          AND (
            s.registration_code = $2

            OR (
              $3::text <> ''
              AND s.source_type = 'manual'
              AND REGEXP_REPLACE(
                COALESCE(s.identity_number, ''),
                '[[:space:]]+',
                '',
                'g'
              ) = $3
            )
          )

        ORDER BY s.id, e.course_id
      `,
      [courseIds, student.registrationCode, identity],
    );

    const direct = rows.filter(
      (row) => row.registrationCode === student.registrationCode,
    );

    let matchingRows: CandidateRow[];
    let method: StudentMatch['matchMethod'];

    if (direct.length > 0) {
      matchingRows = direct;
      method = 'registration_code';
    } else {
      matchingRows = rows.filter(
        (row) =>
          row.sourceType === 'manual' &&
          identity !== '' &&
          this.normalizeIdentity(row.identityNumber) === identity,
      );

      method = 'identity_number';
    }

    const studentIds = [...new Set(matchingRows.map((row) => Number(row.id)))];

    if (studentIds.length === 0) {
      return {
        student,
        match: null,
        error:
          `Thí sinh ${student.fullName} ` +
          `(${student.registrationCode}) ` +
          'chưa có trong danh sách học viên ' +
          'đã ghi danh của BC1 tương ứng.',
      };
    }

    if (studentIds.length > 1) {
      return {
        student,
        match: null,
        error:
          `Thí sinh ${student.fullName} ` +
          `(${student.registrationCode}) ` +
          'khớp nhiều học viên trong BC1. ' +
          'Vui lòng kiểm tra dữ liệu trùng.',
      };
    }

    const row = matchingRows.find((item) => Number(item.id) === studentIds[0])!;

    const existingIdentity = this.normalizeIdentity(row.identityNumber);

    /**
     * Nếu cả hai bên có CCCD mà không khớp,
     * không được gộp dù mã đăng ký giống nhau.
     */
    if (identity && existingIdentity && identity !== existingIdentity) {
      return {
        student,
        match: null,
        error:
          `CCCD của thí sinh ${student.registrationCode} ` +
          'không khớp với học viên BC1.',
      };
    }

    return {
      student,
      match: {
        studentId: Number(row.id),
        registrationCode: row.registrationCode,
        matchMethod: method,
        courseId: Number(row.courseId),
      },
      error: null,
    };
  }

  /**
   * Đối chiếu toàn bộ thí sinh.
   *
   * Trả kết quả chi tiết để Preview hiển thị
   * và Confirm dùng lại cùng quy tắc.
   */
  private async matchStudents(
    executor: DataSource | EntityManager,
    document: Bc2Document,
    courses: Bc1Course[],
  ): Promise<StudentMatchResult[]> {
    const courseIds = courses.map((course) => Number(course.id));

    const results: StudentMatchResult[] = [];

    const usedStudentIds = new Set<number>();

    for (const student of document.students) {
      const result = await this.findStudentMatch(executor, student, courseIds);

      /**
       * Hai mã MA_DK khác nhau trong cùng BC2
       * không được liên kết cùng một student ID.
       */
      if (result.match) {
        if (usedStudentIds.has(result.match.studentId)) {
          results.push({
            student,
            match: null,
            error:
              `Thí sinh ${student.registrationCode} ` +
              'trùng học viên đã được đối chiếu ' +
              'ở một dòng khác trong BC2.',
          });

          continue;
        }

        usedStudentIds.add(result.match.studentId);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * PREVIEW BC2
   *
   * Không cho xem như hợp lệ khi BC1
   * chưa được import.
   */
  async preview(file?: Express.Multer.File) {
    const { document, hash } = this.read(file);

    const bc1Code = this.requireBc1Code(document);

    const [existing, matchedCourses] = await Promise.all([
      this.dataSource.query(
        `
          SELECT id
          FROM import_batches
          WHERE file_sha256 = $1
          LIMIT 1
        `,
        [hash],
      ),

      this.requireImportedBc1(this.dataSource, document),
    ]);

    const matches = await this.matchStudents(
      this.dataSource,
      document,
      matchedCourses,
    );

    const matchedCount = matches.filter((item) => item.match !== null).length;

    const unmatchedCount = matches.length - matchedCount;

    const matchedByIdentity = matches.filter(
      (item) => item.match?.matchMethod === 'identity_number',
    ).length;

    return {
      type: 'BC2',
      fileName: file!.originalname,
      fileSize: file!.size,
      sha256: hash,

      alreadyImported: existing.length > 0,
      existingImportId: existing[0]?.id ?? null,

      report: document.report,
      bc1Code,

      totalCandidates: document.students.length,

      existingStudents: matchedCount,
      newStudents: 0,

      matchedStudents: matchedCount,
      unmatchedStudents: unmatchedCount,
      matchedByIdentity,

      bc1MatchStatus: 'matched',
      matchedCourses,

      /**
       * Frontend có thể dựa vào canImport
       * để chặn nút xác nhận.
       *
       * Backend vẫn kiểm tra độc lập.
       */
      canImport: existing.length === 0 && unmatchedCount === 0,

      students: matches.slice(0, 100).map(({ student, match, error }) => ({
        order: student.order,
        registrationCode: student.registrationCode,
        fullName: student.fullName,
        dateOfBirth: student.dateOfBirth,
        identityNumber: student.identityNumber,
        fileNumber: student.fileNumber,
        requestedLicenseClass: student.requestedLicenseClass,

        alreadyExists: match !== null,
        matchedStudentId: match?.studentId ?? null,
        matchedRegistrationCode: match?.registrationCode ?? null,
        matchMethod: match?.matchMethod ?? null,
        error,
      })),

      previewLimit: 100,

      errors: matches
        .filter((item) => Boolean(item.error))
        .slice(0, 30)
        .map((item) => item.error),
    };
  }

  /**
   * CONFIRM BC2
   *
   * Thực hiện lại toàn bộ kiểm tra trong
   * transaction, không tin dữ liệu Preview.
   *
   * - BC1 bắt buộc đã import.
   * - Học viên BC2 phải thuộc BC1 tương ứng.
   * - Không tạo students mới.
   * - Không tạo courses mới.
   * - Không tạo training_schools mới.
   *
   * Nếu có lỗi, toàn bộ transaction rollback.
   */
  async confirm(file: Express.Multer.File | undefined, userId: number) {
    const { document, hash } = this.read(file);

    const bc1Code = this.requireBc1Code(document);

    return this.dataSource.transaction(async (manager) => {
      /**
       * 1. Kiểm tra BC1 đã import.
       */
      const matchedCourses = await this.requireImportedBc1(manager, document);

      /**
       * 2. Kiểm tra tất cả học viên
       *    đã có trong BC1.
       */
      const matches = await this.matchStudents(
        manager,
        document,
        matchedCourses,
      );

      const invalid = matches.filter(
        (item) => !item.match || Boolean(item.error),
      );

      if (invalid.length > 0) {
        const examples = invalid
          .slice(0, 5)
          .map(
            (item) =>
              item.error ??
              `Không đối chiếu được ${item.student.registrationCode}`,
          )
          .join(' ');

        throw new BadRequestException(
          `Không thể import BC2 vì có ` +
            `${invalid.length} thí sinh chưa khớp BC1. ` +
            examples,
        );
      }

      /**
       * 3. Lấy CSĐT đã tồn tại từ BC1.
       *
       * Không tự tạo CSĐT khi import BC2.
       */
      const schools: Array<{ id: number }> = await manager.query(
        `
            SELECT id
            FROM training_schools
            WHERE code = $1
            LIMIT 1
          `,
        [document.report.schoolCode],
      );

      if (!schools.length) {
        throw new BadRequestException('Chưa có cơ sở đào tạo của BC1.');
      }

      const schoolId = Number(schools[0].id);

      /**
       * 4. Ghi batch sau khi dữ liệu
       *    đã được kiểm tra hợp lệ.
       */
      const batches: Array<{ id: number }> = await manager.query(
        `
            INSERT INTO import_batches (
              type,
              file_name,
              file_sha256,
              file_size,
              report_code,
              source_transaction_code,
              school_code,
              total_records,
              imported_by
            )
            VALUES (
              'BC2', $1, $2, $3, $4,
              $5, $6, $7, $8
            )
            ON CONFLICT (file_sha256)
            DO NOTHING
            RETURNING id
          `,
        [
          file!.originalname,
          hash,
          file!.size,
          document.report.bc2Code,
          document.transactionCode,
          document.report.schoolCode,
          document.students.length,
          userId,
        ],
      );

      if (!batches.length) {
        throw new ConflictException('File BC2 này đã được import trước đó.');
      }

      const batchId = Number(batches[0].id);

      /**
       * 5. Tạo BC2, giữ mã BC1 tham chiếu.
       */
      const reports: Array<{ id: number }> = await manager.query(
        `
            INSERT INTO bc2_reports (
              import_batch_id,
              school_id,
              bc2_code,
              bc1_code,
              document_number,
              document_date,
              declared_candidate_count,
              actual_candidate_count,
              training_class,
              license_class,
              source_transaction_code
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11
            )
            RETURNING id
          `,
        [
          batchId,
          schoolId,
          document.report.bc2Code,
          bc1Code,
          document.report.documentNumber,
          document.report.documentDate,
          document.report.declaredCount,
          document.students.length,
          document.report.trainingClass,
          document.report.licenseClass,
          document.transactionCode,
        ],
      );

      const reportId = Number(reports[0].id);

      /**
       * 6. Chỉ liên kết học viên BC1 có sẵn.
       *
       * Không có INSERT INTO students.
       */
      for (const result of matches) {
        const student = result.student;
        const match = result.match!;

        await manager.query(
          `
            INSERT INTO bc2_candidates (
              report_id,
              student_id,
              source_order,
              file_number,
              requested_license_class,
              previous_license_number,
              previous_license_class,
              completion_certificate_number,
              certificate_number,
              medical_certificate,
              exam_content_code,
              note,
              source_data
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13::jsonb
            )
          `,
          [
            reportId,
            match.studentId,
            student.order,
            student.fileNumber,
            student.requestedLicenseClass,
            student.previousLicenseNumber,
            student.previousLicenseClass,
            student.completionCertificateNumber,
            student.certificateNumber,
            student.medicalCertificate,
            student.examContentCode,
            student.note,
            JSON.stringify(student.sourceData),
          ],
        );
      }

      /**
       * 7. BC2 không tạo học viên mới.
       */
      await manager.query(
        `
          UPDATE import_batches
          SET new_students = 0
          WHERE id = $1
        `,
        [batchId],
      );

      return {
        id: batchId,
        reportId,
        bc2Code: document.report.bc2Code,
        bc1Code,

        matchedCourses: matchedCourses.map((course) => ({
          id: course.id,
          code: course.code,
        })),

        totalCandidates: document.students.length,

        newStudents: 0,
        existingStudents: document.students.length,

        matchedByIdentity: matches.filter(
          (item) => item.match?.matchMethod === 'identity_number',
        ).length,

        linkedToBc1: true,
      };
    });
  }

  /**
   * LỊCH SỬ IMPORT BC2
   *
   * Giữ nguyên cấu trúc response.
   */
  async history() {
    return this.dataSource.query(`
      SELECT
        r.id,
        r.bc2_code AS "bc2Code",
        r.bc1_code AS "bc1Code",
        r.document_date AS "documentDate",
        r.actual_candidate_count AS "totalCandidates",
        s.code AS "schoolCode",
        s.name AS "schoolName",
        b.id AS "importId",
        b.file_name AS "fileName",
        b.new_students AS "newStudents",
        b.imported_at AS "importedAt",
        u.username AS "importedBy"
      FROM bc2_reports r
      JOIN training_schools s
        ON s.id = r.school_id
      JOIN import_batches b
        ON b.id = r.import_batch_id
      LEFT JOIN users u
        ON u.id = b.imported_by
      ORDER BY b.imported_at DESC, r.id DESC
      LIMIT 100
    `);
  }

  /**
   * DANH SÁCH THÍ SINH TRONG BC2
   *
   * Giữ nguyên phân trang và response.
   */
  async candidates(reportId: number, page: number, limit: number) {
    if (!Number.isSafeInteger(reportId) || reportId < 1) {
      throw new BadRequestException('Mã BC2 không hợp lệ.');
    }

    const safePage = Number.isSafeInteger(page)
      ? Math.min(Math.max(page, 1), 1000000)
      : 1;

    const safeLimit = Number.isSafeInteger(limit)
      ? Math.min(Math.max(limit, 1), 100)
      : 20;

    const counts = await this.dataSource.query(
      `
        SELECT COUNT(*)::int AS total
        FROM bc2_candidates
        WHERE report_id = $1
      `,
      [reportId],
    );

    const data = await this.dataSource.query(
      `
        SELECT
          bc.id,
          bc.source_order AS "sourceOrder",
          st.registration_code AS "registrationCode",
          st.full_name AS "fullName",
          st.date_of_birth AS "dateOfBirth",
          st.identity_number AS "identityNumber",
          bc.file_number AS "fileNumber",
          bc.requested_license_class
            AS "requestedLicenseClass",
          bc.previous_license_class
            AS "previousLicenseClass",
          bc.exam_content_code AS "examContentCode"

        FROM bc2_candidates bc

        JOIN students st
          ON st.id = bc.student_id

        WHERE bc.report_id = $1

        ORDER BY
          bc.source_order ASC NULLS LAST,
          bc.id ASC

        LIMIT $2 OFFSET $3
      `,
      [reportId, safeLimit, (safePage - 1) * safeLimit],
    );

    const total = Number(counts[0]?.total ?? 0);

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}
