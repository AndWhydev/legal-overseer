# Legal Overseer — Windows Server installation script.
#
# Run from an elevated PowerShell prompt on a Windows Server with
# Docker Desktop OR Docker Engine for Windows already installed.
#
#   PS> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   PS> .\install-windows.ps1 -LicenceFile C:\Path\To\licence.key
#
# Re-running is safe; existing .env and licence.key files are kept.

[CmdletBinding()]
param(
  [string]$InstallDir = "C:\LegalOverseer",
  [string]$LicenceFile = "",
  [string]$LicenceKey = "",
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

function Test-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Error "This installer must be run as Administrator."
  exit 1
}

Write-Host "==> Checking prerequisites"
try {
  $docker = docker version --format '{{.Server.Version}}' 2>$null
  if (-not $docker) { throw "docker not running" }
  Write-Host "    Docker engine: $docker"
} catch {
  Write-Error @"
Docker Engine is required but is not running.

Install Docker Desktop or Docker Engine for Windows Server from
https://docs.docker.com/engine/install/ and ensure the daemon is
running, then re-run this installer.
"@
  exit 2
}

try { docker compose version | Out-Null } catch {
  Write-Error "Docker Compose plugin not found. Install Docker Desktop 4.x or newer."
  exit 2
}

$DataDir = Join-Path $InstallDir "data"
New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir,
  (Join-Path $DataDir "matters"),
  (Join-Path $DataDir "inbox-monitor"),
  (Join-Path $DataDir "backups") | Out-Null

Write-Host "==> Copying compose files to $InstallDir"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
Copy-Item -Force -Recurse `
  -Path (Join-Path $RepoRoot "*") `
  -Destination $InstallDir `
  -Exclude @("data", ".env", ".git")

if (-not (Test-Path (Join-Path $InstallDir ".env"))) {
  Copy-Item -Force `
    -Path (Join-Path $RepoRoot ".env.example") `
    -Destination (Join-Path $InstallDir ".env")
  Write-Host "    Created $InstallDir\.env from template — edit it before going live."
}

# --- licence ---
$LicencePath = Join-Path $DataDir "licence.key"
if ($LicenceFile -and (Test-Path $LicenceFile)) {
  Copy-Item -Force $LicenceFile $LicencePath
} elseif ($LicenceKey) {
  Set-Content -Path $LicencePath -Value $LicenceKey -NoNewline
} elseif (-not $NonInteractive -and -not (Test-Path $LicencePath)) {
  Write-Host ""
  Write-Host "Paste your Legal Overseer licence key (single line, then press Enter):"
  $KeyInput = Read-Host
  if ($KeyInput) {
    Set-Content -Path $LicencePath -Value $KeyInput -NoNewline
  }
}
if (-not (Test-Path $LicencePath)) {
  Write-Host "    No licence key installed yet — the system will boot in 14-day trial mode."
}

# Lock down ACLs on the data directory.
Write-Host "==> Hardening data directory ACLs"
$acl = Get-Acl $DataDir
$acl.SetAccessRuleProtection($true, $false)
$adminsSid = New-Object System.Security.Principal.SecurityIdentifier `
  ([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null)
$systemSid = New-Object System.Security.Principal.SecurityIdentifier `
  ([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null)
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule `
  ($adminsSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule `
  ($systemSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($adminRule)
$acl.AddAccessRule($systemRule)
Set-Acl -Path $DataDir -AclObject $acl

Write-Host "==> Starting Legal Overseer"
Set-Location $InstallDir
docker compose up -d --build

# --- scheduled task to ensure the stack is up after reboot ---
$TaskName = "LegalOverseerAutoStart"
try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"cd '$InstallDir'; docker compose up -d`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal | Out-Null
Write-Host "    Auto-start scheduled task registered: $TaskName"

$DashboardUrl = "http://localhost:3000/setup"
Write-Host @"

============================================================
Legal Overseer is starting.

Next steps:
  1. Open $DashboardUrl in a browser on this server.
  2. Walk through the first-run setup wizard.
  3. Edit $InstallDir\.env to add SMTP + inbox credentials.
  4. Restart with:  docker compose restart  (from $InstallDir)

To check status:
  docker compose -f "$InstallDir\docker-compose.yml" ps
  Invoke-WebRequest http://127.0.0.1:8080/health | Select Content

Updating:
  cd $InstallDir
  docker compose pull
  docker compose up -d

Support: support@legaloverseer.com.au
============================================================
"@
