FROM node:22-alpine

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/crypto/package.json packages/crypto/
COPY packages/logger/package.json packages/logger/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @starter/shared build \
  && pnpm --filter @starter/crypto build \
  && pnpm --filter @starter/logger build \
  && pnpm --filter @starter/db build \
  && pnpm --filter @starter/worker build

CMD ["node", "apps/worker/dist/index.js"]
