import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

import {
  parseExamResult,
  type ExamResultDocument,
} from './exam-result-parser.js';
import { extractStudentPhotoMap } from './student-photo-xml.util.js';
import { StudentPhotoService } from '../students/student-photo.service.js';

type IdRow = { id: number };

type StoredCandidate = {
  id: number;
  studentId: number;
  registrationCode: string;
  examinationNumber: string | null;
  fullName: string;
  identityNumber: string | null;
};

@Injectable()
export class ExamResultImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly studentPhotoService: StudentPhotoService,
  ) {}

  private read(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file KQSH.');
    }

    if (!/\.xml$/i.test(file.originalname)) {
      throw new BadRequestException('Chỉ hỗ trợ file XML.');
    }

    return {
      document: parseExamResult(file.buffer),
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private normalizeIdentity(value: string | null): string | null {
    return value?.trim() || null;
  }

  private async validateCandidates(document: ExamResultDocument) {
    const sessions: IdRow[] = await this.dataSource.query(
      `
        SELECT id
        FROM examination_sessions
        WHERE code = $1
      `,
      [document.sessionCode],
    );

    if (!sessions.length) {
      throw new NotFoundException(
        `Chưa có kỳ sát hạch ${document.sessionCode}. Hãy import file 48 trước.`,
      );
    }

    const sessionId = Number(sessions[0].id);

    const stored: StoredCandidate[] = await this.dataSource.query(
      `
        SELECT
          ec.id,
          ec.student_id AS "studentId",
          ec.registration_code AS "registrationCode",
          ec.examination_number AS "examinationNumber",
          st.full_name AS "fullName",
          st.identity_number AS "identityNumber"
        FROM examination_candidates ec
        JOIN students st ON st.id = ec.student_id
        WHERE ec.examination_session_id = $1
      `,
      [sessionId],
    );

    const byRegistration = new Map(
      stored.map((candidate) => [candidate.registrationCode, candidate]),
    );

    const unmatched: string[] = [];
    const conflicts: string[] = [];

    for (const candidate of document.candidates) {
      const existing = byRegistration.get(candidate.registrationCode);

      if (!existing) {
        unmatched.push(candidate.registrationCode);
        continue;
      }

      if (
        candidate.examinationNumber &&
        existing.examinationNumber &&
        candidate.examinationNumber !== existing.examinationNumber
      ) {
        conflicts.push(
          `${candidate.registrationCode}: SBD không khớp (${existing.examinationNumber}/${candidate.examinationNumber})`,
        );
      }

      if (
        candidate.identityNumber &&
        existing.identityNumber &&
        this.normalizeIdentity(candidate.identityNumber) !==
          this.normalizeIdentity(existing.identityNumber)
      ) {
        conflicts.push(`${candidate.registrationCode}: CCCD không khớp`);
      }
    }

    const matched = document.candidates.length - unmatched.length;

    return {
      sessionId,
      expectedCandidates: stored.length,
      matched,
      unmatched,
      conflicts,
    };
  }

  async preview(file: Express.Multer.File | undefined) {
    const { document, sha256 } = this.read(file);

    const existing: IdRow[] = await this.dataSource.query(
      `
        SELECT id
        FROM import_batches
        WHERE file_sha256 = $1
      `,
      [sha256],
    );

    const validation = await this.validateCandidates(document);

    const byResult: Record<string, number> = {};
    let totalParts = 0;

    for (const candidate of document.candidates) {
      const status = candidate.resultStatus || 'EMPTY';

      byResult[status] = (byResult[status] ?? 0) + 1;
      totalParts += candidate.parts.length;
    }

    return {
      type: 'EXAM_RESULT' as const,
      fileName: file!.originalname,
      fileSize: file!.size,
      sha256,
      alreadyImported: existing.length > 0,
      existingImportId: existing[0]?.id ?? null,
      sessionCode: document.sessionCode,
      sourceUnitCode: document.sourceUnitCode,
      totalCandidates: document.candidates.length,
      totalParts,
      byResult,
      validation,
      canImport:
        !existing.length &&
        validation.unmatched.length === 0 &&
        validation.conflicts.length === 0,
      candidates: document.candidates.slice(0, 30),
    };
  }

  async confirm(file: Express.Multer.File | undefined, userId: number) {
    const { document, sha256 } = this.read(file);

    const photos = extractStudentPhotoMap(file!.buffer, 'SAT_HACH');

    const validation = await this.validateCandidates(document);

    if (validation.unmatched.length || validation.conflicts.length) {
      throw new ConflictException({
        message: 'Dữ liệu KQSH chưa khớp danh sách dự thi.',
        unmatched: validation.unmatched.slice(0, 30),
        conflicts: validation.conflicts.slice(0, 30),
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // Khóa kỳ thi để tránh import đồng thời.
      const locked: IdRow[] = await manager.query(
        `
          SELECT id
          FROM examination_sessions
          WHERE id = $1
          FOR UPDATE
        `,
        [validation.sessionId],
      );

      if (!locked.length) {
        throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
      }

      const batchRows: IdRow[] = await manager.query(
        `
          INSERT INTO import_batches (
            type,
            file_name,
            file_sha256,
            file_size,
            report_code,
            source_transaction_code,
            total_records,
            imported_by
          )
          VALUES (
            'EXAM_RESULT',
            $1, $2, $3, $4, $5, $6, $7
          )
          ON CONFLICT (file_sha256) DO NOTHING
          RETURNING id
        `,
        [
          file!.originalname,
          sha256,
          file!.size,
          document.sessionCode,
          document.transactionCode,
          document.candidates.length,
          userId,
        ],
      );

      if (!batchRows.length) {
        throw new ConflictException('File KQSH đã được import trước đó.');
      }

      const batchId = Number(batchRows[0].id);

      // Đối chiếu lại bên trong transaction.
      const stored: StoredCandidate[] = await manager.query(
        `
          SELECT
            ec.id,
            ec.student_id AS "studentId",
            ec.registration_code AS "registrationCode",
            ec.examination_number AS "examinationNumber",
            st.full_name AS "fullName",
            st.identity_number AS "identityNumber"
          FROM examination_candidates ec
          JOIN students st ON st.id = ec.student_id
          WHERE ec.examination_session_id = $1
          FOR UPDATE OF ec
        `,
        [validation.sessionId],
      );

      const candidateMap = new Map(
        stored.map((item) => [item.registrationCode, item]),
      );

      const resultCounts: Record<string, number> = {};
      let totalParts = 0;

      for (const candidate of document.candidates) {
        const current = candidateMap.get(candidate.registrationCode);

        if (!current) {
          throw new ConflictException(
            `Không tìm thấy thí sinh ${candidate.registrationCode} trong kỳ.`,
          );
        }

        if (
          candidate.examinationNumber &&
          current.examinationNumber &&
          candidate.examinationNumber !== current.examinationNumber
        ) {
          throw new ConflictException(
            `SBD không khớp: ${candidate.registrationCode}.`,
          );
        }

        if (
          candidate.identityNumber &&
          current.identityNumber &&
          candidate.identityNumber.trim() !== current.identityNumber.trim()
        ) {
          throw new ConflictException(
            `CCCD không khớp: ${candidate.registrationCode}.`,
          );
        }

        const photoBase64 = photos.get(candidate.registrationCode);

        if (photoBase64) {
          await this.studentPhotoService.saveBase64(manager, {
            studentId: current.studentId,
            base64: photoBase64,
            sourceType: 'EXAM_RESULT',
            importBatchId: batchId,
          });
        }

        await manager.query(
          `
            UPDATE examination_candidates
            SET
              result_status = $2,
              theory_score = $3,
              practical_score = $4,
              road_score = $5,
              result_import_id = $6,
              result_updated_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            current.id,
            candidate.resultStatus,
            candidate.theoryScore,
            candidate.practicalScore,
            candidate.roadScore,
            batchId,
          ],
        );

        // Kết quả mới thay thế chi tiết phần thi cũ.
        await manager.query(
          `
            DELETE FROM examination_candidate_results
            WHERE examination_candidate_id = $1
          `,
          [current.id],
        );

        for (let index = 0; index < candidate.parts.length; index++) {
          const part = candidate.parts[index];

          await manager.query(
            `
              INSERT INTO examination_candidate_results (
                examination_candidate_id,
                part_order,
                exam_type,
                result_status,
                exam_date,
                score,
                maximum_score,
                examiner,
                examiner_comment,
                note
              )
              VALUES (
                $1, $2, $3, $4, $5::date,
                $6, $7, $8, $9, $10
              )
            `,
            [
              current.id,
              index + 1,
              part.examType,
              part.resultStatus,
              part.examDate,
              part.score,
              part.maximumScore,
              part.examiner,
              part.examinerComment,
              part.note,
            ],
          );

          totalParts++;
        }

        const status = candidate.resultStatus || 'EMPTY';

        resultCounts[status] = (resultCounts[status] ?? 0) + 1;
      }

      return {
        id: batchId,
        type: 'EXAM_RESULT',
        sessionCode: document.sessionCode,
        totalCandidates: document.candidates.length,
        updatedCandidates: document.candidates.length,
        totalParts,
        byResult: resultCounts,
      };
    });
  }

  /**
   * Danh sách kỳ sát hạch.
   * "absent" đếm từng thí sinh, không đếm số phần thi.
   */
  async sessions() {
    return this.dataSource.query(
      `
        SELECT
          es.id,
          es.code,
          es.exam_date AS "examDate",
          ec.code AS "centerCode",
          ec.name AS "centerName",

          COUNT(c.id)::int AS "totalCandidates",

          COUNT(c.id) FILTER (
            WHERE c.result_import_id IS NOT NULL
          )::int AS "withResults",

          COUNT(c.id) FILTER (
            WHERE c.result_status = 'DA'
          )::int AS "passed",

          COUNT(c.id) FILTER (
            WHERE c.result_status = 'RO'
          )::int AS "failed",

          COUNT(c.id) FILTER (
            WHERE c.result_status = 'VA'
               OR EXISTS (
                 SELECT 1
                 FROM examination_candidate_results r
                 WHERE r.examination_candidate_id = c.id
                   AND r.result_status = 'VA'
               )
          )::int AS "absent"

        FROM examination_sessions es

        JOIN examination_centers ec
          ON ec.id = es.examination_center_id

        LEFT JOIN examination_candidates c
          ON c.examination_session_id = es.id

        GROUP BY es.id, ec.id

        ORDER BY
          es.exam_date DESC NULLS LAST,
          es.id DESC

        LIMIT 200
      `,
    );
  }

  /**
   * Trả danh sách kết quả và thống kê.
   *
   * Bộ lọc VA tìm các thí sinh có ít nhất một phần thi
   * vắng hoặc trạng thái tổng là VA.
   */
  async results(
    sessionCode: string,
    params: {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;
      candidateType?: string;
    },
  ) {
    const sessionRows: Array<{
      id: number;
      code: string;
      examDate: string | null;
      centerCode: string;
      centerName: string | null;
    }> = await this.dataSource.query(
      `
        SELECT
          es.id,
          es.code,
          es.exam_date AS "examDate",
          ec.code AS "centerCode",
          ec.name AS "centerName"

        FROM examination_sessions es

        JOIN examination_centers ec
          ON ec.id = es.examination_center_id

        WHERE es.code = $1
      `,
      [sessionCode],
    );

    const session = sessionRows[0];

    if (!session) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
    }

    const safeNumber = (
      raw: string | undefined,
      fallback: number,
      max: number,
    ) => {
      const n = Number(raw);

      return raw && Number.isSafeInteger(n) && n > 0
        ? Math.min(n, max)
        : fallback;
    };

    const page = safeNumber(params.page, 1, 1_000_000);

    const limit = safeNumber(params.limit, 20, 100);

    const search = (params.search ?? '').trim().slice(0, 150);

    const status = (params.status ?? '').trim();

    const candidateType = (params.candidateType ?? '').trim();

    const values: unknown[] = [session.id, search, status, candidateType];

    const where = `
      WHERE c.examination_session_id = $1

        AND (
          $2 = ''
          OR c.registration_code ILIKE '%' || $2 || '%'
          OR COALESCE(c.examination_number, '') ILIKE '%' || $2 || '%'
          OR st.full_name ILIKE '%' || $2 || '%'
          OR COALESCE(st.identity_number, '') ILIKE '%' || $2 || '%'
        )

        AND (
          $3 = ''

          OR (
            $3 = 'PENDING'
            AND c.result_import_id IS NULL
          )

          OR (
            $3 = 'VA'
            AND (
              c.result_status = 'VA'
              OR EXISTS (
                SELECT 1
                FROM examination_candidate_results ar
                WHERE ar.examination_candidate_id = c.id
                  AND ar.result_status = 'VA'
              )
            )
          )

          OR (
            $3 NOT IN ('VA', 'PENDING')
            AND c.result_status = $3
          )
        )

        AND (
          $4 = ''
          OR c.candidate_type = $4
        )
    `;

    const counts: Array<{
      total: string;
    }> = await this.dataSource.query(
      `
        SELECT COUNT(*)::text AS total
        FROM examination_candidates c
        JOIN students st ON st.id = c.student_id
        ${where}
      `,
      values,
    );

    const data = await this.dataSource.query(
      `
        SELECT
          c.id,
          c.registration_code AS "registrationCode",
          c.examination_number AS "examinationNumber",
          c.candidate_type AS "candidateType",
          c.license_class AS "licenseClass",
          c.result_status AS "resultStatus",
          c.theory_score AS "theoryScore",
          c.practical_score AS "practicalScore",
          c.road_score AS "roadScore",

          (
            c.result_import_id IS NOT NULL
          ) AS "hasResult",

          (
            c.result_status = 'VA'
            OR EXISTS (
              SELECT 1
              FROM examination_candidate_results ar
              WHERE ar.examination_candidate_id = c.id
                AND ar.result_status = 'VA'
            )
          ) AS "hasAbsentPart",

          st.id AS "studentId",
          (
            st.photo_id IS NOT NULL
          ) AS "hasPhoto",
          st.full_name AS "fullName",
          st.identity_number AS "identityNumber",

          s.code AS "schoolCode",
          s.name AS "schoolName",
          course.code AS "courseCode",

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
              ORDER BY r.part_order
            )

            FROM examination_candidate_results r

            WHERE r.examination_candidate_id = c.id
          ), '[]'::jsonb) AS parts

        FROM examination_candidates c

        JOIN students st
          ON st.id = c.student_id

        LEFT JOIN training_schools s
          ON s.id = c.training_school_id

        LEFT JOIN courses course
          ON course.id = c.course_id

        ${where}

        ORDER BY
          c.examination_number ASC NULLS LAST,
          c.id ASC

        LIMIT $5 OFFSET $6
      `,
      [...values, limit, (page - 1) * limit],
    );

    const summaryRows: Array<{
      total: number;
      withResults: number;
      passed: number;
      failed: number;
      absent: number;
      independent: number;
    }> = await this.dataSource.query(
      `
        SELECT
          COUNT(*)::int AS total,

          COUNT(*) FILTER (
            WHERE c.result_import_id IS NOT NULL
          )::int AS "withResults",

          COUNT(*) FILTER (
            WHERE c.result_status = 'DA'
          )::int AS passed,

          COUNT(*) FILTER (
            WHERE c.result_status = 'RO'
          )::int AS failed,

          COUNT(*) FILTER (
            WHERE c.result_status = 'VA'
               OR EXISTS (
                 SELECT 1
                 FROM examination_candidate_results r
                 WHERE r.examination_candidate_id = c.id
                   AND r.result_status = 'VA'
               )
          )::int AS absent,

          COUNT(*) FILTER (
            WHERE c.candidate_type = 'independent'
          )::int AS independent

        FROM examination_candidates c

        WHERE c.examination_session_id = $1
      `,
      [session.id],
    );

    const total = Number(counts[0]?.total ?? 0);

    return {
      session,
      summary: summaryRows[0],
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async history() {
    return this.dataSource.query(
      `
        SELECT
          id,
          file_name AS "fileName",
          report_code AS "sessionCode",
          total_records AS "totalCandidates",
          imported_at AS "importedAt"

        FROM import_batches

        WHERE type = 'EXAM_RESULT'

        ORDER BY id DESC

        LIMIT 100
      `,
    );
  }
}
