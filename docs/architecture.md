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

## Phase status

- **Phase 0 — Foundation:** done. Monorepo, TypeScript, lint/format, Docker infra, `/health`.
- Phases 1–8: see the project specification.
