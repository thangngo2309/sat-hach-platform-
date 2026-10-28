import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';

import { Enrollment } from './enrollment.entity.js';

export enum StudentCandidateType {
  TRAINING = 'training',
  INDEPENDENT = 'independent',
  UNKNOWN = 'unknown',
}

export enum StudentSourceType {
  IMPORT = 'import',
  MANUAL = 'manual',
}

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('uq_students_registration_code', { unique: true })
  @Column({
    name: 'registration_code',
    type: 'varchar',
    length: 150,
    unique: true,
  })
  registrationCode!: string;

  @Column({
    name: 'full_name',
    type: 'varchar',
    length: 255,
  })
  fullName!: string;

  @Column({
    name: 'family_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  familyName!: string | null;

  @Column({
    name: 'given_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  givenName!: string | null;

  @Column({
    name: 'date_of_birth',
    type: 'date',
    nullable: true,
  })
  dateOfBirth!: string | null;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  gender!: string | null;

  @Column({
    name: 'identity_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  identityNumber!: string | null;

  @Column({
    name: 'nationality_code',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  nationalityCode!: string | null;

  @Column({
    name: 'nationality_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  nationalityName!: string | null;

  @Column({
    name: 'permanent_address',
    type: 'text',
    nullable: true,
  })
  permanentAddress!: string | null;

  @Column({
    name: 'current_address',
    type: 'text',
    nullable: true,
  })
  currentAddress!: string | null;

  @Column({
    name: 'candidate_type',
    type: 'varchar',
    length: 30,
    default: StudentCandidateType.UNKNOWN,
  })
  candidateType!: StudentCandidateType;

  @Column({
    name: 'candidate_type_updated_at',
    type: 'timestamptz',
    nullable: true,
  })
  candidateTypeUpdatedAt!: Date | null;

  @Index('idx_students_created_by_user')
  @Column({
    name: 'created_by_user_id',
    type: 'integer',
    nullable: true,
  })
  createdByUserId!: number | null;

  @Column({
    name: 'updated_by_user_id',
    type: 'integer',
    nullable: true,
  })
  updatedByUserId!: number | null;

  @Column({
    name: 'source_type',
    type: 'varchar',
    length: 30,
    default: StudentSourceType.IMPORT,
  })
  sourceType!: StudentSourceType;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.student)
  enrollments!: Relation<Enrollment[]>;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}
