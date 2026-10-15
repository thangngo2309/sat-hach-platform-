import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';

import { Course } from './course.entity.js';
import { Student } from './student.entity.js';
import { ImportBatch } from './import-batch.entity.js';

@Entity('enrollments')
@Unique('uq_enrollments_course_student', ['courseId', 'studentId'])
export class Enrollment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'course_id', type: 'integer' })
  courseId!: number;

  @ManyToOne(() => Course, (course) => course.enrollments, {
    nullable: false,
  })
  @JoinColumn({ name: 'course_id' })
  course!: Relation<Course>;

  @Index('idx_enrollments_student_id')
  @Column({ name: 'student_id', type: 'integer' })
  studentId!: number;

  @ManyToOne(() => Student, (student) => student.enrollments, {
    nullable: false,
  })
  @JoinColumn({ name: 'student_id' })
  student!: Relation<Student>;

  @Column({
    name: 'file_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fileNumber!: string | null;

  @Column({
    name: 'source_order',
    type: 'integer',
    nullable: true,
  })
  sourceOrder!: number | null;

  @Column({
    name: 'source_import_id',
    type: 'integer',
    nullable: true,
  })
  sourceImportId!: number | null;

  @ManyToOne(() => ImportBatch, (batch) => batch.enrollments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'source_import_id' })
  sourceImport!: Relation<ImportBatch | null>;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;
}
