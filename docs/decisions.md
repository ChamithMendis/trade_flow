# Architecture Decision Log

Short records of non-obvious choices. Newest first.

## ADR-0001 — Modular monolith, npm workspaces

**Date:** 2026-08-27
**Status:** Accepted

- Single NestJS app with clear module boundaries (Auth, Users, Market, Orders, Exchange,
  Portfolio, WebSocket, Common) rather than microservices. The MVP goal is correct business
  behaviour and clean boundaries; services can be extracted later.
- Monorepo via **npm workspaces** (not pnpm) — one fewer tool to learn, and the spec allows either.
- `packages/shared-types` holds enums and contract types (order statuses, WS event names) so the
  web app and API cannot drift. Compiled to CommonJS with `tsc` so both a CJS (Nest) and a
  bundler (Vite) consumer resolve it cleanly.

## ADR-0002 — Linting: per-app linters, root Prettier

**Date:** 2026-08-27
**Status:** Accepted

- The Vite scaffold ships **oxlint**; the Nest scaffold ships **eslint**. Rather than force both
  onto one config, each app keeps its scaffolded linter and the root owns a single **Prettier**
  config for formatting. Revisit if the split causes friction.

## ADR-0013 — Exchange: one job per slice, locked transitions

**Date:** 2026-09-05
**Status:** Accepted

- **One BullMQ job applies one execution slice**, then enqueues a delayed continuation if
  quantity remains. Rejected alternative: a single job that sleeps between fills — it pins a
  worker for the life of the order and makes a retry replay every fill.
- Job id is `<orderId>-<sequence>`, deterministic from the execution count, so a retry cannot
  enqueue a duplicate continuation. `-` not `:` — BullMQ rejects `:` in custom ids.
- **Idempotency** rides on the `executions.executionReference` unique constraint. A replay is
  caught as Prisma P2002 and reported as `duplicate`; `filledQuantity` never advances twice.
  Verified against the live database, not just mocks.
- Two concurrency bugs found by the end-to-end test and fixed:
  - `applyExecution` and `cancel` both take `SELECT ... FOR UPDATE` on the order row. Without
    it, `READ COMMITTED` let a fill commit over a cancel and revive the order as `FILLED`.
  - `NEW → PROCESSING` / `NEW → REJECTED` use `updateMany` with a `status: NEW` filter so the
    guard and the write are one atomic statement. The unconditional update was resurrecting
    orders that had just been cancelled.
- Enqueue happens **after** the create transaction commits — otherwise the worker can race
  ahead of the order becoming visible.
- Cancellation does not remove queued jobs; the worker's status check makes them no-ops. Fewer
  moving parts than reaching into the queue, and it is the behaviour the spec's "a cancelled
  order cannot receive new execution processing" scenario actually asks for.
- `LIMIT` orders are clamped to their limit price rather than resting unfilled. Not how a real
  book works, but the spec explicitly excludes a matching engine and orders need to complete.

## ADR-0012 — Buying power counts open orders; no cash reservation

**Date:** 2026-09-05
**Status:** Accepted

- FR-06 only asks for "sufficient virtual cash". Checking `availableCash` alone is not enough:
  cash is not debited until an execution settles (Phase 7), so a trader could place several
  orders that are individually affordable but collectively are not.
- The check therefore subtracts what open orders have already committed:
  `availableCash − Σ(remaining × basis)` for open BUYs, and
  `position.quantity − Σ(remaining)` for open SELLs on that instrument.
- **Rejected alternative:** a real reservation ledger (debit on placement, refund on
  cancel/reject). More correct, but it needs its own state and unwind paths on every terminal
  transition — too much for the MVP, and the spec doesn't ask for it. Revisit if Phase 7's
  settlement makes the derived calculation awkward.
- For a `MARKET` order the basis is the instrument's live price, so the figure is an estimate;
  the fill price is whatever the simulator uses. Acceptable for a simulator, and the error is
  bounded by the ±1% tick.
- Check and insert share one interactive `$transaction`, so concurrent submits serialise.
- Reads and cancel are scoped by `userId` and return **404** (not 403) for another trader's
  order, so the endpoint doesn't confirm the id exists.

## ADR-0011 — `shared-types` ships dual CJS + ESM

**Date:** 2026-09-05
**Status:** Accepted (supersedes the CJS-only decision in ADR-0001)

- The package was CommonJS-only. That worked while the web app imported **types** from it —
  TypeScript erases those, so no runtime import ever reached the browser. The first runtime
  value import (`WsEvent`, Phase 3) broke the dev server with
  _"does not provide an export named 'WsEvent'"_: Vite serves linked workspace packages as
  source and does not apply CJS→ESM interop to them.
- Fixed by emitting both formats via TS project references
  (`tsconfig.cjs.json` → `dist/cjs`, `tsconfig.esm.json` → `dist/esm`, driven by `tsc -b`)
  behind a conditional `exports` map with per-condition `types`. Nest and Jest take `require`
  → CJS; Vite takes `import` → ESM.
- `scripts/write-esm-marker.mjs` drops `{"type":"module"}` into `dist/esm/` because the package
  root is `"type": "commonjs"` — without it Node would read the ESM output as CommonJS.
- **Operational note:** changing an `exports` map requires clearing Vite's cache
  (`rm -rf apps/web/node_modules/.vite`); it caches resolved paths across restarts.

## ADR-0010 — Socket events go through `EventsService`, not the gateway

**Date:** 2026-09-05
**Status:** Accepted

- `EventsModule` exports only `EventsService`; the gateway stays private. Market (and later
  Orders, Exchange, Portfolio) inject the service, so business code never imports a transport
  class. That keeps the Phase 6 change — JWT handshake auth and per-user rooms — inside one
  module, and keeps NFR-05 (future service extraction) open.
- Phase 3 deliberately leaves the socket **unauthenticated**: prices are public market data
  and every client just joins the `market` room. Per-user authorisation lands in Phase 6 with
  order events, which are the data that actually needs it.

## ADR-0009 — Price engine: dynamic interval, batched writes

**Date:** 2026-09-05
**Status:** Accepted

- Registered via `SchedulerRegistry.addInterval` in `onModuleInit` instead of a static
  `@Interval(3000)` decorator, because the decorator takes a compile-time constant.
  `MARKET_TICK_MS` now tunes the cadence and `0` turns the engine off — useful for tests and
  for a deployment that shouldn't be writing to the DB every 3 seconds.
- Each tick writes **all** instruments in a single `$transaction` rather than N separate
  updates, so a tick is atomic and readers never see a half-applied tick.
- A `running` flag drops a tick if the previous one is still in flight, and the whole body is
  wrapped in `try/catch` — an unhandled rejection inside `setInterval` would otherwise take
  down the process.
- Movement is a bounded random walk (±1% per tick, price floor of 1). Simple and obviously
  fake, which is the point: the spec explicitly rules out a real matching engine.

## ADR-0008 — Web auth state: token in Zustand, user via TanStack Query

**Date:** 2026-08-29
**Status:** Accepted

- Only the JWT is persisted (Zustand `persist` → `localStorage`). The authenticated user is
  **not** stored; it is fetched from `GET /auth/me` through TanStack Query and cached in memory.
  Avoids a stale user object surviving in storage after role/name changes or logout elsewhere.
- The axios response interceptor clears the token on any `401`; `ProtectedRoute` handles the
  redirect. Keeps "session expired" handling in one place.
- Path alias `@/*` → `src/*` (tsconfig `paths` + Vite `resolve.alias`). No `baseUrl` — TS 6
  deprecates it and `paths` now resolves relative to the config file.

## ADR-0007 — Jest uses `@swc/jest`; `@nestjs/config` adopted

**Date:** 2026-08-29
**Status:** Accepted

- `@nestjs/jwt`, `@nestjs/config` and `@nestjs/passport` v12 ship **ESM-only** (no `require`
  export). Jest (CommonJS) cannot load them under `ts-jest`. Switched the Jest transform to
  **`@swc/jest`** (`.swcrc` with `legacyDecorator` + `decoratorMetadata`), added a
  `transformIgnorePatterns` exception so those three packages are transpiled, and a
  `moduleNameMapper` (`^(\.{1,2}/.*)\.js$` → `$1`) so the Prisma 7 client's `.js` import
  specifiers resolve to its `.ts` files. `nest build` still uses `tsc` — unaffected.
- `@nestjs/config` is now in (deferred from Phase 1). It loads the root `.env`
  (`envFilePath` = `<cwd>/../../.env`) and validates required vars via `class-validator`
  (`validateEnv`). `src/config/load-env.ts` stays — it runs before Nest DI so `PrismaService`'s
  constructor still sees `DATABASE_URL`.

## ADR-0006 — Argon2 via `@node-rs/argon2`, seed/scripts via `tsx`

**Date:** 2026-08-28
**Status:** Accepted

- The reference `argon2` package needs a native C++ toolchain (node-gyp + Visual Studio),
  which isn't installed. **`@node-rs/argon2`** ships prebuilt binaries (Rust/napi-rs), same
  Argon2id algorithm, no compiler. Still satisfies the spec ("bcrypt or Argon2").
- Prisma 7's generated client imports siblings with `.js` specifiers that resolve to `.ts`
  files; `ts-node` can't follow that. **`tsx`** runs `prisma/seed.ts` (and future scripts)
  with zero config.

## ADR-0005 — Prisma 7 with driver adapter + root `.env`

**Date:** 2026-08-28
**Status:** Accepted

- Using the current **Prisma 7** (`prisma-client` generator). Differences from older tutorials:
  generated client is TypeScript emitted into `src/generated/prisma` (git-ignored, regenerated
  on `postinstall`/`build`); datasource URL is **not** in `schema.prisma` — it lives in
  `prisma7.config.ts` for the CLI and is passed to `PrismaClient` at runtime via the
  **`@prisma/adapter-pg`** driver adapter (Prisma 7 requires an adapter).
- One `.env` at the repo root is the single source of truth. `prisma7.config.ts` loads it with
  `dotenv`; the Nest app loads it via `src/config/load-env.ts` (imported first in `main.ts`),
  relying on every API entrypoint running with `apps/api` as its cwd. `@nestjs/config` is
  deferred to Phase 2.
- Prisma 7 also drops AI-assistant "skill" files (`.claude/`, `.windsurf/`, `.agents/`,
  `skills-lock.json`) into the app dir on CLI runs — these are git-ignored, not committed.

## ADR-0004 — Table names `snake_case`, columns camelCase

**Date:** 2026-08-28
**Status:** Accepted

- `@@map` gives every table a `snake_case` name (`order_events`, etc.). Columns are left as
  Prisma's default camelCase rather than annotating every field with `@map` — standard practice
  in Prisma projects and keeps the schema readable. Raw SQL must quote identifiers (`"userId"`).

## ADR-0003 — Local infra via Docker Compose

**Date:** 2026-08-27
**Status:** Accepted

- Postgres 16 + Redis 7 run as containers (`docker-compose.yml`). Keeps local dev reproducible and
  matches what CI will use. Requires Docker Desktop with the WSL2 backend on Windows.
