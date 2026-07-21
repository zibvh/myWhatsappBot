FROM node:20-bookworm-slim

# python3 is required at runtime by yt-dlp (used for the .video/.audio downloader).
# yt-dlp-exec's install script specifically checks for a binary named "python"
# (not "python3"), so we need python-is-python3 to provide that symlink.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
