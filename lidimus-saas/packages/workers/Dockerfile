FROM node:20-alpine AS base
RUN npm install -g pnpm

# poppler-utils: pdfinfo mede a página e pdftoppm recorta a palavra que o
# corretor de leitura mostra ao usuário. É a única dependência de sistema do
# worker — recortar direto na chamada (flags -x -y -W -H) evita trazer módulo
# nativo de imagem só para cortar um retângulo. Ver src/lib/recorte.ts.
RUN apk add --no-cache poppler-utils

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/revisao/package.json ./packages/revisao/
COPY packages/workers/package.json ./packages/workers/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/revisao ./packages/revisao
COPY packages/workers ./packages/workers

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node packages/workers/healthcheck.js

CMD ["pnpm", "--filter", "workers", "start"]
