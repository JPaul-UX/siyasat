# syntax=docker/dockerfile:1

# ---- Build: install everything, compile the three packages, then drop what only the build needed ----
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# OpenSSL is here as well so that Prisma downloads the migration engine that matches the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app

# Manifests first, so the dependency layer is reused until one of them changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# The API with its production dependencies only, in a folder of its own.
RUN pnpm --filter @siyasat/api deploy --prod --legacy /out/api

# ---- Run ----
FROM node:22-slim
# Prisma's migration engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/api

COPY --from=build /out/api ./
COPY --from=build /app/apps/web/dist /app/apps/web/dist

USER node
EXPOSE 3000
# Apply any new database migrations, then start. The server also serves the built web app.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
