# PRESS Journals submission app
# Node + Debian Chromium (for Puppeteer PDF rendering) + native build tools (better-sqlite3/sharp)
FROM node:20-bookworm-slim

# Chromium + the shared libraries it needs at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Use the system Chromium instead of downloading puppeteer's own copy
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Persistent data (uploads + SQLite DB) lives under /app/uploads — mount a volume there
# and set DB_PATH=/app/uploads/press-journals.db in the environment.
CMD ["npm", "start"]
