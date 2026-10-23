
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SharedModule } from './shared/shared.module.js';

import { User } from './entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TrainingSchool } from './entities/training-school.entity.js';
import { ExaminationCenter } from './entities/examination-center.entity.js';
import { Course } from './entities/course.entity.js';
import { Student } from './entities/student.entity.js';
import { Enrollment } from './entities/enrollment.entity.js';
import { ImportBatch } from './entities/import-batch.entity.js';
import { Bc2Report } from './entities/bc2-report.entity.js';
import { Bc2Candidate } from './entities/bc2-candidate.entity.js';

import { AuthController } from './business/auth/auth.controller.js';
import { AuthService } from './business/auth/auth.service.js';
import { SuperAdminSeedService } from './business/auth/super-admin-seed.service.js';

import { JwtAuthGuard } from './shared/guards/jwt-auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { Bc1ImportService } from './business/imports/bc1-import.service.js';
import { Bc1ImportController } from './business/imports/bc1-import.controller.js';

import { Bc2ImportController } from './business/imports/bc2-import.controller.js';
import { Bc2ImportService } from './business/imports/bc2-import.service.js';

import { ExamListImportController } from './business/imports/exam-list-import.controller.js';
import { ExamListImportService } from './business/imports/exam-list-import.service.js';

import { ExamResultImportController } from './business/imports/exam-result-import.controller.js';
import { ExamResultImportService } from './business/imports/exam-result-import.service.js';

import { CatalogController } from './business/catalog/catalog.controller.js';
import { CatalogService } from './business/catalog/catalog.service.js';

import { Bc2ViewController } from './business/catalog/bc2-view.controller.js';
import { Bc2ViewService } from './business/catalog/bc2-view.service.js';

import { ExaminationCenterController } from './business/catalog/examination-center.controller.js';
import { ExaminationCenterService } from './business/catalog/examination-center.service.js';

import { TrainingSchoolManagementController } from './business/catalog/training-school-management.controller.js';
import { StudentPhotoController } from './business/students/student-photo.controller.js';
import { StudentPhotoService } from './business/students/student-photo.service.js';
import { StudentManagementController } from './business/students/student-management.controller.js';
import { StudentManagementService } from './business/students/student-management.service.js';
import { ExamStatisticsController } from './business/exam-statistics/exam-statistics.controller.js';
import { ExamStatisticsService } from './business/exam-statistics/exam-statistics.service.js';

const businessEntities = [
  User,
  RefreshToken,
  TrainingSchool,
  ExaminationCenter,
  Course,
  Student,
  Enrollment,
  ImportBatch,
  Bc2Report,
  Bc2Candidate,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    SharedModule,

    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,

        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 8003),
        username: process.env.DB_USERNAME ?? 'sathach',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE ?? 'sathach',

        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),

    TypeOrmModule.forFeature(businessEntities),
  ],

  controllers: [
    AppController,
    AuthController,
    Bc1ImportController,
    CatalogController,
    Bc2ImportController,
    Bc2ViewController,
    ExaminationCenterController,
    TrainingSchoolManagementController,
    ExamListImportController,
    ExamResultImportController,
    StudentPhotoController,
    StudentManagementController,
    ExamStatisticsController
  ],

  providers: [
    AppService,
    AuthService,
    SuperAdminSeedService,
    JwtAuthGuard,
    RolesGuard,
    Bc1ImportService,
    CatalogService,
    Bc2ImportService,
    Bc2ViewService,
    ExaminationCenterService,
    ExamListImportService,
    ExamResultImportService,
    StudentPhotoService,
    StudentManagementService,
    ExamStatisticsService
  ],
})
export class AppModule {}
