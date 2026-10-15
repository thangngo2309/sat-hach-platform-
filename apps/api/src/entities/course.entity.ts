import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';

import { TrainingSchool } from './training-school.entity.js';
import { Enrollment } from './enrollment.entity.js';

@Entity('courses')
@Unique('uq_courses_school_code', ['schoolId', 'code'])
export class Course {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'school_id', type: 'integer' })
  schoolId!: number;

  @ManyToOne(() => TrainingSchool, (school) => school.courses, {
    nullable: false,
  })
  @JoinColumn({ name: 'school_id' })
  school!: Relation<TrainingSchool>;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'bc1_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  bc1Code!: string | null;

  @Column({
    name: 'license_class',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  licenseClass!: string | null;

  @Column({
    name: 'training_class',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  trainingClass!: string | null;

  @Column({
    name: 'opening_date',
    type: 'date',
    nullable: true,
  })
  openingDate!: string | null;

  @Column({
    name: 'closing_date',
    type: 'date',
    nullable: true,
  })
  closingDate!: string | null;

  @Column({
    name: 'declared_student_count',
    type: 'integer',
    nullable: true,
  })
  declaredStudentCount!: number | null;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
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
