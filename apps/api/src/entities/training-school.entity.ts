import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';

import { Course } from './course.entity.js';

@Entity('training_schools')
export class TrainingSchool {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'province_code',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  provinceCode!: string | null;

  @Column({
    name: 'province_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  provinceName!: string | null;

  @OneToMany(() => Course, (course) => course.school)
  courses!: Relation<Course[]>;

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
