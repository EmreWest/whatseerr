#!/usr/bin/env node

/**
 * Helper script to configure WAHA webhooks
 * 
 * This script configures webhooks in WAHA to send events to your bot server.
 * Run this after starting your bot server.
 */

import { createHttpClient } from './request.js';
import { loadConfig, getWebhookUrl } from './utils.js';

async function configureWebhook() {
  const cfg = loadConfig({ requireWaha: true, requireWebhook: true, requireWebhookHost: true });
  const webhookUrl = getWebhookUrl(cfg);
  const session = cfg.waha?.session || 'default';

  console.log('[INFO] Configuring WAHA webhook...');
  console.log(`[INFO] WAHA URL: ${cfg.waha.baseUrl}`);
  console.log(`[INFO] Session: ${session}`);
  console.log(`[INFO] Webhook URL: ${webhookUrl}`);

  // Create HTTP client for WAHA (reuse the same HTTP client pattern)
  const client = createHttpClient(cfg.waha.baseUrl);

  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  // First, check if session exists and get its current config
  try {
    console.log(`[INFO] Checking session "${session}"...`);
    const sessionRes = await client.request('GET', `/api/sessions/${session}`, { headers });
    
    if (sessionRes.status === 404) {
      console.log(`[INFO] Session "${session}" does not exist. Creating it with webhook...`);
      
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
        console.log('[SUCCESS] Session created with webhook configuration!');
        console.log('[INFO] You may need to start the session and scan QR code.');
        return;
      } else {
        console.error('[ERROR] Failed to create session:', createRes.status, createRes.data);
        process.exit(1);
      }
    } else if (sessionRes.status === 200) {
      console.log(`[INFO] Session "${session}" exists. Updating webhook configuration...`);
      
      // Update session with webhook configuration
      // Note: WAHA API might require stopping the session first
      const updateBody = {
        config: {
          webhooks: [
            {
              url: webhookUrl,
              events: ['message', 'message.any']
            }
          ]
        }
      };

      // Try to update via PATCH or PUT
      const updateRes = await client.request('PATCH', `/api/sessions/${session}`, {
        headers,
        body: updateBody
      });

      if (updateRes.status === 200) {
        console.log('[SUCCESS] Webhook configuration updated!');
        console.log('[INFO] You may need to restart the session for changes to take effect.');
        return;
      } else {
        console.log(`[WARN] PATCH not supported (${updateRes.status}), trying alternative method...`);
        console.log('[INFO] You may need to configure webhooks manually via WAHA dashboard or API.');
        console.log('[INFO] Webhook configuration:');
        console.log(JSON.stringify(updateBody, null, 2));
      }
    } else {
      console.error('[ERROR] Unexpected response when checking session:', sessionRes.status, sessionRes.data);
      process.exit(1);
    }
  } catch (err) {
    console.error('[ERROR] Failed to configure webhook:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    console.log('\n[INFO] Manual configuration:');
    console.log('1. Open WAHA dashboard or use API');
    console.log(`2. Configure webhook URL: ${webhookUrl}`);
    console.log('3. Enable events: message, message.any');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  configureWebhook().catch((err) => {
    console.error('[FATAL] Fatal error:', err);
    process.exit(1);
  });
}

