import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamSessionScans1794010000000 implements MigrationInterface {
  name = 'CreateExamSessionScans1794010000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE examination_session_scan_files (
          id SERIAL PRIMARY KEY,
  
          examination_session_id INTEGER NOT NULL
            REFERENCES examination_sessions(id)
            ON DELETE RESTRICT,
  
          uploaded_by_user_id INTEGER NOT NULL
            REFERENCES users(id)
            ON DELETE RESTRICT,
  
          original_name VARCHAR(255) NOT NULL,
          storage_key VARCHAR(120) NOT NULL UNIQUE,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes BIGINT NOT NULL,
          sha256 VARCHAR(64) NOT NULL,
  
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT chk_exam_scan_size
            CHECK (size_bytes > 0)
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_exam_session_scan_files
        ON examination_session_scan_files (
          examination_session_id,
          created_at DESC,
          id DESC
        )
      `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP TABLE IF EXISTS examination_session_scan_files
      `);
  }
}
