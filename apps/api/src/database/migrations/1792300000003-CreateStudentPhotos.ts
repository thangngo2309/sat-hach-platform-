import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStudentPhotos1792300000003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE student_photos (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id)
          ON DELETE CASCADE,
        sha256 VARCHAR(64) NOT NULL,
        storage_key VARCHAR(255) NOT NULL,
        mime_type VARCHAR(50) NOT NULL,
        size_bytes INTEGER NOT NULL,
        source_type VARCHAR(30) NOT NULL,
        import_batch_id INTEGER REFERENCES import_batches(id)
          ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_photos_student_hash
          UNIQUE (student_id, sha256)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_student_photos_student
      ON student_photos(student_id)
    `);

    await queryRunner.query(`
      ALTER TABLE students
      ADD COLUMN photo_id INTEGER
        REFERENCES student_photos(id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE students DROP COLUMN IF EXISTS photo_id
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS student_photos
    `);
  }
}
