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
      logger?.info('🔄 Duplicate message detected - message already processed, ignoring', {
        messageId, 
        chatId: context.chatId,
        messageText: context.messageText?.substring(0, 50) || '(empty)',
        reason: 'This message ID was already processed (preventing duplicate handling)'
      });
      context.skip = true; // Mark context to skip further processing
      return;
    }

    // Mark message as processed
    stateManager.addProcessedMessage(messageId);

    await next();
  };
}

