## Jellyseerr Interactive Requester

This is a small Node.js script that lets you interactively search Jellyseerr and request movies or TV shows from the terminal, or via WhatsApp using WAHA.

### Setup

1. Go to your Jellyseerr web UI and copy your **API key** from **Settings → General**.
2. In this folder, create `config.json` from the example:

```bash
cp config.example.json config.json
```

3. Edit `config.json` and set:
   - `baseUrl`: your Jellyseerr URL, e.g. `http://localhost:5055` or `https://jellyseerr.example.com`
   - `apiKey`: the API key you copied
   - `waha.baseUrl`: your WAHA API URL (e.g., `http://localhost:8584` or `http://YOUR_WAHA_HOST:8584`)
   - `waha.apiKey`: your WAHA API key
   - `waha.session`: WAHA session name (default: "default")
   - `webhook.host`: host/IP WAHA should call (required if you use `npm run configure-webhook`; example: `192.168.1.10`)
   - `webhook.port`: port for webhook server (required)
   - `webhook.path`: webhook path (required; example: `/webhook`)

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
   - Add webhook URL: `http://YOUR_SERVER_IP:3003/webhook` (adjust IP and port as needed)
   - Enable events: `message`, `message.any`

3. **Usage via WhatsApp:**
   - Send: `/request The Matrix`
   - Bot will search and return numbered results
   - Reply with a number (e.g., "1") to request that item

**Note:** Make sure your bot server is accessible from WAHA. If WAHA is in Docker, ensure network connectivity.


