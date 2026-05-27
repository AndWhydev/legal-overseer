<#
  Legal Overseer - installer (Windows / PowerShell).

  Run once on the firm's own Windows server, from an elevated
  PowerShell prompt in the Legal Overseer folder:

      Set-ExecutionPolicy -Scope Process Bypass
      .\install-windows.ps1

  Installs dependencies, creates the .env file, prepares the data
  directory, and runs the database migrations. Nothing leaves the
  building.
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Say($m)  { Write-Host "> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }

# 1. Node version check (need 20+).
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node 20 or newer first."
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { throw "Node 20+ required (found $(node -v)). Please upgrade." }
Say "Node $(node -v) detected."

# 2. Install dependencies.
Say "Installing dependencies (this can take a few minutes)..."
if (Test-Path package-lock.json) { npm ci } else { npm install }

# 3. Create .env from the template if it does not exist.
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Say "Created .env from .env.example - open it now and fill in your firm's details."
} else {
  Warn ".env already exists - leaving it untouched."
}

# 4. Prepare the data directory.
New-Item -ItemType Directory -Force -Path data, data\matters, data\branding | Out-Null
Say "Created .\data working directories."

# 5. Run database migrations (idempotent).
Say "Applying database migrations..."
npx tsx -e "import('./src/db/index.js').then(m => { m.initializeDatabase(); m.closeDatabase(); console.log('Database ready.'); });"

Write-Host ""
Say "Install complete."
Write-Host "Next steps:"
Write-Host "  1. Edit .env and fill in SMTP, LEGAL_EMAIL, ANTHROPIC_API_KEY, INTAKE_FIRM_NAME."
Write-Host "  2. (Optional) Load sample data:        npm run demo:seed"
Write-Host "  3. Start the system:                   npm run dev"
Write-Host "  4. Open the dashboard:                 http://localhost:3000"
Write-Host "  5. Complete the first-run setup wizard to create the first lawyer user."
