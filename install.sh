#!/usr/bin/env bash
#
# Legal Overseer — installer (Linux / macOS).
#
# Run once on the firm's own server. Installs dependencies, creates the
# .env file from the template, prepares the data directory, and runs the
# database migrations. Nothing leaves the building.
#
#   bash install.sh
#
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

cd "$(dirname "$0")"

# 1. Node version check (need 20+).
command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install Node 20 or newer first."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required (found $(node -v)). Please upgrade."
say "Node $(node -v) detected."

# 2. Install dependencies.
say "Installing dependencies (this can take a few minutes)…"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 3. Create .env from the template if it does not exist.
if [ ! -f .env ]; then
  cp .env.example .env
  say "Created .env from .env.example — open it now and fill in your firm's details."
else
  warn ".env already exists — leaving it untouched."
fi

# 4. Prepare the data directory (SQLite DB, matter folders, backups).
mkdir -p data data/matters data/branding
say "Created ./data working directories."

# 5. Run database migrations (idempotent — safe to re-run).
say "Applying database migrations…"
npx tsx -e "import('./src/db/index.js').then(m => { m.initializeDatabase(); m.closeDatabase(); console.log('Database ready.'); });"

echo
say "Install complete."
echo "Next steps:"
echo "  1. Edit .env and fill in SMTP, LEGAL_EMAIL, ANTHROPIC_API_KEY, INTAKE_FIRM_NAME."
echo "  2. (Optional) Load sample data:        npm run demo:seed"
echo "  3. Start the system:                   npm run dev"
echo "  4. Open the dashboard:                 http://localhost:3000"
echo "  5. Complete the first-run setup wizard to create the first lawyer user."
