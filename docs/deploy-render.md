# Render Deployment

This project can be deployed to Render as:

- `novelforge-api`: Docker-based web service
- `novelforge-web`: Static site

The current deployment target keeps SQLite and stores the database on a Render persistent disk. This means:

- backend must stay at `1` instance
- backend deploys are not zero-downtime
- SQLite data is preserved only under the mounted disk path

## 1. Prepare the repository

Push the current repository to GitHub, GitLab, or another Git provider supported by Render.

## 2. Create the backend service

Create a new Blueprint from the repo root or sync [render.yaml](/Users/linkzhao/workspace/AI/books_manage/render.yaml).

Render service details:

- Service: `novelforge-api`
- Runtime: `Docker`
- Root directory: `backend`
- Health check: `/api/health`
- Persistent disk mount path: `/app/data`
- Persistent disk size: `1 GB`

Required backend secrets:

- `DEEPSEEK_API_KEY`
- `ZHIPU_API_KEY`
- `OPENAI_API_KEY` if you plan to use OpenAI-backed model configs
- `ANTHROPIC_API_KEY` if you plan to use Anthropic-backed model configs

Important backend env vars:

- `PORT=10000`
- `DB_PATH=/app/data/novels.db`
- `NODE_ENV=production`

After the first deploy succeeds, open:

- `https://<your-backend>.onrender.com/api/health`

You should see a JSON response with `"status": "ok"`.

## 3. Create the frontend static site

Create the `novelforge-web` static site from the same Blueprint.

Before the first successful frontend deploy, set:

- `VITE_API_BASE_URL=https://<your-backend>.onrender.com/api`

This is required because the frontend is deployed as a separate static site, not through the same Nginx container as local Docker Compose.

## 4. Verify the app

Open the frontend URL and verify:

- novel list page loads
- creating a novel works
- chapter APIs return successfully
- AI status drawer connects during a generation task

## 5. Operational notes

- Do not scale the backend beyond one instance while using SQLite on a disk.
- Keep the SQLite file at `/app/data/novels.db`.
- Disk snapshots are managed by Render, but you should still export important writing data periodically.
- If you later need multi-instance backend scaling, migrate from SQLite to Postgres first.

## 6. Manual setup without Blueprint

If you do not use `render.yaml`, create the same two services manually:

1. Web Service
   - Source: this repo
   - Root dir: `backend`
   - Runtime: Docker
   - Attach persistent disk at `/app/data`

2. Static Site
   - Root dir: `frontend`
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Env var: `VITE_API_BASE_URL=https://<your-backend>.onrender.com/api`
