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
