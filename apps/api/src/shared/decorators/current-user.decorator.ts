import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../types/auth-user.type.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
    }>();

    return request.user;
  },
);
