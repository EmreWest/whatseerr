/**
 * Duplicate detection middleware - checks if message was already processed
 */

import { getStateManager } from '../state/cache-state.js';

export function createDuplicateDetectionMiddleware(logger) {
  return async (context, next) => {
    const { messageId } = context;

    if (!messageId) {
      await next();
      return;
    }

    const stateManager = getStateManager();

    // Check if message was already processed
    if (stateManager.isMessageProcessed(messageId)) {
      logger?.debug('Duplicate message detected, ignoring', { 
        messageId, 
        chatId: context.chatId 
      });
      context.skip = true; // Mark context to skip further processing
      return;
    }

    // Mark message as processed
    stateManager.addProcessedMessage(messageId);

    await next();
  };
}

