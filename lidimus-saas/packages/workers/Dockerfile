FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/workers/package.json ./packages/workers/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/workers ./packages/workers

CMD ["pnpm", "--filter", "workers", "start"]
