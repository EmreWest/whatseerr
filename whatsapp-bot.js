#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import { createHttpClient, searchTitle, formatMedia, approveRequest, declineRequest } from './lib/request.js';
import { createWahaClient, sendMessage, getPhoneNumberByLid } from './lib/waha-client.js';
import { loadConfig, getWebhookUrl, isLidFormat, getUsernameFromChatId, setLidMapping, isAdminChatId } from './lib/utils.js';
import { createLogger } from './lib/logger.js';

// Import modules
import { MAX_PROCESSED_MESSAGES, RESULTS_PER_PAGE } from './lib/constants.js';
import { userSearchResults, pendingTvSelections, processedMessages } from './lib/state.js';
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
    if (isLidFormat(chatId)) {
      const resolvedPhoneChatId = await getPhoneNumberByLid(wahaClient, cfg, chatId);
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
      logger?.debug('Empty message text, ignoring', { chatId, messageId });
      return;
    }

    logger?.info(`📩 Message received`, {
      chatId,
      messageId,
      messageLength: messageText.length,
      preview: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText
    });

    // Normalize message for comparison (used in multiple checks)
    const messageLower = messageText.toLowerCase().trim();
    
    // Check if message is an approval/decline command with request ID
    // Format: "approve 123" or "decline 123" (request ID is required)
    const approveMatch = messageLower.match(/^approve\s+(\d+)$/);
    const declineMatch = messageLower.match(/^decline\s+(\d+)$/);
    
    if (approveMatch || declineMatch) {
      const isApprove = !!approveMatch;
      const requestId = approveMatch?.[1] || declineMatch?.[1];
      
      logger?.info(`Approval/decline command detected`, {
        command: isApprove ? 'approve' : 'decline',
        requestId,
        chatId
      });
      
      // Validate that message is from admin
      const isAdmin = await isAdminChatId(cfg, chatId, wahaClient, logger);
      
      logger?.debug('Validating admin access for approval command', {
        chatId,
        isAdmin,
        isLidFormat: isLidFormat(chatId)
      });
      
      if (!isAdmin) {
        logger?.warn('Non-admin user attempted approval command', {
          chatId,
          requestId,
          command: isApprove ? 'approve' : 'decline',
          messageText
        });
        await sendMessage(wahaClient, cfg, chatId, `❌ Only administrators can approve/decline requests.`);
        return;
      }
      
      logger?.info(`Admin validated, processing ${isApprove ? 'approval' : 'decline'}`, {
        requestId,
        adminChatId: chatId
      });
      
      try {
        if (isApprove) {
          await approveRequest(jellyseerrClient, cfg, requestId, logger);
          logger?.info(`✅ Request approved via text command`, {
            requestId,
            method: 'text',
            adminChatId: chatId
          });
          await sendMessage(wahaClient, cfg, chatId, `✅ Request ${requestId} approved!`);
        } else {
          await declineRequest(jellyseerrClient, cfg, requestId, logger);
          logger?.info(`🚫 Request declined via text command`, {
            requestId,
            method: 'text',
            adminChatId: chatId
          });
          await sendMessage(wahaClient, cfg, chatId, `🚫 Request ${requestId} declined.`);
        }
      } catch (err) {
        logger?.error(`Failed to ${isApprove ? 'approve' : 'decline'} request via text command`, {
          requestId,
          method: 'text',
          error: err?.message || err,
          stack: err?.stack
        });
        await sendMessage(wahaClient, cfg, chatId, `❌ Error: ${err?.message || 'Failed to process request'}`);
      }
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
    // Note: "0" is handled as cancel in selection context, but as agent request when not in selection
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
      const isArrayFormat = Array.isArray(storedData);
      const results = isArrayFormat ? storedData : (storedData?.results || storedData);
      const storedIs4k = isArrayFormat ? false : (storedData?.is4k === true);
      const offset = isArrayFormat ? 0 : (storedData?.offset || 0);
      const query = isArrayFormat ? '' : (storedData?.query || '');
      
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
      
      // Calculate displayed count and check for "Show more" option
      const displayedCount = Math.min(RESULTS_PER_PAGE, results.length - offset);
      const hasMore = (offset + displayedCount) < results.length;
      const showMoreOption = hasMore ? displayedCount + 1 : null;
      
      // Handle "Show more" selection
      if (showMoreOption && selectionNumber === showMoreOption) {
        logger?.info(`📄 Showing more results (offset: ${offset + displayedCount})`);
        const nextOffset = offset + displayedCount;
        const formatted = formatSearchResults(results, query, RESULTS_PER_PAGE, nextOffset);
        
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
        const { title: chosenTitle, typeStr } = formatMedia(chosen);
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, use the handler function
        if (isTvShow) {
          const result = await handleTvShowSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k);
          if (result) {
            // Store with is4k flag for season selection
            pendingTvSelections.set(chatId, { show: result, is4k: storedIs4k });
            logger?.debug('Stored TV selection', { chatId });
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
        logger?.debug('Cleared stored results for user', { chatId });
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
      const primaryCommand = searchCommands[0] || 'r';
      helpText += `🎬 Standard Request\n${primaryCommand} <name>\nExample: ${primaryCommand} Matrix\n`;
      
      // 4K request section (if configured and help4k is enabled)
      if (cfg.help4k && searchCommands4k.length > 0) {
        const fourKExample = searchCommands4k[0];
        helpText += `\n🖥️ 4K Request\n${fourKExample} <name>\nExample: ${fourKExample} Matrix\n`;
      }
      
      helpText += '\n📝 Just type the command followed by the movie or show name.';
      helpText += '\n\n💬 Need help? Reply "agent" to speak with an agent.';
      
      await sendMessage(wahaClient, cfg, chatId, helpText);
      return;
    }

    // Check if user wants to speak with an agent (only when not in selection mode)
    const isAgentRequest = messageLower === 'agent' && 
                           !userSearchResults.has(chatId) && 
                           !pendingTvSelections.has(chatId);
    
    if (isAgentRequest) {
      logger?.info('User requested to speak with agent', { chatId });
      
      // Get user info for the notification
      const username = await getUsernameFromChatId(cfg, chatId, wahaClient);
      const userDisplayName = username || chatId;
      
      // Send confirmation to user
      await sendMessage(wahaClient, cfg, chatId, '✅ Your request has been sent to an agent. They will respond shortly.');
      
      // Send notification to admin (sendMessage handles LID conversion internally)
      const adminPhoneNumber = cfg.jellyseerr?.adminDetails?.phoneNumber;
      if (adminPhoneNumber) {
        const adminPhoneChatId = `${adminPhoneNumber}@c.us`;
        const notificationMessage = `💬 Agent Request\n\n👤 User: ${userDisplayName}\n📱 Chat ID: ${chatId}\n\nUser requested to speak with an agent.`;
        
        try {
          await sendMessage(wahaClient, cfg, adminPhoneChatId, notificationMessage);
          logger?.info('Agent request notification sent to admin', {
            userChatId: chatId,
            username,
            adminPhoneNumber
          });
        } catch (err) {
          logger?.error('Failed to send agent request notification to admin', {
            userChatId: chatId,
            adminPhoneNumber,
            error: err?.message || err,
            stack: err?.stack
          });
        }
      } else {
        logger?.warn('Admin phone number not configured, cannot send agent request notification', {
          userChatId: chatId
        });
      }
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
      logger?.debug('Stored results', { 
        chatId, 
        count: candidates.length, 
        is4k
      });

      // Format and send results (first page, offset 0)
      const formatted = formatSearchResults(candidates, query, RESULTS_PER_PAGE, 0);
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
