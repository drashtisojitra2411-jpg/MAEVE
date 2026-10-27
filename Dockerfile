# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# Install Python and dependencies for YOLOv8 CV inference
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Setup Python virtual environment
RUN python3 -m venv /app/server/cv/.venv
ENV PATH="/app/server/cv/.venv/bin:$PATH"

# Install Python requirements
COPY server/cv/requirements.txt ./server/cv/
RUN pip install --no-cache-dir -r server/cv/requirements.txt

# Install Node dependencies
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci && npm --prefix server ci

# Copy application source
COPY . .

# Build production client bundle
RUN npm run build

# Environment variables
ENV NODE_ENV=production
ENV PORT=8787
ENV MAEVE_DATA_DIR=/app/server/data
ENV MAEVE_DB=/app/server/data/maeve.db
ENV MAEVE_PYTHON=/app/server/cv/.venv/bin/python

# Persistent data directory
VOLUME ["/app/server/data", "/app/server/cv/models"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8787/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
