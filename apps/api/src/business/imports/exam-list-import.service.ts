import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

import { parseExamList, type ExamListCandidate } from './exam-list-parser.js';
import { extractStudentPhotoMap } from './student-photo-xml.util.js';
import { StudentPhotoService } from '../students/student-photo.service.js';

type IdRow = { id: number };

@Injectable()
export class ExamListImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly studentPhotoService: StudentPhotoService,
  ) {}

  private read(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file XML.');
    }

    if (!/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('Chỉ hỗ trợ file .xml.');
    }

    return {
      document: parseExamList(file.buffer),
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async preview(file: Express.Multer.File | undefined) {
    const { document, sha256 } = this.read(file);

    const existing: IdRow[] = await this.dataSource.query(
      'SELECT id FROM import_batches WHERE file_sha256 = $1',
      [sha256],
    );

    const byType = {
      training: 0,
      independent: 0,
      unknown: 0,
    };

    const schools = new Set<string>();
    const courses = new Set<string>();

    for (const candidate of document.candidates) {
      byType[candidate.candidateType]++;

      if (candidate.schoolCode) {
        schools.add(candidate.schoolCode);
      }

      if (candidate.schoolCode && candidate.courseCode) {
        courses.add(`${candidate.schoolCode}:${candidate.courseCode}`);
      }
    }

    return {
      type: 'EXAM_LIST' as const,
      fileName: file!.originalname,
      fileSize: file!.size,
      sha256,
      alreadyImported: existing.length > 0,
      existingImportId: existing[0]?.id ?? null,
      session: document.session,
      sourceUnitCode: document.sourceUnitCode,
      totalCandidates: document.candidates.length,
      byType,
      schoolCodes: [...schools].sort(),
      distinctCourses: courses.size,
      candidates: document.candidates.slice(0, 30),
      previewLimit: 30,
    };
  }

  private async ensureCenter(
    manager: EntityManager,
    code: string,
  ): Promise<number> {
    const rows: IdRow[] = await manager.query(
      `
        INSERT INTO examination_centers (
          code, name, name_source, is_active, last_seen_at
        )
        VALUES ($1, NULL, 'xml', TRUE, NOW())
        ON CONFLICT (code) DO UPDATE SET
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING id
        `,
      [code],
    );

    return Number(rows[0].id);
  }

  private async ensureSchool(
    manager: EntityManager,
    code: string,
  ): Promise<number> {
    const placeholder =
      code === '48099'
        ? 'Phòng cảnh sát giao thông'
        : `Cơ sở đào tạo ${code} (chưa xác minh)`;

    const rows: IdRow[] = await manager.query(
      `
        INSERT INTO training_schools (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO UPDATE SET
          updated_at = training_schools.updated_at
        RETURNING id
        `,
      [code, placeholder],
    );

    return Number(rows[0].id);
  }

  private async ensureCourse(
    manager: EntityManager,
    schoolId: number,
    code: string,
    licenseClass: string | null,
  ): Promise<number> {
    const placeholder = code.startsWith('AUTO-UNKNOWN-')
      ? `Khóa tạm ${code} (chưa xác minh)`
      : `Khóa học ${code} (chưa xác minh tên)`;

    const rows: IdRow[] = await manager.query(
      `
        INSERT INTO courses (
          school_id, code, name, license_class
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (school_id, code) DO UPDATE SET
          license_class = COALESCE(
            courses.license_class,
            EXCLUDED.license_class
          ),
          updated_at = NOW()
        RETURNING id
        `,
      [schoolId, code, placeholder, licenseClass],
    );

    return Number(rows[0].id);
  }

  private async findStudent(
    manager: EntityManager,
    candidate: ExamListCandidate,
  ): Promise<number | null> {
    const byRegistration: IdRow[] = await manager.query(
      `
        SELECT id
        FROM students
        WHERE registration_code = $1
        LIMIT 1
        `,
      [candidate.registrationCode],
    );

    if (byRegistration.length) {
      return Number(byRegistration[0].id);
    }

    // Nhận diện lại học viên BC1/BC2 có MA_DK khác file 48.
    // Chỉ ghép khi CCCD và ngày sinh đầy đủ, duy nhất.
    if (!candidate.identityNumber || !candidate.dateOfBirth) {
      return null;
    }

    const matches: Array<{
      id: number;
      fullName: string;
      dateOfBirth: string;
    }> = await manager.query(
      `
        SELECT id, full_name AS "fullName",
               date_of_birth::text AS "dateOfBirth"
        FROM students
        WHERE identity_number = $1
          AND date_of_birth = $2::date
        `,
      [candidate.identityNumber, candidate.dateOfBirth],
    );

    if (matches.length > 1) {
      throw new ConflictException(
        `Có nhiều hồ sơ học viên cùng CCCD và ngày sinh: ${candidate.registrationCode}.`,
      );
    }

    if (!matches.length) return null;

    const normalize = (value: string) =>
      value
        .normalize('NFC')
        .toLocaleUpperCase('vi-VN')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalize(matches[0].fullName) !== normalize(candidate.fullName)) {
      throw new ConflictException(
        `Thông tin nhân thân không khớp ở MA_DK ${candidate.registrationCode}.`,
      );
    }

    return Number(matches[0].id);
  }

  private async upsertStudent(
    manager: EntityManager,
    candidate: ExamListCandidate,
  ): Promise<{ id: number; created: boolean }> {
    const existingId = await this.findStudent(manager, candidate);

    if (existingId) {
      const existing: Array<{
        identityNumber: string | null;
        dateOfBirth: string | null;
      }> = await manager.query(
        `
          SELECT identity_number AS "identityNumber",
                 date_of_birth::text AS "dateOfBirth"
          FROM students
          WHERE id = $1
          `,
        [existingId],
      );

      const current = existing[0];

      if (
        current.identityNumber &&
        candidate.identityNumber &&
        current.identityNumber !== candidate.identityNumber
      ) {
        throw new ConflictException(
          `CCCD không khớp ở MA_DK ${candidate.registrationCode}.`,
        );
      }

      if (
        current.dateOfBirth &&
        candidate.dateOfBirth &&
        current.dateOfBirth !== candidate.dateOfBirth
      ) {
        throw new ConflictException(
          `Ngày sinh không khớp ở MA_DK ${candidate.registrationCode}.`,
        );
      }

      await manager.query(
        `
          UPDATE students
          SET
            identity_number = COALESCE(identity_number, $2),
            date_of_birth = COALESCE(date_of_birth, $3::date),
            gender = COALESCE(gender, $4),
            nationality_code = COALESCE(nationality_code, $5),
            candidate_type = $6,
            candidate_type_updated_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          `,
        [
          existingId,
          candidate.identityNumber,
          candidate.dateOfBirth,
          candidate.gender,
          candidate.nationalityCode,
          candidate.candidateType,
        ],
      );

      return { id: existingId, created: false };
    }

    const rows: IdRow[] = await manager.query(
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
          candidate_type,
          candidate_type_updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5::date,
          $6, $7, $8, $9, NOW()
        )
        RETURNING id
        `,
      [
        candidate.registrationCode,
        candidate.fullName,
        candidate.familyName,
        candidate.givenName,
        candidate.dateOfBirth,
        candidate.gender,
        candidate.identityNumber,
        candidate.nationalityCode,
        candidate.candidateType,
      ],
    );

    return { id: Number(rows[0].id), created: true };
  }

  async confirm(file: Express.Multer.File | undefined, userId: number) {
    const { document, sha256 } = this.read(file);
    const photos = extractStudentPhotoMap(file!.buffer, 'SAT_HACH');

    return this.dataSource.transaction(async (manager) => {
      const batchRows: IdRow[] = await manager.query(
        `
          INSERT INTO import_batches (
            type, file_name, file_sha256, file_size,
            report_code, source_transaction_code,
            total_records, imported_by
          )
          VALUES (
            'EXAM_LIST', $1, $2, $3,
            $4, $5, $6, $7
          )
          ON CONFLICT (file_sha256) DO NOTHING
          RETURNING id
          `,
        [
          file!.originalname,
          sha256,
          file!.size,
          document.session.code,
          document.transactionCode,
          document.candidates.length,
          userId,
        ],
      );

      if (!batchRows.length) {
        throw new ConflictException('File 48 này đã được import trước đó.');
      }

      const batchId = Number(batchRows[0].id);
      const centerId = await this.ensureCenter(
        manager,
        document.session.examinationCenterCode,
      );

      const examRows: IdRow[] = await manager.query(
        `
          INSERT INTO examination_sessions (
            code, examination_center_id,
            exam_date, exam_time,
            decision_number, decision_date,
            source_unit_code, source_unit_name,
            declared_count, last_import_id
          )
          VALUES (
            $1, $2, $3::date, $4,
            $5, $6::date, $7, $8,
            $9, $10
          )
          ON CONFLICT (code) DO UPDATE SET
            examination_center_id =
              EXCLUDED.examination_center_id,
            exam_date =
              COALESCE(EXCLUDED.exam_date, examination_sessions.exam_date),
            exam_time =
              COALESCE(EXCLUDED.exam_time, examination_sessions.exam_time),
            decision_number =
              COALESCE(EXCLUDED.decision_number, examination_sessions.decision_number),
            decision_date =
              COALESCE(EXCLUDED.decision_date, examination_sessions.decision_date),
            source_unit_code =
              COALESCE(EXCLUDED.source_unit_code, examination_sessions.source_unit_code),
            source_unit_name =
              COALESCE(EXCLUDED.source_unit_name, examination_sessions.source_unit_name),
            declared_count = EXCLUDED.declared_count,
            last_import_id = EXCLUDED.last_import_id,
            updated_at = NOW()
          RETURNING id
          `,
        [
          document.session.code,
          centerId,
          document.session.examDate,
          document.session.examTime,
          document.session.decisionNumber,
          document.session.decisionDate,
          document.sourceUnitCode,
          document.sourceUnitName,
          document.candidates.length,
          batchId,
        ],
      );

      const examId = Number(examRows[0].id);

      const schoolCache = new Map<string, number>();
      const courseCache = new Map<string, number>();

      let newSchools = 0;
      let newCourses = 0;
      let newStudents = 0;
      let linkedStudents = 0;
      let newCandidates = 0;
      let updatedCandidates = 0;
      let newEnrollments = 0;

      for (const candidate of document.candidates) {
        // Với hồ sơ không có MA_CSDT, dùng một mã riêng
        // để chứa khóa tạm; không tự coi là 48099.
        const schoolCode = candidate.schoolCode ?? 'UNASSIGNED';

        let schoolId = schoolCache.get(schoolCode);

        if (!schoolId) {
          const old: IdRow[] = await manager.query(
            'SELECT id FROM training_schools WHERE code = $1',
            [schoolCode],
          );

          schoolId = await this.ensureSchool(manager, schoolCode);

          if (!old.length) newSchools++;
          schoolCache.set(schoolCode, schoolId);
        }

        // Không tạo khóa chung cho mọi hạng hoặc mọi kỳ.
        // Khóa tạm gắn với kỳ và hạng bằng mã có thể nhận diện.
        const courseCode =
          candidate.courseCode ??
          `AUTO-UNKNOWN-${document.session.code}-${candidate.licenseClass ?? 'NA'}`;

        const cacheKey = `${schoolId}:${courseCode}`;

        let courseId = courseCache.get(cacheKey);

        if (!courseId) {
          const old: IdRow[] = await manager.query(
            `
              SELECT id FROM courses
              WHERE school_id = $1 AND code = $2
              `,
            [schoolId, courseCode],
          );

          courseId = await this.ensureCourse(
            manager,
            schoolId,
            courseCode,
            candidate.licenseClass,
          );

          if (!old.length) newCourses++;
          courseCache.set(cacheKey, courseId);
        }

        const student = await this.upsertStudent(manager, candidate);

        const photoBase64 = photos.get(candidate.registrationCode);
        if (photoBase64) {
          await this.studentPhotoService.saveBase64(manager, {
            studentId: student.id,
            base64: photoBase64,
            sourceType: 'EXAM_LIST',
            importBatchId: batchId,
          });
        }

        if (student.created) newStudents++;
        else linkedStudents++;

        // Một học viên không thể xuất hiện dưới hai mã dự thi
        // khác nhau trong cùng một kỳ mà không cần đối chiếu.
        const duplicatePerson: IdRow[] = await manager.query(
          `
            SELECT id FROM examination_candidates
            WHERE examination_session_id = $1
              AND student_id = $2
              AND registration_code <> $3
            `,
          [examId, student.id, candidate.registrationCode],
        );

        if (duplicatePerson.length) {
          throw new ConflictException(
            `Học viên xuất hiện nhiều MA_DK trong kỳ ${document.session.code}.`,
          );
        }

        const existingCandidate: IdRow[] = await manager.query(
          `
            SELECT id FROM examination_candidates
            WHERE examination_session_id = $1
              AND registration_code = $2
            `,
          [examId, candidate.registrationCode],
        );

        await manager.query(
          `
            INSERT INTO examination_candidates (
              examination_session_id, student_id,
              registration_code, examination_number,
              training_school_id, course_id,
              candidate_type, license_class,
              examination_content, file_number,
              source_import_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11
            )
            ON CONFLICT (
              examination_session_id, registration_code
            )
            DO UPDATE SET
              student_id = EXCLUDED.student_id,
              examination_number = EXCLUDED.examination_number,
              training_school_id = EXCLUDED.training_school_id,
              course_id = EXCLUDED.course_id,
              candidate_type = EXCLUDED.candidate_type,
              license_class = EXCLUDED.license_class,
              examination_content = EXCLUDED.examination_content,
              file_number = EXCLUDED.file_number,
              source_import_id = EXCLUDED.source_import_id,
              updated_at = NOW()
            `,
          [
            examId,
            student.id,
            candidate.registrationCode,
            candidate.examinationNumber,
            schoolId,
            courseId,
            candidate.candidateType,
            candidate.licenseClass,
            candidate.examinationContent,
            candidate.fileNumber,
            batchId,
          ],
        );

        if (existingCandidate.length) updatedCandidates++;
        else newCandidates++;

        const enrolled = await manager.query(
          `
            INSERT INTO enrollments (
              course_id, student_id,
              file_number, source_import_id
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (course_id, student_id) DO NOTHING
            RETURNING id
            `,
          [courseId, student.id, candidate.fileNumber, batchId],
        );

        if (enrolled.length) newEnrollments++;
      }

      await manager.query(
        `
          UPDATE import_batches
          SET new_students = $2,
              new_enrollments = $3,
              skipped_enrollments = $4
          WHERE id = $1
          `,
        [
          batchId,
          newStudents,
          newEnrollments,
          document.candidates.length - newEnrollments,
        ],
      );

      return {
        id: batchId,
        type: 'EXAM_LIST',
        sessionId: examId,
        sessionCode: document.session.code,
        examinationCenterCode: document.session.examinationCenterCode,
        totalCandidates: document.candidates.length,
        newSchools,
        newCourses,
        newStudents,
        linkedStudents,
        newCandidates,
        updatedCandidates,
        newEnrollments,
      };
    });
  }

  async history(limit = 50) {
    const safeLimit = Math.min(Math.max(1, limit || 50), 100);

    return this.dataSource.query(
      `
        SELECT
          id,
          file_name AS "fileName",
          report_code AS "sessionCode",
          total_records AS "totalCandidates",
          new_students AS "newStudents",
          new_enrollments AS "newEnrollments",
          imported_at AS "importedAt"
        FROM import_batches
        WHERE type = 'EXAM_LIST'
        ORDER BY id DESC
        LIMIT $1
        `,
      [safeLimit],
    );
  }
}
