/**
 * Selection command - handles number selections from search results
 * This is a special command that handles numeric selections (0, 1-10, etc.)
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { handleTvSeasonSelection, handleTvShowSelection, handleMovieSelection } from '../request-handler.js';
import { formatSearchResults } from '../message-formatters.js';
import { RESULTS_PER_PAGE } from '../constants.js';
import { getStateManager } from '../state/cache-state.js';
import { formatMedia } from '../request.js';

export class SelectionCommand extends BaseCommand {
  constructor() {
    super('selection', 'Handle numeric selections from search results');
  }

  match(messageText, context) {
    // Check if message is a number
    const selectionNumber = parseInt(messageText, 10);
    if (isNaN(selectionNumber)) {
      return null;
    }
    
    const stateManager = getStateManager();
    const { chatId } = context;
    
    // Check if user has search results or pending TV selection
    const hasResults = stateManager.hasUserResults(chatId);
    const hasPendingTv = stateManager.hasPendingSelection(chatId);
    
    if (!hasResults && !hasPendingTv) {
      return null; // Not in selection mode
    }
    
    return {
      matched: true,
      command: 'selection',
      selectionNumber,
      hasResults,
      hasPendingTv
    };
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, jellyseerrClient, logger, matchResult } = context;
    const { selectionNumber, hasPendingTv } = matchResult;
    const stateManager = getStateManager();
    
    // Handle TV season selection
    if (hasPendingTv) {
      const tvShowData = stateManager.getPendingSelection(chatId);
      if (!tvShowData) {
        logger?.warn('No stored TV show data found for season selection', { chatId });
        stateManager.deletePendingSelection(chatId);
        stateManager.deleteUserResults(chatId);
        return;
      }
      
      const tvShow = (tvShowData && typeof tvShowData === 'object' && 'show' in tvShowData) 
        ? tvShowData.show 
        : tvShowData;
      const is4k = (tvShowData && typeof tvShowData === 'object' && 'is4k' in tvShowData) 
        ? (tvShowData.is4k === true) 
        : false;
      
      if (!tvShow) {
        logger?.warn('Invalid TV show data in stored selection', { chatId });
        stateManager.deletePendingSelection(chatId);
        stateManager.deleteUserResults(chatId);
        await sendMessage(wahaClient, cfg, chatId, '❌ Invalid selection. Please search again.');
        return;
      }
      
      const { title: chosenTitle } = formatMedia(tvShow);
      logger?.info(`Season selection for: "${chosenTitle}"${is4k ? ' (4K)' : ''}`);
      
      const result = await handleTvSeasonSelection(
        cfg, jellyseerrClient, wahaClient, chatId, 
        context.messageText, tvShow, logger, is4k
      );
      
      if (result?.cancelled || result?.allRequested || result?.success) {
        stateManager.deletePendingSelection(chatId);
        stateManager.deleteUserResults(chatId);
      }
      return;
    }
    
    // Handle search result selection
    const storedData = stateManager.getUserResults(chatId);
    if (!storedData) {
      logger?.warn('No stored results found for selection', { chatId });
      stateManager.deleteUserResults(chatId);
      return;
    }
    
    const isArrayFormat = Array.isArray(storedData);
    const results = isArrayFormat ? storedData : (storedData?.results || storedData);
    const storedIs4k = isArrayFormat ? false : (storedData?.is4k === true);
    const offset = isArrayFormat ? 0 : (storedData?.offset || 0);
    const query = isArrayFormat ? '' : (storedData?.query || '');
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      logger?.warn('Invalid or empty stored results', { chatId });
      stateManager.deleteUserResults(chatId);
      await sendMessage(wahaClient, cfg, chatId, '❌ No results available. Please search again.');
      return;
    }
    
    logger?.debug('Stored result count', { chatId, count: results.length, is4k: storedIs4k, offset });
    
    // Handle cancel (option 0)
    if (selectionNumber === 0) {
      logger?.info('Cancelled selection');
      stateManager.deleteUserResults(chatId);
      await sendMessage(wahaClient, cfg, chatId, '❌ Cancelled');
      return;
    }
    
    // Calculate displayed count and check for "Show more" option
    const displayedCount = Math.min(RESULTS_PER_PAGE, results.length - offset);
    const hasMore = (offset + displayedCount) < results.length;
    const showMoreOption = hasMore ? displayedCount + 1 : null;
    
    // Handle "Show more" selection
    if (showMoreOption && selectionNumber === showMoreOption) {
      logger?.info(`Showing more results (offset: ${offset + displayedCount})`);
      const nextOffset = offset + displayedCount;
      const formatted = formatSearchResults(results, query, RESULTS_PER_PAGE, nextOffset);
      
      // Update stored data with new offset
      stateManager.setUserResults(chatId, {
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
      const actualIndex = offset + selectionNumber - 1;
      const chosen = results[actualIndex];
      const { title: chosenTitle, typeStr } = formatMedia(chosen);
      const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';
      
      // For TV shows, use the handler function
      if (isTvShow) {
        const result = await handleTvShowSelection(
          cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k
        );
        if (result) {
          // Store with is4k flag for season selection
          stateManager.setPendingSelection(chatId, { show: result, is4k: storedIs4k });
          logger?.debug('Stored TV selection', { chatId });
        } else {
          // Handled (already requested/available or error)
          stateManager.deleteUserResults(chatId);
        }
        return;
      }
      
      // For movies, use the handler function
      await handleMovieSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k);
      
      // Clear stored results
      stateManager.deleteUserResults(chatId);
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
}

