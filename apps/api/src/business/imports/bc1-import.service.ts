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
      `SELECT id, imported_at
         FROM import_batches
         WHERE file_sha256 = $1
         LIMIT 1`,
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
      // PostgreSQL unique constraint is the final safeguard
      // against importing identical content concurrently.
      const batchRows = await manager.query(
        `INSERT INTO import_batches (
            type, file_name, file_sha256, file_size,
            report_code, source_transaction_code,
            school_code, course_code,
            total_records, imported_by
          )
          VALUES (
            'BC1', $1, $2, $3,
            $4, $5, $6, $7, $8, $9
          )
          ON CONFLICT (file_sha256) DO NOTHING
          RETURNING id`,
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

      const schoolRows = await manager.query(
        `INSERT INTO training_schools (
            code, name, province_code, province_name
          )
          VALUES ($1, $2, $3, $4)
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
          RETURNING id`,
        [
          document.school.code,
          document.school.name,
          document.school.provinceCode,
          document.school.provinceName,
        ],
      );

      const schoolId = schoolRows[0].id;

      const courseRows = await manager.query(
        `INSERT INTO courses (
            school_id, code, name, bc1_code,
            license_class, training_class,
            opening_date, closing_date,
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
            declared_student_count = EXCLUDED.declared_student_count,
            updated_at = NOW()
          RETURNING id`,
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

      const courseId = courseRows[0].id;

      let newStudents = 0;
      let newEnrollments = 0;
      let skippedEnrollments = 0;

      for (const student of document.students) {
        const insertedStudents = await manager.query(
          `INSERT INTO students (
              registration_code, full_name,
              family_name, given_name,
              date_of_birth, gender,
              identity_number,
              nationality_code, nationality_name,
              permanent_address, current_address
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11
            )
            ON CONFLICT (registration_code) DO NOTHING
            RETURNING id`,
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

        let studentId: number;

        if (insertedStudents.length) {
          studentId = Number(insertedStudents[0].id);
          newStudents++;
        } else {
          const existingStudents = await manager.query(
            `SELECT id
               FROM students
               WHERE registration_code = $1`,
            [student.registrationCode],
          );

          if (!existingStudents.length) {
            throw new ConflictException(
              `Không tìm thấy hồ sơ học viên ${student.registrationCode}.`,
            );
          }

          studentId = Number(existingStudents[0].id);
        }

        const photoBase64 = photos.get(student.registrationCode);

        if (photoBase64) {
          await this.studentPhotoService.saveBase64(manager, {
            studentId,
            base64: photoBase64,
            sourceType: 'BC1',
            importBatchId: batchId,
          });
        }

        const enrollmentRows = await manager.query(
          `INSERT INTO enrollments (
              course_id, student_id, file_number,
              source_order, source_import_id
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (course_id, student_id) DO NOTHING
            RETURNING id`,
          [courseId, studentId, student.fileNumber, student.order, batchId],
        );

        if (enrollmentRows.length) {
          newEnrollments++;
        } else {
          skippedEnrollments++;
        }
      }

      await manager.query(
        `UPDATE import_batches SET
             new_students = $2,
             new_enrollments = $3,
             skipped_enrollments = $4
           WHERE id = $1`,
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
      `SELECT
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
        LEFT JOIN users u ON u.id = b.imported_by
        WHERE b.type = 'BC1'
        ORDER BY b.imported_at DESC, b.id DESC
        LIMIT $1`,
      [safeLimit],
    );
  }
}
