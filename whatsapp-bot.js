#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import { createHttpClient, searchTitle, formatMedia, approveRequest, declineRequest } from './lib/request.js';
import { createWahaClient, sendMessage, getPhoneNumberByLid } from './lib/waha-client.js';
import { loadConfig, getWebhookUrl, isLidFormat, getIdentifierType, getUsernameFromChatId, setLidMapping } from './lib/utils.js';
import { createLogger } from './lib/logger.js';

// Import modules
import { MAX_PROCESSED_MESSAGES } from './lib/constants.js';
import { userSearchResults, pendingTvSelections, processedMessages, pendingRequestApprovals } from './lib/state.js';
import { formatSearchResults } from './lib/message-formatters.js';
import { parseCommands, extractSearchQuery } from './lib/command-parser.js';
import { handleTvSeasonSelection, handleTvShowSelection, handleMovieSelection } from './lib/request-handler.js';
import { createWebhookServer } from './lib/webhook-server.js';

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

    // Auto-create LID mapping if we receive LID format and can resolve it
    // Also resolve to phone number for potential reuse in pending approvals lookup
    let resolvedPhoneChatId = null;
    if (isLidFormat(chatId)) {
      resolvedPhoneChatId = await getPhoneNumberByLid(wahaClient, cfg, chatId);
      if (resolvedPhoneChatId) {
        setLidMapping(cfg, resolvedPhoneChatId, chatId, logger);
      }
    }
    
    logger?.debug('Message received', {
      chatId,
      isLidFormat: isLidFormat(chatId),
      messageId,
      messageLength: messageText.length
    });


    // Check for duplicate messages early (before processing)
    if (messageId && processedMessages.has(messageId)) {
      logger?.debug('Duplicate message detected, ignoring', { messageId, chatId });
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
        logger?.debug('Cleaned up old processed message ID', { removedId: firstId, totalSize: processedMessages.size });
      }
    }

    logger?.debug('Incoming message details', {
      chatId,
      messageId,
      messageText,
      isLidFormat: isLidFormat(chatId),
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

    // Check if admin is responding to a pending request approval
    // Pending approvals are stored with phone format key (from config), but we need to handle
    // both LID and phone formats for lookup since incoming messages may be in either format
    let lookupChatId = chatId;
    if (isLidFormat(chatId) && resolvedPhoneChatId) {
      // Reuse phone number resolved earlier, or resolve now if not already resolved
      if (pendingRequestApprovals.has(resolvedPhoneChatId)) {
        lookupChatId = resolvedPhoneChatId;
        logger?.debug('Found pending approval using phone format (resolved from LID)', {
          originalChatId: chatId,
          lookupChatId: resolvedPhoneChatId
        });
      }
    }
    // If phone format, use as-is (pending approvals are stored with phone format key)
    
    if (pendingRequestApprovals.has(lookupChatId)) {
      const requestInfo = pendingRequestApprovals.get(lookupChatId);
      const messageLower = messageText.toLowerCase().trim();
      
      // Handle cancel/ignore (0)
      if (messageLower === '0' || messageLower === 'cancel') {
        logger?.info('Admin cancelled request approval', { requestId: requestInfo.requestId });
        pendingRequestApprovals.delete(lookupChatId);
        await sendMessage(wahaClient, cfg, chatId, '❌ Request approval cancelled');
        return;
      }
      
      // Parse approve/decline commands: "approve 123" or "approve" or "approve123"
      const approveMatch = messageLower.match(/^approve\s*(\d+)?$/);
      const declineMatch = messageLower.match(/^decline\s*(\d+)?$/);
      
      if (approveMatch || declineMatch) {
        const isApprove = !!approveMatch;
        const requestIdFromMessage = (approveMatch?.[1] || declineMatch?.[1]);
        
        // Use request ID from message if provided, otherwise use stored one
        const requestId = requestIdFromMessage || requestInfo.requestId;
        
        // Validate request ID matches stored one (if provided in message)
        if (requestIdFromMessage && requestIdFromMessage !== requestInfo.requestId) {
          await sendMessage(wahaClient, cfg, chatId, `❌ Request ID mismatch. Expected: ${requestInfo.requestId}`);
          return;
        }
        
        try {
          if (isApprove) {
            await approveRequest(jellyseerrClient, cfg, requestId, logger);
            logger?.info(`✅ Admin approved request ${requestId}`, { 
              requestId, 
              subject: requestInfo.subject,
              requestedBy: requestInfo.requestedBy
            });
            await sendMessage(wahaClient, cfg, chatId, `✅ Request approved!\n\n📋 ${requestInfo.subject}\n👤 Requested by: ${requestInfo.requestedBy}`);
          } else {
            await declineRequest(jellyseerrClient, cfg, requestId, logger);
            logger?.info(`🚫 Admin declined request ${requestId}`, { 
              requestId, 
              subject: requestInfo.subject,
              requestedBy: requestInfo.requestedBy
            });
            await sendMessage(wahaClient, cfg, chatId, `🚫 Request declined.\n\n📋 ${requestInfo.subject}\n👤 Requested by: ${requestInfo.requestedBy}`);
          }
          
          // Remove from pending approvals (use lookupChatId which may be different format)
          pendingRequestApprovals.delete(lookupChatId);
        } catch (err) {
          logger?.error(`Failed to ${isApprove ? 'approve' : 'decline'} request`, {
            requestId,
            error: err?.message || err,
            stack: err?.stack
          });
          await sendMessage(wahaClient, cfg, chatId, `❌ Error: ${err?.message || 'Failed to process request'}`);
        }
        return;
      }
      
      // If message doesn't match approve/decline pattern, show help
      await sendMessage(wahaClient, cfg, chatId, 
        `📋 Pending request: ${requestInfo.subject}\n\n` +
        `✅ React with ✅ or reply "approve ${requestInfo.requestId}" to approve\n` +
        `🚫 React with ❌ or reply "decline ${requestInfo.requestId}" to decline\n` +
        `0️⃣ Reply "0" to cancel`
      );
      return;
    }

    // Check if user is selecting seasons for a TV show
    if (pendingTvSelections.has(chatId)) {
      const tvShowData = pendingTvSelections.get(chatId);
      if (!tvShowData) {
        logger?.warn('No stored TV show data found for season selection', { chatId });
        pendingTvSelections.delete(chatId);
        userSearchResults.delete(chatId);
        return;
      }
      
      // Handle both simple object format and structured format with show and is4k
      const tvShow = (tvShowData && typeof tvShowData === 'object' && 'show' in tvShowData) ? tvShowData.show : tvShowData;
      const is4k = (tvShowData && typeof tvShowData === 'object' && 'is4k' in tvShowData) ? (tvShowData.is4k === true) : false;
      
      if (!tvShow) {
        logger?.warn('Invalid TV show data in stored selection', { chatId });
        pendingTvSelections.delete(chatId);
        userSearchResults.delete(chatId);
        await sendMessage(wahaClient, cfg, chatId, `❌ Invalid selection. Please search again.`);
        return;
      }
      
      const { title: chosenTitle } = formatMedia(tvShow);
      logger?.info(`📺 Season selection for: "${chosenTitle}"${is4k ? ' (4K)' : ''}`);
      
      // Use the handler function - is4k flag propagates through all steps
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
      const storedData = userSearchResults.get(chatId);
      if (!storedData) {
        logger?.warn('No stored results found for selection', { chatId });
        userSearchResults.delete(chatId);
        return;
      }
      
      // Handle both array format and structured format with results, is4k, offset, query
      const results = Array.isArray(storedData) ? storedData : (storedData?.results || storedData);
      const storedIs4k = Array.isArray(storedData) ? false : (storedData?.is4k === true);
      const offset = Array.isArray(storedData) ? 0 : (storedData?.offset || 0);
      const query = Array.isArray(storedData) ? '' : (storedData?.query || '');
      
      if (!results || !Array.isArray(results) || results.length === 0) {
        logger?.warn('Invalid or empty stored results', { chatId });
        userSearchResults.delete(chatId);
        await sendMessage(wahaClient, cfg, chatId, `❌ No results available. Please search again.`);
        return;
      }
      
      logger?.debug('Stored result count', { chatId, count: results.length, is4k: storedIs4k, offset });
      
      // Handle cancel (option 0)
      if (selectionNumber === 0) {
        logger?.info('🚫 Cancelled selection');
        userSearchResults.delete(chatId);
        await sendMessage(wahaClient, cfg, chatId, `❌ Cancelled`);
        return;
      }
      
      // Calculate displayed count and check for "Show more" option (8 results per page, option 9 for next page)
      const resultsPerPage = 8;
      const displayedCount = Math.min(resultsPerPage, results.length - offset);
      const hasMore = (offset + displayedCount) < results.length;
      const showMoreOption = hasMore ? displayedCount + 1 : null;
      
      // Handle "Show more" selection
      if (showMoreOption && selectionNumber === showMoreOption) {
        logger?.info(`📄 Showing more results (offset: ${offset + displayedCount})`);
        const nextOffset = offset + displayedCount;
        const formatted = formatSearchResults(results, query, resultsPerPage, nextOffset);
        
        // Update stored data with new offset
        userSearchResults.set(chatId, {
          results,
          is4k: storedIs4k,
          offset: nextOffset,
          query
        });
        
        await sendMessage(wahaClient, cfg, chatId, formatted.message);
        return;
      }
      
      // Handle regular selection (1 to displayedCount)
      if (selectionNumber >= 1 && selectionNumber <= displayedCount) {
        const actualIndex = offset + selectionNumber - 1; // Convert display number to actual array index
        const chosen = results[actualIndex];
        const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, use the handler function
        if (isTvShow) {
          const result = await handleTvShowSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k);
          if (result) {
            // Store with is4k flag for season selection
            pendingTvSelections.set(chatId, { show: result, is4k: storedIs4k });
            const identifierInfo = getIdentifierType(chatId);
            logger?.debug('Stored TV selection [USES LID FORMAT]', {
              chatId,
              ...identifierInfo
            });
          } else {
            // Handled (already requested/available or error)
            userSearchResults.delete(chatId);
          }
          return;
        }
        
        // For movies, use the handler function
        await handleMovieSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k);

        // Clear stored results
        userSearchResults.delete(chatId);
        const identifierInfo = getIdentifierType(chatId);
        logger?.debug('Cleared stored results for user [USES LID FORMAT]', { 
          chatId,
          ...identifierInfo
        });
        return;
      } else {
        // Invalid selection number
        const maxOption = showMoreOption || displayedCount;
        logger?.warn(`Invalid selection number ${selectionNumber}`, { validRange: `0-${maxOption}` });
        await sendMessage(wahaClient, cfg, chatId, `❌ Invalid. Reply with 0-${maxOption} (0 = cancel)`);
        return;
      }
    }

    // Check if message is "help" command
    if (messageText.toLowerCase().trim() === 'help') {
      // Get username from mappings if available
      const username = await getUsernameFromChatId(cfg, chatId, wahaClient);
      
      // Build help message
      // Always show greeting, include username if available
      const greeting = username ? `👋 Hello ${username}!\n\n` : '👋 Hello!\n\n';
      let helpText = greeting;
      
      helpText += '📌 Available Commands:\n\n';
      
      // Standard request section
      helpText += `🎬 Standard Request\n${primaryCommand} <name>\nExample: ${primaryCommand} Matrix\n`;
      
      // 4K request section (if configured and help4k is enabled)
      if (cfg.help4k && searchCommands4k.length > 0) {
        const fourKExample = searchCommands4k[0];
        helpText += `\n🖥️ 4K Request\n${fourKExample} <name>\nExample: ${fourKExample} Matrix\n`;
      }
      
      helpText += '\n📝 Just type the command followed by the movie or show name.';
      
      await sendMessage(wahaClient, cfg, chatId, helpText);
      return;
    }

    // Check if message starts with any configured command (including 4K commands)
    const searchResult = extractSearchQuery(messageText, searchCommands, searchCommands4k);
    if (!searchResult) {
      // Message doesn't match any command and is not "help" - just ignore it
      logger?.debug('Message does not match any command and is not "help", ignoring', { messageText });
      return;
    }

    const query = searchResult.query;
    // Extract is4k flag from command match - this propagates through all subsequent steps
    const is4k = searchResult.is4k === true;
    
    // Handle empty query (user just typed command without search term)
    if (!query || query.trim().length === 0) {
      logger?.info(`Empty query after command "${searchResult.matchedCommand}"`);
      await sendMessage(wahaClient, cfg, chatId, `💬 ${searchResult.matchedCommand} <name>\nExample: ${searchResult.matchedCommand} Matrix`);
      return;
    }
    
    logger?.info(`🔍 Searching: "${query}" (matched command: ${searchResult.matchedCommand})`);

    // Send searching message
    await sendMessage(wahaClient, cfg, chatId, `🔍 Searching...`);

    try {
      const candidates = await searchTitle(jellyseerrClient, cfg, query, null, null, logger);
      logger?.debug('Search result count', { count: candidates?.length || 0 });

      if (!candidates || candidates.length === 0) {
        logger?.info(`🙈 No results for: "${query}"`);
        await sendMessage(wahaClient, cfg, chatId, '❌ No results. Try different keywords.');
        userSearchResults.delete(chatId);
        return;
      }

      // Store results for this user along with is4k flag, offset, and query
      userSearchResults.set(chatId, { 
        results: candidates, 
        is4k, 
        offset: 0, 
        query 
      });
      const identifierInfo = getIdentifierType(chatId);
      logger?.debug('Stored results [USES LID FORMAT]', { 
        chatId, 
        count: candidates.length, 
        is4k,
        ...identifierInfo
      });

      // Format and send results (first page, offset 0, 8 results per page)
      const resultsPerPage = 8;
      const formatted = formatSearchResults(candidates, query, resultsPerPage, 0);
      await sendMessage(wahaClient, cfg, chatId, formatted.message);

    } catch (err) {
      logger?.error(`Error searching for "${query}"`, err?.message || err);
      if (err?.stack) {
        logger?.debug('Search error stack', err.stack);
      }
      const errorMsg = err?.message || 'Unknown error';
      await sendMessage(wahaClient, cfg, chatId, `❌ Search error: ${errorMsg}`);
      userSearchResults.delete(chatId);
    }

  } catch (err) {
    logger?.error('Error handling message', err?.message || err);
    if (err?.stack) {
      logger?.debug('Handler error stack', err.stack);
    }
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

  logger?.info('🤖 Starting WhatsApp bot...');
  logger?.info(`🔗 Jellyseerr: ${cfg.jellyseerr.baseUrl}`);
  logger?.info(`🔗 WAHA: ${cfg.waha.baseUrl}`);
  logger?.info(`🧩 WAHA Session: ${cfg.waha?.session || 'default'}`);

  const server = createWebhookServer(cfg, jellyseerrClient, wahaClient, handleMessage, getWebhookUrl);

  // Graceful shutdown handler
  const shutdown = () => {
    logger?.info('\n🛑 Shutting down…');
    server.close(() => {
      logger?.info('✅ Server closed.');
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
    logger?.error('Fatal error', err?.message || err);
    if (err?.stack) {
      logger?.debug('Fatal stack', err.stack);
    }
    process.exit(1);
  });
}
