# Multi-stage build for the React app, served by nginx.
# Context is the REPO ROOT:  docker build -f apps/web/Dockerfile .
#
# Vite inlines VITE_* variables at BUILD time, so the API URL is a build arg,
# not a runtime environment variable.

FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

ARG VITE_API_URL=http://localhost:3000
ARG VITE_WS_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build -w @tradeflow/shared-types \
 && npm run build -w @tradeflow/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
