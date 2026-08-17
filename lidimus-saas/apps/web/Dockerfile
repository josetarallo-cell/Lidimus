FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Instala dependências
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/revisao/package.json ./packages/revisao/
COPY packages/croqui/package.json ./packages/croqui/
COPY packages/docx/package.json ./packages/docx/

RUN pnpm install --frozen-lockfile

# Copia código-fonte
COPY apps/web ./apps/web
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/revisao ./packages/revisao
COPY packages/croqui ./packages/croqui
COPY packages/docx ./packages/docx

# Build Nuxt
WORKDIR /app
RUN pnpm --filter web build

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/.output/server/index.mjs"]
