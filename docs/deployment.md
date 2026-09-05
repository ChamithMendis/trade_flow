# Deployment

TradeFlow needs four things running: PostgreSQL, Redis, the NestJS API, and the static React
bundle. Below is the container path (works anywhere) and a hosted path (least setup).

## Everything in Docker, locally

```bash
cp .env.example .env          # adjust JWT_SECRET at minimum
docker compose --profile full up -d --build
```

- Web: http://localhost:8080
- API: http://localhost:3000
- API docs: http://localhost:3000/docs

The `full` profile adds the `api` and `web` services on top of Postgres and Redis. Without it,
`docker compose up -d` still starts infrastructure only, which is what local development uses.

The API container runs `prisma migrate deploy` on start, so the schema is applied automatically.
Seed data is not applied automatically — run it once against the running stack:

```bash
docker compose exec api npx prisma db seed
```

## Hosted

The API needs a long-running Node process plus Postgres and Redis; the web app is static files.

**API — Railway, Render or Fly.io**

1. Point the service at this repository, Dockerfile `apps/api/Dockerfile`, build context the
   repository root (the Dockerfile assumes it, because npm workspaces hoist dependencies).
2. Add a PostgreSQL and a Redis instance and let the platform inject their URLs.
3. Set the environment:

   | Variable               | Notes                                                              |
   | ---------------------- | ------------------------------------------------------------------ |
   | `DATABASE_URL`         | from the managed Postgres                                          |
   | `REDIS_URL`            | from the managed Redis                                             |
   | `JWT_SECRET`           | **generate a fresh one**, at least 16 characters                   |
   | `JWT_EXPIRES_IN`       | e.g. `1d`                                                          |
   | `WEB_ORIGIN`           | the deployed web URL — CORS and the socket handshake both check it |
   | `API_PORT`             | whatever the platform expects, often `8080`                        |
   | `MARKET_TICK_MS`       | `3000`, or higher to reduce database writes                        |
   | `EXCHANGE_REJECT_RATE` | `0.1`                                                              |

**Web — Vercel, Netlify or Cloudflare Pages**

Vite inlines `VITE_*` variables at **build** time, so these are build settings, not runtime ones.
Changing them means rebuilding.

| Setting          | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| Build command    | `npm run build -w @tradeflow/shared-types && npm run build -w @tradeflow/web` |
| Output directory | `apps/web/dist`                                                               |
| `VITE_API_URL`   | the deployed API URL                                                          |
| `VITE_WS_URL`    | the same URL — Socket.IO shares the HTTP origin                               |

The host must serve `index.html` for unmatched paths, or `/orders` and `/portfolio` will 404 on
a hard refresh. `apps/web/nginx.conf` does this for the container image; Vercel and Netlify do it
for SPAs by default.

## After deploying

1. `npx prisma db seed` once, so the five instruments exist.
2. Open `/docs` and confirm the OpenAPI page renders.
3. Register a trader, place an order, and check it fills — that exercises the API, the database,
   Redis, the BullMQ worker and the WebSocket in one go.

## Notes

- **One web dyno, one API process.** The price engine runs on an interval inside the API, so two
  API replicas means two engines writing prices. Extracting the engine (and the BullMQ worker)
  into their own process is the natural first step if this ever needs to scale — the module
  boundaries are already drawn for it.
- `.npmrc` pins the public npm registry. Without it a machine configured for a private registry
  bakes that host into `package-lock.json`, and the Docker build then fails to authenticate.
