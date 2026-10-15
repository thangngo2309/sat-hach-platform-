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

import { RefreshToken } from './refresh-token.entity.js';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index('uq_users_username', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({
    name: 'full_name',
    type: 'varchar',
    length: 255,
  })
  fullName!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column({
    type: 'varchar',
    length: 30,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({
    name: 'last_login_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: Relation<RefreshToken[]>;

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
