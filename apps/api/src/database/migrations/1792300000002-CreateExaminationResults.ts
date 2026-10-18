import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExaminationResults1792300000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE examination_candidates
      ADD COLUMN result_status VARCHAR(30),
      ADD COLUMN theory_score VARCHAR(30),
      ADD COLUMN simulation_score VARCHAR(30),
      ADD COLUMN practical_score VARCHAR(30),
      ADD COLUMN road_score VARCHAR(30),
      ADD COLUMN result_import_id INTEGER
        REFERENCES import_batches(id) ON DELETE SET NULL,
      ADD COLUMN result_updated_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE TABLE examination_candidate_results (
        id SERIAL PRIMARY KEY,
        examination_candidate_id INTEGER NOT NULL
          REFERENCES examination_candidates(id)
          ON DELETE CASCADE,
        part_order INTEGER NOT NULL,
        exam_type VARCHAR(30) NOT NULL,
        result_status VARCHAR(30),
        exam_date DATE,
        score VARCHAR(50),
        maximum_score VARCHAR(50),
        examiner VARCHAR(255),
        examiner_comment TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_examination_candidate_result_order
          UNIQUE (examination_candidate_id, part_order)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_exam_candidates_result_status
      ON examination_candidates(result_status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_exam_candidate_results_candidate
      ON examination_candidate_results(examination_candidate_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS examination_candidate_results
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_exam_candidates_result_status
    `);

    await queryRunner.query(`
      ALTER TABLE examination_candidates
      DROP COLUMN IF EXISTS result_status,
      DROP COLUMN IF EXISTS theory_score,
      DROP COLUMN IF EXISTS simulation_score,
      DROP COLUMN IF EXISTS practical_score,
      DROP COLUMN IF EXISTS road_score,
      DROP COLUMN IF EXISTS result_import_id,
      DROP COLUMN IF EXISTS result_updated_at
    `);
  }
}
