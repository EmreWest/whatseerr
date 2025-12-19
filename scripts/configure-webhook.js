#!/usr/bin/env node

/**
 * Helper script to configure WAHA webhooks
 * 
 * This script configures webhooks in WAHA to send events to your bot server.
 * Run this after starting your bot server.
 */

import { createHttpClient } from '../lib/request.js';
import { loadConfig, getWebhookUrl } from '../lib/utils.js';
import { createLogger } from '../lib/logger.js';

async function configureWebhook() {
  const cfg = loadConfig({ requireWaha: true, requireWebhook: true, requireWebhookHost: true });
  const logger = createLogger(cfg);
  const webhookUrl = getWebhookUrl(cfg);
  const session = cfg.waha?.session || 'default';

  logger.info('🪝 Configuring WAHA webhook…');
  logger.info(`🔗 WAHA: ${cfg.waha.baseUrl}`);
  logger.info(`🧩 Session: ${session}`);
  logger.info(`🔗 Webhook URL: ${webhookUrl}`);

  // Create HTTP client for WAHA (reuse the same HTTP client pattern)
  const client = createHttpClient(cfg.waha.baseUrl);

  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  // First, check if session exists and get its current config
  try {
    logger.info(`🔎 Checking session "${session}"…`);
    const sessionRes = await client.request('GET', `/api/sessions/${session}`, { headers });
    logger.debug('Session check response', { status: sessionRes.status, data: sessionRes.data });
    
    if (sessionRes.status === 404) {
      logger.info(`🆕 Session "${session}" does not exist. Creating it with webhook…`);
      
      // Create session with webhook configuration
      const createBody = {
        name: session,
        config: {
          webhooks: [
            {
              url: webhookUrl,
              events: ['message', 'message.any']
            }
          ]
        }
      };

      const createRes = await client.request('POST', '/api/sessions', {
        headers,
        body: createBody
      });

      if (createRes.status === 201 || createRes.status === 200) {
        logger.info('✅ Session created with webhook configuration!');
        logger.info('📱 You may need to start the session and scan the QR code.');
        return;
      } else {
        logger.error(`Failed to create session (status ${createRes.status})`, createRes.data);
        process.exit(1);
      }
    } else if (sessionRes.status === 200) {
      logger.info(`♻️ Session "${session}" exists. Updating webhook configuration…`);
      
      // Update session with webhook configuration
      // WAHA OpenAPI uses PUT /api/sessions/{session} with SessionUpdateRequest.
      const updateBody = {
        name: session,
        config: {
          webhooks: [
            {
              url: webhookUrl,
              events: ['message', 'message.any']
            }
          ]
        }
      };

      const updateRes = await client.request('PUT', `/api/sessions/${session}`, {
        headers,
        body: updateBody
      });

      if (updateRes.status === 200) {
        logger.info('✅ Webhook configuration updated!');
        logger.info('🔄 You may need to restart the session for changes to take effect.');
        return;
      } else {
        logger.warn(`Failed to update session (status ${updateRes.status}). Configure manually if needed.`);
        logger.debug('Webhook update body', updateBody);
      }
    } else {
      logger.error(`Unexpected response when checking session (status ${sessionRes.status})`, sessionRes.data);
      process.exit(1);
    }
  } catch (err) {
    logger.error('Failed to configure webhook', err?.message || err);
    logger.debug('Configure webhook stack', err?.stack);
    logger.info('\n🧰 Manual configuration:');
    logger.info('1) Open WAHA dashboard or use the API');
    logger.info(`2) Set webhook URL: ${webhookUrl}`);
    logger.info('3) Enable events: message, message.any');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  configureWebhook().catch((err) => {
    const logger = createLogger({ logging: { level: 'error' } });
    logger.error('Fatal error', err?.message || err);
    process.exit(1);
  });
}

