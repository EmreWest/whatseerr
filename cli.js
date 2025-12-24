#!/usr/bin/env node

/**
 * Jellyseerr Interactive CLI Requester
 *
 * How it works:
 *   1. Run: node cli.js
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
import { createHttpClient, searchTitle, createRequest, formatMedia, extractMediaStatus, formatStatusMessage } from './lib/request.js';
import { loadConfig } from './lib/utils.js';
import { createLogger } from './lib/logger.js';
import { extractApiMessage } from './lib/api-message-extractor.js';
import { getErrorDetails } from './lib/errors/error-formatter.js';

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
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
        logger.error(`Search failed for "${title}"`, {
          ...getErrorDetails(err, 'searchTitle'),
          title
        });
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
          const apiMessage = extractApiMessage(data);
          
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
        logger.error('Failed to create request', {
          ...getErrorDetails(err, 'createRequest'),
          chosenTitle
        });
      }
    }
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const logger = createLogger({ logging: { level: 'error' } });
    logger.error('Fatal error', getErrorDetails(err, 'cliMain'));
    process.exit(1);
  });
}

