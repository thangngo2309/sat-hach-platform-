import { MigrationInterface, QueryRunner } from 'typeorm';

// Đổi tên class khớp với file timestamp do CLI vừa tạo.
export class CreateAuthTables1792000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE "users" (
          "id" SERIAL PRIMARY KEY,
          "username" VARCHAR(100) NOT NULL,
          "password_hash" VARCHAR(255) NOT NULL,
          "full_name" VARCHAR(255) NOT NULL,
          "role" VARCHAR(30) NOT NULL DEFAULT 'user',
          "status" VARCHAR(30) NOT NULL DEFAULT 'active',
          "last_login_at" TIMESTAMPTZ NULL,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT "chk_users_role"
            CHECK ("role" IN ('super_admin', 'admin', 'user')),
          CONSTRAINT "chk_users_status"
            CHECK ("status" IN ('active', 'inactive', 'suspended'))
        )
      `);

    await queryRunner.query(`
        CREATE UNIQUE INDEX "uq_users_username"
        ON "users" ("username")
      `);

    await queryRunner.query(`
        CREATE TABLE "refresh_tokens" (
          "id" SERIAL PRIMARY KEY,
          "user_id" INTEGER NOT NULL,
          "token_hash" VARCHAR(64) NOT NULL,
          "expires_at" TIMESTAMPTZ NOT NULL,
          "revoked_at" TIMESTAMPTZ NULL,
          "device_name" VARCHAR(255) NULL,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT "fk_refresh_tokens_user"
            FOREIGN KEY ("user_id")
            REFERENCES "users" ("id")
            ON DELETE CASCADE
        )
      `);

    await queryRunner.query(`
        CREATE UNIQUE INDEX "uq_refresh_tokens_token_hash"
        ON "refresh_tokens" ("token_hash")
      `);

    await queryRunner.query(`
        CREATE INDEX "idx_refresh_tokens_user_id"
        ON "refresh_tokens" ("user_id")
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "refresh_tokens"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
