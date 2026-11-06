import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePc08FinalResults1794011000000 implements MigrationInterface {
  name = 'CreatePc08FinalResults1794011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE examination_session_pc08_result_states (
        examination_session_id INTEGER PRIMARY KEY
          REFERENCES examination_sessions(id)
          ON DELETE RESTRICT,

        revision INTEGER NOT NULL DEFAULT 0,
        confirmed_revision INTEGER,

        confirmed_by_user_id INTEGER
          REFERENCES users(id) ON DELETE RESTRICT,

        confirmed_at TIMESTAMPTZ,
        confirmation_note TEXT,

        published_at TIMESTAMPTZ,
        published_by_user_id INTEGER
          REFERENCES users(id) ON DELETE RESTRICT,

        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_pc08_result_revision
          CHECK (revision >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE examination_session_pc08_result_deliveries (
        id SERIAL PRIMARY KEY,

        examination_session_id INTEGER NOT NULL
          REFERENCES examination_sessions(id)
          ON DELETE RESTRICT,

        training_school_id INTEGER NOT NULL
          REFERENCES training_schools(id)
          ON DELETE RESTRICT,

        current_version INTEGER NOT NULL DEFAULT 1,

        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        uploaded_by_user_id INTEGER NOT NULL
          REFERENCES users(id)
          ON DELETE RESTRICT,

        reviewed_by_user_id INTEGER
          REFERENCES users(id)
          ON DELETE RESTRICT,

        reviewed_at TIMESTAMPTZ,
        rejection_reason TEXT,

        published_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_pc08_result_session_school
          UNIQUE (examination_session_id, training_school_id),

        CONSTRAINT chk_pc08_result_delivery_status
          CHECK (status IN ('pending', 'approved', 'rejected')),

        CONSTRAINT chk_pc08_result_delivery_version
          CHECK (current_version > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE examination_session_pc08_result_versions (
        id SERIAL PRIMARY KEY,

        delivery_id INTEGER NOT NULL
          REFERENCES examination_session_pc08_result_deliveries(id)
          ON DELETE RESTRICT,

        version INTEGER NOT NULL,

        original_name VARCHAR(255) NOT NULL,
        storage_key VARCHAR(120) NOT NULL UNIQUE,

        size_bytes BIGINT NOT NULL,
        sha256 CHAR(64) NOT NULL,

        uploaded_by_user_id INTEGER NOT NULL
          REFERENCES users(id)
          ON DELETE RESTRICT,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_pc08_result_delivery_version
          UNIQUE (delivery_id, version),

        CONSTRAINT chk_pc08_result_file_size
          CHECK (size_bytes > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_pc08_result_deliveries_session
      ON examination_session_pc08_result_deliveries (
        examination_session_id, status
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_pc08_result_versions_delivery
      ON examination_session_pc08_result_versions (
        delivery_id, version DESC
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS examination_session_pc08_result_versions
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS examination_session_pc08_result_deliveries
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS examination_session_pc08_result_states
    `);
  }
}
