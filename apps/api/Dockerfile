# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app

# Copy monorepo manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY apps/api/ apps/api/
COPY packages/ packages/

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build
RUN pnpm --filter @book-translator/api build

# Stage 2: Production
FROM node:20-alpine AS runner

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps_node_modules

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
