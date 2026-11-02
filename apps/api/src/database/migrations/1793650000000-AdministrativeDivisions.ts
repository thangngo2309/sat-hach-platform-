import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdministrativeDivisions1793650000000 implements MigrationInterface {
  name = 'AdministrativeDivisions1793650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE administrative_provinces (
        code VARCHAR(30) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(30) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_administrative_province_type
          CHECK (type IN ('province', 'city'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE administrative_wards (
        code VARCHAR(30) PRIMARY KEY,
        province_code VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(30) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_administrative_ward_province
          FOREIGN KEY (province_code)
          REFERENCES administrative_provinces(code),

        CONSTRAINT chk_administrative_ward_type
          CHECK (type IN ('ward', 'commune', 'special_zone'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_administrative_provinces_name
      ON administrative_provinces (name)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_administrative_wards_province
      ON administrative_wards (province_code, name)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_administrative_wards_name
      ON administrative_wards (name)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE administrative_wards');
    await queryRunner.query('DROP TABLE administrative_provinces');
  }
}
