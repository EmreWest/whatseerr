/**
 * Admin authentication middleware - validates admin access for privileged commands
 */

import { isAdminChatId } from '../utils.js';

export function createAdminAuthMiddleware(wahaClient, logger) {
  return async (context, next) => {
    // Only check admin auth if command requires it
    if (context.requiresAdmin) {
      const { chatId, cfg } = context;
      
      const isAdmin = await isAdminChatId(cfg, chatId, wahaClient, logger);
      
      logger?.debug('Admin auth check', {
        chatId,
        isAdmin,
        command: context.command
      });

      if (!isAdmin) {
        logger?.warn('Non-admin user attempted privileged command', {
          chatId,
          command: context.command
        });
        context.skip = true;
        context.error = {
          type: 'AUTH_ERROR',
          message: 'Only administrators can use this command.'
        };
        return;
      }
    }

    await next();
  };
}

