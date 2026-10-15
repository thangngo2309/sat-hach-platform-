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

import { User } from './user.entity.js';
import { Enrollment } from './enrollment.entity.js';

export enum ImportType {
  BC1 = 'BC1',
  BC2 = 'BC2',
  EXAM_LIST = 'EXAM_LIST',
  EXAM_RESULT = 'EXAM_RESULT',
}

@Entity('import_batches')
export class ImportBatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 30 })
  type!: ImportType;

  @Column({
    name: 'file_name',
    type: 'varchar',
    length: 255,
  })
  fileName!: string;

  @Column({
    name: 'file_sha256',
    type: 'char',
    length: 64,
    unique: true,
  })
  fileSha256!: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
  })
  fileSize!: string;

  @Column({
    name: 'report_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  reportCode!: string | null;

  @Column({
    name: 'source_transaction_code',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  sourceTransactionCode!: string | null;

  @Column({
    name: 'school_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  schoolCode!: string | null;

  @Column({
    name: 'course_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  courseCode!: string | null;

  @Column({
    name: 'total_records',
    type: 'integer',
    default: 0,
  })
  totalRecords!: number;

  @Column({
    name: 'new_students',
    type: 'integer',
    default: 0,
  })
  newStudents!: number;

  @Column({
    name: 'new_enrollments',
    type: 'integer',
    default: 0,
  })
  newEnrollments!: number;

  @Column({
    name: 'skipped_enrollments',
    type: 'integer',
    default: 0,
  })
  skippedEnrollments!: number;

  @Column({
    name: 'imported_by',
    type: 'integer',
    nullable: true,
  })
  importedBy!: number | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'imported_by' })
  importedByUser!: Relation<User | null>;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.sourceImport)
  enrollments!: Relation<Enrollment[]>;

  @Index('idx_import_batches_imported_at')
  @CreateDateColumn({
    name: 'imported_at',
    type: 'timestamptz',
  })
  importedAt!: Date;
}
