#!/bin/sh
set -e

# Start Redis in the background
redis-server --daemonize yes --maxmemory-policy noeviction --bind 127.0.0.1 --port 6379

# Wait for Redis to be ready
until redis-cli ping > /dev/null 2>&1; do
  sleep 0.5
done
echo "Redis is ready"

# Override REDIS_URL to use local Redis
export REDIS_URL="redis://127.0.0.1:6379"

# Run Twenty's original entrypoint
exec /app/entrypoint.sh "$@"
