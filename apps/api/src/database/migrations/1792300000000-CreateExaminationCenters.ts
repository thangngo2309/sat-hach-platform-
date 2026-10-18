import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExaminationCenters1792300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE examination_centers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        address VARCHAR(500),
        phone VARCHAR(30),
        note TEXT,
        name_source VARCHAR(20) NOT NULL DEFAULT 'manual',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_examination_centers_code UNIQUE (code),
        CONSTRAINT chk_examination_centers_name_source
          CHECK (name_source IN ('manual', 'xml'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_examination_centers_name
      ON examination_centers(name)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE examination_centers');
  }
}
