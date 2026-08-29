import type { AuthUser } from '@tradeflow/shared-types';
import { UserRole } from '@tradeflow/shared-types';
import type { User } from '../generated/prisma/client';

/** Strips the password hash and normalises dates for API responses. */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    createdAt: user.createdAt.toISOString(),
  };
}
