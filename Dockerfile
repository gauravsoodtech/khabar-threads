# One image for the Node API and the Python scraper it spawns. Runs on Render's free tier (512 MB).
FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps in a venv (Debian's system Python is externally managed). Putting the venv on PATH
# means the API's `spawn("python", ...)` lands on it with no extra config.
COPY scraper/requirements.txt scraper/requirements.txt
RUN python3 -m venv /venv && /venv/bin/pip install --no-cache-dir -r scraper/requirements.txt
ENV PATH="/venv/bin:$PATH" TZ=UTC NODE_ENV=production

# Node deps
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

COPY scraper scraper
COPY backend backend

# Render injects PORT; the API reads it.
CMD ["node", "backend/src/index.ts"]
