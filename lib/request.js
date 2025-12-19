/**
 * Jellyseerr API Request Functions
 * 
 * Provides functions for searching, getting media details, and creating requests
 * via the Jellyseerr/Overseerr API.
 */

import { createHttpClient as createBaseHttpClient } from './http-client.js';

// Re-export for backward compatibility
export const createHttpClient = (baseUrl) => createBaseHttpClient(baseUrl, { defaultContentType: false });

export async function searchTitle(client, cfg, query, type, year, logger = null) {
  logger?.debug('Searching title', { query, type, year });
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
  // Called by the bot; keep any deep logging at debug level in the caller.
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

export async function createRequest(client, cfg, media, seasons = null, is4k = false, logger = null) {
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
    is4k: is4k,
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

  logger?.debug('Creating request', { path: 'request', body });
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

/**
 * Extracts media status from API response
 * @param {Object} data - Response data from Jellyseerr API
 * @param {boolean} is4k - Whether to check 4K status instead of standard status
 * @returns {Object|null} Status object with { status: number } or null
 */
export function extractMediaStatus(data, is4k = false) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // Check for media status in the response
  // The createRequest response returns a MediaRequest object with a media field
  const mediaInfo = data.media || data.mediaInfo || data;
  
  // Status values: 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED
  // For 4K requests, check status4k field; otherwise check status field
  const statusField = is4k ? 'status4k' : 'status';
  let status = mediaInfo[statusField];
  if (typeof status === 'string') {
    status = parseInt(status, 10);
  }
  
  // If 4K status is not available, fall back to standard status
  if (is4k && (status === undefined || status === null)) {
    status = mediaInfo.status;
    if (typeof status === 'string') {
      status = parseInt(status, 10);
    }
  }
  
  if (typeof status !== 'number' || isNaN(status) || status < 1 || status > 6) {
    return null;
  }

  // For TV shows, extract season-level status
  // API returns mediaInfo.seasons (lowercase) per OpenAPI spec and actual API responses
  // Check lowercase first (actual API format), then uppercase for compatibility
  // For 4K, check status4k field in seasons
  const seasonStatusField = is4k ? 'status4k' : 'status';
  let seasons = null;
  if (mediaInfo.seasons && Array.isArray(mediaInfo.seasons)) {
    seasons = mediaInfo.seasons.map(s => {
      let seasonStatus = s[seasonStatusField];
      // Fallback to standard status if 4K status not available
      if (is4k && (seasonStatus === undefined || seasonStatus === null)) {
        seasonStatus = s.status;
      }
      if (typeof seasonStatus === 'string') {
        seasonStatus = parseInt(seasonStatus, 10);
      }
      // Fallback to overall status if season status not available
      if (typeof seasonStatus !== 'number' || isNaN(seasonStatus)) {
        seasonStatus = status;
      }
      return {
        seasonNumber: s.seasonNumber || s.season_number,
        status: seasonStatus,
      };
    }).filter(s => typeof s.status === 'number' && !isNaN(s.status));
  } else if (mediaInfo.Seasons && Array.isArray(mediaInfo.Seasons)) {
    // Fallback for compatibility with older API versions
    seasons = mediaInfo.Seasons.map(s => {
      let seasonStatus = s[seasonStatusField];
      // Fallback to standard status if 4K status not available
      if (is4k && (seasonStatus === undefined || seasonStatus === null)) {
        seasonStatus = s.status;
      }
      if (typeof seasonStatus === 'string') {
        seasonStatus = parseInt(seasonStatus, 10);
      }
      // Fallback to overall status if season status not available
      if (typeof seasonStatus !== 'number' || isNaN(seasonStatus)) {
        seasonStatus = status;
      }
      return {
        seasonNumber: s.seasonNumber || s.season_number,
        status: seasonStatus,
      };
    }).filter(s => typeof s.status === 'number' && !isNaN(s.status));
  }

  return {
    status: status,
    seasons: seasons,
  };
}

/**
 * Formats status message based on media status
 * @param {number} status - Status code (1-6)
 * @param {string} typeStr - Media type string (Movie/TV)
 * @param {boolean} isTvShow - Whether this is a TV show
 * @param {Array|null} seasonStatuses - Array of season statuses (for TV shows)
 * @returns {string} User-friendly status message
 */
export function formatStatusMessage(status, typeStr, isTvShow = false, seasonStatuses = null) {
  switch (status) {
    case 5: // AVAILABLE - Available? ✅, In Library? ✅
      if (isTvShow && seasonStatuses) {
        const allAvailable = seasonStatuses.every(s => s.status === 5);
        if (allAvailable) {
          return `✅ Available`;
        }
        const availableCount = seasonStatuses.filter(s => s.status === 5).length;
        return `✅ ${availableCount}/${seasonStatuses.length} seasons`;
      }
      return `✅ Available`;
    
    case 2: // PENDING - Requested? ✅, Available? ❌
      return `📋 Already requested`;
    
    case 3: // PROCESSING - Requested? ✅, Available? ❌
      return `📋 Already requested`;
    
    case 4: // PARTIALLY_AVAILABLE - Requested? ✅, In Library? ⚠️ Partial
      if (isTvShow && seasonStatuses) {
        const partialCount = seasonStatuses.filter(s => s.status === 4 || s.status === 5).length;
        return `📺 ${partialCount}/${seasonStatuses.length} seasons`;
      }
      return `📺 Partially available`;
    
    case 1: // UNKNOWN - Can Request? ✅
      return `✅ Request created`;
    
    case 6: // DELETED
      return `✅ Request created`;
    
    default:
      return `✅ Request created`;
  }
}

async function main() {
  const cfg = loadConfig({ requireWaha: false });
  const client = createHttpClient(cfg.jellyseerr.apiBaseUrl);
  const logger = createLogger(cfg);
  logger.info('🎬 Jellyseerr Interactive Requester');
  logger.info(`🔗 Jellyseerr: ${cfg.jellyseerr.baseUrl}`);
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

      logger.info(`\n🔍 Searching for: "${title}"`);

      let candidates;
      try {
        candidates = await searchTitle(client, cfg, title, type, year, logger);
      } catch (err) {
        logger.error(`Search failed for "${title}"`, err?.message || err);
        if (err.response) {
          logger.debug('Search error response', { status: err.response.status, body: err.response.data });
        } else if (err.stack) {
          logger.debug('Search error stack', err.stack);
        }
        continue;
      }

      if (!candidates || candidates.length === 0) {
        logger.info('🙈 No results found.');
        continue;
      }

      const top = candidates.slice(0, 10);
      logger.info('\n📋 Top results:');
      top.forEach((media, idx) => {
        const { title: displayTitle, year: displayYear, typeStr } = formatMedia(media);
        logger.info(`${idx + 1}. [${typeStr}] ${displayTitle} (${displayYear})`);
      });

      const pickInput = await question(
        rl,
        '\nEnter the number of the item to request (or 0 to cancel): '
      );
      const pick = parseInt(pickInput.trim(), 10);
      if (Number.isNaN(pick) || pick < 0 || pick > top.length) {
        logger.info(pick === 0 ? '🚫 Cancelled.' : '⚠️ Invalid selection.');
        continue;
      }

      const chosen = top[pick - 1];
      const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
      logger.info(`\n📨 Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})`);

      try {
        const res = await createRequest(client, cfg, chosen, null, logger);
        const isTvShow = typeStr === 'TV';
        
        if (res.status === 201 || res.status === 200) {
          // For successful requests, check the media status
          const statusInfo = extractMediaStatus(res.data);
          
          if (statusInfo) {
            // Use the status to provide detailed feedback
            // Pass season statuses directly (already extracted with status field)
            const seasonStatuses = isTvShow && statusInfo.seasons && statusInfo.seasons.length > 0
              ? statusInfo.seasons
              : null;
            
            const statusMsg = formatStatusMessage(statusInfo.status, typeStr, isTvShow, seasonStatuses);
            logger.info(statusMsg);
          } else {
            logger.info('✅ Request created');
          }
        } else if (res.status === 409) {
          // Check response data to determine specific status
          const data = res.data || {};
          const apiMessage = (() => {
            if (typeof data === 'string') {
              const s = data.trim();
              return s ? s.slice(0, 300) : null; // User-facing message limit
            }
            if (data && typeof data === 'object') {
              const m = data.message || data.error || data.details || data.reason;
              return typeof m === 'string' && m.trim() ? m.trim().slice(0, 300) : null; // User-facing message limit
            }
            return null;
          })();
          
          // Prioritize API message if available
          if (apiMessage) {
            logger.info(`ℹ️ ${apiMessage}`);
          } else {
            // Try to extract status from response
            const statusInfo = extractMediaStatus(data);
            if (statusInfo) {
              // Pass season statuses directly (already extracted with status field)
              const seasonStatuses = isTvShow && statusInfo.seasons && statusInfo.seasons.length > 0
                ? statusInfo.seasons
                : null;
              const statusMsg = formatStatusMessage(statusInfo.status, typeStr, isTvShow, seasonStatuses);
              logger.info(statusMsg);
            } else {
              // Fallback message if status cannot be extracted
              logger.info('ℹ️ Already requested or available');
            }
          }
          
          logger.debug('409 response details', res.data);
        } else {
          logger.error(`Unexpected response status: ${res.status}`);
          logger.debug('Unexpected response body', res.data);
        }
      } catch (err) {
        logger.error('Failed to create request', err?.message || err);
        if (err.response) {
          logger.debug('Request error response', { status: err.response.status, body: err.response.data });
        } else if (err.stack) {
          logger.debug('Request error stack', err.stack);
        }
      }
    }
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const logger = createLogger({ logging: { level: 'error' } });
    logger.error('Fatal error', err?.message || err);
    process.exit(1);
  });
}

