import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationAccountRoles1793500000000 implements MigrationInterface {
  name = 'AddOrganizationAccountRoles1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS chk_users_role
      `);

    await queryRunner.query(`
        ALTER TABLE users
        ADD CONSTRAINT chk_users_role
        CHECK (
          role IN (
            'super_admin',
            'admin',
            'system_admin',
            'user',
            'training_school',
            'pc08_staff',
            'exam_center',
            'exam_secretary'
          )
        )
      `);

    await queryRunner.query(`
        CREATE TABLE user_organization_assignments (
          id SERIAL PRIMARY KEY,
  
          user_id INTEGER NOT NULL,
  
          training_school_id INTEGER NULL,
          examination_center_id INTEGER NULL,
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT fk_uoa_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,
  
          CONSTRAINT fk_uoa_training_school
            FOREIGN KEY (training_school_id)
            REFERENCES training_schools(id)
            ON DELETE RESTRICT,
  
          CONSTRAINT fk_uoa_examination_center
            FOREIGN KEY (examination_center_id)
            REFERENCES examination_centers(id)
            ON DELETE RESTRICT,
  
          CONSTRAINT chk_uoa_exactly_one_organization
            CHECK (
              (
                training_school_id IS NOT NULL
                AND examination_center_id IS NULL
              )
              OR
              (
                training_school_id IS NULL
                AND examination_center_id IS NOT NULL
              )
            ),
  
          CONSTRAINT uq_uoa_user
            UNIQUE (user_id)
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_uoa_training_school
        ON user_organization_assignments(training_school_id)
        WHERE training_school_id IS NOT NULL
      `);

    await queryRunner.query(`
        CREATE INDEX idx_uoa_examination_center
        ON user_organization_assignments(examination_center_id)
        WHERE examination_center_id IS NOT NULL
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const activeRoles: Array<{ count: number }> = await queryRunner.query(`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE role IN (
            'training_school',
            'pc08_staff',
            'exam_center',
            'exam_secretary'
          )
        `);

    if (Number(activeRoles[0]?.count ?? 0) > 0) {
      throw new Error(
        'Không thể rollback: đang tồn tại tài khoản thuộc các role mới.',
      );
    }

    await queryRunner.query(`
        DROP TABLE IF EXISTS user_organization_assignments
      `);

    await queryRunner.query(`
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS chk_users_role
      `);

    await queryRunner.query(`
        ALTER TABLE users
        ADD CONSTRAINT chk_users_role
        CHECK (
          role IN (
            'super_admin',
            'admin',
            'system_admin',
            'user'
          )
        )
      `);
  }
}
