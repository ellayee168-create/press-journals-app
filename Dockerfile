# PRESS Journals submission app
# Node + Playwright's Chromium (for PDF rendering) + native build tools (better-sqlite3/sharp)
# NOTE: we deliberately use Playwright's own Chromium build rather than Debian's
# `chromium` package — the distro build crashes (SIGILL) on ARM cloud VMs.
FROM node:20-bookworm-slim

# Build tools for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Install Playwright's Chromium + the system libraries it needs
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Persistent data (uploads + SQLite DB) lives under /app/uploads — mount a volume there
# and set DB_PATH=/app/uploads/press-journals.db in the environment.
CMD ["npm", "start"]
