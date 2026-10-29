# syntax=docker/dockerfile:1
# One container: the Next.js site and the backend (API, indexer, fee router, airdrops). Next proxies /api/* to the
# backend on 127.0.0.1:42069. Dokploy runs it as a Swarm service and updates it start-first, so the new version
# takes over before the old one stops (docs/DOKPLOY.md).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY web/package.json web/

FROM manifests AS dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
# A new id per build: a browser still on the previous version reloads on its next navigation instead of mixing
# old and new code. Pass the commit as DEPLOYMENT_ID if you like; the build time is the fallback.
ARG DEPLOYMENT_ID
# Same-origin API: the browser calls /api/*, which Next proxies to the backend.
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=
RUN NEXT_DEPLOYMENT_ID="${DEPLOYMENT_ID:-$(date +%s)}" pnpm --filter @cook/web build \
 && rm -rf web/.next/cache \
 && mv web/.next/static web/static-build

FROM manifests AS production-dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:22-bookworm-slim AS app
WORKDIR /app
# DATA_DIR holds the SQLite database, demo wallets and uploaded images: mount a volume there (docs/DOKPLOY.md).
ENV NODE_ENV=production PORT=3000 BACKEND_PORT=42069 BACKEND_URL=http://127.0.0.1:42069 \
    DATA_DIR=/app/data UPLOAD_DIR=/app/data/uploads NEXT_TELEMETRY_DISABLED=1
COPY --from=production-dependencies --chown=node:node /app ./
COPY --chown=node:node packages/shared/src ./packages/shared/src
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/tsconfig.json ./backend/
COPY --chown=node:node web/next.config.ts web/tsconfig.json ./web/
COPY --chown=node:node web/public ./web/public
COPY --chown=node:node deploy ./deploy
COPY --from=build --chown=node:node /app/web/.next ./web/.next
COPY --from=build --chown=node:node /app/web/static-build ./web/static-build
# web/.next/static is filled at start (deploy/publish-static.mjs); a Dokploy volume there keeps earlier builds' files.
RUN mkdir -p data web/.next/static && chown node:node data web/.next/static
USER node
EXPOSE 3000
# Healthy includes "standby": during an update the new server waits for the old one to hand over background work.
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "deploy/start.mjs"]
