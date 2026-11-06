import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { DataSource, type EntityManager } from 'typeorm';

import { UserRole } from '../../entities/user.entity.js';
import type { AuthUser } from '../../shared/types/auth-user.type.js';
import { parseExamResult } from '../imports/exam-result-parser.js';

export const PC08_RESULT_MAX_BYTES = 64 * 1024 * 1024;

const STORAGE_ROOT = resolve(
  process.env.FILE_STORAGE_DIR || join(process.cwd(), 'storage', 'submissions'),
);

const RESULT_DIR = join(STORAGE_ROOT, 'pc08-final-results');

type SessionRow = {
  id: number;
  code: string;
  officialCode: string | null;
  completedAt: Date | null;
};

type SchoolRow = {
  id: number;
  code: string;
  name: string;
  candidateCount: number;
};

type DeliveryRow = {
  id: number;
  examinationSessionId: number;
  trainingSchoolId: number;
  schoolCode: string;
  schoolName: string;
  status: 'pending' | 'approved' | 'rejected';
  currentVersion: number;
  originalName: string;
  sizeBytes: string;
  uploadedByUserId: number;
  reviewedByUserId: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  publishedAt: Date | null;
};

type StateRow = {
  revision: number;
  confirmedRevision: number | null;
  confirmedByUserId: number | null;
  confirmedAt: Date | null;
  confirmationNote: string | null;
  publishedAt: Date | null;
};

function positiveId(input: unknown, label: string): number {
  const value = String(input ?? '');

  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException(`${label} không hợp lệ.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`${label} không hợp lệ.`);
  }

  return parsed;
}

function code(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toUpperCase();
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    const codeValue =
      error && typeof error === 'object' && 'code' in error ? error.code : null;

    if (codeValue !== 'EXDEV') throw error;

    try {
      await copyFile(source, destination);
      await unlink(source);
    } catch (copyError) {
      await unlink(destination).catch(() => undefined);
      throw copyError;
    }
  }
}

@Injectable()
export class Pc08FinalResultsService {
  constructor(
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  private assertPc08(user: AuthUser): void {
    if (user.role !== UserRole.PC08_STAFF) {
      throw new ForbiddenException('Chỉ IT PC08 được thực hiện.');
    }
  }

  private assertAdmin(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Chỉ SUPER_ADMIN được phê duyệt KQSH cuối cùng.',
      );
    }
  }

  private async lockSession(
    manager: EntityManager,
    sessionId: number,
  ): Promise<SessionRow> {
    const rows: SessionRow[] = await manager.query(
      `
          SELECT
            id,
            code,
            official_code AS "officialCode",
            completed_at AS "completedAt"
          FROM examination_sessions
          WHERE id = $1
          FOR UPDATE
        `,
      [sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
    }

    return rows[0];
  }

  private async getSession(sessionId: number): Promise<SessionRow> {
    const rows: SessionRow[] = await this.db.query(
      `
          SELECT
            id,
            code,
            official_code AS "officialCode",
            completed_at AS "completedAt"
          FROM examination_sessions
          WHERE id = $1
        `,
      [sessionId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy kỳ sát hạch.');
    }

    return rows[0];
  }

  private async schools(
    manager: EntityManager,
    sessionId: number,
  ): Promise<SchoolRow[]> {
    return manager.query(
      `
          SELECT
            ts.id,
            ts.code,
            ts.name,
            COUNT(c.id)::int AS "candidateCount"
          FROM examination_candidates c
          JOIN training_schools ts
            ON ts.id = c.training_school_id
          WHERE c.examination_session_id = $1
            AND c.training_school_id IS NOT NULL
          GROUP BY ts.id, ts.code, ts.name
          ORDER BY ts.name, ts.id
        `,
      [sessionId],
    );
  }

  private async deliveries(
    manager: EntityManager,
    sessionId: number,
  ): Promise<DeliveryRow[]> {
    return manager.query(
      `
          SELECT
            d.id,
            d.examination_session_id AS "examinationSessionId",
            d.training_school_id AS "trainingSchoolId",
            ts.code AS "schoolCode",
            ts.name AS "schoolName",
            d.status,
            d.current_version AS "currentVersion",
            v.original_name AS "originalName",
            v.size_bytes::text AS "sizeBytes",
            d.uploaded_by_user_id AS "uploadedByUserId",
            d.reviewed_by_user_id AS "reviewedByUserId",
            d.reviewed_at AS "reviewedAt",
            d.rejection_reason AS "rejectionReason",
            d.published_at AS "publishedAt"
          FROM examination_session_pc08_result_deliveries d
          JOIN training_schools ts
            ON ts.id = d.training_school_id
          JOIN examination_session_pc08_result_versions v
            ON v.delivery_id = d.id
           AND v.version = d.current_version
          WHERE d.examination_session_id = $1
          ORDER BY ts.name, d.id
        `,
      [sessionId],
    );
  }

  private async getState(
    manager: EntityManager,
    sessionId: number,
  ): Promise<StateRow | null> {
    const rows: StateRow[] = await manager.query(
      `
          SELECT
            revision,
            confirmed_revision AS "confirmedRevision",
            confirmed_by_user_id AS "confirmedByUserId",
            confirmed_at AS "confirmedAt",
            confirmation_note AS "confirmationNote",
            published_at AS "publishedAt"
          FROM examination_session_pc08_result_states
          WHERE examination_session_id = $1
        `,
      [sessionId],
    );

    return rows[0] ?? null;
  }

  private async ensureState(
    manager: EntityManager,
    sessionId: number,
  ): Promise<void> {
    await manager.query(
      `
          INSERT INTO examination_session_pc08_result_states (
            examination_session_id
          )
          VALUES ($1)
          ON CONFLICT (examination_session_id) DO NOTHING
        `,
      [sessionId],
    );
  }

  /**
   * Mọi thay đổi bộ file làm mất hiệu lực
   * xác nhận trước đó của IT.
   */
  private async invalidateConfirmation(
    manager: EntityManager,
    sessionId: number,
  ): Promise<void> {
    await this.ensureState(manager, sessionId);

    await manager.query(
      `
          UPDATE examination_session_pc08_result_states
          SET
            revision = revision + 1,
            confirmed_revision = NULL,
            confirmed_by_user_id = NULL,
            confirmed_at = NULL,
            confirmation_note = NULL,
            updated_at = NOW()
          WHERE examination_session_id = $1
        `,
      [sessionId],
    );
  }

  /**
   * Chỉ IT được chỉ định trong KQSH ban đầu
   * đã được duyệt mới có thể xử lý kỳ này.
   *
   * Trường itOfficerUserId được Backend xác minh
   * khi TTSH upload KQSH.
   */
  private async assertAssignedIt(
    manager: EntityManager,
    sessionId: number,
    userId: number,
  ): Promise<void> {
    const rows: Array<{ itOfficerId: number | null }> = await manager.query(
      `
            SELECT
              NULLIF(
                v.document_metadata->>'itOfficerUserId',
                ''
              )::integer AS "itOfficerId"
            FROM file_submissions fs
            JOIN file_submission_versions v
              ON v.submission_id = fs.id
             AND v.version = fs.current_version
            WHERE fs.examination_session_id = $1
              AND fs.file_type = 'exam_result'
              AND fs.status = 'approved'
              AND fs.import_status = 'completed'
            ORDER BY fs.reviewed_at DESC, fs.id DESC
            LIMIT 1
          `,
      [sessionId],
    );

    if (!rows.length) {
      throw new ConflictException(
        'KQSH ban đầu của TTSH chưa được SUPER_ADMIN duyệt.',
      );
    }

    if (Number(rows[0].itOfficerId) !== userId) {
      throw new ForbiddenException(
        'Bạn không phải IT PC08 được phân công xử lý KQSH kỳ này.',
      );
    }
  }

  private async assertAssignedSchoolUser(
    manager: EntityManager,
    userId: number,
    schoolId: number,
  ): Promise<void> {
    const rows: Array<{ id: number }> = await manager.query(
      `
          SELECT 1 AS id
          FROM user_organization_assignments
          WHERE user_id = $1
            AND training_school_id = $2
          LIMIT 1
        `,
      [userId, schoolId],
    );

    if (!rows.length) {
      throw new ForbiddenException(
        'File KQSH không thuộc cơ sở đào tạo của bạn.',
      );
    }
  }

  /**
   * Kiểm tra KQSH PC08:
   * - Đúng MAKYSH
   * - Không có thí sinh ngoài CSĐT nhận
   * - Không thiếu thí sinh của CSĐT đó
   * - Không trùng MA_DK
   *
   * Không import kết quả lần thứ hai.
   */
  private async validateXml(
    manager: EntityManager,
    session: SessionRow,
    school: SchoolRow,
    buffer: Buffer,
  ): Promise<void> {
    const document = parseExamResult(buffer);

    const officialCode = code(session.officialCode || session.code);

    if (code(document.sessionCode) !== officialCode) {
      throw new BadRequestException(
        `MAKYSH trong KQSH (${document.sessionCode}) ` +
          `không khớp kỳ ${officialCode}.`,
      );
    }

    const candidates: Array<{ registrationCode: string }> = await manager.query(
      `
            SELECT registration_code AS "registrationCode"
            FROM examination_candidates
            WHERE examination_session_id = $1
              AND training_school_id = $2
          `,
      [session.id, school.id],
    );

    const expected = new Set(
      candidates.map((item) => code(item.registrationCode)),
    );

    if (!expected.size) {
      throw new BadRequestException(
        'CSĐT không có thí sinh trong kỳ sát hạch.',
      );
    }

    const actual = new Set<string>();

    for (const candidate of document.candidates) {
      const registration = code(candidate.registrationCode);

      if (!registration || actual.has(registration)) {
        throw new BadRequestException(
          `KQSH có MA_DK rỗng hoặc trùng: ${registration}.`,
        );
      }

      actual.add(registration);

      if (!expected.has(registration)) {
        throw new BadRequestException(
          `Thí sinh ${registration} không thuộc ` +
            `CSĐT ${school.name} trong kỳ này.`,
        );
      }
    }

    const missing = [...expected].filter(
      (registration) => !actual.has(registration),
    );

    if (missing.length) {
      throw new BadRequestException(
        `KQSH của ${school.name} còn thiếu ` +
          `${missing.length} thí sinh. ` +
          `Ví dụ: ${missing.slice(0, 5).join(', ')}.`,
      );
    }
  }

  async sessionStatus(user: AuthUser, sessionIdInput: number) {
    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    if (
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }

    const session = await this.getSession(sessionId);

    if (user.role === UserRole.PC08_STAFF) {
      await this.assertAssignedIt(this.db.manager, sessionId, user.sub);
    }

    const [schools, deliveries, state] = await Promise.all([
      this.schools(this.db.manager, sessionId),
      this.deliveries(this.db.manager, sessionId),
      this.getState(this.db.manager, sessionId),
    ]);

    const receivedIds = new Set(
      deliveries.map((item) => item.trainingSchoolId),
    );

    const missingSchools = schools.filter(
      (school) => !receivedIds.has(school.id),
    );

    const confirmationValid =
      state !== null &&
      state.confirmedRevision !== null &&
      state.confirmedRevision === state.revision;

    return {
      session,
      schools,
      deliveries,
      missingSchools,
      state,
      confirmationValid,
      canConfirm:
        !session.completedAt &&
        schools.length > 0 &&
        missingSchools.length === 0 &&
        deliveries.every(
          (item) => item.status === 'pending' || item.status === 'approved',
        ),
    };
  }

  async upload(
    user: AuthUser,
    sessionIdInput: number,
    schoolIdInput: number,
    file?: Express.Multer.File,
  ) {
    this.assertPc08(user);

    let destination: string | null = null;

    try {
      const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

      const schoolId = positiveId(schoolIdInput, 'ID cơ sở đào tạo');

      if (!file?.path || !/\.xml$/i.test(file.originalname)) {
        throw new BadRequestException('Vui lòng chọn file KQSH định dạng XML.');
      }

      const info = await stat(file.path);

      if (
        !info.isFile() ||
        info.size <= 0 ||
        info.size > PC08_RESULT_MAX_BYTES
      ) {
        throw new BadRequestException(
          'File KQSH phải có dung lượng tối đa 64 MB.',
        );
      }

      const buffer = await readFile(file.path);
      const sha256 = createHash('sha256').update(buffer).digest('hex');

      await mkdir(RESULT_DIR, { recursive: true });

      const storageKey = `${randomUUID()}.xml`;
      destination = join(RESULT_DIR, storageKey);

      /**
       * Di chuyển file trước transaction.
       * Nếu transaction lỗi sẽ dọn file.
       */
      await moveFile(file.path, destination);

      const result = await this.db.transaction(async (manager) => {
        const session = await this.lockSession(manager, sessionId);

        if (session.completedAt) {
          throw new ConflictException(
            'Kỳ sát hạch đã kết thúc, không thể gửi KQSH.',
          );
        }

        await this.assertAssignedIt(manager, sessionId, user.sub);

        const schools = await this.schools(manager, sessionId);

        const school = schools.find((item) => item.id === schoolId);

        if (!school) {
          throw new BadRequestException(
            'CSĐT không có thí sinh trong kỳ sát hạch.',
          );
        }

        await this.validateXml(manager, session, school, buffer);

        const existing: Array<{
          id: number;
          status: string;
          currentVersion: number;
        }> = await manager.query(
          `
                SELECT
                  id,
                  status,
                  current_version AS "currentVersion"
                FROM examination_session_pc08_result_deliveries
                WHERE examination_session_id = $1
                  AND training_school_id = $2
                FOR UPDATE
              `,
          [sessionId, schoolId],
        );

        let deliveryId: number;
        let version: number;

        if (existing.length) {
          if (existing[0].status === 'approved') {
            throw new ConflictException(
              'File của CSĐT đã được duyệt. ' +
                'Không thể tự ý thay đổi kết quả.',
            );
          }

          deliveryId = Number(existing[0].id);
          version = Number(existing[0].currentVersion) + 1;

          await manager.query(
            `
                  UPDATE examination_session_pc08_result_deliveries
                  SET
                    current_version = $2,
                    status = 'pending',
                    uploaded_by_user_id = $3,
                    reviewed_by_user_id = NULL,
                    reviewed_at = NULL,
                    rejection_reason = NULL,
                    updated_at = NOW()
                  WHERE id = $1
                `,
            [deliveryId, version, user.sub],
          );
        } else {
          const rows: Array<{ id: number }> = await manager.query(
            `
                    INSERT INTO examination_session_pc08_result_deliveries (
                      examination_session_id,
                      training_school_id,
                      uploaded_by_user_id
                    )
                    VALUES ($1, $2, $3)
                    RETURNING id
                  `,
            [sessionId, schoolId, user.sub],
          );

          deliveryId = Number(rows[0].id);
          version = 1;
        }

        const originalName = basename(
          file.originalname.replace(/\\/g, '/'),
        ).slice(0, 255);

        await manager.query(
          `
                INSERT INTO examination_session_pc08_result_versions (
                  delivery_id,
                  version,
                  original_name,
                  storage_key,
                  size_bytes,
                  sha256,
                  uploaded_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `,
          [
            deliveryId,
            version,
            originalName,
            storageKey,
            info.size,
            sha256,
            user.sub,
          ],
        );

        await this.invalidateConfirmation(manager, sessionId);

        return { deliveryId, version };
      });

      destination = null;

      return {
        ...result,
        sessionId,
        schoolId,
        status: 'pending',
      };
    } finally {
      if (file?.path) {
        await unlink(file.path).catch(() => undefined);
      }

      if (destination) {
        await unlink(destination).catch(() => undefined);
      }
    }
  }

  async confirm(
    user: AuthUser,
    sessionIdInput: number,
    confirmation: boolean,
    noteInput?: string,
  ) {
    this.assertPc08(user);

    if (confirmation !== true) {
      throw new BadRequestException('Phải tích xác nhận đã gửi đầy đủ KQSH.');
    }

    const sessionId = positiveId(sessionIdInput, 'ID kỳ sát hạch');

    const note = String(noteInput ?? '')
      .normalize('NFC')
      .trim();

    if (note.length > 2000) {
      throw new BadRequestException('Ghi chú không được vượt quá 2000 ký tự.');
    }

    await this.db.transaction(async (manager) => {
      const session = await this.lockSession(manager, sessionId);

      if (session.completedAt) {
        throw new ConflictException('Kỳ sát hạch đã hoàn tất.');
      }

      await this.assertAssignedIt(manager, sessionId, user.sub);

      const schools = await this.schools(manager, sessionId);

      const deliveries = await this.deliveries(manager, sessionId);

      if (!schools.length) {
        throw new BadRequestException(
          'Kỳ chưa xác định được CSĐT cần nhận KQSH.',
        );
      }

      const expectedIds = new Set(schools.map((item) => item.id));

      const actualIds = new Set(
        deliveries.map((item) => item.trainingSchoolId),
      );

      if (
        schools.length !== deliveries.length ||
        [...expectedIds].some((schoolId) => !actualIds.has(schoolId))
      ) {
        throw new ConflictException('Chưa upload đầy đủ KQSH cho tất cả CSĐT.');
      }

      if (deliveries.some((item) => item.status === 'rejected')) {
        throw new ConflictException(
          'Có file bị từ chối. ' + 'IT phải thay file trước khi xác nhận lại.',
        );
      }

      await this.ensureState(manager, sessionId);

      await manager.query(
        `
            UPDATE examination_session_pc08_result_states
            SET
              confirmed_revision = revision,
              confirmed_by_user_id = $2,
              confirmed_at = NOW(),
              confirmation_note = $3,
              updated_at = NOW()
            WHERE examination_session_id = $1
          `,
        [sessionId, user.sub, note || null],
      );
    });

    return this.sessionStatus(user, sessionId);
  }

  /**
   * SUPER_ADMIN duyệt hoặc từ chối một file.
   *
   * Nếu bị từ chối, IT phải sửa file và
   * xác nhận lại bộ KQSH.
   *
   * Chỉ khi tất cả file được duyệt
   * mới phát hành và hoàn tất kỳ.
   */
  async review(
    user: AuthUser,
    deliveryIdInput: number,
    action: 'approve' | 'reject',
    reasonInput?: string,
  ) {
    this.assertAdmin(user);

    const deliveryId = positiveId(deliveryIdInput, 'ID file KQSH');

    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('Thao tác duyệt không hợp lệ.');
    }

    const reason = String(reasonInput ?? '')
      .normalize('NFC')
      .trim();

    if (action === 'reject' && !reason) {
      throw new BadRequestException('Phải nhập lý do từ chối.');
    }

    if (reason.length > 2000) {
      throw new BadRequestException('Lý do không được quá 2000 ký tự.');
    }

    return this.db.transaction(async (manager) => {
      const references: Array<{
        sessionId: number;
      }> = await manager.query(
        `
            SELECT
              examination_session_id AS "sessionId"
            FROM examination_session_pc08_result_deliveries
            WHERE id = $1
          `,
        [deliveryId],
      );

      if (!references.length) {
        throw new NotFoundException('Không tìm thấy file KQSH PC08.');
      }

      const sessionId = Number(references[0].sessionId);

      const session = await this.lockSession(manager, sessionId);

      if (session.completedAt) {
        throw new ConflictException(
          'Kỳ đã kết thúc, không thể thay đổi duyệt.',
        );
      }

      const deliveries = await this.deliveries(manager, sessionId);

      const selected = deliveries.find((item) => item.id === deliveryId);

      if (!selected) {
        throw new NotFoundException('Không tìm thấy file KQSH cần duyệt.');
      }

      if (selected.status !== 'pending') {
        throw new ConflictException('Chỉ được xử lý file đang chờ duyệt.');
      }

      const state = await this.getState(manager, sessionId);

      if (
        !state ||
        state.confirmedRevision === null ||
        state.confirmedRevision !== state.revision
      ) {
        throw new ConflictException(
          'IT PC08 chưa xác nhận đầy đủ bộ KQSH hiện tại.',
        );
      }

      await manager.query(
        `
            UPDATE examination_session_pc08_result_deliveries
            SET
              status = $2,
              reviewed_by_user_id = $3,
              reviewed_at = NOW(),
              rejection_reason = $4,
              updated_at = NOW()
            WHERE id = $1
          `,
        [
          deliveryId,
          action === 'approve' ? 'approved' : 'rejected',
          user.sub,
          action === 'reject' ? reason : null,
        ],
      );

      if (action === 'reject') {
        await this.invalidateConfirmation(manager, sessionId);

        return {
          deliveryId,
          sessionId,
          status: 'rejected',
          sessionCompleted: false,
          message:
            'Đã từ chối file. IT phải thay file ' + 'và xác nhận lại bộ KQSH.',
        };
      }

      const schools = await this.schools(manager, sessionId);

      const current = await this.deliveries(manager, sessionId);

      const expectedIds = new Set(schools.map((school) => school.id));

      const fullyApproved =
        schools.length > 0 &&
        current.length === schools.length &&
        current.every(
          (item) =>
            expectedIds.has(item.trainingSchoolId) &&
            item.status === 'approved',
        );

      if (!fullyApproved) {
        return {
          deliveryId,
          sessionId,
          status: 'approved',
          sessionCompleted: false,
        };
      }

      /**
       * Toàn bộ file đã duyệt:
       * phát hành trong transaction hiện tại.
       */
      await manager.query(
        `
            UPDATE examination_session_pc08_result_deliveries
            SET
              published_at = NOW(),
              updated_at = NOW()
            WHERE examination_session_id = $1
              AND status = 'approved'
              AND published_at IS NULL
          `,
        [sessionId],
      );

      await manager.query(
        `
            UPDATE examination_session_pc08_result_states
            SET
              published_at = NOW(),
              published_by_user_id = $2,
              updated_at = NOW()
            WHERE examination_session_id = $1
              AND confirmed_revision = revision
          `,
        [sessionId, user.sub],
      );

      await manager.query(
        `
            UPDATE examination_sessions
            SET
              completed_at = NOW(),
              completed_by_user_id = $2,
              updated_at = NOW()
            WHERE id = $1
              AND completed_at IS NULL
          `,
        [sessionId, user.sub],
      );

      return {
        deliveryId,
        sessionId,
        status: 'approved',
        sessionCompleted: true,
        message:
          'Đã phê duyệt, phát hành đầy đủ KQSH ' +
          'cho các CSĐT và hoàn tất kỳ sát hạch.',
      };
    });
  }

  async received(user: AuthUser) {
    if (user.role !== UserRole.TRAINING_SCHOOL) {
      throw new ForbiddenException('Chỉ CSĐT được xem KQSH đã trả.');
    }

    return this.db.query(
      `
          SELECT
            d.id,
            d.examination_session_id AS "examinationSessionId",
            es.code AS "sessionCode",
            d.training_school_id AS "trainingSchoolId",
            v.original_name AS "originalName",
            v.size_bytes::text AS "sizeBytes",
            d.published_at AS "publishedAt"
          FROM examination_session_pc08_result_deliveries d
  
          JOIN examination_sessions es
            ON es.id = d.examination_session_id
  
          JOIN examination_session_pc08_result_versions v
            ON v.delivery_id = d.id
           AND v.version = d.current_version
  
          JOIN user_organization_assignments a
            ON a.training_school_id = d.training_school_id
           AND a.user_id = $1
  
          WHERE d.status = 'approved'
            AND d.published_at IS NOT NULL
            AND es.completed_at IS NOT NULL
  
          ORDER BY d.published_at DESC, d.id DESC
        `,
      [user.sub],
    );
  }

  async download(
    user: AuthUser,
    deliveryIdInput: number,
  ): Promise<{
    absolutePath: string;
    filename: string;
    sizeBytes: number;
  }> {
    const deliveryId = positiveId(deliveryIdInput, 'ID file KQSH');

    if (
      user.role !== UserRole.PC08_STAFF &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.TRAINING_SCHOOL
    ) {
      throw new ForbiddenException();
    }

    const rows: Array<{
      sessionId: number;
      schoolId: number;
      status: string;
      publishedAt: Date | null;
      storageKey: string;
      originalName: string;
      sizeBytes: string;
      sha256: string;
    }> = await this.db.query(
      `
          SELECT
            d.examination_session_id AS "sessionId",
            d.training_school_id AS "schoolId",
            d.status,
            d.published_at AS "publishedAt",
            v.storage_key AS "storageKey",
            v.original_name AS "originalName",
            v.size_bytes::text AS "sizeBytes",
            v.sha256
          FROM examination_session_pc08_result_deliveries d
          JOIN examination_session_pc08_result_versions v
            ON v.delivery_id = d.id
           AND v.version = d.current_version
          WHERE d.id = $1
        `,
      [deliveryId],
    );

    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy file KQSH.');
    }

    const selected = rows[0];

    if (user.role === UserRole.TRAINING_SCHOOL) {
      if (selected.status !== 'approved' || !selected.publishedAt) {
        throw new ForbiddenException('KQSH chưa được phát hành.');
      }

      await this.assertAssignedSchoolUser(
        this.db.manager,
        user.sub,
        selected.schoolId,
      );
    }

    if (user.role === UserRole.PC08_STAFF) {
      await this.assertAssignedIt(
        this.db.manager,
        selected.sessionId,
        user.sub,
      );
    }

    if (!/^[a-f0-9-]{36}\.xml$/i.test(selected.storageKey)) {
      throw new ConflictException('Khóa lưu trữ file không hợp lệ.');
    }

    const absolutePath = join(RESULT_DIR, selected.storageKey);

    const info = await stat(absolutePath);

    if (!info.isFile() || info.size !== Number(selected.sizeBytes)) {
      throw new ConflictException('Dung lượng file trên máy chủ không khớp.');
    }

    if ((await hashFile(absolutePath)) !== selected.sha256.trim()) {
      throw new ConflictException('File KQSH không vượt qua kiểm tra SHA-256.');
    }

    return {
      absolutePath,
      filename: selected.originalName,
      sizeBytes: info.size,
    };
  }
}
