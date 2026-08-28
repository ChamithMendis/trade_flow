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

## Phase status

- **Phase 0 — Foundation:** done. Monorepo, TypeScript, lint/format, Docker infra, `/health`.
- **Phase 1 — Database schema:** done. Prisma schema + `init` migration, `PrismaModule`/`PrismaService`,
  seed (admin user + 5 instruments + admin portfolio).
- Phases 2–8: see the project specification.
