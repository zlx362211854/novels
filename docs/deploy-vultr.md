# Vultr Deployment

This guide deploys the current project to a single Vultr VPS with Docker Compose.

Recommended target:

- OS: `Ubuntu 24.04 LTS`
- CPU/RAM: at least `1 vCPU / 2 GB RAM`
- Region: `Tokyo` or `Seoul`
- DNS: point `novel.stackfield.org` to the VPS public IPv4

This project runs as:

- frontend container on port `80`
- backend container on port `3001`
- SQLite database stored in Docker volume `data-volume`

## 1. Connect to the server

From your local machine:

```bash
ssh root@<YOUR_SERVER_IP>
```

If you created a sudo user, use that user instead of `root`.

## 2. Install Docker and Compose

Run on the server:

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
docker --version
docker compose version
```

## 3. Open firewall ports

In Vultr firewall or the instance firewall, allow:

- `22` for SSH
- `80` for web access
- `443` for HTTPS if you add TLS later

If you use `ufw` on the server:

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

## 4. Pull the project

Choose a directory and clone the repo:

```bash
mkdir -p /opt
cd /opt
git clone <YOUR_GIT_REPO_URL> books_manage
cd /opt/books_manage
```

If the repo is private, use an SSH remote or a personal access token.

## 5. Create the environment file

At the repo root:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
nano /opt/books_manage/.env
```

At minimum fill:

```env
ZHIPU_API_KEY=your_real_key
DEEPSEEK_API_KEY=your_real_key
DEFAULT_AI_MODEL=deepseek
REVIEW_STRICTNESS=strict
```

If you plan to use OpenAI or Anthropic from per-novel or per-graph settings, also add:

```env
OPENAI_API_KEY=your_real_key
ANTHROPIC_API_KEY=your_real_key
```

## 6. Start the services

From `/opt/books_manage`:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## 7. Verify the deployment

Run on the server:

```bash
curl http://127.0.0.1/api/health
```

Then test from your browser:

- `http://<YOUR_SERVER_IP>/`
- `http://novel.stackfield.org/`

Expected health response:

```json
{"status":"ok","timestamp":"..."}
```

## 8. DNS setup

In Dynadot DNS, the recommended record for this project is:

- Subdomain: `novel`
- Record type: `A`
- Value: `<YOUR_SERVER_IP>`

You only need a root-domain `A` record if you also want `stackfield.org` itself to open this app.

## 9. Update the deployment

When you push new code:

```bash
cd /opt/books_manage
git pull
docker compose up -d --build
```

GitHub Actions deploy note:

- If you use SSH-based auto deploy, `DEPLOY_HOST` must be a plain host or IP, for example `novel.stackfield.org` or `123.123.123.123`.
- Do not include `http://`, `https://`, username, or port inside `DEPLOY_HOST`.
- Keep `DEPLOY_USER` aligned with the account that actually owns the matching `authorized_keys` entry on the server.

## 10. Backup the database

This project stores SQLite data in the Docker volume `data-volume`.

Create a backup directory:

```bash
mkdir -p /opt/books_manage_backups
```

Backup command:

```bash
docker run --rm \
  -v books_manage_data-volume:/from \
  -v /opt/books_manage_backups:/to \
  alpine sh -c "cp -r /from /to/data-$(date +%F-%H%M%S)"
```

## 11. Useful commands

Restart:

```bash
docker compose restart
```

Stop:

```bash
docker compose down
```

Rebuild a single service:

```bash
docker compose up -d --build backend
docker compose up -d --build frontend
```

Inspect backend logs:

```bash
docker compose logs --tail=200 backend
```

## 12. Optional next step: HTTPS

The current repo-level Docker Compose setup exposes plain HTTP on port `80`.

For HTTPS, the clean next steps are:

- put Cloudflare in front and later add a proper origin cert, or
- add host-level Caddy / Nginx as TLS terminator

Do not use self-signed certs directly in the browser-facing path unless you only access it privately.
