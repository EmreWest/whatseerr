#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import { createHttpClient, searchTitle, createRequest, formatMedia, getMediaDetails, extractMediaStatus, formatStatusMessage } from './lib/request.js';
import { createWahaClient, sendText } from './lib/waha-client.js';
import { loadConfig, getWebhookUrl } from './lib/utils.js';
import { createLogger } from './lib/logger.js';

// Import modules
import { MAX_PROCESSED_MESSAGES, MAX_ERROR_BODY_LENGTH } from './lib/constants.js';
import { userSearchResults, pendingTvSelections, processedMessages } from './lib/state.js';
import { formatSearchResults } from './lib/message-formatters.js';
import { parseCommands, extractSearchQuery } from './lib/command-parser.js';
import { parseSeasonSelection, formatSeasons, filterOutSpecials, getSeasonNumber } from './lib/season-utils.js';
import { isRequested, isAvailable, canBeRequested, checkSeasonRequestStatus, getRequestStatusMessage } from './lib/media-status.js';
import { handleTvSeasonSelection, handleTvShowSelection, handleMovieSelection } from './lib/request-handler.js';
import { createWebhookServer } from './lib/webhook-server.js';

// Import MAX_RESULTS_DISPLAY from constants (already imported via message-formatters)


/**
 * Handles incoming WhatsApp messages
 */
async function handleMessage(cfg, jellyseerrClient, wahaClient, webhookData) {
  const logger = cfg.__logger;
  const searchCommands = parseCommands(cfg.command);
  const searchCommands4k = parseCommands(cfg.command4k);
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
      const tvShowData = pendingTvSelections.get(chatId);
      const tvShow = tvShowData.show || tvShowData; // Support both old and new format
      const is4k = tvShowData.is4k || false;
      const { title: chosenTitle } = formatMedia(tvShow);
      
      logger?.info(`📺 Season selection for: "${chosenTitle}"${is4k ? ' (4K)' : ''}`);
      
      // Use the handler function
      const result = await handleTvSeasonSelection(cfg, jellyseerrClient, wahaClient, chatId, messageText, tvShow, logger, is4k);
      
      if (result?.cancelled || result?.allRequested || result?.success) {
        pendingTvSelections.delete(chatId);
        userSearchResults.delete(chatId);
      }
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
        await sendText(wahaClient, cfg, chatId, `❌ Cancelled`);
        return;
      }
      
      if (selectionNumber >= 1 && selectionNumber <= results.length) {
        const chosen = results[selectionNumber - 1];
        const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, use the handler function
        if (isTvShow) {
          const result = await handleTvShowSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, is4k);
          if (result) {
            // Store with is4k flag for season selection
            pendingTvSelections.set(chatId, { show: result, is4k });
          } else {
            // Handled (already requested/available or error)
            userSearchResults.delete(chatId);
          }
          return;
        }
        
        // For movies, use the handler function
        await handleMovieSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, is4k);

        // Clear stored results
        userSearchResults.delete(chatId);
        logger?.debug('Cleared stored results for user', { chatId });
        return;
      } else {
        // Invalid selection number
        logger?.warn(`Invalid selection number ${selectionNumber}`, { validRange: `0-${results.length}` });
        await sendText(wahaClient, cfg, chatId, `❌ Invalid. Reply with 0-${results.length} (0 = cancel)`);
        return;
      }
    }

    // Check if message starts with any configured command (including 4K commands)
    const searchResult = extractSearchQuery(messageText, searchCommands, searchCommands4k);
    if (!searchResult) {
      const allCommands = [...searchCommands, ...searchCommands4k];
      const commandsList = allCommands.join('", "');
      logger?.warn(`Message does not start with any command: "${commandsList}"`, { messageText });
      const helpText = searchCommands4k.length > 0 
        ? `💬 Use: ${searchCommands.join(', ')} <name> (standard) or ${searchCommands4k.join(', ')} <name> (4K)\nExample: ${primaryCommand} Matrix`
        : `💬 Use: ${searchCommands.join(', ')} <name>\nExample: ${primaryCommand} Matrix`;
      await sendText(wahaClient, cfg, chatId, helpText);
      return;
    }

    const query = searchResult.query;
    const is4k = searchResult.is4k || false;
    
    // Handle empty query (user just typed command without search term)
    if (!query || query.trim().length === 0) {
      logger?.info(`Empty query after command "${searchResult.matchedCommand}"`);
      await sendText(wahaClient, cfg, chatId, `💬 ${searchResult.matchedCommand} <name>\nExample: ${searchResult.matchedCommand} Matrix`);
      return;
    }
    
    logger?.info(`🔍 Searching: "${query}" (matched command: ${searchResult.matchedCommand})`);

    // Send searching message
    await sendText(wahaClient, cfg, chatId, `🔍 Searching...`);

    try {
      const candidates = await searchTitle(jellyseerrClient, cfg, query, null, null, logger);
      logger?.debug('Search result count', { count: candidates?.length || 0 });

      if (!candidates || candidates.length === 0) {
        logger?.info(`🙈 No results for: "${query}"`);
        await sendText(wahaClient, cfg, chatId, '❌ No results. Try different keywords.');
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
      await sendText(wahaClient, cfg, chatId, `❌ Search error: ${err.message}`);
      userSearchResults.delete(chatId);
    }

  } catch (err) {
    logger?.error('Error handling message', err?.message || err);
    logger?.debug('Handler error stack', err?.stack);
  }
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

  const server = createWebhookServer(cfg, jellyseerrClient, wahaClient, handleMessage, getWebhookUrl);

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
