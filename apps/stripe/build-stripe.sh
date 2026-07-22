#!/bin/bash
set -euo pipefail

echo "=== Build Stripe app ==="

IMAGE_TAG="stripe-build:$(date +%s)"

docker build \
  -t "$IMAGE_TAG" \
  -f - \
  . << 'DOCKERFILE'
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm i --frozen-lockfile --prefer-offline

COPY . .

ENV NEXT_OUTPUT=standalone
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
CMD ["node", "server.js"]
DOCKERFILE

CID=$(docker create "$IMAGE_TAG")
rm -rf .next/standalone
docker cp "$CID:/app" .next/standalone
docker rm "$CID"

echo "=== Done ==="
echo "Output: .next/standalone/"
