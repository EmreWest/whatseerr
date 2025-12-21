/**
 * Message normalization middleware - trims and normalizes message text
 */

export function createNormalizationMiddleware() {
  return async (context, next) => {
    if (context.messageText) {
      context.messageText = context.messageText.trim();
      context.messageTextLower = context.messageText.toLowerCase().trim();
    }

    await next();
  };
}

