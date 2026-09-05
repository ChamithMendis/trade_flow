# TradeFlow

A real-time trading **simulator**. Users manage a virtual cash balance, view simulated market
prices, place buy/sell orders that are executed asynchronously by an exchange simulator (with
partial fills), and track a virtual portfolio updated in real time over WebSockets.

> TradeFlow does not connect to a real exchange and does not process real money. Everything is
> simulated.

## Tech stack

| Layer      | Tech                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Web        | React + TypeScript + Vite, React Router, TanStack Query, Zustand, Tailwind CSS + shadcn/ui, Recharts, Socket.IO client |
| API        | NestJS + TypeScript (modular monolith)                                                                                 |
| Database   | PostgreSQL + Prisma                                                                                                    |
| Async jobs | BullMQ + Redis                                                                                                         |
| Real time  | Socket.IO                                                                                                              |
| Auth       | JWT + Argon2                                                                                                           |

## Repository layout

```
tradeflow/
├── apps/
│   ├── web/            # React + Vite frontend
│   └── api/            # NestJS backend
├── packages/
│   └── shared-types/   # Enums & contract types shared by web + api
├── docs/
│   ├── architecture.md
│   └── decisions.md    # architecture decision log
└── docker-compose.yml  # Postgres + Redis for local dev
```

## Prerequisites

- Node.js 20 (`nvm use` picks it up from `.nvmrc`)
- Docker Desktop (WSL2 backend) — for local Postgres + Redis

## Setup

```bash
# 1. install dependencies (npm workspaces)
npm install

# 2. environment
cp .env.example .env

# 3. start Postgres + Redis
npm run infra:up

# 4. apply migrations + seed (admin user, 5 instruments)
npm run db:migrate
npm run db:seed

# 5. run web + api + shared-types in watch mode
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000
- **API docs (Swagger): http://localhost:3000/docs**
- API health check: http://localhost:3000/health
- Prisma Studio (browse the DB): `npm run db:studio`

Then open http://localhost:5173, register a trader (you start with $100,000 virtual cash), or
sign in as the seeded admin: `admin@tradeflow.local` / `admin12345`. The market dashboard
streams simulated price changes over WebSockets — set `MARKET_TICK_MS` in `.env` to change the
cadence (`0` disables the price engine).

## Scripts (run from repo root)

| Script               | Does                                          |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | shared-types (watch) + api + web concurrently |
| `npm run build`      | build all workspaces                          |
| `npm run lint`       | lint api (eslint) + web (oxlint)              |
| `npm run format`     | Prettier write across the repo                |
| `npm run typecheck`  | type-check all workspaces                     |
| `npm run infra:up`   | start Postgres + Redis containers             |
| `npm run infra:down` | stop them                                     |
| `npm run db:migrate` | apply Prisma migrations (dev)                 |
| `npm run db:seed`    | seed reference data                           |
| `npm run db:studio`  | open Prisma Studio                            |

Per-app: `npm test -w @tradeflow/api` (unit) and `npm run test:e2e -w @tradeflow/api`
(the specification's critical scenarios, against a real Postgres and Redis).

## Tests

Unit tests cover order validation, the price engine, settlement arithmetic and idempotent
execution handling. The end-to-end suite in `apps/api/test/critical-scenarios.e2e-spec.ts` runs
the eight scenarios from §14 of the specification against real infrastructure:

1. A user cannot buy shares without sufficient virtual cash.
2. A user cannot sell more shares than they own.
3. An order can move through multiple partial fills.
4. A fully filled order cannot be cancelled.
5. A cancelled order cannot receive new execution processing.
6. The same execution processed twice does not change the portfolio twice.
7. A user cannot access another user's orders or portfolio.
8. WebSocket clients receive only their own events.

```bash
npm run infra:up                       # Postgres + Redis must be running
npm run test:e2e -w @tradeflow/api
```

## Running the whole stack in Docker

```bash
docker compose --profile full up -d --build   # web on :8080, api on :3000
docker compose exec api npx prisma db seed
```

See [docs/deployment.md](docs/deployment.md) for hosted deployment.

## Build status

All eight phases complete: foundation, database schema, authentication, market dashboard with
live prices, order entry, exchange simulator, real-time order updates, portfolio, and quality
tooling (tests, OpenAPI docs, containers, CI). See `docs/decisions.md` for the running decision
log and `docs/architecture.md` for how the pieces fit together.
