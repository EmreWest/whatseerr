#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import http from 'http';
import { createHttpClient, searchTitle, createRequest, formatMedia, getMediaDetails } from './request.js';
import { createWahaClient, sendText } from './waha-client.js';
import { loadConfig, getWebhookUrl } from './utils.js';
import { createLogger } from './logger.js';

// Constants
const MAX_PROCESSED_MESSAGES = 1000;
const MAX_RESULTS_DISPLAY = 10;
const MAX_ERROR_BODY_LENGTH = 500;

// In-memory store for user search results (chatId -> results array)
const userSearchResults = new Map();

// Store selected TV shows waiting for season selection (chatId -> media object)
const pendingTvSelections = new Map();

// Track processed message IDs to prevent duplicates
const processedMessages = new Set();

/**
 * Formats search results into a numbered list message
 */
function formatSearchResults(results, limit = MAX_RESULTS_DISPLAY) {
  const top = results.slice(0, limit);
  if (top.length === 0) {
    return 'No results found.';
  }

  let message = 'Search results:\n\n';
  top.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    message += `${idx + 1}. [${typeStr}] ${title} (${year})\n`;
  });
  message += '\n0. Cancel\n';
  message += '\nReply with the number to request that item.';

  return message;
}

/**
 * Parses comma-separated commands from config
 * @param {string|string[]} commandConfig - Command config (string or array)
 * @returns {string[]} Array of normalized commands
 */
function parseCommands(commandConfig) {
  if (!commandConfig) {
    return ['r'];
  }
  
  if (Array.isArray(commandConfig)) {
    return commandConfig.map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
  }
  
  // Split by comma and normalize
  return String(commandConfig)
    .split(',')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0);
}

/**
 * Extracts search query from message, handling command prefix
 * @param {string} messageText - The message text
 * @param {string[]} commands - Array of command strings to check
 * @returns {object|null} Object with `query` and `matchedCommand`, or null if no match
 */
function extractSearchQuery(messageText, commands) {
  const trimmed = messageText.trim();
  
  // Sort commands by length (longest first) to match longer commands before shorter ones
  // e.g., "request" should match before "r" if both are configured
  const sortedCommands = [...commands].sort((a, b) => b.length - a.length);
  
  // Check if message starts with any of the commands
  for (const command of sortedCommands) {
    const lowerCommand = command.toLowerCase();
    const lowerTrimmed = trimmed.toLowerCase();
    
    if (lowerTrimmed.startsWith(lowerCommand)) {
      // Check if it's a complete word match (command followed by space or end of string)
      const afterCommand = trimmed.slice(command.length);
      if (afterCommand.length === 0 || afterCommand[0] === ' ') {
        const query = afterCommand.trim();
        // Return match even if query is empty (will be handled by caller)
        return { query: query || '', matchedCommand: command };
      }
    }
  }
  
  return null;
}

/**
 * Parses season selection from user input
 * Supports: "1", "1,2,3", "1 2 3", "all", "0" (cancel)
 * @param {string} input - User input
 * @param {number} maxSeasons - Maximum number of seasons available
 * @returns {Object} { seasons: number[] | null, cancelled: boolean, error: string | null }
 */
function parseSeasonSelection(input, maxSeasons) {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === '0' || trimmed === 'cancel') {
    return { seasons: null, cancelled: true, error: null };
  }
  
  if (trimmed === 'all') {
    return { seasons: Array.from({ length: maxSeasons }, (_, i) => i + 1), cancelled: false, error: null };
  }
  
  // Parse comma or space-separated numbers
  const numbers = trimmed.split(/[,\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  
  if (numbers.length === 0) {
    return { seasons: null, cancelled: false, error: 'Invalid format. Use numbers (e.g., "1" or "1,2,3") or "all"' };
  }
  
  // Validate all numbers are within range
  const invalid = numbers.filter(n => n < 1 || n > maxSeasons);
  if (invalid.length > 0) {
    return { seasons: null, cancelled: false, error: `Invalid season numbers: ${invalid.join(', ')}. Valid range: 1-${maxSeasons}` };
  }
  
  // Remove duplicates and sort
  const uniqueSeasons = [...new Set(numbers)].sort((a, b) => a - b);
  
  return { seasons: uniqueSeasons, cancelled: false, error: null };
}

/**
 * Formats available seasons into a message
 * @param {Array} seasons - Array of season objects from Jellyseerr
 * @returns {string} Formatted message
 */
function formatSeasons(seasons) {
  if (!seasons || seasons.length === 0) {
    return 'No seasons available.';
  }
  
  let message = 'Available seasons:\n\n';
  seasons.forEach((season, idx) => {
    // Handle different season object structures
    const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                      season.season_number !== undefined ? season.season_number :
                      idx + 1;
    const name = (season.name || season.seasonName) ? ` - ${season.name || season.seasonName}` : '';
    const episodeCount = (season.episodeCount || season.episode_count) ? 
                         ` (${season.episodeCount || season.episode_count} episodes)` : '';
    message += `${seasonNum}. Season ${seasonNum}${name}${episodeCount}\n`;
  });
  message += '\n0. Cancel\n';
  message += 'all. Request all seasons\n';
  message += '\nReply with season numbers (e.g., "1" or "1,2,3" or "all"):';
  
  return message;
}

/**
 * Determines the status message for request responses
 * @param {Object} res - Response object from Jellyseerr API
 * @param {string} typeStr - Media type string (Movie/TV)
 * @returns {string} Status message
 */
function getRequestStatusMessage(res, typeStr) {
  if (res.status === 201 || res.status === 200) {
    return `✅ Request created successfully!`;
  }

  const data = res.data || {};
  const apiMessage = (() => {
    if (typeof data === 'string') {
      const s = data.trim();
      return s ? s.slice(0, 300) : null;
    }
    if (data && typeof data === 'object') {
      const m = data.message || data.error || data.details || data.reason;
      return typeof m === 'string' && m.trim() ? m.trim().slice(0, 300) : null;
    }
    return null;
  })();

  if (res.status === 409) {
    // Prioritize API message if available
    if (apiMessage) {
      return `ℹ️ ${apiMessage}`;
    }
    
    // Fallback to custom messages if no API message
    // Check for status fields that indicate availability
    if (data.status === 'available' || data.mediaStatus === 'available' ||
        data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
      return `✅ This ${typeStr.toLowerCase()} is already available in your library!`;
    }
    
    // Check for status fields that indicate it's requested but not available
    if (data.status === 'pending' || data.status === 'approved' ||
        data.mediaStatus === 'pending' || data.mediaStatus === 'approved' ||
        data.media?.status === 'pending' || data.media?.status === 'approved' ||
        data.media?.mediaStatus === 'pending' || data.media?.mediaStatus === 'approved') {
      return `⏳ This ${typeStr.toLowerCase()} is already requested and pending approval.`;
    }
    
    // Check if there's a request object indicating it's already requested
    if (data.request || data.media?.request) {
      return `📋 This ${typeStr.toLowerCase()} is already requested.`;
    }
    
    // Default message if we can't determine the specific status
    return `ℹ️ This ${typeStr.toLowerCase()} is already requested or available.`;
  }

  if (apiMessage) {
    // Show the API-provided reason (permissions, quotas, etc.) to the user.
    return `❌ ${apiMessage}`;
  }

  return `❌ Failed to create request. (HTTP ${res.status})`;
}

/**
 * Handles incoming WhatsApp messages
 */
async function handleMessage(cfg, jellyseerrClient, wahaClient, webhookData) {
  const logger = cfg.__logger;
  const searchCommands = parseCommands(cfg.command);
  const primaryCommand = searchCommands[0] || 'r';
  try {
    // Extract message data from WAHA webhook payload
    const payload = webhookData.payload;
    if (!payload) {
      logger?.warn('Webhook received with no payload', { keys: Object.keys(webhookData || {}) });
      return;
    }

    // Only process incoming messages (not sent by us)
    if (payload.fromMe) {
      logger?.debug('Ignoring message from self (fromMe: true)');
      return;
    }

    const chatId = payload.from;
    const messageText = payload.body?.trim() || '';
    const messageId = payload.id;

    // Check for duplicate messages early (before processing)
    if (messageId && processedMessages.has(messageId)) {
      logger?.debug('Duplicate message detected, ignoring', { messageId });
      return;
    }

    // Mark message as processed
    if (messageId) {
      processedMessages.add(messageId);
      // Clean up old message IDs to prevent memory issues
      if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        // Remove oldest entry (Set maintains insertion order)
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
      }
    }

    logger?.debug('Incoming message details', {
      chatId,
      messageId,
      messageText,
      fromMe: payload.fromMe,
      to: payload.to,
      event: webhookData.event,
      session: webhookData.session,
    });

    if (!messageText) {
      logger?.warn('Empty message text, ignoring');
      return;
    }

    logger?.info(`📩 Message from ${chatId}: ${messageText}`);

    // Check if user is selecting seasons for a TV show
    if (pendingTvSelections.has(chatId)) {
      const tvShow = pendingTvSelections.get(chatId);
      const { title: chosenTitle } = formatMedia(tvShow);
      
      logger?.info(`📺 Season selection for: "${chosenTitle}"`);
      
      // Parse season selection - use actual seasons array length
      const availableSeasons = tvShow.seasons || [];
      const maxSeasons = availableSeasons.length > 0 ? availableSeasons.length : (tvShow.numberOfSeasons || 10);
      const seasonSelection = parseSeasonSelection(messageText, maxSeasons);
      
      if (seasonSelection.cancelled) {
        logger?.info('🚫 Cancelled season selection');
        pendingTvSelections.delete(chatId);
        userSearchResults.delete(chatId);
        await sendText(wahaClient, cfg, chatId, `Cancelled. Send ${primaryCommand} <name> to search again.`);
        return;
      }
      
      if (seasonSelection.error) {
        await sendText(wahaClient, cfg, chatId, `❌ ${seasonSelection.error}`);
        return;
      }
      
      // Create request with selected seasons
      const seasons = seasonSelection.seasons;
      const seasonsText = seasons.length === maxSeasons ? 'all seasons' : `season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`;
      
      logger?.info(`📨 Requesting "${chosenTitle}" (${seasonsText})`);
      await sendText(wahaClient, cfg, chatId, `Requesting "${chosenTitle}" - ${seasonsText}...`);
      
      try {
        const res = await createRequest(jellyseerrClient, cfg, tvShow, seasons, logger);
        logger?.debug('Create request response', { status: res.status, data: res.data });
        
        const statusMessage = getRequestStatusMessage(res, 'TV');
        
        if (res.status === 201 || res.status === 200) {
          logger?.debug('Request created successfully');
        } else if (res.status === 409) {
          const data = res.data || {};
          if (data.status === 'available' || data.mediaStatus === 'available' || 
              data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
            logger?.debug('Media already available');
          } else {
            logger?.debug('Media already requested');
          }
        } else {
          logger?.error(`Unexpected response from Jellyseerr (status ${res.status})`);
          logger?.debug('Unexpected response body', res.data);
        }
        
        await sendText(wahaClient, cfg, chatId, statusMessage);
      } catch (err) {
        logger?.error('Failed to create request', err?.message || err);
        logger?.debug('Request error stack', err?.stack);
        await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${err.message}`);
      }
      
      // Clear stored data
      pendingTvSelections.delete(chatId);
      userSearchResults.delete(chatId);
      return;
    }

    // Check if message is a number (selection from previous search)
    const selectionNumber = parseInt(messageText, 10);
    if (!isNaN(selectionNumber) && userSearchResults.has(chatId)) {
      logger?.info(`🔢 Selection from ${chatId}: ${selectionNumber}`);
      // User is selecting from previous results
      const results = userSearchResults.get(chatId);
      logger?.debug('Stored result count', { chatId, count: results.length });
      
      // Handle cancel (option 0)
      if (selectionNumber === 0) {
        logger?.info('🚫 Cancelled selection');
        userSearchResults.delete(chatId);
        await sendText(wahaClient, cfg, chatId, `Cancelled. Send ${primaryCommand} <name> to search again.`);
        return;
      }
      
      if (selectionNumber >= 1 && selectionNumber <= results.length) {
        const chosen = results[selectionNumber - 1];
        const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, fetch details and show season selection
        if (isTvShow) {
          logger?.info(`📺 TV selected: "${chosenTitle}" — fetching seasons...`);
          await sendText(wahaClient, cfg, chatId, `Fetching season information for "${chosenTitle}"...`);
          
          try {
            const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 2);
            const seasons = mediaDetails.seasons || [];
            logger?.debug('TV media details seasons', { seasonCount: seasons.length });
            
            if (seasons.length === 0) {
              // No season info available, request all seasons
              logger?.warn('No season info returned; requesting all seasons');
              await sendText(wahaClient, cfg, chatId, `No season details found. Requesting all seasons for "${chosenTitle}"...`);
              
              const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
              const statusMessage = getRequestStatusMessage(res, typeStr);
              await sendText(wahaClient, cfg, chatId, statusMessage);
              
              userSearchResults.delete(chatId);
              return;
            }
            
            // Store TV show for season selection
            chosen.seasons = seasons;
            pendingTvSelections.set(chatId, chosen);
            
            // Show season selection
            const seasonsMessage = formatSeasons(seasons);
            await sendText(wahaClient, cfg, chatId, seasonsMessage);
            
            // Keep search results in case user wants to cancel and pick something else
            return;
          } catch (err) {
            logger?.error('Failed to get TV media details', err?.message || err);
            await sendText(wahaClient, cfg, chatId, `❌ Error fetching season information: ${err.message}. Requesting all seasons...`);
            
            // Fallback: request all seasons
            try {
              const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
              const statusMessage = getRequestStatusMessage(res, typeStr);
              await sendText(wahaClient, cfg, chatId, statusMessage);
            } catch (reqErr) {
              logger?.error('Fallback request failed', reqErr?.message || reqErr);
              await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${reqErr.message}`);
            }
            
            userSearchResults.delete(chatId);
            return;
          }
        }
        
        // For movies, create request directly
        logger?.info(`📨 Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})`);

        // Send confirmation
        await sendText(wahaClient, cfg, chatId, `Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})...`);

        try {
          const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
          logger?.debug('Create request response', { status: res.status, data: res.data });
          
          const statusMessage = getRequestStatusMessage(res, typeStr);
          
          if (res.status === 201 || res.status === 200) {
            logger?.debug('Request created successfully');
          } else if (res.status === 409) {
            // Determine specific status for logging
            const data = res.data || {};
            if (data.status === 'available' || data.mediaStatus === 'available' || 
                data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
              logger?.debug('Media already available');
            } else {
              logger?.debug('Media already requested');
            }
          } else {
            logger?.error(`Unexpected response from Jellyseerr (status ${res.status})`);
            logger?.debug('Unexpected response body', res.data);
          }
          
          await sendText(wahaClient, cfg, chatId, statusMessage);
        } catch (err) {
          logger?.error('Failed to create request', err?.message || err);
          logger?.debug('Request error stack', err?.stack);
          await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${err.message}`);
        }

        // Clear stored results
        userSearchResults.delete(chatId);
        logger?.debug('Cleared stored results for user', { chatId });
        return;
      } else {
        // Invalid selection number
        logger?.warn(`Invalid selection number ${selectionNumber}`, { validRange: `0-${results.length}` });
        await sendText(wahaClient, cfg, chatId, `Invalid selection. Please reply with a number between 0 and ${results.length} (0 to cancel).`);
        return;
      }
    }

    // Check if message starts with any configured command
    const searchResult = extractSearchQuery(messageText, searchCommands);
    if (!searchResult) {
      const commandsList = searchCommands.join('", "');
      logger?.warn(`Message does not start with any command: "${commandsList}"`, { messageText });
      await sendText(wahaClient, cfg, chatId, `Please use one of these commands to search: ${searchCommands.join(', ')}\n\nExample: ${primaryCommand} The Matrix`);
      return;
    }

    const query = searchResult.query;
    
    // Handle empty query (user just typed command without search term)
    if (!query || query.trim().length === 0) {
      logger?.info(`Empty query after command "${searchResult.matchedCommand}"`);
      await sendText(wahaClient, cfg, chatId, `Please provide a search term.\n\nExample: ${searchResult.matchedCommand} The Matrix`);
      return;
    }
    
    logger?.info(`🔍 Searching: "${query}" (matched command: ${searchResult.matchedCommand})`);

    // Send searching message
    await sendText(wahaClient, cfg, chatId, `Searching for "${query}"...`);

    try {
      const candidates = await searchTitle(jellyseerrClient, cfg, query, null, null, logger);
      logger?.debug('Search result count', { count: candidates?.length || 0 });

      if (!candidates || candidates.length === 0) {
        logger?.info(`🙈 No results for: "${query}"`);
        await sendText(wahaClient, cfg, chatId, 'No results found. Try a different search term.');
        userSearchResults.delete(chatId);
        return;
      }

      // Store results for this user
      userSearchResults.set(chatId, candidates);
      logger?.debug('Stored results', { chatId, count: candidates.length });

      // Format and send results
      const resultsMessage = formatSearchResults(candidates);
      await sendText(wahaClient, cfg, chatId, resultsMessage);

    } catch (err) {
      logger?.error(`Error searching for "${query}"`, err?.message || err);
      logger?.debug('Search error stack', err?.stack);
      await sendText(wahaClient, cfg, chatId, `❌ Error searching: ${err.message}`);
      userSearchResults.delete(chatId);
    }

  } catch (err) {
    logger?.error('Error handling message', err?.message || err);
    logger?.debug('Handler error stack', err?.stack);
  }
}

/**
 * Creates and starts the webhook server
 */
function createWebhookServer(cfg, jellyseerrClient, wahaClient) {
  const port = cfg.webhook.port;
  const path = cfg.webhook.path;
  const logger = cfg.__logger;

  const server = http.createServer(async (req, res) => {
    // Only handle POST requests to the webhook path
    if (req.method !== 'POST' || req.url !== path) {
      if (req.method === 'GET' && req.url === '/') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          service: 'WhatsApp Jellyseerr Bot',
          webhookPath: path,
          port: port
        }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    logger?.debug('Webhook POST received', { url: req.url });

    // Set CORS headers (if needed)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const webhookData = JSON.parse(body);
        
        if (webhookData.event) {
          logger?.debug('Webhook event received', { event: webhookData.event, session: webhookData.session || 'unknown' });
        } else {
          logger?.warn('Webhook data has no event field');
        }

        // Process message events - prefer 'message.any' to avoid duplicates
        // If both 'message' and 'message.any' are configured, they may send the same message
        // We'll process 'message.any' and skip 'message' for the same message ID
        if (webhookData.event === 'message.any' && webhookData.payload) {
          // Process message asynchronously (don't block response)
          handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
            logger?.error('Error in handleMessage', err?.message || err);
            logger?.debug('handleMessage stack', err?.stack);
          });
        } else if (webhookData.event === 'message' && webhookData.payload) {
          // Only process 'message' event if we don't have 'message.any' configured
          // Check if this message ID was already processed (might have come as 'message.any' first)
          const messageId = webhookData.payload?.id;
          if (messageId && !processedMessages.has(messageId)) {
            handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
              logger?.error('Error in handleMessage', err?.message || err);
              logger?.debug('handleMessage stack', err?.stack);
            });
          } else {
            logger?.debug('Skipping duplicate message event', { messageId });
          }
        }

        // Always respond with 200 to acknowledge receipt
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));

      } catch (err) {
        logger?.error('Error parsing webhook JSON', err?.message || err);
        if (body.length < MAX_ERROR_BODY_LENGTH) {
          logger?.debug('Webhook raw body', body);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', message: err.message }));
      }
    });

    req.on('error', (err) => {
      logger?.error('Webhook request stream error', err?.message || err);
      logger?.debug('Webhook request error stack', err?.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(port, () => {
    const searchCommands = parseCommands(cfg.command);
    const primaryCommand = searchCommands[0] || 'r';
    logger?.info(`🚀 Webhook server listening`);
    logger?.info(`📍 Path: ${path}`);
    logger?.info(`🔌 Port: ${port}`);
    try {
      const webhookUrl = getWebhookUrl(cfg);
      logger?.info(`🔗 WAHA webhook URL: ${webhookUrl}`);
    } catch {
      logger?.warn('protocol/host not set; cannot print public webhook URL. Set protocol + host, or configure WAHA manually.');
    }
    if (searchCommands.length === 1) {
      logger?.info(`💬 Command: ${primaryCommand} <movie or TV show name>`);
      logger?.info(`🧪 Example: ${primaryCommand} The Matrix`);
    } else {
      logger?.info(`💬 Commands: ${searchCommands.join(', ')} <movie or TV show name>`);
      logger?.info(`🧪 Example: ${primaryCommand} The Matrix`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger?.error(`Port ${port} is already in use. Choose a different webhook.port.`);
    } else {
      logger?.error('Server error', err?.message || err);
      logger?.debug('Server error stack', err?.stack);
    }
    process.exit(1);
  });

  return server;
}

/**
 * Main function
 */
async function main() {
  const cfg = loadConfig({ requireWaha: true, requireWebhook: true });
  cfg.__logger = createLogger(cfg);
  const logger = cfg.__logger;
  const jellyseerrClient = createHttpClient(cfg.jellyseerr.apiBaseUrl);
  const wahaClient = createWahaClient(cfg.waha.baseUrl);

  logger.info('🤖 Starting WhatsApp bot...');
  logger.info(`🔗 Jellyseerr: ${cfg.jellyseerr.baseUrl}`);
  logger.info(`🔗 WAHA: ${cfg.waha.baseUrl}`);
  logger.info(`🧩 WAHA Session: ${cfg.waha?.session || 'default'}`);

  const server = createWebhookServer(cfg, jellyseerrClient, wahaClient);

  // Graceful shutdown handler
  const shutdown = () => {
    logger.info('\n🛑 Shutting down…');
    server.close(() => {
      logger.info('✅ Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const cfg = (() => {
      try { return loadConfig({ requireWaha: false, requireWebhook: false }); } catch { return {}; }
    })();
    const logger = createLogger(cfg);
    logger.error('Fatal error', err?.message || err);
    logger.debug('Fatal stack', err?.stack);
    process.exit(1);
  });
}
