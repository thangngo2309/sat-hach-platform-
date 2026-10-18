import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ExaminationCenterNameSource {
  MANUAL = 'manual',
  XML = 'xml',
}

@Entity('examination_centers')
export class ExaminationCenter {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('uq_examination_centers_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    name: 'name_source',
    type: 'varchar',
    length: 20,
    default: ExaminationCenterNameSource.MANUAL,
  })
  nameSource!: ExaminationCenterNameSource;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
