import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileSubmissions1793520000000 implements MigrationInterface {
  name = 'CreateFileSubmissions1793520000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE file_submissions (
          id SERIAL PRIMARY KEY,
  
          file_type VARCHAR(30) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
          uploaded_by_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          training_school_id INTEGER NULL
            REFERENCES training_schools(id) ON DELETE RESTRICT,
  
          examination_center_id INTEGER NULL
            REFERENCES examination_centers(id) ON DELETE RESTRICT,
  
          note TEXT NULL,
          rejection_reason TEXT NULL,
  
          current_version INTEGER NOT NULL DEFAULT 1,
  
          reviewed_by_user_id INTEGER NULL
            REFERENCES users(id) ON DELETE SET NULL,
  
          reviewed_at TIMESTAMPTZ NULL,
  
          import_status VARCHAR(30) NOT NULL
            DEFAULT 'not_processed',
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT chk_file_submissions_type
            CHECK (file_type IN (
              'bc1',
              'bc2',
              'bc2_result',
              'exam_48',
              'exam_result'
            )),
  
          CONSTRAINT chk_file_submissions_status
            CHECK (status IN (
              'pending',
              'approved',
              'rejected'
            )),
  
          CONSTRAINT chk_file_submissions_import_status
            CHECK (import_status IN (
              'not_processed',
              'processing',
              'completed',
              'failed'
            )),
  
          CONSTRAINT chk_file_submissions_version
            CHECK (current_version >= 1)
        )
      `);

    await queryRunner.query(`
        CREATE TABLE file_submission_versions (
          id SERIAL PRIMARY KEY,
  
          submission_id INTEGER NOT NULL
            REFERENCES file_submissions(id) ON DELETE RESTRICT,
  
          version INTEGER NOT NULL,
  
          original_name VARCHAR(255) NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          mime_type VARCHAR(150) NOT NULL,
          size_bytes BIGINT NOT NULL,
          sha256 CHAR(64) NOT NULL,
  
          uploaded_by_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT uq_file_submission_version
            UNIQUE (submission_id, version),
  
          CONSTRAINT chk_file_submission_version_positive
            CHECK (version >= 1),
  
          CONSTRAINT chk_file_submission_size
            CHECK (size_bytes > 0)
        )
      `);

    await queryRunner.query(`
        CREATE TABLE file_submission_events (
          id BIGSERIAL PRIMARY KEY,
  
          submission_id INTEGER NOT NULL
            REFERENCES file_submissions(id) ON DELETE RESTRICT,
  
          actor_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          action VARCHAR(30) NOT NULL,
  
          detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT chk_file_submission_event_action
            CHECK (action IN (
              'created',
              'version_uploaded',
              'approved',
              'rejected',
              'downloaded'
            ))
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submissions_owner
        ON file_submissions(uploaded_by_user_id, created_at DESC)
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submissions_status
        ON file_submissions(status, created_at DESC)
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submissions_school
        ON file_submissions(training_school_id)
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submissions_center
        ON file_submissions(examination_center_id)
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submission_events_submission
        ON file_submission_events(submission_id, created_at DESC)
      `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_submission_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_submission_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS file_submissions`);
  }
}
