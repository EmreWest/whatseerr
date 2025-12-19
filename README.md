## Jellyseerr Interactive Requester

This is a small Node.js script that lets you interactively search Jellyseerr and request movies or TV shows from the terminal, or via WhatsApp using WAHA.

### Setup

1. Go to your Jellyseerr web UI and copy your **API key** from **Settings → General**.
2. Create `config.json` from the example:

**For local development (non-Docker):**
```bash
cp config/config.example.json config.json
```

**For Docker:** See the [Docker section](#running-with-docker) below.

3. Edit `config.json` and set:
   - `protocol`: `http` or `https`
   - `host`: hostname/IP shared by Jellyseerr + WAHA + the bot webhook (example: `192.168.1.8`)
   - `jellyseerr.port`: Jellyseerr port (example: `5055`)
   - `jellyseerr.apiKey`: the API key you copied
   - `waha.port`: WAHA port (example: `8584`)
   - `waha.apiKey`: your WAHA API key
   - `waha.session`: WAHA session name (default: "default")
   - `webhook.port`: port for webhook server
   - `webhook.path`: webhook path (example: `/webhook`)
   - `logging.level`: `info` (default) or `debug`
   - `command`: command prefix(es) for requests, comma-separated (default: `"r"`, example: `"r,request,s,search"`)

### Running CLI Version

From this directory:

```bash
node request.js
```

The script will:

- Ask you for a **title** (movie or TV show).
- Optionally ask for **type** (movie / TV) and **year** filter.
- Show the **top results** from Jellyseerr.
- Let you **pick a number** to send a request.
- Loop so you can search again, until you press Enter on an empty title to quit.

### Running WhatsApp Bot

1. **Start the bot server:**
   ```bash
   npm run bot
   ```
   or
   ```bash
   node whatsapp-bot.js
   ```

2. **Configure WAHA webhooks:**
   
   Option A - Use the helper script:
   ```bash
   npm run configure-webhook
   ```
   
   Option B - Manual configuration:
   - Open your WAHA dashboard (e.g., `http://localhost:8584`)
   - Navigate to session settings
   - Add webhook URL: `http(s)://<host>:<webhook.port><webhook.path>` (adjust as needed)
   - Enable events: `message`, `message.any`

3. **Usage via WhatsApp:**
   - Send: `r The Matrix` (or your configured command)
   - Bot will search and return numbered results
   - Reply with a number (e.g., "1") to request that item

**Note:** Make sure your bot server is accessible from WAHA. If WAHA is in Docker, ensure network connectivity.

### Running with Docker

1. **Prepare your configuration:**
   
   The container includes `config.example.json` at `/config/config.example.json`. You can either:
   
   **Option A: Use a mounted config folder (recommended)**
   ```bash
   # Create a config directory
   mkdir -p config
   
   # Copy the example config from the container (after first run) or from the project
   cp config/config.example.json config/config.json
   
   # Edit the config file
   nano config/config.json  # or use your preferred editor
   ```
   
   **Option B: Copy from container**
   ```bash
   # Start container once to get the example config
   docker-compose up -d
   
   # Copy example from container
   docker cp whatsapp-requests-bot:/config/config.example.json config/config.json
   
   # Edit the config file
   nano config/config.json
   
   # Restart container to use your config
   docker-compose restart
   ```

2. **Build and run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

   Or build and run manually:
   ```bash
   # Build the image
   docker build -t whatsapp-requests-bot .
   
   # Run the container
   docker run -d \
     --name whatsapp-requests-bot \
     --restart unless-stopped \
     -p 3003:3003 \
     -v $(pwd)/config:/config:ro \
     whatsapp-requests-bot
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   # or
   docker logs -f whatsapp-requests-bot
   ```

4. **Stop the container:**
   ```bash
   docker-compose down
   # or
   docker stop whatsapp-requests-bot
   ```

**Important:** 
- The config file must be located at `/config/config.json` inside the container
- The container includes `config.example.json` at `/config/config.example.json` as a template
- If you mount a `config/` volume, it will override the container's `/config` directory
- Make sure your `config.json` file is in the mounted `config/` directory, or copy it from the example in the container


