import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExamSessionSecretaryAssignments1794000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * Mã theo dõi do thư ký nhập.
     *
     * Không thay đổi code, temp_code,
     * official_code hoặc ID kỳ sát hạch.
     */
    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS tracking_code
          VARCHAR(150)
      `);

    /**
     * Lịch sử phân công thư ký cho kỳ sát hạch.
     *
     * Mỗi bản ghi đại diện một lần phân công.
     * revoked_at = NULL là phân công hiện tại.
     */
    await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS
          examination_session_secretary_assignments (
            id SERIAL PRIMARY KEY,
  
            examination_session_id INTEGER NOT NULL
              REFERENCES examination_sessions(id)
              ON DELETE RESTRICT,
  
            secretary_user_id INTEGER NOT NULL
              REFERENCES users(id)
              ON DELETE RESTRICT,
  
            assigned_by_user_id INTEGER NOT NULL
              REFERENCES users(id)
              ON DELETE RESTRICT,
  
            assigned_at TIMESTAMPTZ NOT NULL
              DEFAULT NOW(),
  
            revoked_at TIMESTAMPTZ,
  
            revoked_by_user_id INTEGER
              REFERENCES users(id)
              ON DELETE SET NULL,
  
            note TEXT,
  
            created_at TIMESTAMPTZ NOT NULL
              DEFAULT NOW()
          )
      `);

    /**
     * Mỗi kỳ chỉ có một thư ký
     * đang được phân công tại một thời điểm.
     *
     * Các phân công cũ vẫn được lưu lại.
     */
    await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_exam_session_active_secretary
        ON examination_session_secretary_assignments (
          examination_session_id
        )
        WHERE revoked_at IS NULL
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_exam_session_secretary_user
        ON examination_session_secretary_assignments (
          secretary_user_id,
          examination_session_id
        )
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_exam_session_secretary_history
        ON examination_session_secretary_assignments (
          examination_session_id,
          assigned_at DESC
        )
      `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP TABLE IF EXISTS
          examination_session_secretary_assignments
      `);

    await queryRunner.query(`
        ALTER TABLE examination_sessions
        DROP COLUMN IF EXISTS tracking_code
      `);
  }
}
