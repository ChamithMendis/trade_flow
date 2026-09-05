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

- **Handshake auth runs as Socket.IO middleware** (`server.use` in `afterInit`), not in
  `handleConnection`. Middleware refuses the handshake and the client sees `connect_error`;
  disconnecting inside `handleConnection` lets the connection open first and only then tears it
  down, which the client briefly observes as a successful connect.
- On connect the client joins the shared `market` room **and** a private `user:<id>` room.
  Order events go only to that private room, so a trader can never receive another's (spec §14).
- `EventsService` is what other modules inject (`emitPriceUpdate`, `emitOrderEvent`), so Market,
  Orders and Exchange never import the gateway directly.
- `OrderNotifier` loads an order and pushes it to its owner. It lives in `events/` rather than
  `orders/` because OrdersModule already imports ExchangeModule — putting it in `orders/` would
  make those two modules circular. Importing the pure `toOrderDto` mapper creates no such cycle.

Every emit happens **after** its transaction commits, so a client never sees an order state the
database hasn't durably accepted.

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
- `useOrderSocket` (mounted once in `AppLayout`) writes each order event into the cached lists,
  honouring each list's status filter: an order moving `NEW → FILLED` is removed from the "New"
  tab and inserted into "Filled" with no refetch. The detail query is patched with the fields the
  event carries and then invalidated, because only a refetch brings the new executions.
- `useSocketConnection` opens the socket while a token exists and closes it on sign-out. The
  socket's `auth` is a **callback**, so reconnects read the current token instead of replaying a
  stale one.
- Terminal outcomes (filled, rejected, cancelled) raise a toast from a small Zustand store.

## Exchange simulator

`ExchangeModule` — a BullMQ worker on the `exchange` queue (Redis), plus `ExecutionService`,
which is the only code allowed to move an order's fill state.

**One job = one execution slice.** Rather than a single long job that sleeps between partial
fills, each job applies one slice and, if quantity remains, enqueues a delayed continuation. The
worker stays free between fills and every step is independently retryable
(`attempts: 3`, exponential backoff, failures retained for inspection).

**Job ids are deterministic:** `<orderId>-<sequence>`, where sequence is the order's current
execution count. BullMQ ignores an `add` for an id it already knows, so a retried job cannot
enqueue a second continuation. The separator is `-` because BullMQ rejects `:` in custom ids.

**Idempotency (NFR-04).** Every execution carries `executionReference = <orderId>:<sequence>`,
and that column is `@unique`. A replayed event loses the insert race, is caught as a P2002
violation, and returns `{ applied: false, reason: 'duplicate' }` — `filledQuantity` never moves
twice. The execution row, the order's new fill state and the order event all commit in one
transaction.

**Two races the design has to survive**, both against a concurrent cancel:

1. _Fill overwrites cancel._ `applyExecution` re-reads the order with
   `SELECT ... FOR UPDATE`, and `OrdersService.cancel` takes the same lock. Under
   `READ COMMITTED` a plain read would let a cancel commit between the status check and the
   update, and the update would silently revive the order as `FILLED`.
2. _Accept revives a cancelled order._ The `NEW → PROCESSING` and `NEW → REJECTED` transitions
   use `updateMany({ where: { id, status: NEW } })`, which compiles to
   `UPDATE ... WHERE status = 'NEW'` — guard and write in one atomic statement. An unconditional
   update would resurrect an order cancelled moments earlier. The order event is only written if
   that statement matched a row.

**Fill behaviour.** ~40% of the time the remainder fills in one go; otherwise a 25–75% slice, so
orders visibly pass through `PARTIALLY_FILLED`. `MARKET` fills at the live price with slight
slippage; `LIMIT` is clamped so it never fills worse than its limit — there is no order book, and
the spec rules out a real matching engine. Tunable via `EXCHANGE_REJECT_RATE`,
`EXCHANGE_MIN_DELAY_MS`, `EXCHANGE_MAX_DELAY_MS`.

Orders are enqueued **after** the create transaction commits, so the worker can never pick up an
order that isn't visible yet. Cancelling does not hunt down queued jobs — the worker's status
check turns them into no-ops.

## Portfolio

`PortfolioModule` — `GET /portfolio`, `/portfolio/positions`, `/portfolio/transactions`.

**Settlement shares the execution's transaction.** `SettlementService.settle(tx, ...)` takes the
caller's `Prisma.TransactionClient` rather than opening its own, because it runs inside
`ExecutionService.applyExecution`. That is the whole idempotency story: a replayed execution
fails the unique `executionReference` insert, the transaction rolls back, and **cash and
positions roll back with it**. Settlement in its own transaction would satisfy the order-level
guarantee while still double-charging the portfolio.

Per execution:

| Side | Cash                 | Position                                                        |
| ---- | -------------------- | --------------------------------------------------------------- |
| BUY  | `− quantity × price` | upsert; `newAvg = (oldQty·oldAvg + qty·price) / (oldQty + qty)` |
| SELL | `+ quantity × price` | `quantity −= qty`; row deleted at zero                          |

Selling leaves the average cost alone — it is the cost of what remains. Realized P/L is a V2
item per the spec, so nothing records it.

Both the portfolio row and the position row are read with `SELECT ... FOR UPDATE`, so two
executions settling for one trader serialise instead of both reading the same starting balance.

**Derived on read, never stored:** market value, cost basis and unrealized P/L are computed from
the instrument's live price when the endpoint is called. Storing them would mean every price
tick had to rewrite every position row.

`PortfolioModule` deliberately imports nothing from Exchange — ExchangeModule imports _it_, so a
dependency the other way would be circular.

### Web portfolio

- `/portfolio`: value/cash/holdings/P&L cards, positions table, Recharts allocation donut
  (positions plus cash), and the execution history.
- `usePortfolioSocket` invalidates on `portfolio.updated`. Unlike order events the payload is
  just a signal — the numbers are derived from live prices, so there is nothing to patch in place.

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
- **Phase 5 — Exchange simulator:** done. `ExchangeModule` (BullMQ worker, idempotent
  `ExecutionService`, partial fills, rejections, row-locked state transitions).
- **Phase 6 — Real-time order updates:** done. JWT handshake middleware, per-user rooms,
  `OrderNotifier`; web patches order caches from socket events and toasts terminal outcomes.
- **Phase 7 — Portfolio:** done. `SettlementService` inside the execution transaction (weighted
  average cost, row-locked cash and positions), portfolio/positions/transactions endpoints,
  web portfolio page with allocation chart.
- **Phase 8 — Quality and deployment:** done. End-to-end suite for the §14 scenarios, OpenAPI at
  `/docs`, Dockerfiles for both apps plus a `full` compose profile, GitHub Actions CI.

## Quality tooling

- **Unit tests** (`npm test -w @tradeflow/api`) cover order validation, the price engine,
  settlement arithmetic and idempotent execution handling.
- **End-to-end tests** (`npm run test:e2e -w @tradeflow/api`) run the specification's eight §14
  scenarios against real Postgres and Redis. See ADR-0017 for why some drive services directly.
- **OpenAPI** at `/docs`, generated by the `@nestjs/swagger` CLI plugin, which infers request
  schemas and validation constraints from the DTOs and their JSDoc — no hand-written
  `@ApiProperty` needed.
- **Containers:** `apps/api/Dockerfile` (multi-stage Node, runs `prisma migrate deploy` on start)
  and `apps/web/Dockerfile` (Vite build served by nginx with SPA fallback). Both take the
  repository root as build context because npm workspaces hoist dependencies there. The `full`
  compose profile runs the whole stack; the default profile stays infrastructure-only for dev.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, migrations, seed, unit and e2e tests
  and builds, with Postgres and Redis service containers; a second job builds both images.
