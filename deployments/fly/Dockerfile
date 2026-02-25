FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner

RUN groupadd -r bitbit && useradd -r -g bitbit -d /app bitbit

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER bitbit
EXPOSE 3001

CMD ["node", "dist/worker.js"]
