# Stage 1: Install dependencies (Keep Bun for speed)
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build the application (Switch to Node.js for stability)
FROM node:20-alpine AS builder
WORKDIR /app
# Copy the installed node_modules from the Bun stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# Use standard npm/Node to build so Turbopack doesn't crash
RUN npm run build

# Stage 3: Production runner (Node.js)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set correct permissions
RUN mkdir .next && chown nextjs:nodejs .next

# Copy the standalone output and static files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]