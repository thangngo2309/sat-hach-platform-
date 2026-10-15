import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

import { parseBc2 } from './bc2-parser.js';

@Injectable()
export class Bc2ImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private read(file?: Express.Multer.File) {
    if (!file?.buffer?.length || !/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('Vui lòng chọn file XML hợp lệ.');
    }

    return {
      document: parseBc2(file.buffer),
      hash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async preview(file?: Express.Multer.File) {
    const { document, hash } = this.read(file);

    const [existing, knownStudents, matchedBc1] = await Promise.all([
      this.dataSource.query(
        `SELECT id FROM import_batches WHERE file_sha256 = $1`,
        [hash],
      ),
      this.dataSource.query(
        `SELECT registration_code
           FROM students WHERE registration_code = ANY($1::varchar[])`,
        [document.students.map((s) => s.registrationCode)],
      ),
      document.report.bc1Code
        ? this.dataSource.query(
            `SELECT c.id, c.code, c.name
               FROM courses c
               JOIN training_schools s ON s.id = c.school_id
               WHERE s.code = $1 AND c.bc1_code = $2`,
            [document.report.schoolCode, document.report.bc1Code],
          )
        : Promise.resolve([]),
    ]);

    const knownCodes = new Set<string>(
      knownStudents.map(
        (s: { registration_code: string }) => s.registration_code,
      ),
    );

    return {
      type: 'BC2',
      fileName: file!.originalname,
      fileSize: file!.size,
      sha256: hash,
      alreadyImported: existing.length > 0,
      existingImportId: existing[0]?.id ?? null,
      report: document.report,
      totalCandidates: document.students.length,
      existingStudents: document.students.filter((s) =>
        knownCodes.has(s.registrationCode),
      ).length,
      newStudents: document.students.filter(
        (s) => !knownCodes.has(s.registrationCode),
      ).length,
      bc1MatchStatus:
        matchedBc1.length === 1
          ? 'matched'
          : matchedBc1.length > 1
            ? 'ambiguous'
            : 'unmatched',
      matchedCourses: matchedBc1,
      students: document.students.slice(0, 100).map((student) => ({
        order: student.order,
        registrationCode: student.registrationCode,
        fullName: student.fullName,
        dateOfBirth: student.dateOfBirth,
        identityNumber: student.identityNumber,
        fileNumber: student.fileNumber,
        requestedLicenseClass: student.requestedLicenseClass,
        alreadyExists: knownCodes.has(student.registrationCode),
      })),
      previewLimit: 100,
    };
  }

  async confirm(file: Express.Multer.File | undefined, userId: number) {
    const { document, hash } = this.read(file);

    return this.dataSource.transaction(async (manager) => {
      const batches = await manager.query(
        `INSERT INTO import_batches (
            type, file_name, file_sha256, file_size,
            report_code, source_transaction_code,
            school_code, total_records, imported_by
          )
          VALUES ('BC2', $1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (file_sha256) DO NOTHING
          RETURNING id`,
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
        throw new ConflictException('File BC2 này đã được import.');
      }

      const batchId = Number(batches[0].id);

      const schools = await manager.query(
        `INSERT INTO training_schools (code, name)
           VALUES ($1, $2)
           ON CONFLICT (code) DO UPDATE SET
             name = CASE
               WHEN training_schools.name = training_schools.code
               THEN EXCLUDED.name
               ELSE training_schools.name
             END,
             updated_at = NOW()
           RETURNING id`,
        [
          document.report.schoolCode,
          document.senderName || document.report.schoolCode,
        ],
      );

      const schoolId = Number(schools[0].id);

      const reports = await manager.query(
        `INSERT INTO bc2_reports (
            import_batch_id, school_id, bc2_code, bc1_code,
            document_number, document_date,
            declared_candidate_count, actual_candidate_count,
            training_class, license_class, source_transaction_code
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
        [
          batchId,
          schoolId,
          document.report.bc2Code,
          document.report.bc1Code,
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
      let newStudents = 0;

      for (const student of document.students) {
        const inserted = await manager.query(
          `INSERT INTO students (
              registration_code, full_name, family_name,
              given_name, date_of_birth, identity_number
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (registration_code) DO NOTHING
            RETURNING id`,
          [
            student.registrationCode,
            student.fullName,
            student.familyName,
            student.givenName,
            student.dateOfBirth,
            student.identityNumber,
          ],
        );

        let studentId: number;

        if (inserted.length) {
          studentId = Number(inserted[0].id);
          newStudents++;
        } else {
          const found = await manager.query(
            `SELECT id FROM students WHERE registration_code = $1`,
            [student.registrationCode],
          );

          if (!found.length) {
            throw new ConflictException(
              `Không tìm thấy học viên ${student.registrationCode}.`,
            );
          }

          studentId = Number(found[0].id);
        }

        await manager.query(
          `INSERT INTO bc2_candidates (
              report_id, student_id, source_order,
              file_number, requested_license_class,
              previous_license_number, previous_license_class,
              completion_certificate_number, certificate_number,
              medical_certificate, exam_content_code, note, source_data
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12, $13::jsonb
            )`,
          [
            reportId,
            studentId,
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

      await manager.query(
        `UPDATE import_batches
           SET new_students = $2
           WHERE id = $1`,
        [batchId, newStudents],
      );

      return {
        id: batchId,
        reportId,
        bc2Code: document.report.bc2Code,
        bc1Code: document.report.bc1Code,
        totalCandidates: document.students.length,
        newStudents,
        existingStudents: document.students.length - newStudents,
      };
    });
  }

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
        JOIN training_schools s ON s.id = r.school_id
        JOIN import_batches b ON b.id = r.import_batch_id
        LEFT JOIN users u ON u.id = b.imported_by
        ORDER BY b.imported_at DESC, r.id DESC
        LIMIT 100
      `);
  }

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
      `SELECT COUNT(*)::int AS total
         FROM bc2_candidates WHERE report_id = $1`,
      [reportId],
    );

    const data = await this.dataSource.query(
      `SELECT
          bc.id,
          bc.source_order AS "sourceOrder",
          st.registration_code AS "registrationCode",
          st.full_name AS "fullName",
          st.date_of_birth AS "dateOfBirth",
          st.identity_number AS "identityNumber",
          bc.file_number AS "fileNumber",
          bc.requested_license_class AS "requestedLicenseClass",
          bc.previous_license_class AS "previousLicenseClass",
          bc.exam_content_code AS "examContentCode"
         FROM bc2_candidates bc
         JOIN students st ON st.id = bc.student_id
         WHERE bc.report_id = $1
         ORDER BY bc.source_order ASC NULLS LAST, bc.id ASC
         LIMIT $2 OFFSET $3`,
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
