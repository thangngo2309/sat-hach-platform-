import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBc1Tables1792060000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE training_schools (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        province_code VARCHAR(30),
        province_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE courses (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL REFERENCES training_schools(id),
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        bc1_code VARCHAR(100),
        license_class VARCHAR(30),
        training_class VARCHAR(30),
        opening_date DATE,
        closing_date DATE,
        declared_student_count INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_courses_school_code UNIQUE (school_id, code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE students (
        id SERIAL PRIMARY KEY,
        registration_code VARCHAR(150) NOT NULL UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        family_name VARCHAR(255),
        given_name VARCHAR(100),
        date_of_birth DATE,
        gender VARCHAR(10),
        identity_number VARCHAR(50),
        nationality_code VARCHAR(20),
        nationality_name VARCHAR(100),
        permanent_address TEXT,
        current_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE import_batches (
        id SERIAL PRIMARY KEY,
        type VARCHAR(30) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_sha256 CHAR(64) NOT NULL UNIQUE,
        file_size BIGINT NOT NULL,
        report_code VARCHAR(100),
        source_transaction_code VARCHAR(150),
        school_code VARCHAR(50),
        course_code VARCHAR(100),
        total_records INTEGER NOT NULL DEFAULT 0,
        new_students INTEGER NOT NULL DEFAULT 0,
        new_enrollments INTEGER NOT NULL DEFAULT 0,
        skipped_enrollments INTEGER NOT NULL DEFAULT 0,
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_import_batches_imported_at
      ON import_batches(imported_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE enrollments (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        file_number VARCHAR(100),
        source_order INTEGER,
        source_import_id INTEGER REFERENCES import_batches(id)
          ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_enrollments_course_student
          UNIQUE (course_id, student_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_enrollments_student_id
      ON enrollments(student_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_students_identity_number
      ON students(identity_number)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE enrollments');
    await queryRunner.query('DROP TABLE import_batches');
    await queryRunner.query('DROP TABLE students');
    await queryRunner.query('DROP TABLE courses');
    await queryRunner.query('DROP TABLE training_schools');
  }
}
