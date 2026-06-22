FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Instala dependências
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/

RUN pnpm install --frozen-lockfile

# Copia código-fonte
COPY apps/web ./apps/web
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue

# Build Nuxt
WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", ".output/server/index.mjs"]
