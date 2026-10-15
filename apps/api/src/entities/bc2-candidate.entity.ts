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

import { Bc2Report } from './bc2-report.entity.js';
import { Student } from './student.entity.js';

@Entity('bc2_candidates')
@Unique('uq_bc2_candidates_report_student', ['reportId', 'studentId'])
export class Bc2Candidate {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'report_id', type: 'integer' })
  reportId!: number;

  @ManyToOne(() => Bc2Report, (report) => report.candidates, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report!: Relation<Bc2Report>;

  @Index('idx_bc2_candidates_student_id')
  @Column({ name: 'student_id', type: 'integer' })
  studentId!: number;

  @ManyToOne(() => Student, { nullable: false })
  @JoinColumn({ name: 'student_id' })
  student!: Relation<Student>;

  @Column({ name: 'source_order', type: 'integer', nullable: true })
  sourceOrder!: number | null;

  @Column({
    name: 'file_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fileNumber!: string | null;

  @Column({
    name: 'requested_license_class',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  requestedLicenseClass!: string | null;

  @Column({
    name: 'previous_license_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  previousLicenseNumber!: string | null;

  @Column({
    name: 'previous_license_class',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  previousLicenseClass!: string | null;

  @Column({
    name: 'completion_certificate_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  completionCertificateNumber!: string | null;

  @Column({
    name: 'certificate_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  certificateNumber!: string | null;

  @Column({
    name: 'medical_certificate',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  medicalCertificate!: string | null;

  @Column({
    name: 'exam_content_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  examContentCode!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    name: 'source_data',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  sourceData!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
