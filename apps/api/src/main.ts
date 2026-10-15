import 'reflect-metadata';

import cookieParser from 'cookie-parser';

import { ValidationPipe } from '@nestjs/common';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:8001',
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 8000);

  await app.listen(port, '0.0.0.0');

  console.log(`API: http://localhost:${port}/api`);
}

void bootstrap();
