#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import http from 'http';
import { createHttpClient, searchTitle, createRequest, formatMedia, getMediaDetails, extractMediaStatus, formatStatusMessage } from './request.js';
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
    return '❌ No results found. Try a different search.';
  }

  let message = '📋 Results:\n';
  top.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    message += `${idx + 1}. ${title} (${year}) [${typeStr}]\n`;
  });
  message += '\n0. Cancel\n';
  message += '\nReply with a number to request.';

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
 * @param {Object} mediaDetails - Media details to check season availability
 * @returns {string} Formatted message
 */
function formatSeasons(seasons, mediaDetails = null) {
  if (!seasons || seasons.length === 0) {
    return '❌ No seasons available.';
  }
  
  let message = '📺 Select seasons:\n';
  seasons.forEach((season, idx) => {
    // Handle different season object structures
    const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                      season.season_number !== undefined ? season.season_number :
                      idx + 1;
    const name = (season.name || season.seasonName) ? ` - ${season.name || season.seasonName}` : '';
    const episodeCount = (season.episodeCount || season.episode_count) ? 
                         ` (${season.episodeCount || season.episode_count} eps)` : '';
    
    // Check season status and show indicators
    let indicator = '';
    if (mediaDetails) {
      const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum);
      if (seasonStatus.isAvailable) {
        indicator = ' ✅'; // Available in library
      } else if (seasonStatus.isRequested) {
        indicator = ' 📋'; // Requested but not available
      }
    }
    
    message += `${seasonNum}. S${seasonNum}${name}${episodeCount}${indicator}\n`;
  });
  message += '\n0. Cancel | all. All seasons\n';
  message += '\nReply: number(s) or "all"';
  
  return message;
}

/**
 * Determines if media is requested based on status
 * According to docs: Requested = (status != UNKNOWN)
 * Status codes: 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if requested
 */
function isRequested(status) {
  // Status 1 = UNKNOWN (not requested)
  // Status 2, 3, 4, 5 = PENDING, PROCESSING, PARTIALLY_AVAILABLE, AVAILABLE (all requested)
  // Status 6 = DELETED (not requested, but was previously available)
  return status !== 1 && status >= 2 && status <= 5;
}

/**
 * Determines if media is available based on status
 * According to docs: Available = (status == AVAILABLE)
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if available
 */
function isAvailable(status) {
  // Only status 5 (AVAILABLE) means it's in the library
  return status === 5;
}

/**
 * Checks if a movie can be requested
 * According to docs: CanBeRequested = !Available && !Requested
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if can be requested
 */
function canBeRequested(status) {
  return !isAvailable(status) && !isRequested(status);
}

/**
 * Converts season status to requested state
 * According to docs: IsRequested = (status == 3 || status == 4 || status == 5)
 * UNKNOWN (1) or PENDING (2) → None
 * PROCESSING (3), PARTIALLY_AVAILABLE (4), or AVAILABLE (5) → Full
 * @param {number} status - Status code (1-6)
 * @returns {string} 'None' or 'Full'
 */
function convertRequestedState(status) {
  if (status === 1 || status === 2) {
    // UNKNOWN or PENDING → None
    return 'None';
  }
  if (status === 3 || status === 4 || status === 5) {
    // PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE → Full
    return 'Full';
  }
  // Status 6 (DELETED) or invalid → None
  return 'None';
}

/**
 * Checks if a TV show season is requested and available
 * Follows the 3-step priority system from Requestrr reference:
 * 1. Initial status from seasons[] metadata (lowest priority)
 * 2. Override with pending/approved requests (highest priority)
 * 3. Override with MediaInfo.Seasons status (medium priority, but not if pending request exists)
 * @param {Object} mediaDetails - Media details from getMediaDetails
 * @param {number} seasonNumber - Season number to check
 * @returns {Object} { isRequested: boolean, isAvailable: boolean, reason: string }
 */
function checkSeasonRequestStatus(mediaDetails, seasonNumber) {
  const mediaInfo = mediaDetails.mediaInfo || mediaDetails;
  
  // Step 1: Initial status from seasons[] metadata (lowest priority)
  // Match table columns exactly:
  // Status 1 (UNKNOWN): IsAvailable = false, IsRequested = None (false)
  // Status 2 (PENDING): IsAvailable = false, IsRequested = None (false)
  // Status 3 (PROCESSING): IsAvailable = false, IsRequested = Full (true)
  // Status 4 (PARTIALLY_AVAILABLE): IsAvailable = false, IsRequested = Full (true)
  // Status 5 (AVAILABLE): IsAvailable = true, IsRequested = Full (true)
  let isAvailable = false;
  let isRequested = false;
  let reason = 'seasons_metadata';
  
  if (mediaDetails.seasons && Array.isArray(mediaDetails.seasons)) {
    const seasonMeta = mediaDetails.seasons.find(s => (s.seasonNumber || s.season_number) === seasonNumber);
    if (seasonMeta && seasonMeta.status !== undefined && seasonMeta.status !== null) {
      const status = typeof seasonMeta.status === 'string' ? parseInt(seasonMeta.status, 10) : seasonMeta.status;
      isAvailable = status === 5; // Only status 5 is available
      const requestedState = convertRequestedState(status);
      isRequested = requestedState === 'Full'; // Status 3, 4, 5 = Full (true), Status 1, 2 = None (false)
    }
  }
  
  // Step 2: Override with pending/approved requests (highest priority)
  // According to reference: If a request exists, IsAvailable = false and IsRequested = Full (regardless of other status)
  // Request status codes: 1 = PENDING APPROVAL, 2 = APPROVED, 3 = DECLINED
  let hasPendingRequest = false;
  if (mediaInfo.requests && Array.isArray(mediaInfo.requests)) {
    const pendingRequest = mediaInfo.requests.find(req => {
      // Only PENDING (1) or APPROVED (2) requests count as requested
      // DECLINED (3) requests do not block new requests
      if (req.status !== 1 && req.status !== 2) {
        return false;
      }
      // Check if this request includes the season
      if (req.seasons && Array.isArray(req.seasons)) {
        return req.seasons.some(s => (s.seasonNumber || s.season_number) === seasonNumber);
      }
      return false;
    });
    
    if (pendingRequest) {
      // Pending/approved requests always override: IsAvailable = false, IsRequested = Full
      // This prevents duplicate requests even if the season status suggests it's not requested
      hasPendingRequest = true;
      isAvailable = false; // Always false if request exists (per reference)
      isRequested = true; // Always Full if request exists (per reference)
      reason = 'pending_request';
    }
  }
  
  // Step 3: Override with mediaInfo.seasons status (medium priority)
  // According to reference: Overrides initial status (but NOT if pending requests exist)
  // Only overrides if status is PROCESSING (3), PARTIALLY_AVAILABLE (4), or AVAILABLE (5)
  // Does not override if status is UNKNOWN (1) or PENDING (2)
  // API returns mediaInfo.seasons (lowercase) per OpenAPI spec and actual API responses
  if (!hasPendingRequest) {
    // Check lowercase first (actual API format), then uppercase for compatibility
    const mediaSeasons = mediaInfo.seasons || mediaInfo.Seasons;
    if (mediaSeasons && Array.isArray(mediaSeasons)) {
      const seasonInfo = mediaSeasons.find(s => (s.seasonNumber || s.season_number) === seasonNumber);
      if (seasonInfo && seasonInfo.status !== undefined && seasonInfo.status !== null) {
        const status = typeof seasonInfo.status === 'string' ? parseInt(seasonInfo.status, 10) : seasonInfo.status;
        // Only override if status is 3, 4, or 5 (not 1 or 2)
        if (status === 3 || status === 4 || status === 5) {
          isAvailable = status === 5; // Only status 5 is available
          isRequested = true; // Status 3, 4, 5 = Full (true)
          reason = 'media_info_seasons';
        }
        // If status is 1 or 2, keep the initial status from Step 1
      }
    }
  }
  
  return {
    isRequested,
    isAvailable,
    reason
  };
}

/**
 * Extracts media status from API response
 * @param {Object} data - Response data from Jellyseerr API
 * @returns {Object|null} Status object with { status: number, is4k: boolean } or null
 */

/**
 * Determines the status message for request responses
 * @param {Object} res - Response object from Jellyseerr API
 * @param {string} typeStr - Media type string (Movie/TV)
 * @param {boolean} isTvShow - Whether this is a TV show
 * @returns {string} Status message
 */
function getRequestStatusMessage(res, typeStr, isTvShow = false) {
  if (res.status === 201 || res.status === 200 || res.status === 202) {
    // For successful requests (including 202 Accepted), check the media status
    const statusInfo = extractMediaStatus(res.data);
    
    if (statusInfo) {
      // Use the status to provide detailed feedback
      // Pass season statuses directly (already extracted with status field)
      const seasonStatuses = isTvShow && statusInfo.seasons && statusInfo.seasons.length > 0
        ? statusInfo.seasons
        : null;
      
      return formatStatusMessage(statusInfo.status, typeStr, isTvShow, seasonStatuses);
    }
    
    // For 202, check if there's an API message
    if (res.status === 202) {
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
      
      if (apiMessage) {
        return `ℹ️ ${apiMessage}`;
      }
    }
    
    // Fallback if status can't be extracted
    return `✅ Request created`;
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
    
    // Extract numeric status from response
    const statusInfo = extractMediaStatus(data);
    
    if (statusInfo) {
      // Use the same status formatting as successful requests
      const seasonStatuses = isTvShow && statusInfo.seasons && statusInfo.seasons.length > 0
        ? statusInfo.seasons
        : null;
      
      return formatStatusMessage(statusInfo.status, typeStr, isTvShow, seasonStatuses);
    }
    
    // Fallback message if status cannot be extracted
    return `ℹ️ Already requested or available`;
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
        await sendText(wahaClient, cfg, chatId, `❌ Cancelled`);
        return;
      }
      
      if (seasonSelection.error) {
        await sendText(wahaClient, cfg, chatId, `❌ ${seasonSelection.error}`);
        return;
      }
      
      // Check season status before creating request (duplicate prevention)
      let seasons = seasonSelection.seasons;
      
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
            const seasons = mediaDetails.seasons || [];
            logger?.debug('TV media details seasons', { seasonCount: seasons.length });
            
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
              const seasonNum = season.seasonNumber || season.season_number;
              if (seasonNum === undefined || seasonNum === null) continue;
              
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
