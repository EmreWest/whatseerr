FROM node:20-alpine

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

# Run the WhatsApp bot
CMD ["node", "whatsapp-bot.js"]

