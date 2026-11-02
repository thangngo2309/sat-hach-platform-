
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FileSubmissionDocumentMetadata1793654000000 implements MigrationInterface {
  name = 'FileSubmissionDocumentMetadata1793654000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE file_submission_versions
      ADD COLUMN IF NOT EXISTS document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE file_submission_versions
      DROP COLUMN IF EXISTS document_metadata
    `);
  }
}
