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
        await sendText(wahaClient, cfg, chatId, `❌ Cancelled`);
        return;
      }
      
      if (seasonSelection.error) {
        await sendText(wahaClient, cfg, chatId, `❌ ${seasonSelection.error}`);
        return;
      }
      
      // Check season status before creating request (duplicate prevention)
      // Filter out season 0 (Specials) - never allow requesting specials
      let seasons = (seasonSelection.seasons || []).filter(s => s !== 0);
      
      if (seasons.length === 0) {
        await sendText(wahaClient, cfg, chatId, `❌ No valid seasons selected. Season 0 (Specials) cannot be requested.`);
        return;
      }
      
      // Get fresh media details to check current season status
      let mediaDetails = tvShow.mediaDetails;
      if (!mediaDetails) {
        logger?.debug('Fetching fresh media details for season status check');
        try {
          mediaDetails = await getMediaDetails(jellyseerrClient, cfg, tvShow.id, 2);
        } catch (err) {
          logger?.warn('Failed to fetch media details for status check, proceeding with request', err?.message);
        }
      }
      
      // Check if selected seasons are already requested (duplicate prevention)
      // According to reference: If IsRequested == Full, block request and show appropriate message
      if (mediaDetails) {
        const alreadyRequestedSeasons = [];
        const alreadyAvailableSeasons = [];
        const canRequestSeasons = [];
        
        for (const seasonNum of seasons) {
          const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum);
          if (seasonStatus.isRequested) {
            if (seasonStatus.isAvailable) {
              // Already available - warn user
              alreadyAvailableSeasons.push(seasonNum);
            } else {
              // Already requested but not available
              alreadyRequestedSeasons.push(seasonNum);
            }
          } else {
            canRequestSeasons.push(seasonNum);
          }
        }
        
        // If all selected seasons are already requested or available
        if (canRequestSeasons.length === 0 && (alreadyRequestedSeasons.length > 0 || alreadyAvailableSeasons.length > 0)) {
          if (alreadyAvailableSeasons.length > 0) {
            logger?.info(`✅ All selected seasons (${alreadyAvailableSeasons.join(', ')}) are already available`);
            await sendText(wahaClient, cfg, chatId, `✅ Seasons ${alreadyAvailableSeasons.join(', ')} already available`);
          } else {
            logger?.info(`📋 All selected seasons (${alreadyRequestedSeasons.join(', ')}) are already requested`);
            await sendText(wahaClient, cfg, chatId, `📋 Seasons ${alreadyRequestedSeasons.join(', ')} already requested`);
          }
          pendingTvSelections.delete(chatId);
          userSearchResults.delete(chatId);
          return;
        }
        
        // If some seasons are already requested/available, only request the ones that can be requested
        if (alreadyRequestedSeasons.length > 0 || alreadyAvailableSeasons.length > 0) {
          const messages = [];
          if (alreadyAvailableSeasons.length > 0) {
            messages.push(`✅ S${alreadyAvailableSeasons.join(', S')} available`);
          }
          if (alreadyRequestedSeasons.length > 0) {
            messages.push(`📋 S${alreadyRequestedSeasons.join(', S')} requested`);
          }
          logger?.info(`Some seasons already requested/available, requesting only seasons ${canRequestSeasons.join(', ')}`);
          if (messages.length > 0) {
            await sendText(wahaClient, cfg, chatId, messages.join('. '));
          }
          seasons = canRequestSeasons; // Update to only request requestable seasons
        }
      }
      
      // Create request with selected seasons
      const seasonsText = seasons.length === maxSeasons ? 'all seasons' : `season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`;
      logger?.info(`📨 Requesting "${chosenTitle}" (${seasonsText})`);
      
      try {
        const res = await createRequest(jellyseerrClient, cfg, tvShow, seasons, logger);
        logger?.debug('Create request response', { status: res.status, data: res.data });
        
        if (res.status === 201 || res.status === 200 || res.status === 202) {
          logger?.debug('Request response received', { status: res.status });
          const statusMessage = getRequestStatusMessage(res, 'TV', true);
          await sendText(wahaClient, cfg, chatId, statusMessage);
        } else if (res.status === 409) {
          logger?.debug('Request conflict - media already requested or available');
          const statusMessage = getRequestStatusMessage(res, 'TV', true);
          await sendText(wahaClient, cfg, chatId, statusMessage);
        } else {
          logger?.error(`Unexpected response from Jellyseerr (status ${res.status})`);
          logger?.debug('Unexpected response body', res.data);
          const statusMessage = getRequestStatusMessage(res, 'TV', true);
          await sendText(wahaClient, cfg, chatId, statusMessage);
        }
      } catch (err) {
        logger?.error('Failed to create request', err?.message || err);
        logger?.debug('Request error stack', err?.stack);
        await sendText(wahaClient, cfg, chatId, `❌ Error: ${err.message}`);
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
        await sendText(wahaClient, cfg, chatId, `❌ Cancelled`);
        return;
      }
      
      if (selectionNumber >= 1 && selectionNumber <= results.length) {
        const chosen = results[selectionNumber - 1];
        const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, fetch details and check season status before showing selection
        if (isTvShow) {
          logger?.info(`📺 TV selected: "${chosenTitle}" — fetching seasons...`);
          await sendText(wahaClient, cfg, chatId, `📺 Loading seasons for "${chosenTitle}"...`);
          
          try {
            const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 2);
            // Filter out season 0 (Specials) - never show or allow requesting specials
            const allSeasons = mediaDetails.seasons || [];
            const seasons = allSeasons.filter(season => {
              const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                                season.season_number !== undefined ? season.season_number : null;
              return seasonNum !== null && seasonNum !== 0;
            });
            logger?.debug('TV media details seasons', { seasonCount: seasons.length, totalIncludingSpecials: allSeasons.length });
            
            if (seasons.length === 0) {
              // No season info available, check overall status before requesting all seasons
              logger?.warn('No season info returned; checking overall status');
              const statusInfo = extractMediaStatus(mediaDetails);
              
              if (statusInfo) {
                const requested = isRequested(statusInfo.status);
                const available = isAvailable(statusInfo.status);
                
                if (available) {
                  logger?.info(`✅ "${chosenTitle}" is already available`);
                  await sendText(wahaClient, cfg, chatId, `✅ Available`);
                  userSearchResults.delete(chatId);
                  return;
                } else if (requested) {
                  const statusMsg = formatStatusMessage(statusInfo.status, typeStr, true, null);
                  logger?.info(`📋 "${chosenTitle}" is already requested`);
                  await sendText(wahaClient, cfg, chatId, statusMsg);
                  userSearchResults.delete(chatId);
                  return;
                }
              }
              
              // Can be requested - proceed
              const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
              const statusMessage = getRequestStatusMessage(res, typeStr, true);
              await sendText(wahaClient, cfg, chatId, statusMessage);
              
              userSearchResults.delete(chatId);
              return;
            }
            
            // Check season-level status (following reference: show all seasons, block requests for requested ones)
            // According to reference: Show all seasons with indicators, block requests for IsRequested == Full
            const requestedSeasons = [];
            const canRequestSeasons = [];
            
            for (const season of seasons) {
              // Handle different season object structures consistently
              // Handle different season object structures consistently
              const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                                season.season_number !== undefined ? season.season_number : null;
              if (seasonNum === null) continue; // Skip if season number is missing
              
              const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum);
              
              if (seasonStatus.isRequested) {
                requestedSeasons.push({ seasonNum, status: seasonStatus });
              } else {
                canRequestSeasons.push(seasonNum);
              }
            }
            
            // If all seasons are already requested
            if (canRequestSeasons.length === 0 && requestedSeasons.length > 0) {
              logger?.info(`📋 All seasons of "${chosenTitle}" are already requested`);
              await sendText(wahaClient, cfg, chatId, `📋 All seasons already requested`);
              userSearchResults.delete(chatId);
              return;
            }
            
            // Store TV show with all seasons for selection (we'll block requests for requested ones later)
            chosen.seasons = seasons;
            chosen.mediaDetails = mediaDetails; // Store full details for later season status checks
            pendingTvSelections.set(chatId, chosen);
            
            // Show season selection with all seasons (indicators will show which are requested/available)
            const seasonsMessage = formatSeasons(chosen.seasons, mediaDetails);
            await sendText(wahaClient, cfg, chatId, seasonsMessage);
            
            // Keep search results in case user wants to cancel and pick something else
            return;
          } catch (err) {
            logger?.error('Failed to get TV media details', err?.message || err);
            await sendText(wahaClient, cfg, chatId, `⚠️ Error loading seasons. Requesting all...`);
            
            // Fallback: request all seasons (no status check possible)
            try {
              const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
              const statusMessage = getRequestStatusMessage(res, typeStr, true);
              await sendText(wahaClient, cfg, chatId, statusMessage);
            } catch (reqErr) {
              logger?.error('Fallback request failed', reqErr?.message || reqErr);
              await sendText(wahaClient, cfg, chatId, `❌ Error: ${reqErr.message}`);
            }
            
            userSearchResults.delete(chatId);
            return;
          }
        }
        
        // For movies, check status before creating request (duplicate prevention)
        logger?.info(`📨 Checking status for ${typeStr}: "${chosenTitle}" (${chosenYear})`);
        
        try {
          // Get media details to check current status
          const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 1);
          const statusInfo = extractMediaStatus(mediaDetails);
          
          if (statusInfo) {
            const requested = isRequested(statusInfo.status);
            const available = isAvailable(statusInfo.status);
            
            // Check if can be requested (duplicate prevention)
            if (!canBeRequested(statusInfo.status)) {
              if (available) {
                // Already available in library
                logger?.info(`✅ "${chosenTitle}" is already available in your library`);
                await sendText(wahaClient, cfg, chatId, `✅ Available`);
                userSearchResults.delete(chatId);
                return;
              } else if (requested) {
                // Already requested but not available
                const statusMsg = formatStatusMessage(statusInfo.status, typeStr, false, null);
                logger?.info(`📋 "${chosenTitle}" is already requested`);
                await sendText(wahaClient, cfg, chatId, statusMsg);
                userSearchResults.delete(chatId);
                return;
              }
            }
          }
          
          // Can be requested - proceed with request
          logger?.info(`📨 Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})`);
          
          const res = await createRequest(jellyseerrClient, cfg, chosen, null, logger);
          logger?.debug('Create request response', { status: res.status, data: res.data });
          
          if (res.status === 201 || res.status === 200 || res.status === 202) {
            logger?.debug('Request response received', { status: res.status });
            const statusMessage = getRequestStatusMessage(res, typeStr, false);
            await sendText(wahaClient, cfg, chatId, statusMessage);
          } else if (res.status === 409) {
            logger?.debug('Request conflict - media already requested or available');
            const statusMessage = getRequestStatusMessage(res, typeStr, false);
            await sendText(wahaClient, cfg, chatId, statusMessage);
          } else {
            logger?.error(`Unexpected response from Jellyseerr (status ${res.status})`);
            logger?.debug('Unexpected response body', res.data);
            const statusMessage = getRequestStatusMessage(res, typeStr, false);
            await sendText(wahaClient, cfg, chatId, statusMessage);
          }
        } catch (err) {
          logger?.error('Failed to check status or create request', err?.message || err);
          logger?.debug('Request error stack', err?.stack);
          await sendText(wahaClient, cfg, chatId, `❌ Error: ${err.message}`);
        }

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

    // Check if message starts with any configured command
    const searchResult = extractSearchQuery(messageText, searchCommands);
    if (!searchResult) {
      const commandsList = searchCommands.join('", "');
      logger?.warn(`Message does not start with any command: "${commandsList}"`, { messageText });
      await sendText(wahaClient, cfg, chatId, `💬 Use: ${searchCommands.join(', ')} <name>\nExample: ${primaryCommand} Matrix`);
      return;
    }

    const query = searchResult.query;
    
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
