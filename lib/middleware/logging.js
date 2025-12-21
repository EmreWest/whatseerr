/**
 * Logging middleware - logs incoming messages
 */

export function createLoggingMiddleware(logger) {
  return async (context, next) => {
    const { chatId, messageId, messageText } = context;
    
    logger?.debug('Incoming message', {
      chatId,
      messageId,
      messageLength: messageText?.length || 0,
      preview: messageText && messageText.length > 100 
        ? messageText.substring(0, 100) + '...' 
        : messageText
    });

    logger?.info('Message received', {
      chatId,
      messageId,
      messageLength: messageText?.length || 0
    });

    await next();
  };
}

