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
    const searchCommands = parseCommands(cfg.command);
    const searchCommands4k = parseCommands(cfg.command4k);
    
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
    
    // Handle empty query
    if (!query || query.trim().length === 0) {
      logger?.info(`Empty query after command "${matchResult.matchedCommand}"`);
      await sendMessage(wahaClient, cfg, chatId, 
        `💬 ${matchResult.matchedCommand} <name>\nExample: ${matchResult.matchedCommand} Matrix`
      );
      return;
    }
    
    logger?.info(`Searching: "${query}" (matched command: ${matchResult.matchedCommand}, is4k: ${is4k})`);
    
    // Send searching message
    await sendMessage(wahaClient, cfg, chatId, '🔍 Searching...');
    
    const queueManager = getQueueManager();
    
    try {
      // Use API queue for search
      const candidates = await queueManager.addApiTask(async () => {
        return await searchTitle(jellyseerrClient, cfg, query, null, null, logger);
      });
      
      logger?.debug('Search result count', { count: candidates?.length || 0 });
      
      if (!candidates || candidates.length === 0) {
        logger?.info(`No results for: "${query}"`);
        await sendMessage(wahaClient, cfg, chatId, '❌ No results. Try different keywords.');
        const stateManager = getStateManager();
        stateManager.deleteUserResults(chatId);
        return;
      }
      
      // Store results using state manager
      const stateManager = getStateManager();
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
      
      // Format and send results (first page, offset 0)
      const formatted = formatSearchResults(candidates, query, RESULTS_PER_PAGE, 0);
      await sendMessage(wahaClient, cfg, chatId, formatted.message);
      
    } catch (err) {
      logger?.error(`Error searching for "${query}"`, {
        ...getErrorDetails(err, 'searchTitle'),
        query
      });
      const errorMsg = err?.message || `Failed to search for "${query}"`;
      await sendMessage(wahaClient, cfg, chatId, `❌ Search error: ${errorMsg}`);
      const stateManager = getStateManager();
      stateManager.deleteUserResults(chatId);
    }
  }
}

