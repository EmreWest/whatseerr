/**
 * Search command - handles search and request commands
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { searchTitle } from '../request.js';
import { formatSearchResults } from '../message-formatters.js';
import { extractSearchQuery, parseCommands } from '../command-parser.js';
import { RESULTS_PER_PAGE } from '../constants.js';
import { getStateManager } from '../state/cache-state.js';
import { getQueueManager } from '../queue/message-queue.js';
import { getErrorDetails } from '../errors/error-formatter.js';

export class SearchCommand extends BaseCommand {
  constructor() {
    super('search', 'Search for movies and TV shows');
  }

  match(messageText, context) {
    const { cfg } = context;
    const searchCommands = parseCommands(cfg.commands?.command || '');
    const searchCommands4k = parseCommands(cfg.commands?.command4k || '');
    
    const searchResult = extractSearchQuery(messageText, searchCommands, searchCommands4k);
    
    if (searchResult) {
      return {
        matched: true,
        command: 'search',
        query: searchResult.query,
        matchedCommand: searchResult.matchedCommand,
        is4k: searchResult.is4k || false
      };
    }
    
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, jellyseerrClient, logger, matchResult } = context;
    const { query, is4k } = matchResult;
    const stateManager = getStateManager();
    
    // Validate and clean up any orphaned locks (before processing any search command)
    stateManager.validateFlowState(chatId);
    
    // Handle empty query
    if (!query || query.trim().length === 0) {
      logger?.info(`💬 User: "${matchResult.matchedCommand}" (no search term provided)`);
      try {
        await sendMessage(wahaClient, cfg, chatId, 
          `💬 ${matchResult.matchedCommand} <name>\nExample: ${matchResult.matchedCommand} Matrix`
        );
      } catch (err) {
        logger?.error('Error sending empty query help message', {
          ...getErrorDetails(err, 'sendEmptyQueryHelp'),
          chatId
        });
      }
      return;
    }
    
    // Try to acquire flow lock atomically (prevents race conditions)
    // This ensures only one search can proceed per user at a time
    if (!stateManager.tryAcquireFlowLock(chatId)) {
      logger?.info(`⏳ User already has an active request - waiting for "${query}"`);
      
      // Get current active search query for informative message
      const currentResults = stateManager.getUserResults(chatId);
      const currentQuery = currentResults?.query || 'current search';
      
      try {
        await sendMessage(wahaClient, cfg, chatId,
          `⏳ Please finish your current "${currentQuery}" request before starting a new search.\n\nYour new request for "${query}" has not started.\n\nSend 0 to cancel current request.`
        );
      } catch (err) {
        logger?.error('Error sending active flow message', {
          ...getErrorDetails(err, 'sendActiveFlowMessage'),
          chatId
        });
      }
      return;
    }
    
    // Lock acquired successfully - proceed with search
    
    try {
      logger?.info(`🔍 Searching for: "${query}"${is4k ? ' (4K)' : ''}`);
      
      // Send searching message
      await sendMessage(wahaClient, cfg, chatId, '🔍 Searching...');
      
      const queueManager = getQueueManager();
      
      // Use API queue for search
      const candidates = await queueManager.addApiTask(async () => {
        return await searchTitle(jellyseerrClient, cfg, query, null, null, logger);
      });
      
      logger?.debug('Search result count', { count: candidates?.length || 0 });
      
      if (!candidates || candidates.length === 0) {
        logger?.info(`❌ No results found for: "${query}"`);
        try {
          await sendMessage(wahaClient, cfg, chatId, '❌ No results found. Try different keywords');
        } catch (err) {
          logger?.error('Error sending no results message', {
            ...getErrorDetails(err, 'sendNoResultsMessage'),
            chatId
          });
        }
        // Release lock and clear state on no results
        stateManager.clearUserFlow(chatId);
        return;
      }
      
      // Format and send results (first page, offset 0)
      const formatted = formatSearchResults(candidates, query, RESULTS_PER_PAGE, 0);
      try {
        await sendMessage(wahaClient, cfg, chatId, formatted.message);
        // Store prompt timestamp after message is successfully sent
        // Timestamp-based filtering prevents selections made before the prompt is received
        stateManager.setPromptSentAt(chatId, Date.now());
      } catch (err) {
        logger?.error('Error sending search results', {
          ...getErrorDetails(err, 'sendSearchResults'),
          chatId
        });
        // If we can't send results, clear flow to allow retry
        stateManager.clearUserFlow(chatId);
        return;
      }
      
      // Store results in state after successfully sending message
      stateManager.setUserResults(chatId, {
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
      
      // Lock remains active - SelectionCommand will release it when the flow completes
      
    } catch (err) {
      logger?.error(`Error searching for "${query}"`, {
        ...getErrorDetails(err, 'searchTitle'),
        query
      });
      const errorMsg = err?.message || `Failed to search for "${query}"`;
      try {
        await sendMessage(wahaClient, cfg, chatId, `❌ Search error: ${errorMsg}`);
      } catch (sendErr) {
        logger?.error('Error sending search error message', {
          ...getErrorDetails(sendErr, 'sendSearchErrorMessage'),
          chatId
        });
      }
      // Release lock and clear state on error
      stateManager.clearUserFlow(chatId);
    }
  }
}

