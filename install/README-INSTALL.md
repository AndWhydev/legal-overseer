# Legal Overseer — Installation Guide

**Audience:** the IT person at the law firm. Assumes Linux or Windows
Server admin skills. Does not assume Node.js or Docker expertise.

This guide walks you through a clean install on the firm's own server.
Legal Overseer is on-prem only. No firm data leaves your perimeter
except for explicitly-redacted text sent to the AI model provider.

If you've done this before, the short version is:

```bash
# Linux
sudo ./install/install.sh

# Windows (elevated PowerShell)
.\install\install-windows.ps1 -LicenceFile C:\path\to\licence.key
```

Then open `http://<server>:3000/setup` and walk the wizard.

---

## 1. What you'll have at the end

A single Docker container running on the firm's server, plus a SQLite
file holding every matter, deadline, review queue row, and audit log
entry. Backups are: stop the container, copy the data directory,
start again.

Two ports:

| Port | What's on it           | Reachable from               |
|------|------------------------|------------------------------|
| 8080 | `/health` + `/version` | Localhost (loopback) by default. Front with a reverse proxy if you need remote health probes. |
| 3000 | The dashboard          | Localhost. Front with the firm's existing reverse proxy + SSO if remote users need it. |

The data directory (default `/opt/legal-overseer/data` on Linux,
`C:\LegalOverseer\data` on Windows) sits OUTSIDE the container. As
long as you back up this directory you have backed up the firm.

---

## 2. Prerequisites

### Server sizing

| Firm size            | vCPU | RAM | Disk           |
|----------------------|------|-----|----------------|
| Small (≤5 users)     | 2    | 4 GB| 50 GB SSD      |
| Mid (≤20 users)      | 4    | 8 GB| 200 GB SSD     |
| Enterprise (>20)     | 8    | 16 GB | 500 GB+ SSD |

Disk is dominated by matter folders + attachments — size to your
historic case load. SQLite itself stays small (10 MB per ~1000
matters).

### OS

- Linux: Ubuntu 22.04 LTS, Debian 12, RHEL 9, Rocky Linux 9.
- Windows: Windows Server 2022 (Docker Engine for Windows) or
  Windows Server 2019 with Docker Desktop.

### Software dependencies

- Docker Engine 24+ and the Docker Compose plugin.
- `curl` and `tar` for the install script.
- 443/tcp egress to `api.anthropic.com` and (optionally)
  `updates.legaloverseer.com.au`.
- 587/tcp or 465/tcp egress to your SMTP relay.
- 993/tcp egress to your IMAP host (if you're using inbox monitoring).

### Network policy

The system is built for "behind the firewall" use. The dashboard
binds 127.0.0.1 by default. If your lawyers need remote access:

1. Put it behind your existing reverse proxy (nginx, IIS, Traefik).
2. Add SSO at the proxy layer (the product has its own
   username/password login, but proxy-level auth is recommended).
3. Set `FORCE_HTTPS=true` in `.env` so session cookies use the
   `Secure` flag.

### Time + DNS

Set the server's timezone to your firm's local timezone — every
deadline, audit row, and billing entry is timestamped in UTC but
displayed in local time on the dashboard.

---

## 3. Install (Linux)

```bash
# 1. As a normal user, drop the source tree onto the server.
git clone https://github.com/<vendor>/legal-overseer.git /tmp/legal-overseer
cd /tmp/legal-overseer

# 2. As root, run the installer. It creates an 'overseer' system
#    user, installs to /opt/legal-overseer, and brings the stack up.
sudo ./install/install.sh --licence-file /path/to/licence.key
```

The script:

- Installs to `/opt/legal-overseer` (override with `--install-dir`).
- Creates the `overseer` system user.
- Copies `docker-compose.yml` and `.env.example` to the install dir.
- Drops your licence key at `/opt/legal-overseer/data/licence.key`
  with mode `0600`.
- Builds and starts the container.
- Registers a `systemd` unit (`legal-overseer.service`) so the stack
  comes up at boot.

After the script finishes, finish setup at
`http://<server>:3000/setup`.

### Editing `.env`

Open `/opt/legal-overseer/.env` and fill in:

| Variable             | Why                                                   |
|----------------------|-------------------------------------------------------|
| `ADMIN_EMAIL`        | Where briefings and alerts land.                      |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Outbound mail. |
| `ANTHROPIC_API_KEY`  | Required if `ENABLE_TASK_PROCESSOR=true`.             |
| `LEGAL_EMAIL` + `LEGAL_EMAIL_PASS` | Inbox the system watches for new matters. |
| `CLIENT_EMAIL` / `COURT_EMAIL` / `INTERNAL_EMAIL` | Optional extra inbox slots. |
| `DEFAULT_JURISDICTION` | Defaults to NSW; set to your home state.            |
| `BRIEFING_ENABLED=true` + `BRIEFING_CRON` | Daily partner email. |
| `FORCE_HTTPS=true`   | If you put the dashboard behind a TLS proxy.          |

Then:

```bash
sudo systemctl restart legal-overseer
```

---

## 4. Install (Windows Server)

```powershell
# Open an elevated PowerShell prompt.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\install\install-windows.ps1 -LicenceFile C:\Path\To\licence.key
```

What it does:

- Installs to `C:\LegalOverseer` (override with `-InstallDir`).
- Locks down ACLs on the data directory so only `Administrators` and
  `SYSTEM` can read it.
- Registers a `LegalOverseerAutoStart` scheduled task that runs
  `docker compose up -d` at boot.
- Brings the stack up.

After the script finishes, finish setup at
`http://localhost:3000/setup`.

Edit `C:\LegalOverseer\.env` with Notepad or VS Code, save, and then:

```powershell
cd C:\LegalOverseer
docker compose restart
```

---

## 5. First-run wizard

Open `http://<server>:3000/setup`. Five short steps:

1. **Licence** — confirms the key is loaded and shows the tier.
2. **Firm details** — display name + default jurisdiction.
3. **First admin user** — the lawyer who will manage everyone else.
   Use a real email address; this account approves work product.
4. **Email connectivity** — optional; skip if you'll do it later in
   `.env`.
5. **Review &amp; finish** — flips `setup_state.completed=1` so the
   wizard never shows again.

The wizard is the only path that can create the first admin user.
Once it's done, only an admin can add more users.

---

## 6. Backup &amp; restore

The whole product state lives in one directory:

| Linux                          | Windows                  |
|--------------------------------|--------------------------|
| `/opt/legal-overseer/data`     | `C:\LegalOverseer\data`  |

Inside that directory:

- `legal-overseer.db` — the SQLite database (matters, deadlines,
  reviews, billing, audit log, users, sessions).
- `matters/` — one folder per matter, with attachments + drafts.
- `inbox-monitor/` — staging area for inbound attachments.
- `licence.key` — your installed licence.
- `backups/` — rolling snapshots from `npm run update`.

### Nightly backup (Linux example)

```bash
0 1 * * * /usr/bin/tar -C /opt/legal-overseer -czf \
  /mnt/firm-backups/legal-overseer-$(date +\%Y\%m\%d).tar.gz data
```

Replace `/mnt/firm-backups` with the firm's existing backup target.

### Restore

```bash
sudo systemctl stop legal-overseer
sudo tar -C /opt/legal-overseer -xzf /mnt/firm-backups/legal-overseer-20260520.tar.gz
sudo systemctl start legal-overseer
```

The audit chain is re-verified on the next `/health` call. If the
chain breaks (e.g. someone hand-edited the DB), `/health` reports
`status=unhealthy` and the dashboard banner turns red.

---

## 7. Upgrading

### Docker path (recommended)

```bash
cd /opt/legal-overseer/src-tree
sudo bash scripts/update.sh --docker --branch main
```

This pulls the latest tag, snapshots the SQLite file to
`data/backups/`, rebuilds the image, and restarts the container.

### Bare-metal path

```bash
cd /opt/legal-overseer/src-tree
sudo bash scripts/update.sh
```

Same flow, except the runtime is `node`/`tsx` directly, restarted via
`systemctl restart legal-overseer`.

### Update notifications

The runtime polls the vendor's `UPDATE_MANIFEST_URL` daily. When a
new version is available, the dashboard shows a banner and `/health`
reports `update.updateAvailable=true`. You can suppress remote checks
in regulated environments with `UPDATE_CHECK_DISABLED=true`.

---

## 8. Logs &amp; troubleshooting

| Symptom | Where to look |
|---------|---------------|
| Container won't start | `docker compose logs legal-overseer` |
| Dashboard 502 | Reverse proxy logs + `curl http://127.0.0.1:3000/` |
| Licence rejected | `curl http://127.0.0.1:8080/health \| jq .licence` — message field tells you why |
| Inbox not polling | `.env` `ENABLE_INBOX_MONITOR=true`, password set, IMAP host reachable |
| Outbound mail failing | `.env` SMTP block; test with `swaks` or the firm's preferred SMTP probe |
| Audit chain broken | `/health` reports `unhealthy`; do not write anything; restore the latest pre-incident backup |

Logs are JSON to stdout, rotated by Docker (`max-size=20m`,
`max-file=5`). On Linux: `journalctl -u legal-overseer -f`.

---

## 9. Uninstall

```bash
# Linux
sudo systemctl stop legal-overseer
sudo systemctl disable legal-overseer
sudo rm /etc/systemd/system/legal-overseer.service
sudo systemctl daemon-reload
docker compose -f /opt/legal-overseer/docker-compose.yml down
# Leave /opt/legal-overseer/data in place until you're sure the firm
# does not need to recover from it.
```

```powershell
# Windows
Unregister-ScheduledTask -TaskName "LegalOverseerAutoStart" -Confirm:$false
cd C:\LegalOverseer
docker compose down
# Keep C:\LegalOverseer\data until you're sure the firm does not need
# to recover from it.
```

---

## 10. Support

| Question                       | Where                              |
|--------------------------------|------------------------------------|
| Install / upgrade trouble      | support@legaloverseer.com.au       |
| Licence + billing              | sales@legaloverseer.com.au         |
| Security incident              | security@legaloverseer.com.au      |
| Source code &amp; PRs          | <vendor's GitHub URL>              |

Read `SECURITY.md` (next to this file) before going live.
