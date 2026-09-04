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

## Market data & real time

**`EventsModule`** owns the Socket.IO transport and is the single seam between business
modules and the wire:

- `EventsGateway` holds the `Server` and, on connect, puts every client in the public
  `market` room. Phase 6 adds JWT verification here plus a private `user:<id>` room.
- `EventsService` is what other modules inject (`emitPriceUpdate(...)`), so Market, Orders
  and Portfolio never import the gateway directly.

**`MarketModule`**

- `GET /instruments`, `GET /instruments/:symbol` (both require a JWT like every other route).
- `InstrumentsService` also exposes `getEntityBySymbol()` — Orders and Exchange will need the
  raw `Decimal` price, not the DTO's `number`.
- `PriceEngineService` registers an interval through `SchedulerRegistry` on module init
  (rather than a fixed `@Interval(3000)`) so `MARKET_TICK_MS` can tune it and `0` disables it.
  Each tick: read active instruments → bounded random walk (±1%, floor of 1) → persist all
  updates in one `$transaction` → broadcast one `market.price.updated` per instrument.
  A re-entrancy flag skips overlapping ticks; a `try/catch` keeps a failed tick from killing
  the interval.

### Web market

- `lib/socket.ts` — one shared Socket.IO connection for the app.
- `useMarketSocket` writes each price tick **directly into the TanStack Query cache**
  (`queryClient.setQueryData`), so the table re-renders with no refetch and no polling. The
  instruments query is `staleTime: Infinity` for the same reason.
- Connection status uses `useSyncExternalStore` — the socket is external state, not React state.
- `priceHistoryStore` (Zustand) keeps the last 40 ticks per symbol to feed the Recharts
  sparklines, plus the most recent change percentage.

## Orders

`OrdersModule` — `POST /orders`, `GET /orders?status=`, `GET /orders/:id`, `POST /orders/:id/cancel`.

**Validation (FR-06).** Symbol is upper-cased by a DTO `@Transform`; quantity must be a positive
integer; a `LIMIT` order requires a price and a `MARKET` order must not carry one. The instrument
must exist **and** be `ACTIVE`.

**Buying power counts open orders, not just cash.** Checking `availableCash` alone would let a
trader place five orders that are each affordable but not affordable together — nothing is
deducted until Phase 7 settles an execution. So the check is:

```
buyingPower = availableCash - Σ(remaining qty × price basis) over open BUY orders
sellable    = position.quantity - Σ(remaining qty) over open SELL orders on that instrument
```

`remaining = quantity - filledQuantity`. The price basis is the limit price, or the instrument's
live price for a `MARKET` order (an estimate — the real fill price is whatever the simulator
uses). The whole check-then-insert runs in one interactive `$transaction`, so two concurrent
submits cannot both pass.

**Ownership.** Every read and the cancel path filter on `userId`, so another trader's order comes
back as a 404 rather than a 403 — it does not leak that the id exists.

**Cancellation** is allowed only from `NEW` / `PROCESSING` / `PARTIALLY_FILLED`
(`isOpenOrderStatus` in `shared-types`). Creating and cancelling each append an `OrderEvent`, so
`GET /orders/:id` returns the full audit trail alongside executions.

### Web orders

- `/` market page: instruments table plus an order ticket; clicking a row selects the instrument.
  Selection is **derived** during render (falls back to the first instrument) rather than set in
  an effect.
- `/orders`: status tabs backed by the API's `status` filter, each tab its own query key.
- `/orders/:id`: fill progress, average fill price, executions and event history.
- Number inputs register with `setValueAs` so form values are numeric and the Zod schema's input
  and output types match — React Hook Form's resolver requires that.

## Phase status

- **Phase 0 — Foundation:** done. Monorepo, TypeScript, lint/format, Docker infra, `/health`.
- **Phase 1 — Database schema:** done. Prisma schema + `init` migration, `PrismaModule`/`PrismaService`,
  seed (admin user + 5 instruments + admin portfolio).
- **Phase 2 — Auth:** done. `CommonModule` decorators + global JWT guard, `UsersModule`,
  `AuthModule` (`/auth/register`, `/auth/login`, `/auth/me`), throttling, validation.
  Web: React Router, TanStack Query, Zustand, Tailwind; login/register pages + protected dashboard.
- **Phase 3 — Market dashboard:** done. `EventsModule` (Socket.IO gateway + `EventsService`),
  `MarketModule` (instruments API + price engine). Web: live instruments table with sparklines.
- **Phase 4 — Order entry:** done. `OrdersModule` (create/list/detail/cancel with buying-power and
  holdings validation, order events). Web: order ticket, orders list with status tabs, order detail.
- Phases 5–8: see the project specification.
