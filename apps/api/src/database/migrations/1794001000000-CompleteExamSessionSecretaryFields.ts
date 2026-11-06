import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteExamSessionSecretaryFields1794001000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(150)
      `);

    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
      `);

    await queryRunner.query(`
        ALTER TABLE examination_sessions
        ADD COLUMN IF NOT EXISTS completed_by_user_id INTEGER
          REFERENCES users(id)
          ON DELETE SET NULL
      `);

    await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          uq_examination_sessions_tracking_code
        ON examination_sessions (tracking_code)
        WHERE tracking_code IS NOT NULL
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_exam_session_secretary_user
        ON examination_session_secretary_assignments (
          secretary_user_id,
          examination_session_id
        )
        WHERE revoked_at IS NULL
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

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Không tự xóa dữ liệu từ migration cũ.
    // Rollback cần được đánh giá riêng khi đã có phân công.
  }
}
