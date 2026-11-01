import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingSchoolCatalogManagement1793555000000 implements MigrationInterface {
  name = 'TrainingSchoolCatalogManagement1793555000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE training_schools
      ADD COLUMN IF NOT EXISTS address TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE training_schools
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await queryRunner.query(`
      ALTER TABLE training_schools
      ADD COLUMN IF NOT EXISTS info_source VARCHAR(20)
        NOT NULL DEFAULT 'xml'
    `);

    await queryRunner.query(`
      ALTER TABLE training_schools
      ADD CONSTRAINT chk_training_schools_info_source
      CHECK (info_source IN ('xml', 'manual', 'excel'))
    `);

    await queryRunner.query(`
      CREATE TABLE training_school_change_logs (
        id BIGSERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL
          REFERENCES training_schools(id) ON DELETE RESTRICT,
        actor_user_id INTEGER NULL
          REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(30) NOT NULL,
        old_data JSONB NULL,
        new_data JSONB NOT NULL,
        import_id BIGINT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_school_change_action
          CHECK (action IN ('created', 'updated', 'imported'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE training_school_imports (
        id BIGSERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        file_sha256 CHAR(64) NOT NULL,
        total_rows INTEGER NOT NULL,
        created_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        unchanged_count INTEGER NOT NULL DEFAULT 0,
        imported_by INTEGER NULL
          REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_training_school_change_school
      ON training_school_change_logs(school_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_training_school_change_import
      ON training_school_change_logs(import_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_training_school_imports_created
      ON training_school_imports(created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_training_schools_active
      ON training_schools(is_active)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_training_schools_active
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS training_school_change_logs
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS training_school_imports
    `);

    await queryRunner.query(`
      ALTER TABLE training_schools
      DROP CONSTRAINT IF EXISTS chk_training_schools_info_source
    `);

    await queryRunner.query(`
      ALTER TABLE training_schools
      DROP COLUMN IF EXISTS info_source,
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS address
    `);
  }
}
