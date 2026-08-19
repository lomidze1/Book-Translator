# ---------------------------------------------------------------------------
# Stage 1: build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# bcrypt is a native addon with no musl prebuilds — it compiles from source.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Every workspace importer's manifest: --frozen-lockfile validates all of them.
# tsconfig.base.json is what apps/api/tsconfig.json extends — without it the
# Nest build silently loses experimentalDecorators and fails with ~700 errors.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/reader/package.json packages/reader/

# No --ignore-scripts: bcrypt and the Prisma engines need their build scripts
# (pnpm-workspace.yaml's onlyBuiltDependencies is the allowlist).
RUN pnpm install --frozen-lockfile --filter @book-translator/api...

COPY apps/api/ apps/api/

RUN pnpm --filter @book-translator/api exec prisma generate
RUN pnpm --filter @book-translator/api build

# Self-contained deployment directory: real node_modules, no pnpm symlinks
# pointing outside the tree.
RUN pnpm deploy --legacy --prod --filter @book-translator/api /prod/api

# `pnpm deploy` packs the project with npm-pack semantics, which skips
# gitignored build output — copy the artifacts we actually ship explicitly.
RUN cp -r apps/api/dist /prod/api/dist \
 && cp -r apps/api/prisma /prod/api/prisma

# Generate the Prisma client inside the tree that ships, so the query engine
# lands in the node_modules the runtime image uses.
RUN cd /prod/api && node_modules/.bin/prisma generate

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=builder /prod/api ./

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# `exec` hands PID 1 to node so it actually receives Railway's SIGTERM;
# without it the shell stays PID 1 and the container is SIGKILLed instead.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main"]
