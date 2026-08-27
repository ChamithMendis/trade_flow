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

## ADR-0003 — Local infra via Docker Compose

**Date:** 2026-08-27
**Status:** Accepted

- Postgres 16 + Redis 7 run as containers (`docker-compose.yml`). Keeps local dev reproducible and
  matches what CI will use. Requires Docker Desktop with the WSL2 backend on Windows.
