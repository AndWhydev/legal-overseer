FROM node:22-slim AS base

ARG INSTALL_CHROME="false"

# Install Chromium for headless browser tasks (PDF gen, scraping)
RUN if [ "$INSTALL_CHROME" = "true" ]; then \
      apt-get update && \
      apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        libnss3 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libgbm1 \
        libasound2 && \
      rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Non-root user for security
RUN groupadd -r bitbit && useradd -r -g bitbit -d /app bitbit
RUN chown -R bitbit:bitbit /app
USER bitbit

# Health check port (optional HTTP health endpoint)
EXPOSE 3001

CMD ["node", "dist/worker.js"]
