import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowSystemAdminRole1793100000001 implements MigrationInterface {
  name = 'AllowSystemAdminRole1793100000001';

  async up(queryRunner: QueryRunner): Promise<void> {
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

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ total: number }> = await queryRunner.query(`
          SELECT COUNT(*)::int AS total
          FROM users
          WHERE role = 'system_admin'
        `);

    if (Number(rows[0]?.total ?? 0) > 0) {
      throw new Error(
        'Không thể rollback vì đang tồn tại tài khoản SYSTEM_ADMIN.',
      );
    }

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
            'user'
          )
        )
      `);
  }
}
