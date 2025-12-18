#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import http from 'http';
import { createHttpClient, searchTitle, createRequest, formatMedia } from './request.js';
import { createWahaClient, sendText } from './waha-client.js';
import { loadConfig, getWebhookUrl } from './utils.js';

// Constants
const SEARCH_COMMAND = '/request';
const MAX_PROCESSED_MESSAGES = 1000;
const MAX_RESULTS_DISPLAY = 10;
const MAX_ERROR_BODY_LENGTH = 500;

// In-memory store for user search results (chatId -> results array)
const userSearchResults = new Map();

// Track processed message IDs to prevent duplicates
const processedMessages = new Set();

/**
 * Formats search results into a numbered list message
 */
function formatSearchResults(results, limit = MAX_RESULTS_DISPLAY) {
  const top = results.slice(0, limit);
  if (top.length === 0) {
    return 'No results found.';
  }

  let message = 'Search results:\n\n';
  top.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    message += `${idx + 1}. [${typeStr}] ${title} (${year})\n`;
  });
  message += '\n0. Cancel\n';
  message += '\nReply with the number to request that item.';

  return message;
}

/**
 * Extracts search query from message, handling command prefix
 */
function extractSearchQuery(messageText) {
  const trimmed = messageText.trim();
  
  // Check if message starts with /request command
  if (trimmed.toLowerCase().startsWith(SEARCH_COMMAND.toLowerCase())) {
    const query = trimmed.slice(SEARCH_COMMAND.length).trim();
    if (query) {
      return query;
    }
  }
  
  return null;
}

/**
 * Handles incoming WhatsApp messages
 */
async function handleMessage(cfg, jellyseerrClient, wahaClient, webhookData) {
  try {
    // Extract message data from WAHA webhook payload
    const payload = webhookData.payload;
    if (!payload) {
      console.log('[WARN] No payload in webhook data');
      console.log('[DEBUG] Webhook data keys:', Object.keys(webhookData));
      return;
    }

    // Only process incoming messages (not sent by us)
    if (payload.fromMe) {
      console.log('[INFO] Ignoring message from self (fromMe: true)');
      return;
    }

    const chatId = payload.from;
    const messageText = payload.body?.trim() || '';
    const messageId = payload.id;

    // Check for duplicate messages early (before processing)
    if (messageId && processedMessages.has(messageId)) {
      console.log(`[INFO] Duplicate message detected (ID: ${messageId}), ignoring`);
      return;
    }

    // Mark message as processed
    if (messageId) {
      processedMessages.add(messageId);
      // Clean up old message IDs to prevent memory issues
      if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        // Remove oldest entry (Set maintains insertion order)
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
      }
    }

    console.log('[DEBUG] Message details:');
    console.log('  - Chat ID:', chatId);
    console.log('  - Message ID:', messageId);
    console.log('  - Message text:', messageText);
    console.log('  - fromMe:', payload.fromMe);
    console.log('  - to:', payload.to);

    if (!messageText) {
      console.log('[WARN] Empty message text, ignoring');
      return;
    }

    console.log(`[INFO] Received message from ${chatId}: "${messageText}"`);

    // Check if message is a number (selection from previous search)
    const selectionNumber = parseInt(messageText, 10);
    if (!isNaN(selectionNumber) && userSearchResults.has(chatId)) {
      console.log(`[INFO] User ${chatId} selected number: ${selectionNumber}`);
      // User is selecting from previous results
      const results = userSearchResults.get(chatId);
      console.log(`[DEBUG] User has ${results.length} stored results`);
      
      // Handle cancel (option 0)
      if (selectionNumber === 0) {
        console.log('[INFO] User cancelled selection');
        userSearchResults.delete(chatId);
        await sendText(wahaClient, cfg, chatId, 'Cancelled. Send /request <name> to search again.');
        return;
      }
      
      if (selectionNumber >= 1 && selectionNumber <= results.length) {
        const chosen = results[selectionNumber - 1];
        const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);

        console.log(`[INFO] Creating request for: ${typeStr} "${chosenTitle}" (${chosenYear})`);

        // Send confirmation
        console.log('[DEBUG] Sending confirmation message...');
        await sendText(wahaClient, cfg, chatId, `Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})...`);

        try {
          console.log('[DEBUG] Calling createRequest...');
          const res = await createRequest(jellyseerrClient, cfg, chosen);
          console.log(`[INFO] Jellyseerr request response status: ${res.status}`);
          console.log('[DEBUG] Jellyseerr response data:', JSON.stringify(res.data, null, 2));
          
          if (res.status === 201 || res.status === 200) {
            console.log('[SUCCESS] Request created successfully');
            await sendText(wahaClient, cfg, chatId, `✅ Request created successfully!`);
          } else if (res.status === 409) {
            console.log('[INFO] Request already exists');
            await sendText(wahaClient, cfg, chatId, `ℹ️ This ${typeStr.toLowerCase()} is already requested or available.`);
          } else {
            console.error('[ERROR] Unexpected response from Jellyseerr:', res.status, res.data);
            await sendText(wahaClient, cfg, chatId, `❌ Failed to create request. Status: ${res.status}`);
          }
        } catch (err) {
          console.error('[ERROR] Failed to create request:', err);
          console.error('[ERROR] Stack:', err.stack);
          await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${err.message}`);
        }

        // Clear stored results
        userSearchResults.delete(chatId);
        console.log('[DEBUG] Cleared stored results for user');
        return;
      } else {
        // Invalid selection number
        console.log(`[WARN] Invalid selection number ${selectionNumber}, valid range: 0-${results.length}`);
        await sendText(wahaClient, cfg, chatId, `Invalid selection. Please reply with a number between 0 and ${results.length} (0 to cancel).`);
        return;
      }
    }

    // Check if message starts with /request command
    const query = extractSearchQuery(messageText);
    if (!query) {
      console.log(`[WARN] Message does not start with "${SEARCH_COMMAND}" command`);
      console.log(`[DEBUG] Message was: "${messageText}"`);
      await sendText(wahaClient, cfg, chatId, `Please use "${SEARCH_COMMAND}" command to search.\n\nExample: ${SEARCH_COMMAND} The Matrix`);
      return;
    }

    console.log(`[INFO] Extracted search query: "${query}"`);
    console.log(`[INFO] Searching Jellyseerr for: "${query}"`);

    // Send searching message
    console.log('[DEBUG] Sending "Searching..." message...');
    await sendText(wahaClient, cfg, chatId, `Searching for "${query}"...`);

    try {
      console.log('[DEBUG] Calling searchTitle...');
      const candidates = await searchTitle(jellyseerrClient, cfg, query, null, null);
      console.log(`[INFO] Search returned ${candidates?.length || 0} results`);

      if (!candidates || candidates.length === 0) {
        console.log(`[INFO] No results found for "${query}"`);
        await sendText(wahaClient, cfg, chatId, 'No results found. Try a different search term.');
        userSearchResults.delete(chatId);
        return;
      }

      // Store results for this user
      userSearchResults.set(chatId, candidates);
      console.log(`[INFO] Stored ${candidates.length} results for user ${chatId}`);

      // Format and send results
      const resultsMessage = formatSearchResults(candidates);
      console.log('[DEBUG] Sending results message...');
      console.log('[DEBUG] Results message preview:', resultsMessage.substring(0, 200) + '...');
      await sendText(wahaClient, cfg, chatId, resultsMessage);
      console.log('[SUCCESS] Results sent to user');

    } catch (err) {
      console.error(`[ERROR] Error searching for "${query}":`, err);
      console.error('[ERROR] Stack:', err.stack);
      await sendText(wahaClient, cfg, chatId, `❌ Error searching: ${err.message}`);
      userSearchResults.delete(chatId);
    }

  } catch (err) {
    console.error('[ERROR] Error handling message:', err);
    console.error('[ERROR] Stack:', err.stack);
  }
}

/**
 * Creates and starts the webhook server
 */
function createWebhookServer(cfg, jellyseerrClient, wahaClient) {
  const port = cfg.webhook?.port || 3000;
  const path = cfg.webhook?.path || '/webhook';

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

    console.log(`[INFO] Webhook POST received: ${req.url}`);

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
          console.log(`[INFO] Webhook event: ${webhookData.event} (session: ${webhookData.session || 'unknown'})`);
        } else {
          console.log('[WARN] Webhook data has no event field');
        }

        // Process message events - prefer 'message.any' to avoid duplicates
        // If both 'message' and 'message.any' are configured, they may send the same message
        // We'll process 'message.any' and skip 'message' for the same message ID
        if (webhookData.event === 'message.any' && webhookData.payload) {
          // Process message asynchronously (don't block response)
          handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
            console.error('[ERROR] Error in handleMessage:', err);
            console.error('[ERROR] Stack:', err.stack);
          });
        } else if (webhookData.event === 'message' && webhookData.payload) {
          // Only process 'message' event if we don't have 'message.any' configured
          // Check if this message ID was already processed (might have come as 'message.any' first)
          const messageId = webhookData.payload?.id;
          if (messageId && !processedMessages.has(messageId)) {
            handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
              console.error('[ERROR] Error in handleMessage:', err);
              console.error('[ERROR] Stack:', err.stack);
            });
          } else {
            console.log(`[INFO] Skipping duplicate 'message' event (ID: ${messageId})`);
          }
        }

        // Always respond with 200 to acknowledge receipt
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));

      } catch (err) {
        console.error('[ERROR] Error parsing webhook data:', err.message);
        if (body.length < MAX_ERROR_BODY_LENGTH) {
          console.error('[ERROR] Raw body:', body);
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', message: err.message }));
      }
    });

    req.on('error', (err) => {
      console.error('[ERROR] Request error:', err);
      console.error('[ERROR] Stack:', err.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(port, () => {
    const webhookUrl = getWebhookUrl(cfg);
    console.log(`[INFO] WhatsApp bot webhook server listening on port ${port}`);
    console.log(`[INFO] Webhook path: ${path}`);
    console.log(`[INFO] Configure WAHA to send webhooks to: ${webhookUrl}`);
    console.log(`[INFO] Command: ${SEARCH_COMMAND} <movie or TV show name>`);
    console.log(`[INFO] Example: ${SEARCH_COMMAND} The Matrix`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[ERROR] Port ${port} is already in use. Please choose a different port.`);
    } else {
      console.error('[ERROR] Server error:', err);
      console.error('[ERROR] Stack:', err.stack);
    }
    process.exit(1);
  });

  return server;
}

/**
 * Main function
 */
async function main() {
  const cfg = loadConfig({ requireWaha: true });
  const jellyseerrClient = createHttpClient(cfg.baseUrl);
  const wahaClient = createWahaClient(cfg.waha.baseUrl);

  console.log('[INFO] Starting WhatsApp bot for Jellyseerr...');
  console.log(`[INFO] Jellyseerr: ${cfg.baseUrl}`);
  console.log(`[INFO] WAHA: ${cfg.waha.baseUrl}`);
  console.log(`[INFO] WAHA Session: ${cfg.waha?.session || 'default'}`);

  const server = createWebhookServer(cfg, jellyseerrClient, wahaClient);

  // Graceful shutdown handler
  const shutdown = () => {
    console.log('\n[INFO] Shutting down...');
    server.close(() => {
      console.log('[INFO] Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[FATAL] Fatal error:', err);
    console.error('[FATAL] Stack:', err.stack);
    process.exit(1);
  });
}
