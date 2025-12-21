/**
 * Logging middleware - logs incoming messages
 */

import { getStateManager } from '../state/cache-state.js';

export function createLoggingMiddleware(logger) {
  return async (context, next) => {
    const { chatId, messageId, messageText } = context;
    
    // Get flow state for context
    const stateManager = getStateManager();
    const hasResults = stateManager.hasUserResults(chatId);
    const hasPendingTv = stateManager.hasPendingSelection(chatId);
    const hasFlowLock = stateManager.hasFlowLock(chatId);
    
    // Truncate message text for display (show first 150 chars)
    const maxPreviewLength = 150;
    const messagePreview = messageText 
      ? (messageText.length > maxPreviewLength 
          ? messageText.substring(0, maxPreviewLength).trim() + '...' 
          : messageText.trim())
      : '(empty)';
    
    logger?.info('💬 Message received', {
      chatId,
      messageId,
      message: messagePreview,
      messageLength: messageText?.length || 0,
      flowState: {
        hasSearchResults: hasResults,
        hasPendingTvSelection: hasPendingTv,
        hasFlowLock
      }
    });

    await next();
  };
}

