# Legal Overseer — production Docker image.
# Multi-stage build: install + native compile in a builder, ship a slim runtime.

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build dependencies for better-sqlite3 (native module).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cache layer).
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy the rest of the source.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Type-check (acts as a build verification step).
RUN npx tsc --noEmit

# Prune dev dependencies for the runtime stage.
RUN npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DASHBOARD_PORT=3000 \
    DATABASE_PATH=/data/legal-overseer.db \
    MATTER_FOLDERS_ROOT=/data/matters \
    INBOX_MONITOR_ATTACHMENTS_DIR=/data/inbox-monitor \
    LICENCE_FILE=/data/licence.key

# Runtime libs for better-sqlite3.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1100 overseer \
 && useradd  --system --uid 1100 --gid overseer --home-dir /app --shell /usr/sbin/nologin overseer \
 && mkdir -p /data/matters /data/inbox-monitor \
 && chown -R overseer:overseer /data

WORKDIR /app

# Copy production node_modules + source + scripts.
COPY --from=builder --chown=overseer:overseer /app/node_modules ./node_modules
COPY --from=builder --chown=overseer:overseer /app/package.json ./package.json
COPY --from=builder --chown=overseer:overseer /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=overseer:overseer /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=overseer:overseer /app/src ./src
COPY --from=builder --chown=overseer:overseer /app/scripts ./scripts

USER overseer

EXPOSE 8080 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD curl --fail --silent --max-time 5 http://127.0.0.1:8080/health || exit 1

# tini reaps zombie children and forwards SIGTERM cleanly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "./node_modules/.bin/tsx", "src/index.ts"]
