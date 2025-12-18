## Jellyseerr Interactive Requester

This is a small Node.js script that lets you interactively search Jellyseerr and request movies or TV shows from the terminal.

### Setup

1. Go to your Jellyseerr web UI and copy your **API key** from **Settings → General**.
2. In this folder, create `config.json` from the example:

```bash
cp config.example.json config.json
```

3. Edit `config.json` and set:
   - `baseUrl`: your Jellyseerr URL, e.g. `http://localhost:5055` or `https://jellyseerr.example.com`
   - `apiKey`: the API key you copied

### Running

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


