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
