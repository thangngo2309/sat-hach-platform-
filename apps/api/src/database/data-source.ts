import 'reflect-metadata';

import { config } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

config({
  path: resolve(process.cwd(), '../../.env'),
  quiet: true,
});

const currentDir = dirname(fileURLToPath(import.meta.url));

export const AppDataSource = new DataSource({
  type: 'postgres',

  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 8003),
  username: process.env.DB_USERNAME ?? 'sathach',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE ?? 'sathach',

  entities: [join(currentDir, '../**/*.entity{.ts,.js}')],

  migrations: [join(currentDir, 'migrations/*{.ts,.js}')],

  migrationsTableName: 'typeorm_migrations',

  synchronize: false,
  migrationsRun: false,

  logging: process.env.DB_LOGGING === 'true',
});
