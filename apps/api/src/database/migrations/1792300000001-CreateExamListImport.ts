import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamListImport1792300000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS candidate_type VARCHAR(30)
        NOT NULL DEFAULT 'unknown'
    `);

    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS candidate_type_updated_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE TABLE examination_sessions (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        examination_center_id INTEGER NOT NULL
          REFERENCES examination_centers(id),
        exam_date DATE,
        exam_time VARCHAR(20),
        decision_number VARCHAR(150),
        decision_date DATE,
        source_unit_code VARCHAR(50),
        source_unit_name VARCHAR(255),
        declared_count INTEGER,
        last_import_id INTEGER REFERENCES import_batches(id)
          ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE examination_candidates (
        id SERIAL PRIMARY KEY,
        examination_session_id INTEGER NOT NULL
          REFERENCES examination_sessions(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        registration_code VARCHAR(150) NOT NULL,
        examination_number VARCHAR(50),
        training_school_id INTEGER REFERENCES training_schools(id),
        course_id INTEGER REFERENCES courses(id),
        candidate_type VARCHAR(30) NOT NULL DEFAULT 'unknown',
        license_class VARCHAR(30),
        examination_content VARCHAR(50),
        file_number VARCHAR(100),
        source_import_id INTEGER REFERENCES import_batches(id)
          ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_candidate_registration
          UNIQUE (examination_session_id, registration_code),
        CONSTRAINT uq_exam_candidate_student
          UNIQUE (examination_session_id, student_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_examination_candidates_student
      ON examination_candidates(student_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_examination_candidates_school
      ON examination_candidates(training_school_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_examination_candidates_course
      ON examination_candidates(course_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_exam_candidate_number
      ON examination_candidates(examination_session_id, examination_number)
      WHERE examination_number IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE examination_candidates');
    await queryRunner.query('DROP TABLE examination_sessions');

    await queryRunner.query(`
      ALTER TABLE students
      DROP COLUMN IF EXISTS candidate_type_updated_at,
      DROP COLUMN IF EXISTS candidate_type
    `);
  }
}
