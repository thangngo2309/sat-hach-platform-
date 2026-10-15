import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBc2Tables1792100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bc2_reports (
        id SERIAL PRIMARY KEY,
        import_batch_id INTEGER NOT NULL UNIQUE
          REFERENCES import_batches(id) ON DELETE RESTRICT,
        school_id INTEGER NOT NULL
          REFERENCES training_schools(id),
        bc2_code VARCHAR(150) NOT NULL,
        bc1_code VARCHAR(150),
        document_number VARCHAR(150),
        document_date DATE,
        declared_candidate_count INTEGER,
        actual_candidate_count INTEGER NOT NULL DEFAULT 0,
        training_class VARCHAR(30),
        license_class VARCHAR(30),
        source_transaction_code VARCHAR(150),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_bc2_reports_school_id
      ON bc2_reports(school_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_bc2_reports_bc1_code
      ON bc2_reports(bc1_code)
    `);

    await queryRunner.query(`
      CREATE TABLE bc2_candidates (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL
          REFERENCES bc2_reports(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL
          REFERENCES students(id),
        source_order INTEGER,
        file_number VARCHAR(100),
        requested_license_class VARCHAR(30),
        previous_license_number VARCHAR(100),
        previous_license_class VARCHAR(50),
        completion_certificate_number VARCHAR(100),
        certificate_number VARCHAR(100),
        medical_certificate VARCHAR(100),
        exam_content_code VARCHAR(100),
        note TEXT,
        source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_bc2_candidates_report_student
          UNIQUE(report_id, student_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_bc2_candidates_student_id
      ON bc2_candidates(student_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bc2_candidates');
    await queryRunner.query('DROP TABLE bc2_reports');
  }
}
