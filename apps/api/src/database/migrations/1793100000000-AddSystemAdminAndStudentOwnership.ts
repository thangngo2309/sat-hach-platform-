import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemAdminAndStudentOwnership1793100000000 implements MigrationInterface {
  name = 'AddSystemAdminAndStudentOwnership1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(30)
        NOT NULL DEFAULT 'import'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_students_created_by_user
      ON students(created_by_user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS student_intakes (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL
          REFERENCES students(id) ON DELETE CASCADE,
        created_by_user_id INTEGER NOT NULL
          REFERENCES users(id) ON DELETE RESTRICT,
        updated_by_user_id INTEGER
          REFERENCES users(id) ON DELETE SET NULL,
        intake_type VARCHAR(30) NOT NULL DEFAULT 'independent',
        application_type VARCHAR(30) NOT NULL DEFAULT 'new',
        requested_license_class VARCHAR(30),
        training_license_class VARCHAR(30),
        examination_content VARCHAR(100),
        certificate_issuer VARCHAR(255),
        identity_issued_date DATE,
        note TEXT,
        documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        existing_licenses JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_intakes_student_creator
          UNIQUE (student_id, created_by_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_student_intakes_creator
      ON student_intakes(created_by_user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_student_intakes_student
      ON student_intakes(student_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_student_intakes_created_at
      ON student_intakes(created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS student_intakes
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_students_created_by_user
    `);

    await queryRunner.query(`
      ALTER TABLE students
      DROP COLUMN IF EXISTS source_type
    `);

    await queryRunner.query(`
      ALTER TABLE students
      DROP COLUMN IF EXISTS updated_by_user_id
    `);

    await queryRunner.query(`
      ALTER TABLE students
      DROP COLUMN IF EXISTS created_by_user_id
    `);
  }
}
