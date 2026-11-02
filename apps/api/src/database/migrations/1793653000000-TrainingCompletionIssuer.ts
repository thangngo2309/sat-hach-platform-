import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrainingCompletionIssuer1793653000000 implements MigrationInterface {
  name = 'TrainingCompletionIssuer1793653000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE student_intakes
      ADD COLUMN IF NOT EXISTS
        training_completion_issuer VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE student_intakes
      DROP COLUMN IF EXISTS training_completion_issuer
    `);
  }
}
