import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentIntakeEnhancements1793652000000 implements MigrationInterface {
  name = 'StudentIntakeEnhancements1793652000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE students
          ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
          ADD COLUMN IF NOT EXISTS province_code VARCHAR(30),
          ADD COLUMN IF NOT EXISTS ward_code VARCHAR(30)
      `);

    await queryRunner.query(`
        ALTER TABLE student_intakes
          ADD COLUMN IF NOT EXISTS training_completion_number
            VARCHAR(150),
          ADD COLUMN IF NOT EXISTS training_completion_issued_date
            DATE
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_students_province_ward
        ON students (province_code, ward_code)
      `);

    await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS
          student_intake_attachments (
            id SERIAL PRIMARY KEY,
  
            student_intake_id INTEGER NOT NULL
              REFERENCES student_intakes(id)
              ON DELETE CASCADE,
  
            uploaded_by_user_id INTEGER NOT NULL
              REFERENCES users(id),
  
            original_name VARCHAR(255) NOT NULL,
            storage_key VARCHAR(255) NOT NULL UNIQUE,
            mime_type VARCHAR(100) NOT NULL,
            size_bytes BIGINT NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
  
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
            CONSTRAINT chk_student_intake_attachment_size
              CHECK (size_bytes > 0)
          )
      `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
          idx_student_intake_attachments_intake
        ON student_intake_attachments (
          student_intake_id,
          created_at DESC
        )
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP TABLE IF EXISTS student_intake_attachments
      `);

    await queryRunner.query(`
        DROP INDEX IF EXISTS idx_students_province_ward
      `);

    await queryRunner.query(`
        ALTER TABLE student_intakes
          DROP COLUMN IF EXISTS training_completion_number,
          DROP COLUMN IF EXISTS training_completion_issued_date
      `);

    await queryRunner.query(`
        ALTER TABLE students
          DROP COLUMN IF EXISTS phone_number,
          DROP COLUMN IF EXISTS province_code,
          DROP COLUMN IF EXISTS ward_code
      `);
  }
}
