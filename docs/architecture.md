# Architecture

> Living document. Expanded as each phase lands.

## Overview

```
                 React (Vite) SPA
        Dashboard | Trading | Portfolio
                 |            |
             REST (HTTP)   Socket.IO
                 |            |
                 v            v
              NestJS modular monolith
   Auth · Users · Market · Orders · Exchange · Portfolio · WebSocket
                 |         |          |
                 v         v          v
            PostgreSQL   Redis     BullMQ
            (Prisma)    (cache)   (jobs)
```

## Modules (planned)

| Module          | Responsibility                                                   |
| --------------- | ---------------------------------------------------------------- |
| CommonModule    | Guards, filters, interceptors, correlation IDs, shared utilities |
| AuthModule      | Registration, login, JWT issue/verify                            |
| UsersModule     | User records                                                     |
| MarketModule    | Instruments, simulated price engine                              |
| OrdersModule    | Order creation, validation, listing, cancellation                |
| ExchangeModule  | BullMQ worker that simulates fills/partials/rejections           |
| PortfolioModule | Positions, cash, average cost, P/L; idempotent settlement        |
| WebSocketModule | Authenticated Socket.IO gateway, per-user rooms                  |

## Database

Prisma 7 (`prisma-client` generator → `apps/api/src/generated/prisma`, git-ignored) on
PostgreSQL 16. Connection URL lives in the repo-root `.env` and is wired through
`apps/api/prisma7.config.ts` (Prisma CLI) and `PrismaService` (Nest runtime, via the
`@prisma/adapter-pg` driver adapter that Prisma 7 requires).

Tables (`snake_case`, camelCase columns): `users`, `instruments`, `portfolios`, `positions`,
`orders`, `executions`, `order_events`. `executions.executionReference` is `@unique` — the
idempotency backbone for Phase 5. Money is `Decimal(18,4)`.

`PrismaModule` is `@Global()`, so any module can inject `PrismaService`.

## Authentication

- **Password hashing:** Argon2id via `@node-rs/argon2`.
- **Tokens:** stateless JWT (`@nestjs/jwt`), `sub` = user id. Secret + TTL from env.
- **Guard:** `JwtAuthGuard` is registered as a global `APP_GUARD` (Passport `jwt` strategy).
  Every route needs a valid token unless annotated `@Public()`. `@CurrentUser()` reads the
  user that `JwtStrategy.validate` (re-fetched from the DB) attached to the request.
- **Rate limiting:** `@nestjs/throttler` on the `/auth` controller (10 requests / 60s).
- **Validation:** global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`);
  DTOs use `class-validator`.
- **Registration** creates the `User` and its `Portfolio` (100k cash, `STARTING_CASH` from
  `shared-types`) in one `prisma.user.create` nested write.

### Web auth

- `authStore` (Zustand + `persist`) holds **only** the JWT in `localStorage`.
- `axios` instance attaches `Authorization: Bearer`; a 401 response clears the token.
- The current user comes from `GET /auth/me` via TanStack Query (`['auth','me']`), so it is
  never stale in storage. `ProtectedRoute` gates on token presence + that query succeeding.

## Phase status

- **Phase 0 — Foundation:** done. Monorepo, TypeScript, lint/format, Docker infra, `/health`.
- **Phase 1 — Database schema:** done. Prisma schema + `init` migration, `PrismaModule`/`PrismaService`,
  seed (admin user + 5 instruments + admin portfolio).
- **Phase 2 — Auth:** done. `CommonModule` decorators + global JWT guard, `UsersModule`,
  `AuthModule` (`/auth/register`, `/auth/login`, `/auth/me`), throttling, validation.
  Web: React Router, TanStack Query, Zustand, Tailwind; login/register pages + protected dashboard.
- Phases 3–8: see the project specification.
