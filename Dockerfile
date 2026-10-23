# swingbus production image: Next.js standalone server, non-root, listens on $PORT.
#   docker build -t swingbus .
# Running it needs DRIVER_PASSWORD, ADMIN_PASSWORD, AUTH_SECRET and a volume
# at /data; PUBLIC_URL (address printed QR codes use) is optional.
# See README.md → Production.

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
# App files stay root-owned (read-only to the server); only /data is writable.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /data && chown node:node /data
# Numeric so orchestrators enforcing runAsNonRoot can verify it (1000 = node).
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Runtimes may set HOSTNAME to the container/pod name, which would make Next
# bind only that address; always listen on all interfaces.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
