import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileSubmissionImportTracking1793540000000 implements MigrationInterface {
  name = 'AddFileSubmissionImportTracking1793540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS import_error TEXT NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS import_result JSONB NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS import_batch_id INTEGER NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS processing_started_at
          TIMESTAMPTZ NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD COLUMN IF NOT EXISTS import_completed_at
          TIMESTAMPTZ NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD CONSTRAINT fk_file_submissions_import_batch
        FOREIGN KEY (import_batch_id)
        REFERENCES import_batches(id)
        ON DELETE SET NULL
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP CONSTRAINT IF EXISTS chk_file_submissions_status
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD CONSTRAINT chk_file_submissions_status
        CHECK (
          status IN (
            'pending',
            'processing',
            'approved',
            'rejected'
          )
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_file_submissions_import_status
        ON file_submissions(import_status, created_at DESC)
      `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ total: number }> = await queryRunner.query(`
          SELECT COUNT(*)::int AS total
          FROM file_submissions
          WHERE status = 'processing'
        `);

    if (Number(rows[0]?.total ?? 0) > 0) {
      throw new Error('Không thể rollback khi còn hồ sơ đang xử lý.');
    }

    await queryRunner.query(`
        DROP INDEX IF EXISTS idx_file_submissions_import_status
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP CONSTRAINT IF EXISTS
          fk_file_submissions_import_batch
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP CONSTRAINT IF EXISTS chk_file_submissions_status
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        ADD CONSTRAINT chk_file_submissions_status
        CHECK (status IN ('pending', 'approved', 'rejected'))
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS import_completed_at
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS processing_started_at
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS import_batch_id
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS import_result
      `);

    await queryRunner.query(`
        ALTER TABLE file_submissions
        DROP COLUMN IF EXISTS import_error
      `);
  }
}
