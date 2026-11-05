import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrecreatedExaminationSessions1793900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Mã tạm ban đầu, được giữ lại sau khi có mã chính thức.
    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS temp_code VARCHAR(100)
      `);

    // Mã kỳ chính thức lấy từ file 48_.
    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS official_code VARCHAR(100)
      `);

    // Người tạo kỳ và ghi chú nghiệp vụ.
    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER
          REFERENCES users(id) ON DELETE SET NULL
      `);

    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS note TEXT
      `);

    // Các kỳ cũ được tạo qua import 48_ đã có mã chính thức.
    await queryRunner.query(`
        UPDATE examination_sessions
        SET official_code = code
        WHERE official_code IS NULL
          AND code NOT LIKE 'TEMP-%'
      `);

    await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_examination_sessions_temp_code
        ON examination_sessions(temp_code)
        WHERE temp_code IS NOT NULL
      `);

    await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_examination_sessions_official_code
        ON examination_sessions(official_code)
        WHERE official_code IS NOT NULL
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_examination_sessions_center_date
        ON examination_sessions(
          examination_center_id,
          exam_date
        )
      `);

    // Gắn hồ sơ gửi lên với kỳ sát hạch.
    // BC1 vẫn có thể để NULL vì không phụ thuộc kỳ.
    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS examination_session_id INTEGER
          REFERENCES examination_sessions(id)
          ON DELETE RESTRICT
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_file_submissions_exam_session
        ON file_submissions(examination_session_id)
        WHERE examination_session_id IS NOT NULL
      `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP INDEX IF EXISTS
          idx_file_submissions_exam_session
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS examination_session_id
      `);

    await queryRunner.query(`
        DROP INDEX IF EXISTS
          idx_examination_sessions_center_date
      `);

    await queryRunner.query(`
        DROP INDEX IF EXISTS
          uq_examination_sessions_official_code
      `);

    await queryRunner.query(`
        DROP INDEX IF EXISTS
          uq_examination_sessions_temp_code
      `);

    await queryRunner.query(`
        ALTER TABLE examination_sessions
        DROP COLUMN IF EXISTS note,
        DROP COLUMN IF EXISTS created_by_user_id,
        DROP COLUMN IF EXISTS official_code,
        DROP COLUMN IF EXISTS temp_code
      `);
  }
}
