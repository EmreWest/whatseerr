/**
 * Webhook server creation and management
 */

import http from 'http';
import { parseCommands } from './command-parser.js';
import { MAX_ERROR_BODY_LENGTH } from './constants.js';
import { processedMessages } from './state.js';

/**
 * Creates and configures the webhook HTTP server
 * @param {Object} cfg - Configuration object
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} wahaClient - WAHA API client
 * @param {Function} handleMessage - Message handler function
 * @param {Function} getWebhookUrl - Function to get webhook URL
 * @returns {http.Server} HTTP server instance
 */
export function createWebhookServer(cfg, jellyseerrClient, wahaClient, handleMessage, getWebhookUrl) {
  const port = cfg.webhook.port;
  const path = cfg.webhook.path;
  const logger = cfg.__logger;

  const server = http.createServer(async (req, res) => {
    // Only handle POST requests to the webhook path
    if (req.method !== 'POST' || req.url !== path) {
      if (req.method === 'GET' && req.url === '/') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          service: 'WhatsApp Jellyseerr Bot',
          webhookPath: path,
          port: port
        }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    logger?.debug('Webhook POST received', { url: req.url });

    // Set CORS headers (if needed)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const webhookData = JSON.parse(body);
        
        if (webhookData.event) {
          logger?.debug('Webhook event received', { event: webhookData.event, session: webhookData.session || 'unknown' });
        } else {
          logger?.warn('Webhook data has no event field');
        }

        // Process message events - prefer 'message.any' to avoid duplicates
        // If both 'message' and 'message.any' are configured, they may send the same message
        // We'll process 'message.any' and skip 'message' for the same message ID
        if (webhookData.event === 'message.any' && webhookData.payload) {
          // Process message asynchronously (don't block response)
          handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
            logger?.error('Error in handleMessage', err?.message || err);
            logger?.debug('handleMessage stack', err?.stack);
          });
        } else if (webhookData.event === 'message' && webhookData.payload) {
          // Only process 'message' event if we don't have 'message.any' configured
          // Check if this message ID was already processed (might have come as 'message.any' first)
          const messageId = webhookData.payload?.id;
          if (messageId && !processedMessages.has(messageId)) {
            handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
              logger?.error('Error in handleMessage', err?.message || err);
              logger?.debug('handleMessage stack', err?.stack);
            });
          } else {
            logger?.debug('Skipping duplicate message event', { messageId });
          }
        }

        // Always respond with 200 to acknowledge receipt
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));

      } catch (err) {
        logger?.error('Error parsing webhook JSON', err?.message || err);
        if (body.length < MAX_ERROR_BODY_LENGTH) {
          logger?.debug('Webhook raw body', body);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', message: err.message }));
      }
    });

    req.on('error', (err) => {
      logger?.error('Webhook request stream error', err?.message || err);
      logger?.debug('Webhook request error stack', err?.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(port, () => {
    const searchCommands = parseCommands(cfg.command);
    const primaryCommand = searchCommands[0] || 'r';
    logger?.info(`🚀 Webhook server listening`);
    logger?.info(`📍 Path: ${path}`);
    logger?.info(`🔌 Port: ${port}`);
    try {
      const webhookUrl = getWebhookUrl(cfg);
      logger?.info(`🔗 WAHA webhook URL: ${webhookUrl}`);
    } catch {
      logger?.warn('protocol/host not set; cannot print public webhook URL. Set protocol + host, or configure WAHA manually.');
    }
    if (searchCommands.length === 1) {
      logger?.info(`💬 Command: ${primaryCommand} <movie or TV show name>`);
      logger?.info(`🧪 Example: ${primaryCommand} The Matrix`);
    } else {
      logger?.info(`💬 Commands: ${searchCommands.join(', ')} <movie or TV show name>`);
      logger?.info(`🧪 Example: ${primaryCommand} The Matrix`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger?.error(`Port ${port} is already in use. Choose a different webhook.port.`);
    } else {
      logger?.error('Server error', err?.message || err);
      logger?.debug('Server error stack', err?.stack);
    }
    process.exit(1);
  });

  return server;
}

