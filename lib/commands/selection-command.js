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
import { getErrorDetails } from '../errors/error-formatter.js';

export class SelectionCommand extends BaseCommand {
  constructor() {
    super('selection', 'Handle numeric selections from search results');
  }

  match(messageText, context) {
    // First check if message is a number (for search result selection and season numbers)
    const selectionNumber = parseInt(messageText, 10);
    if (!isNaN(selectionNumber)) {
      // Return match with selection number - state validation happens in execute()
      return {
        matched: true,
        command: 'selection',
        selectionNumber
      };
    }
    
    // If not a number, check if it's a valid text input for season selection ("all" or "cancel")
    // Only match these when there's a pending TV selection to avoid matching random text
    const trimmed = messageText.trim().toLowerCase();
    if (trimmed === 'all' || trimmed === 'cancel') {
      // Check if there's a pending TV selection (quick state check)
      const stateManager = getStateManager();
      const chatId = context?.chatId;
      if (chatId && stateManager.hasPendingSelection(chatId)) {
        // Return match with text input - will be processed as season selection in execute()
        return {
          matched: true,
          command: 'selection',
          selectionNumber: null, // Not a number, will be handled as text in execute()
          textInput: trimmed
        };
      }
    }
    
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, jellyseerrClient, logger, matchResult, messageTimestamp } = context;
    const { selectionNumber, textInput } = matchResult;
    const stateManager = getStateManager();
    
    // Validate flow state (clears orphaned locks) - side effect is cleanup
    stateManager.validateFlowState(chatId);
    
    // Check timestamp to prevent race conditions - ignore messages received before prompt was sent
    // Timestamp-based filtering prevents users from making selections before seeing the prompt message
    const promptSentAt = stateManager.getPromptSentAt(chatId);
    if (promptSentAt && messageTimestamp && messageTimestamp < promptSentAt) {
      const timeDiffMs = promptSentAt - messageTimestamp;
      logger?.info('⏱️ Selection command ignored - message received before prompt was sent', {
        chatId,
        selectionNumber,
        incomingMessageTimestamp: new Date(messageTimestamp).toISOString(),
        promptSentAtTimestamp: new Date(promptSentAt).toISOString(),
        timeDiffMs,
        timeDiffSeconds: (timeDiffMs / 1000).toFixed(2),
        reason: `Message was sent ${(timeDiffMs / 1000).toFixed(2)}s before search results/season prompt was delivered (race condition prevention)`
      });
      return; // Ignore this message - it arrived before the prompt
    }
    
    // Check if user has search results or pending TV selection
    // Also check lock for consistency (lock should exist if we're in a flow)
    const hasResults = stateManager.hasUserResults(chatId);
    const hasPendingTv = stateManager.hasPendingSelection(chatId);
    const hasLock = stateManager.hasFlowLock(chatId);
    
    // Must have both state AND lock to be in selection mode
    // This ensures consistency and prevents processing when lock expired but state remains
    if ((!hasResults && !hasPendingTv) || !hasLock) {
      // Clean up any orphaned state if lock is missing
      if ((hasResults || hasPendingTv) && !hasLock) {
        stateManager.clearUserFlow(chatId);
      }
      logger?.info('⚠️ Selection command ignored - no active flow context', {
        chatId,
        selectionNumber,
        reason: !hasLock 
          ? 'No active flow lock (command received outside search/selection flow)'
          : (!hasResults && !hasPendingTv)
            ? 'No search results or pending TV selection (flow state missing)'
            : 'Unknown reason',
        flowState: {
          hasSearchResults: hasResults,
          hasPendingTvSelection: hasPendingTv,
          hasFlowLock: hasLock
        }
      });
      return; // Not in selection mode - ignore this message
    }
    
    // Handle TV season selection
    if (hasPendingTv) {
      try {
        const tvShowData = stateManager.getPendingSelection(chatId);
        if (!tvShowData) {
          logger?.warn('No stored TV show data found for season selection', { chatId });
          stateManager.clearUserFlow(chatId);
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
          stateManager.clearUserFlow(chatId);
          try {
            await sendMessage(wahaClient, cfg, chatId, '❌ Invalid selection. Please search again.');
          } catch (err) {
            logger?.error('Error sending invalid TV selection message', {
              ...getErrorDetails(err, 'sendInvalidTVSelectionMessage'),
              chatId
            });
          }
          return;
        }
        
        const { title: chosenTitle } = formatMedia(tvShow);
        logger?.info(`Season selection for: "${chosenTitle}"${is4k ? ' (4K)' : ''}`);
        
        // Use textInput if available (for "all" or "cancel"), otherwise use original messageText
        const seasonInput = textInput || context.messageText;
        const result = await handleTvSeasonSelection(
          cfg, jellyseerrClient, wahaClient, chatId, 
          seasonInput, tvShow, logger, is4k
        );
        
        // Clear flow on completion (cancelled, all requested, success, or error)
        // If result is undefined/null, also clear to prevent stuck locks
        if (!result || result?.cancelled || result?.allRequested || result?.success || result?.error) {
          stateManager.clearUserFlow(chatId);
        }
      } catch (err) {
        logger?.error('Error handling TV season selection', {
          ...getErrorDetails(err, 'handleTvSeasonSelection'),
          chatId
        });
        stateManager.clearUserFlow(chatId);
        try {
          await sendMessage(wahaClient, cfg, chatId, '❌ An error occurred. Please try again.');
        } catch (sendErr) {
          logger?.error('Error sending TV season error message', {
            ...getErrorDetails(sendErr, 'sendTVSeasonErrorMessage'),
            chatId
          });
        }
      }
      return;
    }
    
    // Handle search result selection
    try {
      const storedData = stateManager.getUserResults(chatId);
      if (!storedData) {
        logger?.warn('No stored results found for selection', { chatId });
        stateManager.clearUserFlow(chatId);
        return;
      }
      
      const isArrayFormat = Array.isArray(storedData);
      const results = isArrayFormat ? storedData : (storedData?.results || storedData);
      const storedIs4k = isArrayFormat ? false : (storedData?.is4k === true);
      const offset = isArrayFormat ? 0 : (storedData?.offset || 0);
      const query = isArrayFormat ? '' : (storedData?.query || '');
      
      if (!results || !Array.isArray(results) || results.length === 0) {
        logger?.warn('Invalid or empty stored results', { chatId });
        stateManager.clearUserFlow(chatId);
        try {
          await sendMessage(wahaClient, cfg, chatId, '❌ No results available. Please search again.');
        } catch (err) {
          logger?.error('Error sending invalid results message', {
            ...getErrorDetails(err, 'sendInvalidResultsMessage'),
            chatId
          });
        }
        return;
      }
      
      logger?.debug('Stored result count', { chatId, count: results.length, is4k: storedIs4k, offset });
      
      // Handle cancel (option 0)
      if (selectionNumber === 0) {
        logger?.info('Cancelled selection');
        stateManager.clearUserFlow(chatId);
        try {
          await sendMessage(wahaClient, cfg, chatId, '❌ Cancelled');
        } catch (err) {
          logger?.error('Error sending cancellation message', {
            ...getErrorDetails(err, 'sendCancellationMessage'),
            chatId
          });
        }
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
        
        try {
          await sendMessage(wahaClient, cfg, chatId, formatted.message);
          // Store prompt timestamp after message is successfully sent
          // Timestamp-based filtering prevents selections made before the prompt is received
          stateManager.setPromptSentAt(chatId, Date.now());
        } catch (err) {
          logger?.error('Error sending show more results', {
            ...getErrorDetails(err, 'sendShowMoreResults'),
            chatId
          });
          // If we can't send results, clear flow to allow retry
          stateManager.clearUserFlow(chatId);
          return;
        }
        
        // Update stored data with new offset after successfully sending message
        stateManager.setUserResults(chatId, {
          results,
          is4k: storedIs4k,
          offset: nextOffset,
          query
        });
        
        // Lock remains active - flow continues (user can retry)
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
          // Clear search results immediately so subsequent selections aren't interpreted as search result selections
          stateManager.deleteUserResults(chatId);
          
          try {
            const result = await handleTvShowSelection(
              cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k
            );
            if (result) {
              // Store pending selection with is4k flag for season selection
              // handleTvShowSelection sends the season selection message and stores prompt timestamp internally
              // Timestamp-based filtering prevents selections made before the prompt is received
              stateManager.setPendingSelection(chatId, { show: result, is4k: storedIs4k });
              logger?.debug('Stored TV selection', { chatId });
            } else {
              // Handled (already requested/available or error) - flow completes
              stateManager.clearUserFlow(chatId);
            }
          } catch (err) {
            logger?.error('Error handling TV show selection', {
              ...getErrorDetails(err, 'handleTvShowSelection'),
              chatId,
              chosenTitle
            });
            stateManager.clearUserFlow(chatId);
            try {
              await sendMessage(wahaClient, cfg, chatId, '❌ An error occurred. Please try again.');
            } catch (sendErr) {
              logger?.error('Error sending TV show error message', {
                ...getErrorDetails(sendErr, 'sendTVShowErrorMessage'),
                chatId
              });
            }
          }
          return;
        }
        
        // For movies, use the handler function
        try {
          await handleMovieSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, storedIs4k);
          // Flow completes - clear everything
          stateManager.clearUserFlow(chatId);
        } catch (err) {
          logger?.error('Error handling movie selection', {
            ...getErrorDetails(err, 'handleMovieSelection'),
            chatId,
            chosenTitle
          });
          stateManager.clearUserFlow(chatId);
          try {
            await sendMessage(wahaClient, cfg, chatId, '❌ An error occurred. Please try again.');
          } catch (sendErr) {
            logger?.error('Error sending movie error message', {
              ...getErrorDetails(sendErr, 'sendMovieErrorMessage'),
              chatId
            });
          }
        }
        return;
      } else {
        // Invalid selection number - flow continues (user can try again)
        const maxOption = showMoreOption || displayedCount;
        logger?.warn(`Invalid selection number ${selectionNumber}`, { validRange: `0-${maxOption}` });
        try {
          await sendMessage(wahaClient, cfg, chatId, `❌ Invalid. Reply with 0-${maxOption} (0 = cancel)`);
        } catch (err) {
          logger?.error('Error sending invalid selection message', {
            ...getErrorDetails(err, 'sendInvalidSelectionMessage'),
            chatId
          });
          // On repeated send failures, might indicate connection issue - keep lock but log
        }
        // Lock remains active - flow continues (user can retry)
        return;
      }
    } catch (err) {
      logger?.error('Error handling selection', {
        ...getErrorDetails(err, 'handleSelection'),
        chatId,
        selectionNumber
      });
      stateManager.clearUserFlow(chatId);
      try {
        await sendMessage(wahaClient, cfg, chatId, '❌ An error occurred. Please try again.');
      } catch (sendErr) {
        logger?.error('Error sending selection error message', {
          ...getErrorDetails(sendErr, 'sendSelectionErrorMessage'),
          chatId
        });
      }
    }
  }
}

