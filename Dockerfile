FROM node:20-alpine

# OCI labels for metadata
LABEL org.opencontainers.image.title="Whatseerr" \
      org.opencontainers.image.description="WhatsApp bot for Seerr that allows users to search and request media via WhatsApp messages" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.authors="WhatSeerr Contributors" \
      org.opencontainers.image.url="https://github.com/sufxgit/whatseerr" \
      org.opencontainers.image.source="https://github.com/sufxgit/whatseerr" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.documentation="https://github.com/sufxgit/whatseerr#readme"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (if any)
RUN npm ci --only=production || true

# Copy application code
COPY . .

# Copy config folder to /config in container (example config will be available)
# If host mounts a config volume, it will override this
RUN mkdir -p /config && \
    if [ -d config ] && [ "$(ls -A config 2>/dev/null)" ]; then \
      cp -r config/* /config/; \
    fi

# Expose webhook port (default 3006, but configurable)
EXPOSE 3006

# Set default language to English (can be overridden by BOT_LANGUAGE env var)
ENV BOT_LANGUAGE=en

# Health check - verify server is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Run the WhatsApp bot
CMD ["node", "whatsapp-bot.js"]

