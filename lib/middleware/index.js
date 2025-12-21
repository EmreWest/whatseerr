/**
 * Middleware pipeline orchestrator
 */

import { createLoggingMiddleware } from './logging.js';
import { createDuplicateDetectionMiddleware } from './duplicate-detection.js';
import { createNormalizationMiddleware } from './message-normalization.js';
import { createAdminAuthMiddleware } from './admin-auth.js';

/**
 * Creates the middleware pipeline
 */
export function createMiddlewarePipeline(cfg, wahaClient, logger) {
  const middleware = [
    createLoggingMiddleware(logger),
    createDuplicateDetectionMiddleware(logger),
    createNormalizationMiddleware(),
    createAdminAuthMiddleware(wahaClient, logger)
  ];

  /**
   * Executes middleware pipeline
   */
  return async function executePipeline(context) {
    let index = 0;

    async function next() {
      if (index >= middleware.length) {
        return;
      }

      const mw = middleware[index++];
      await mw(context, next);
    }

    await next();
    return context;
  };
}

