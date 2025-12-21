#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Modernized architecture using command framework, middleware, and Fastify server
 */

import { createHttpClient } from './lib/request.js';
import { createWahaClient, getPhoneNumberByLid } from './lib/waha-client.js';
import { loadConfig, isLidFormat, setLidMapping } from './lib/utils.js';
import { createLogger } from './lib/logger.js';
import { createServer } from './lib/server.js';
import { createStateManager } from './lib/state/cache-state.js';
import { createQueueManager, getQueueManager } from './lib/queue/message-queue.js';
import { createSubscriptionManager } from './lib/subscriptions/subscription-manager.js';
import { createCommandRegistry, getCommandRegistry } from './lib/commands/index.js';
import { createMiddlewarePipeline } from './lib/middleware/index.js';
import { sendMessage } from './lib/waha-client.js';
import { getErrorDetails } from './lib/errors/error-formatter.js';

/**
 * Handles incoming WhatsApp messages using command framework and middleware
 */
async function handleMessage(cfg, jellyseerrClient, wahaClient, webhookData) {
  const logger = cfg.__logger;
  
  try {
    // Extract message data from WAHA webhook payload
    const payload = webhookData.payload;
    if (!payload) {
      logger?.warn('Webhook received with no payload', { keys: Object.keys(webhookData || {}) });
      return;
    }

    // Only process incoming messages (not sent by us)
    if (payload.fromMe) {
      logger?.debug('Ignoring message from self (fromMe: true)');
      return;
    }

    const chatId = payload.from;
    const messageText = payload.body || '';
    const messageId = payload.id;
    // Extract timestamp from payload (WhatsApp timestamps are in seconds, convert to ms)
    const messageTimestamp = payload.timestamp 
      ? (payload.timestamp < 1000000000000 ? payload.timestamp * 1000 : payload.timestamp)
      : Date.now(); // Fallback to current time if timestamp missing

    // Auto-create LID mapping if we receive LID format and can resolve it
    if (isLidFormat(chatId)) {
      const resolvedPhoneChatId = await getPhoneNumberByLid(wahaClient, cfg, chatId);
      if (resolvedPhoneChatId) {
        setLidMapping(cfg, resolvedPhoneChatId, chatId, logger);
      }
    }
    
    // Create context for middleware and commands
    const context = {
      cfg,
      chatId,
      messageId,
      messageText,
      messageTimestamp, // Add timestamp for race condition prevention
      jellyseerrClient,
      wahaClient,
      logger,
      skip: false,
      error: null
    };
    
    // Run middleware pipeline
    const middlewarePipeline = createMiddlewarePipeline(cfg, wahaClient, logger);
    await middlewarePipeline(context);

    // Check if middleware marked context to skip
    if (context.skip) {
      if (context.error) {
        // Send error message if provided
        if (context.error.type === 'AUTH_ERROR') {
          await sendMessage(wahaClient, cfg, chatId, `❌ ${context.error.message}`);
        }
      }
      return;
    }

    // Check if message text is empty after normalization
    if (!context.messageText || !context.messageText.trim()) {
      logger?.debug('Empty message text, ignoring', { chatId, messageId });
      return;
    }

    // Find matching command
    const commandRegistry = getCommandRegistry();
    const commandMatch = commandRegistry.findCommand(context.messageText, context);

    if (!commandMatch) {
      // No command matched - ignore the message (this is expected for non-command messages)
      logger?.debug('No command matched - message does not match any command pattern, ignoring', { 
        messageText: context.messageText?.substring(0, 100) || '(empty)',
        chatId,
        messageLength: context.messageText?.length || 0
      });
      return;
    }
    
    // Log matched command with details
    logger?.info('🎯 Command matched', {
      chatId,
      commandName: commandMatch.command.name,
      commandDescription: commandMatch.command.description,
      matchResult: commandMatch.matchResult
    });
    
    // Execute the matched command
    await commandRegistry.executeCommand(
      commandMatch.command,
      commandMatch.matchResult,
      context
    );

  } catch (err) {
    logger?.error('Error handling message', {
      ...getErrorDetails(err, 'handleMessage'),
      chatId: payload?.from,
      messageId: payload?.id
    });
    }
  }

/**
 * Main function
 */
async function main() {
  const cfg = loadConfig({ requireWaha: true, requireWebhook: true });
  cfg.__logger = createLogger(cfg);
  const logger = cfg.__logger;
  
  // Initialize state manager, queue manager, and subscription manager
  createStateManager(cfg);
  createQueueManager(cfg);
  createSubscriptionManager(logger, cfg);
  
  const jellyseerrClient = createHttpClient(cfg.jellyseerr.apiBaseUrl);
  const wahaClient = createWahaClient(cfg.waha.baseUrl);

  logger?.info('🤖 Starting WhatsApp bot...');
  logger?.info(`🔗 Jellyseerr: ${cfg.jellyseerr.baseUrl}`);
  logger?.info(`🔗 WAHA: ${cfg.waha.baseUrl}`);
  logger?.info(`🧩 WAHA Session: ${cfg.waha?.session || 'default'}`);

  // Create and start Fastify server
  const server = await createServer(cfg, jellyseerrClient, wahaClient, handleMessage);

  // Graceful shutdown handler
  const shutdown = async () => {
    logger?.info('\n🛑 Shutting down…');
    try {
      await server.close();
      const queueManager = getQueueManager();
      queueManager.destroy(); // Clean up queue manager and timers
      logger?.info('✅ Server closed.');
      logger?.info('✅ Queue manager cleaned up.');
      process.exit(0);
    } catch (err) {
      logger?.error('Error during shutdown', err?.message || err);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const cfg = (() => {
      try { return loadConfig({ requireWaha: false, requireWebhook: false }); } catch { return {}; }
    })();
    const logger = createLogger(cfg);
    logger?.error('Fatal error', err?.message || err);
    if (err?.stack) {
      logger?.debug('Fatal stack', err.stack);
    }
    process.exit(1);
  });
}
