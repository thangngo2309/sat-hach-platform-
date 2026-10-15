
import { UserRole } from '../../entities/user.entity.js';

export interface AuthUser {
  sub: number;
  username: string;
  role: UserRole;
  type: 'access';
  iat?: number;
  exp?: number;
}
