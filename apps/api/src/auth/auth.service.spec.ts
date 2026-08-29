import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  const jwt = { sign: () => 'signed.jwt.token' } as unknown as JwtService;

  interface CreateArg {
    data: {
      passwordHash: string;
      portfolio: { create: { availableCash: number } };
    };
  }

  function setup(user: unknown) {
    const create = jest.fn<Promise<unknown>, [CreateArg]>().mockResolvedValue({
      id: 'u1',
      name: 'Ada',
      email: 'a@b.com',
      role: 'TRADER',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const users = {
      findByEmail: jest.fn().mockResolvedValue(user),
    } as unknown as UsersService;
    const prisma = { user: { create } } as unknown as PrismaService;
    return { service: new AuthService(prisma, users, jwt), create, users };
  }

  it('registers a new user and returns a token + portfolio-seeded user', async () => {
    const { service, create } = setup(null);

    const res = await service.register({
      name: 'Ada',
      email: 'a@b.com',
      password: 'password123',
    });

    expect(res.accessToken).toBe('signed.jwt.token');
    const [createArg] = create.mock.calls[0];
    expect(createArg.data.portfolio.create.availableCash).toBe(100_000);
    expect(createArg.data.passwordHash).not.toBe('password123');
  });

  it('rejects a duplicate email', async () => {
    const { service } = setup({ id: 'existing' });
    await expect(
      service.register({
        name: 'Ada',
        email: 'a@b.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login with a wrong password', async () => {
    const passwordHash = await hash('correct-horse');
    const { service } = setup({ id: 'u1', email: 'a@b.com', passwordHash });
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
