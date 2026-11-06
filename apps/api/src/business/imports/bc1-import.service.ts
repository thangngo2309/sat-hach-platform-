import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

import { parseBc1 } from './bc1-parser.js';
import { extractStudentPhotoMap } from './student-photo-xml.util.js';
import { StudentPhotoService } from '../students/student-photo.service.js';

@Injectable()
export class Bc1ImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly studentPhotoService: StudentPhotoService,
  ) {}

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file XML.');
    }

    if (!/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('Chỉ hỗ trợ file .xml.');
    }

    return {
      document: parseBc1(file.buffer),
      hash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async preview(file: Express.Multer.File | undefined) {
    const { document, hash } = this.validateFile(file);

    const existing = await this.dataSource.query(
      `
        SELECT id, imported_at
        FROM import_batches
        WHERE file_sha256 = $1
        LIMIT 1
      `,
      [hash],
    );

    return {
      type: 'BC1',
      fileName: file!.originalname,
      fileSize: file!.size,
      sha256: hash,
      alreadyImported: existing.length > 0,
      existingImportId: existing[0]?.id ?? null,
      reportCode: document.reportCode,
      transactionCode: document.transactionCode,
      school: document.school,
      course: document.course,
      totalStudents: document.students.length,
      students: document.students.slice(0, 100),
      previewLimit: 100,
    };
  }

  async confirm(file: Express.Multer.File | undefined, userId: number) {
    const { document, hash } = this.validateFile(file);

    const photos = extractStudentPhotoMap(file!.buffer, 'BAO_CAO1');

    return this.dataSource.transaction(async (manager) => {
      const batchRows = await manager.query(
        `
          INSERT INTO import_batches (
            type,
            file_name,
            file_sha256,
            file_size,
            report_code,
            source_transaction_code,
            school_code,
            course_code,
            total_records,
            imported_by
          )
          VALUES (
            'BC1', $1, $2, $3, $4,
            $5, $6, $7, $8, $9
          )
          ON CONFLICT (file_sha256) DO NOTHING
          RETURNING id
        `,
        [
          file!.originalname,
          hash,
          file!.size,
          document.reportCode,
          document.transactionCode,
          document.school.code,
          document.course.code,
          document.students.length,
          userId,
        ],
      );

      if (!batchRows.length) {
        throw new ConflictException('File XML này đã được import trước đó.');
      }

      const batchId = Number(batchRows[0].id);

      /**
       * Tạo cơ sở đào tạo nếu chưa tồn tại.
       *
       * Khi mã đã tồn tại, ưu tiên cập nhật
       * thông tin có trong XML.
       *
       * Không sử dụng dữ liệu rỗng để xóa
       * tỉnh/thành đã lưu trước đó.
       */
      const schoolRows = await manager.query(
        `
          INSERT INTO training_schools (
            code,
            name,
            province_code,
            province_name,
            info_source
          )
          VALUES ($1, $2, $3, $4, 'xml')

          ON CONFLICT (code) DO UPDATE SET

            name = EXCLUDED.name,

            province_code = COALESCE(
              EXCLUDED.province_code,
              training_schools.province_code
            ),

            province_name = COALESCE(
              EXCLUDED.province_name,
              training_schools.province_name
            ),

            updated_at = NOW()

          RETURNING id
        `,
        [
          document.school.code,
          document.school.name,
          document.school.provinceCode,
          document.school.provinceName,
        ],
      );

      const schoolId = Number(schoolRows[0].id);

      /**
       * Khóa học được nhận diện theo:
       * school_id + course.code.
       *
       * Nếu đã tồn tại, cập nhật thông tin
       * theo BC1 mới nhất.
       */
      const courseRows = await manager.query(
        `
          INSERT INTO courses (
            school_id,
            code,
            name,
            bc1_code,
            license_class,
            training_class,
            opening_date,
            closing_date,
            declared_student_count
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9
          )

          ON CONFLICT (school_id, code) DO UPDATE SET

            name = EXCLUDED.name,

            bc1_code = COALESCE(
              EXCLUDED.bc1_code,
              courses.bc1_code
            ),

            license_class = COALESCE(
              EXCLUDED.license_class,
              courses.license_class
            ),

            training_class = COALESCE(
              EXCLUDED.training_class,
              courses.training_class
            ),

            opening_date = COALESCE(
              EXCLUDED.opening_date,
              courses.opening_date
            ),

            closing_date = COALESCE(
              EXCLUDED.closing_date,
              courses.closing_date
            ),

            declared_student_count =
              EXCLUDED.declared_student_count,

            updated_at = NOW()

          RETURNING id
        `,
        [
          schoolId,
          document.course.code,
          document.course.name,
          document.reportCode,
          document.course.licenseClass,
          document.course.trainingClass,
          document.course.openingDate,
          document.course.closingDate,
          document.course.declaredCount,
        ],
      );

      const courseId = Number(courseRows[0].id);

      let newStudents = 0;
      let newEnrollments = 0;
      let skippedEnrollments = 0;

      for (const student of document.students) {
        let studentId: number | null = null;

        const identityNumber =
          student.identityNumber?.replace(/\s+/g, '').trim() ?? '';

        const licenseClass =
          document.course.licenseClass?.trim().toUpperCase() ?? '';

        /**
         * 1. Kiểm tra mã đăng ký chính thức.
         *
         * Nếu mã đã có trong DB, không được
         * ghép với CCCD khác.
         */
        const byRegistration: Array<{
          id: number;
          identityNumber: string | null;
        }> = await manager.query(
          `
            SELECT
              id,
              identity_number AS "identityNumber"
            FROM students
            WHERE registration_code = $1
            FOR UPDATE
          `,
          [student.registrationCode],
        );

        if (byRegistration.length) {
          const existing = byRegistration[0];

          const existingIdentity =
            existing.identityNumber?.replace(/\s+/g, '').trim() ?? '';

          if (
            identityNumber &&
            existingIdentity &&
            identityNumber !== existingIdentity
          ) {
            throw new ConflictException(
              `Mã đăng ký ${student.registrationCode} ` + 'đã thuộc CCCD khác.',
            );
          }

          studentId = Number(existing.id);
        }

        /**
         * 2. Nếu chưa có mã đăng ký:
         *    tìm theo CCCD và hạng thi.
         *
         * Xét các nguồn:
         * - Hồ sơ tiếp nhận thí sinh tự do
         * - Khóa học đã ghi danh
         * - Danh sách sát hạch
         *
         * Không gộp nếu có hơn một học viên.
         */
        if (studentId === null && identityNumber && licenseClass) {
          const matches: Array<{ id: number }> = await manager.query(
            `
                SELECT s.id
                FROM students s

                WHERE regexp_replace(
                  COALESCE(s.identity_number, ''),
                  '[[:space:]]',
                  '',
                  'g'
                ) = $1

                AND (
                  EXISTS (
                    SELECT 1
                    FROM student_intakes si

                    WHERE si.student_id = s.id
                      AND (
                        UPPER(TRIM(
                          COALESCE(
                            si.requested_license_class,
                            ''
                          )
                        )) = $2

                        OR UPPER(TRIM(
                          COALESCE(
                            si.training_license_class,
                            ''
                          )
                        )) = $2
                      )
                  )

                  OR EXISTS (
                    SELECT 1
                    FROM enrollments e

                    JOIN courses c
                      ON c.id = e.course_id

                    WHERE e.student_id = s.id
                      AND UPPER(TRIM(
                        COALESCE(c.license_class, '')
                      )) = $2
                  )

                  OR EXISTS (
                    SELECT 1
                    FROM examination_candidates ec

                    WHERE ec.student_id = s.id
                      AND UPPER(TRIM(
                        COALESCE(ec.license_class, '')
                      )) = $2
                  )
                )

                ORDER BY s.id
                LIMIT 2
                FOR UPDATE OF s
              `,
            [identityNumber, licenseClass],
          );

          if (matches.length > 1) {
            throw new ConflictException(
              `CCCD ${identityNumber}, ` +
                `hạng ${licenseClass} ` +
                'khớp nhiều hồ sơ. ' +
                'Cần đối soát trước khi import BC1.',
            );
          }

          if (matches.length === 1) {
            studentId = Number(matches[0].id);
          }
        }

        /**
         * 3. Khi đã nhận diện được học viên:
         *
         * - Giữ nguyên students.id
         * - Giữ nguyên hồ sơ tiếp nhận
         * - Giữ nguyên ảnh và lịch sử
         * - Cập nhật mã đăng ký chính thức
         * - Ghi đè thông tin hợp lệ từ BC1
         *
         * Trường không có giá trị từ XML
         * giữ nguyên dữ liệu hiện tại.
         */
        if (studentId !== null) {
          await manager.query(
            `
              UPDATE students

              SET
                registration_code = $2,

                full_name = $3,

                family_name = COALESCE(
                  NULLIF($4::text, ''),
                  family_name
                ),

                given_name = COALESCE(
                  NULLIF($5::text, ''),
                  given_name
                ),

                date_of_birth = COALESCE(
                  $6::date,
                  date_of_birth
                ),

                gender = COALESCE(
                  NULLIF($7::text, ''),
                  gender
                ),

                identity_number = COALESCE(
                  NULLIF($8::text, ''),
                  identity_number
                ),

                nationality_code = COALESCE(
                  NULLIF($9::text, ''),
                  nationality_code
                ),

                nationality_name = COALESCE(
                  NULLIF($10::text, ''),
                  nationality_name
                ),

                permanent_address = COALESCE(
                  NULLIF($11::text, ''),
                  permanent_address
                ),

                current_address = COALESCE(
                  NULLIF($12::text, ''),
                  current_address
                ),

                updated_at = NOW()

              WHERE id = $1
            `,
            [
              studentId,
              student.registrationCode,
              student.fullName,
              student.familyName,
              student.givenName,
              student.dateOfBirth,
              student.gender,
              identityNumber || null,
              student.nationalityCode,
              student.nationalityName,
              student.permanentAddress,
              student.currentAddress,
            ],
          );
        }

        /**
         * 4. Chưa tìm được học viên phù hợp:
         *    tạo mới theo BC1.
         */
        if (studentId === null) {
          const insertedStudents: Array<{
            id: number;
          }> = await manager.query(
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
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11
              )

              ON CONFLICT (registration_code)
              DO NOTHING

              RETURNING id
            `,
            [
              student.registrationCode,
              student.fullName,
              student.familyName,
              student.givenName,
              student.dateOfBirth,
              student.gender,
              student.identityNumber,
              student.nationalityCode,
              student.nationalityName,
              student.permanentAddress,
              student.currentAddress,
            ],
          );

          if (insertedStudents.length) {
            studentId = Number(insertedStudents[0].id);
            newStudents++;
          } else {
            throw new ConflictException(
              `Mã đăng ký ${student.registrationCode} ` +
                'đã được tạo trong một giao dịch khác. ' +
                'Vui lòng kiểm tra và import lại.',
            );
          }
        }

        /**
         * 5. Lưu ảnh học viên từ BC1.
         *
         * Giữ cơ chế lưu ảnh hiện có.
         */
        const photoBase64 = photos.get(student.registrationCode);

        if (photoBase64) {
          await this.studentPhotoService.saveBase64(manager, {
            studentId,
            base64: photoBase64,
            sourceType: 'BC1',
            importBatchId: batchId,
          });
        }

        /**
         * 6. Ghi danh học viên vào khóa học.
         *
         * Nếu đã có ghi danh, cập nhật
         * dữ liệu file BC1 mới nhất.
         */
        const enrollmentRows = await manager.query(
          `
            INSERT INTO enrollments (
              course_id,
              student_id,
              file_number,
              source_order,
              source_import_id
            )

            VALUES ($1, $2, $3, $4, $5)

            ON CONFLICT (course_id, student_id)
            DO NOTHING

            RETURNING id
          `,
          [courseId, studentId, student.fileNumber, student.order, batchId],
        );

        if (enrollmentRows.length) {
          newEnrollments++;
        } else {
          await manager.query(
            `
              UPDATE enrollments

              SET
                file_number = COALESCE(
                  $3,
                  file_number
                ),

                source_order = COALESCE(
                  $4,
                  source_order
                ),

                source_import_id = $5

              WHERE course_id = $1
                AND student_id = $2
            `,
            [courseId, studentId, student.fileNumber, student.order, batchId],
          );

          skippedEnrollments++;
        }
      }

      /**
       * 7. Lưu thống kê import batch.
       */
      await manager.query(
        `
          UPDATE import_batches

          SET
            new_students = $2,
            new_enrollments = $3,
            skipped_enrollments = $4

          WHERE id = $1
        `,
        [batchId, newStudents, newEnrollments, skippedEnrollments],
      );

      return {
        id: batchId,
        type: 'BC1',
        fileName: file!.originalname,
        school: document.school,
        course: document.course,
        totalStudents: document.students.length,
        newStudents,
        newEnrollments,
        skippedEnrollments,
      };
    });
  }

  async history(limit = 50) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);

    return this.dataSource.query(
      `
        SELECT
          b.id,
          b.type,
          b.file_name AS "fileName",
          b.file_sha256 AS "sha256",
          b.report_code AS "reportCode",
          b.school_code AS "schoolCode",
          b.course_code AS "courseCode",
          b.total_records AS "totalStudents",
          b.new_students AS "newStudents",
          b.new_enrollments AS "newEnrollments",
          b.skipped_enrollments AS "skippedEnrollments",
          b.imported_at AS "importedAt",
          u.username AS "importedBy"

        FROM import_batches b

        LEFT JOIN users u
          ON u.id = b.imported_by

        WHERE b.type = 'BC1'

        ORDER BY
          b.imported_at DESC,
          b.id DESC

        LIMIT $1
      `,
      [safeLimit],
    );
  }
}
