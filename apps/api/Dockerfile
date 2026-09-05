# Multi-stage build for the NestJS API.
# Context is the REPO ROOT, because npm workspaces hoist dependencies there:
#   docker build -f apps/api/Dockerfile .

# ---- deps -------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /repo

# Only the manifests, so this layer caches until a dependency actually changes.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# The api's postinstall runs `prisma generate`, which needs the schema present.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma7.config.ts apps/api/

RUN npm ci --ignore-scripts

# ---- build ------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

RUN npm run build -w @tradeflow/shared-types \
 && npm run build -w @tradeflow/api

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production

# Drop privileges *before* installing. The Prisma CLI writes its engines into
# node_modules on first run, so that tree has to be writable by the runtime
# user. Installing as `node` gets that for free — a `chown -R` afterwards would
# duplicate every file into a new layer and quadruple the image size.
RUN mkdir -p /repo && chown node:node /repo
WORKDIR /repo
USER node

COPY --chown=node:node package.json package-lock.json .npmrc ./
COPY --chown=node:node packages/shared-types/package.json packages/shared-types/
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node apps/api/prisma apps/api/prisma
COPY --chown=node:node apps/api/prisma7.config.ts apps/api/

# Scoped to this app's workspaces — an unscoped install would also pull in the
# web app's runtime dependencies (React, Recharts, …), which the API never uses.
RUN npm ci --omit=dev --ignore-scripts \
      --workspace @tradeflow/api \
      --workspace @tradeflow/shared-types \
      --include-workspace-root

COPY --from=build --chown=node:node /repo/packages/shared-types/dist packages/shared-types/dist
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist

# The API resolves the root .env relative to its cwd, and Prisma's CLI expects
# to run from the app directory.
WORKDIR /repo/apps/api

EXPOSE 3000

# `migrate deploy` applies pending migrations without prompting, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
