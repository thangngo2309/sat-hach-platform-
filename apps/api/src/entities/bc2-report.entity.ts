import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { TrainingSchool } from './training-school.entity.js';
import { ImportBatch } from './import-batch.entity.js';
import { Bc2Candidate } from './bc2-candidate.entity.js';

@Entity('bc2_reports')
export class Bc2Report {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'import_batch_id', type: 'integer', unique: true })
  importBatchId!: number;

  @ManyToOne(() => ImportBatch, { nullable: false })
  @JoinColumn({ name: 'import_batch_id' })
  importBatch!: Relation<ImportBatch>;

  @Index('idx_bc2_reports_school_id')
  @Column({ name: 'school_id', type: 'integer' })
  schoolId!: number;

  @ManyToOne(() => TrainingSchool, { nullable: false })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<TrainingSchool>;

  @Column({ name: 'bc2_code', type: 'varchar', length: 150 })
  bc2Code!: string;

  @Index('idx_bc2_reports_bc1_code')
  @Column({
    name: 'bc1_code',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  bc1Code!: string | null;

  @Column({
    name: 'document_number',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  documentNumber!: string | null;

  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate!: string | null;

  @Column({
    name: 'declared_candidate_count',
    type: 'integer',
    nullable: true,
  })
  declaredCandidateCount!: number | null;

  @Column({
    name: 'actual_candidate_count',
    type: 'integer',
    default: 0,
  })
  actualCandidateCount!: number;

  @Column({
    name: 'training_class',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  trainingClass!: string | null;

  @Column({
    name: 'license_class',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  licenseClass!: string | null;

  @Column({
    name: 'source_transaction_code',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  sourceTransactionCode!: string | null;

  @OneToMany(() => Bc2Candidate, (candidate) => candidate.report)
  candidates!: Relation<Bc2Candidate[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
