import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@tradeflow/shared-types';

/** Pulls the authenticated user that `JwtStrategy.validate` attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
