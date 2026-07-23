# syntax=docker/dockerfile:1

# Multi-stage build producing a minimal runtime image from Next.js standalone output.
# The standalone bundle traces only the files actually imported, so the final image carries
# neither the full node_modules tree nor the build toolchain.

# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# Alpine's musl needs libc6-compat for some native modules; @node-rs/argon2 ships a musl build,
# but this keeps other native deps working if any are added later.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
# `npm ci` installs exactly the lockfile, which is what makes the build reproducible.
RUN npm ci

# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma 7 no longer runs `generate` implicitly, and the client is generated into src/, so this
# must happen before the Next build or the imports fail.
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
# Switches next.config.ts to `output: "standalone"`.
ENV DOCKER_BUILD=1
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrations and the seed script are needed at runtime so a fresh deployment can prepare its own
# database (see docker-compose.prod.yml).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
