# Whatseerr

WhatsApp bot for [Jellyseerr](https://github.com/Fallenbagel/jellyseerr) / [Overseerr](https://github.com/sct/overseerr) that allows users to search and request movies/TV shows via WhatsApp messages.

## Features

- 🔍 Search movies and TV shows from WhatsApp
- 📺 Request media directly via chat messages
- 🔔 Receive webhook notifications from Jellyseerr/Overseerr
- 👥 User mapping (WhatsApp phone numbers to Jellyseerr user IDs)
- ⚡ Rate limiting and message queuing
- 🎯 Support for 4K requests (optional)

## Quick Start (Docker - Recommended)

### Prerequisites

- [WAHA](https://github.com/devlikeapro/waha) (WhatsApp HTTP API) running and configured
- Jellyseerr or Overseerr instance
- Docker installed

### 1. Pull the Image

```bash
docker pull ghcr.io/sufxgit/whatseerr:latest
```

### 2. Create Configuration

Create a directory for your config:

```bash
mkdir -p /path/to/config
```

Create `/path/to/config/config.json` with the following structure:

```json
{
  "system": {
    "protocol": "http",
    "host": "192.168.1.100",
    "logging": {
      "level": "info",
      "timestamps": false
    }
  },
  "services": {
    "jellyseerr": {
      "port": 5055,
      "apiKey": "YOUR_JELLYSEERR_API_KEY",
      "defaultUserId": 2
    },
    "waha": {
      "port": 8584,
      "apiKey": "YOUR_WAHA_API_KEY",
      "session": "default"
    }
  },
  "webhook": {
    "requests": {
      "path": "/requests",
      "port": 3006
    },
    "seerr": {
      "path": "/seerr"
    }
  },
  "mappings": {
    "userIdMappings": {
      "1234567890": {
        "userId": 1,
        "username": "YourName"
      }
    },
    "emailMappings": {},
    "lidMappings": {}
  },
  "commands": {
    "command": "r,request,s,search",
    "command4k": "r4k,request4k",
    "help4k": false
  },
  "cache": {
    "searchResultsTTL": 3600,
    "pendingSelectionsTTL": 1800,
    "processedMessagesTTL": 86400,
    "promptTimestampsTTL": 3600
  },
  "queues": {
    "messageConcurrency": 5,
    "apiConcurrency": 3,
    "webhookConcurrency": 10
  },
  "rateLimit": {
    "maxRequests": 100,
    "timeWindow": "1 minute"
  }
}
```

**Configuration Notes:**
- `host`: The hostname/IP where Jellyseerr, WAHA, and the bot can reach each other
- `jellyseerr.apiKey`: Get from Jellyseerr → Settings → General
- `waha.apiKey`: Your WAHA API key
- `userIdMappings`: Map WhatsApp phone numbers (without @c.us) to Jellyseerr user IDs

### 3. Run the Container

**Docker CLI:**
```bash
docker run -d \
  --name whatseerr-bot \
  --restart unless-stopped \
  -p 3006:3006 \
  -v /path/to/config:/config \
  -e TZ=Asia/Kuwait \
  ghcr.io/sufxgit/whatseerr:latest
```

**Unraid:**
- Repository: `ghcr.io/sufxgit/whatseerr:latest`
- Port: `3006:3006` (TCP)
- Volume: `/mnt/user/appdata/whatseerr/config` → `/config` (Read/Write)
- Environment: `TZ=Your/Timezone`

### 4. Configure WAHA Webhook

Point your WAHA session webhook to:
```
http://YOUR_HOST_IP:3006/requests
```

Enable these events:
- `message`
- `message.any`

### 5. Configure Jellyseerr Webhook (Optional)

For receiving notifications (approved/available/declined), add webhook in Jellyseerr:

**Webhook URL:**
```
http://YOUR_HOST_IP:3006/seerr
```

**Types:** Select notification types you want to receive

## Usage

Send a WhatsApp message to your WAHA-connected number:

```
r The Matrix
```

The bot will:
1. Search Jellyseerr for "The Matrix"
2. Return numbered results
3. Wait for you to reply with a number (e.g., "1")
4. Submit the request to Jellyseerr

**Available Commands:**
- `r <title>` or `request <title>` - Search and request media
- `r4k <title>` or `request4k <title>` - Request in 4K quality (if enabled)

## Configuration Options

### System
- `protocol`: `http` or `https`
- `host`: Shared hostname/IP for all services
- `logging.level`: `info` or `debug`

### Services
- `jellyseerr.port`: Jellyseerr port (default: 5055)
- `jellyseerr.apiKey`: Your Jellyseerr API key
- `jellyseerr.defaultUserId`: Default user ID for requests
- `waha.port`: WAHA port (default: 8584)
- `waha.apiKey`: WAHA API key
- `waha.session`: WAHA session name (default: "default")

### Webhooks
- `webhook.requests.path`: Path for WAHA webhook (default: `/requests`)
- `webhook.requests.port`: Webhook server port (default: 3006)
- `webhook.seerr.path`: Path for Jellyseerr webhook (default: `/seerr`)

### Mappings
- `userIdMappings`: Map phone numbers to Jellyseerr user IDs
- `emailMappings`: Auto-populated from webhook notifications
- `lidMappings`: Auto-populated for WhatsApp LID format support

### Commands
- `command`: Comma-separated list of request command aliases
- `command4k`: Comma-separated list of 4K request command aliases
- `help4k`: Show 4K commands in help message (default: false)

## Viewing Logs

```bash
docker logs -f whatseerr-bot
```

## Building from Source

```bash
git clone https://github.com/sufxgit/whatseerr.git
cd whatseerr
docker build -t whatseerr .
```

## Development

For local development without Docker:

1. **Clone the repository**
   ```bash
   git clone https://github.com/sufxgit/whatseerr.git
   cd whatseerr
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create config**
   ```bash
   cp config/config.example.json config/config.json
   nano config/config.json
   ```

4. **Run the bot**
   ```bash
   npm run bot
   ```

## License

MIT
