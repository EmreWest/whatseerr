#!/usr/bin/env node

/**
 * Jellyseerr Interactive Requester
 *
 * How it works (interactive only):
 *   1. Run: node request.js
 *   2. Enter a movie/TV title when prompted.
 *   3. The script will show the top results.
 *   4. Pick the number of the result you want to request.
 *
 * Before using:
 *   1. Copy config.example.json to config.json
 *   2. Set:
 *        - protocol + host
 *        - jellyseerr.port + jellyseerr.apiKey
 */

import readline from 'readline';
import { createHttpClient as createBaseHttpClient } from './http-client.js';
import { loadConfig } from './utils.js';

// Re-export for backward compatibility
export const createHttpClient = (baseUrl) => createBaseHttpClient(baseUrl, { defaultContentType: false });

export async function searchTitle(client, cfg, query, type, year) {
  const headers = {
    'X-Api-Key': cfg.jellyseerr.apiKey,
  };

  // Overseerr/Jellyseerr expects the `query` parameter to be URL-encoded already.
  // We therefore encode it ourselves and include it directly in the path.
  const encodedQuery = encodeURIComponent(query);

  const res = await client.request(
    'GET',
    `search?query=${encodedQuery}`,
    {
      headers,
    }
  );

  if (res.status !== 200) {
    const bodySnippet = typeof res.data === 'string'
      ? res.data.slice(0, 500)
      : JSON.stringify(res.data).slice(0, 500);
    const err = new Error(`Search failed with status ${res.status}: ${bodySnippet}`);
    err.response = res;
    throw err;
  }

  const results = res.data?.results || [];
  let filtered = results;

  if (type) {
    filtered = filtered.filter((r) => {
      if (r.mediaType === type) return true;
      // Some installs/versions may return numeric mediaType (1=movie, 2=tv)
      if (r.mediaType === 1 && type === 'movie') return true;
      if (r.mediaType === 2 && type === 'tv') return true;
      return false;
    });
  }

  if (year) {
    filtered = filtered.filter((r) => {
      const date = r.releaseDate || r.firstAirDate || '';
      const yr = date ? parseInt(String(date).slice(0, 4), 10) : null;
      return yr === year;
    });
  }

  return filtered;
}

/**
 * Gets media details from Jellyseerr (useful for getting season information for TV shows)
 * @param {Object} client - HTTP client
 * @param {Object} cfg - Configuration
 * @param {number} mediaId - Media ID
 * @param {number} mediaType - Media type (1=movie, 2=tv)
 * @returns {Promise<Object>} Media details
 */
export async function getMediaDetails(client, cfg, mediaId, mediaType) {
  const headers = {
    'X-Api-Key': cfg.jellyseerr.apiKey,
  };

  const typePath = mediaType === 1 || mediaType === 'movie' ? 'movie' : 'tv';
  const res = await client.request('GET', `${typePath}/${mediaId}`, {
    headers,
  });

  if (res.status !== 200) {
    const err = new Error(`Failed to get media details: ${res.status}`);
    err.response = res;
    throw err;
  }

  return res.data;
}

export async function createRequest(client, cfg, media, seasons = null) {
  const headers = {
    'X-Api-Key': cfg.jellyseerr.apiKey,
  };

  const mediaType =
    media.mediaType === 'movie' || media.mediaType === 'tv'
      ? media.mediaType
      : media.mediaType === 1
        ? 'movie'
        : media.mediaType === 2
          ? 'tv'
          : media.title
            ? 'movie'
            : 'tv';

  const body = {
    // Overseerr expects "movie" | "tv" (see API reference)
    mediaType,
    mediaId: media.id,
  };

  // Add seasons for TV shows if specified
  if (seasons && Array.isArray(seasons) && seasons.length > 0) {
    body.seasons = seasons;
  }

  if (cfg.jellyseerr.defaultUserId) {
    // Overseerr API expects `userId` for "request on behalf of" (requires permissions).
    body.userId = cfg.jellyseerr.defaultUserId;
  }
  if (cfg.jellyseerr.defaultServer) {
    body.serverId = cfg.jellyseerr.defaultServer;
  }

  const res = await client.request('POST', 'request', {
    headers,
    body,
  });

  return res;
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

export function formatMedia(media) {
  const title = media.title || media.name || 'Unknown';
  const date = media.releaseDate || media.firstAirDate || '';
  const year = date ? String(date).slice(0, 4) : '????';
  const typeStr = media.mediaType === 1 || media.mediaType === 'movie' ? 'Movie' : 'TV';
  return { title, year, typeStr };
}

async function main() {
  const cfg = loadConfig({ requireWaha: false });
  const client = createHttpClient(cfg.jellyseerr.apiBaseUrl);
  const rl = createReadline();

  try {
    // Interactive loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const titleInput = await question(
        rl,
        '\nEnter a movie/TV title to search (or press Enter to quit): '
      );

      const title = titleInput.trim();
      if (!title) {
        process.exitCode = 0;
        break;
      }

      const typeInput = await question(
        rl,
        'Is this a movie or TV show? [m/t, Enter for both]: '
      );
      let type = null;
      const t = typeInput.trim().toLowerCase();
      if (t.startsWith('m')) type = 'movie';
      else if (t.startsWith('t')) type = 'tv';

      const yearInput = await question(
        rl,
        'Filter by year? (optional, e.g. 2024; Enter to skip): '
      );
      const year = yearInput.trim() ? parseInt(yearInput.trim(), 10) || null : null;

      console.log(`\nSearching Jellyseerr for "${title}"...`);

      let candidates;
      try {
        candidates = await searchTitle(client, cfg, title, type, year);
      } catch (err) {
        console.error(`Error searching for "${title}":`, err.message);
        if (err.response) {
          console.error('Search error status:', err.response.status);
          console.error('Search error body:', err.response.data);
        } else if (err.stack) {
          console.error(err.stack);
        }
        continue;
      }

      if (!candidates || candidates.length === 0) {
        console.log('No results found.');
        continue;
      }

      const top = candidates.slice(0, 10);
      console.log('\nTop results:');
      top.forEach((media, idx) => {
        const { title: displayTitle, year: displayYear, typeStr } = formatMedia(media);
        console.log(
          `${idx + 1}. [${typeStr}] ${displayTitle} (${displayYear})`
        );
      });

      const pickInput = await question(
        rl,
        '\nEnter the number of the item to request (or 0 to cancel): '
      );
      const pick = parseInt(pickInput.trim(), 10);
      if (Number.isNaN(pick) || pick < 0 || pick > top.length) {
        console.log(pick === 0 ? 'Cancelled.' : 'Invalid selection.');
        continue;
      }

      const chosen = top[pick - 1];
      const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
      console.log(`\nRequesting ${typeStr}: "${chosenTitle}" (${chosenYear}) ...`);

      try {
        const res = await createRequest(client, cfg, chosen);
        if (res.status === 201 || res.status === 200) {
          console.log('Request created successfully.');
        } else if (res.status === 409) {
          // Check response data to determine specific status
          const data = res.data || {};
          
          if (data.status === 'available' || data.mediaStatus === 'available' || 
              data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
            console.log('✅ Media is already available in your library!');
          } else if (data.status === 'pending' || data.status === 'approved' || 
                     data.mediaStatus === 'pending' || data.mediaStatus === 'approved' ||
                     data.media?.status === 'pending' || data.media?.status === 'approved' ||
                     data.media?.mediaStatus === 'pending' || data.media?.mediaStatus === 'approved') {
            console.log('⏳ Media is already requested and pending approval.');
          } else if (data.request || data.media?.request) {
            console.log('📋 Media is already requested.');
          } else {
            console.log('Media is already requested or available.');
          }
          
          if (res.data) {
            console.log('Details:', res.data);
          }
        } else {
          console.error('Unexpected response from Jellyseerr:', res.status);
          console.error('Response body:', res.data);
        }
      } catch (err) {
        console.error('Failed to create request:', err.message);
        if (err.response) {
          console.error('Request error status:', err.response.status);
          console.error('Request error body:', err.response.data);
        } else if (err.stack) {
          console.error(err.stack);
        }
      }
    }
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

