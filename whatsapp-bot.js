#!/usr/bin/env node

/**
 * WhatsApp Bot for Jellyseerr Movie/TV Requests
 * 
 * Receives WhatsApp messages via WAHA webhooks, searches Jellyseerr,
 * and sends formatted responses back to users.
 */

import http from 'http';
import { createHttpClient, searchTitle, createRequest, formatMedia, getMediaDetails } from './request.js';
import { createWahaClient, sendText } from './waha-client.js';
import { loadConfig, getWebhookUrl } from './utils.js';

// Constants
const SEARCH_COMMAND = '/request';
const MAX_PROCESSED_MESSAGES = 1000;
const MAX_RESULTS_DISPLAY = 10;
const MAX_ERROR_BODY_LENGTH = 500;

// In-memory store for user search results (chatId -> results array)
const userSearchResults = new Map();

// Store selected TV shows waiting for season selection (chatId -> media object)
const pendingTvSelections = new Map();

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
 * Parses season selection from user input
 * Supports: "1", "1,2,3", "1 2 3", "all", "0" (cancel)
 * @param {string} input - User input
 * @param {number} maxSeasons - Maximum number of seasons available
 * @returns {Object} { seasons: number[] | null, cancelled: boolean, error: string | null }
 */
function parseSeasonSelection(input, maxSeasons) {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === '0' || trimmed === 'cancel') {
    return { seasons: null, cancelled: true, error: null };
  }
  
  if (trimmed === 'all') {
    return { seasons: Array.from({ length: maxSeasons }, (_, i) => i + 1), cancelled: false, error: null };
  }
  
  // Parse comma or space-separated numbers
  const numbers = trimmed.split(/[,\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  
  if (numbers.length === 0) {
    return { seasons: null, cancelled: false, error: 'Invalid format. Use numbers (e.g., "1" or "1,2,3") or "all"' };
  }
  
  // Validate all numbers are within range
  const invalid = numbers.filter(n => n < 1 || n > maxSeasons);
  if (invalid.length > 0) {
    return { seasons: null, cancelled: false, error: `Invalid season numbers: ${invalid.join(', ')}. Valid range: 1-${maxSeasons}` };
  }
  
  // Remove duplicates and sort
  const uniqueSeasons = [...new Set(numbers)].sort((a, b) => a - b);
  
  return { seasons: uniqueSeasons, cancelled: false, error: null };
}

/**
 * Formats available seasons into a message
 * @param {Array} seasons - Array of season objects from Jellyseerr
 * @returns {string} Formatted message
 */
function formatSeasons(seasons) {
  if (!seasons || seasons.length === 0) {
    return 'No seasons available.';
  }
  
  let message = 'Available seasons:\n\n';
  seasons.forEach((season, idx) => {
    // Handle different season object structures
    const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                      season.season_number !== undefined ? season.season_number :
                      idx + 1;
    const name = (season.name || season.seasonName) ? ` - ${season.name || season.seasonName}` : '';
    const episodeCount = (season.episodeCount || season.episode_count) ? 
                         ` (${season.episodeCount || season.episode_count} episodes)` : '';
    message += `${seasonNum}. Season ${seasonNum}${name}${episodeCount}\n`;
  });
  message += '\n0. Cancel\n';
  message += 'all. Request all seasons\n';
  message += '\nReply with season numbers (e.g., "1" or "1,2,3" or "all"):';
  
  return message;
}

/**
 * Determines the status message for request responses
 * @param {Object} res - Response object from Jellyseerr API
 * @param {string} typeStr - Media type string (Movie/TV)
 * @returns {string} Status message
 */
function getRequestStatusMessage(res, typeStr) {
  if (res.status === 201 || res.status === 200) {
    return `✅ Request created successfully!`;
  }

  if (res.status === 409) {
    // Check response data to determine if it's already requested or available
    const data = res.data || {};
    
    // Check for status fields that indicate availability
    if (data.status === 'available' || data.mediaStatus === 'available' || 
        data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
      return `✅ This ${typeStr.toLowerCase()} is already available in your library!`;
    }
    
    // Check for status fields that indicate it's requested but not available
    if (data.status === 'pending' || data.status === 'approved' || 
        data.mediaStatus === 'pending' || data.mediaStatus === 'approved' ||
        data.media?.status === 'pending' || data.media?.status === 'approved' ||
        data.media?.mediaStatus === 'pending' || data.media?.mediaStatus === 'approved') {
      return `⏳ This ${typeStr.toLowerCase()} is already requested and pending approval.`;
    }
    
    // Check if there's a request object indicating it's already requested
    if (data.request || data.media?.request) {
      return `📋 This ${typeStr.toLowerCase()} is already requested.`;
    }
    
    // Default message if we can't determine the specific status
    return `ℹ️ This ${typeStr.toLowerCase()} is already requested or available.`;
  }

  return `❌ Failed to create request. Status: ${res.status}`;
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

    // Check if user is selecting seasons for a TV show
    if (pendingTvSelections.has(chatId)) {
      const tvShow = pendingTvSelections.get(chatId);
      const { title: chosenTitle } = formatMedia(tvShow);
      
      console.log(`[INFO] User ${chatId} is selecting seasons for TV show: "${chosenTitle}"`);
      
      // Parse season selection - use actual seasons array length
      const availableSeasons = tvShow.seasons || [];
      const maxSeasons = availableSeasons.length > 0 ? availableSeasons.length : (tvShow.numberOfSeasons || 10);
      const seasonSelection = parseSeasonSelection(messageText, maxSeasons);
      
      if (seasonSelection.cancelled) {
        console.log('[INFO] User cancelled season selection');
        pendingTvSelections.delete(chatId);
        userSearchResults.delete(chatId);
        await sendText(wahaClient, cfg, chatId, 'Cancelled. Send /request <name> to search again.');
        return;
      }
      
      if (seasonSelection.error) {
        await sendText(wahaClient, cfg, chatId, `❌ ${seasonSelection.error}`);
        return;
      }
      
      // Create request with selected seasons
      const seasons = seasonSelection.seasons;
      const seasonsText = seasons.length === maxSeasons ? 'all seasons' : `season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`;
      
      console.log(`[INFO] Creating request for TV show "${chosenTitle}" with ${seasonsText}`);
      await sendText(wahaClient, cfg, chatId, `Requesting "${chosenTitle}" - ${seasonsText}...`);
      
      try {
        const res = await createRequest(jellyseerrClient, cfg, tvShow, seasons);
        console.log(`[INFO] Jellyseerr request response status: ${res.status}`);
        console.log('[DEBUG] Jellyseerr response data:', JSON.stringify(res.data, null, 2));
        
        const statusMessage = getRequestStatusMessage(res, 'TV');
        
        if (res.status === 201 || res.status === 200) {
          console.log('[SUCCESS] Request created successfully');
        } else if (res.status === 409) {
          const data = res.data || {};
          if (data.status === 'available' || data.mediaStatus === 'available' || 
              data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
            console.log('[INFO] Media is already available');
          } else {
            console.log('[INFO] Media is already requested');
          }
        } else {
          console.error('[ERROR] Unexpected response from Jellyseerr:', res.status, res.data);
        }
        
        await sendText(wahaClient, cfg, chatId, statusMessage);
      } catch (err) {
        console.error('[ERROR] Failed to create request:', err);
        console.error('[ERROR] Stack:', err.stack);
        await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${err.message}`);
      }
      
      // Clear stored data
      pendingTvSelections.delete(chatId);
      userSearchResults.delete(chatId);
      return;
    }

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
        const isTvShow = typeStr === 'TV' || chosen.mediaType === 2 || chosen.mediaType === 'tv';

        // For TV shows, fetch details and show season selection
        if (isTvShow) {
          console.log(`[INFO] TV show selected: "${chosenTitle}" - fetching season details...`);
          await sendText(wahaClient, cfg, chatId, `Fetching season information for "${chosenTitle}"...`);
          
          try {
            const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 2);
            const seasons = mediaDetails.seasons || [];
            
            if (seasons.length === 0) {
              // No season info available, request all seasons
              console.log('[WARN] No season information available, requesting all seasons');
              await sendText(wahaClient, cfg, chatId, `No season details found. Requesting all seasons for "${chosenTitle}"...`);
              
              const res = await createRequest(jellyseerrClient, cfg, chosen);
              const statusMessage = getRequestStatusMessage(res, typeStr);
              await sendText(wahaClient, cfg, chatId, statusMessage);
              
              userSearchResults.delete(chatId);
              return;
            }
            
            // Store TV show for season selection
            chosen.seasons = seasons;
            pendingTvSelections.set(chatId, chosen);
            
            // Show season selection
            const seasonsMessage = formatSeasons(seasons);
            await sendText(wahaClient, cfg, chatId, seasonsMessage);
            
            // Keep search results in case user wants to cancel and pick something else
            return;
          } catch (err) {
            console.error('[ERROR] Failed to get media details:', err);
            await sendText(wahaClient, cfg, chatId, `❌ Error fetching season information: ${err.message}. Requesting all seasons...`);
            
            // Fallback: request all seasons
            try {
              const res = await createRequest(jellyseerrClient, cfg, chosen);
              const statusMessage = getRequestStatusMessage(res, typeStr);
              await sendText(wahaClient, cfg, chatId, statusMessage);
            } catch (reqErr) {
              console.error('[ERROR] Failed to create request:', reqErr);
              await sendText(wahaClient, cfg, chatId, `❌ Error creating request: ${reqErr.message}`);
            }
            
            userSearchResults.delete(chatId);
            return;
          }
        }
        
        // For movies, create request directly
        console.log(`[INFO] Creating request for: ${typeStr} "${chosenTitle}" (${chosenYear})`);

        // Send confirmation
        console.log('[DEBUG] Sending confirmation message...');
        await sendText(wahaClient, cfg, chatId, `Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})...`);

        try {
          console.log('[DEBUG] Calling createRequest...');
          const res = await createRequest(jellyseerrClient, cfg, chosen);
          console.log(`[INFO] Jellyseerr request response status: ${res.status}`);
          console.log('[DEBUG] Jellyseerr response data:', JSON.stringify(res.data, null, 2));
          
          const statusMessage = getRequestStatusMessage(res, typeStr);
          
          if (res.status === 201 || res.status === 200) {
            console.log('[SUCCESS] Request created successfully');
          } else if (res.status === 409) {
            // Determine specific status for logging
            const data = res.data || {};
            if (data.status === 'available' || data.mediaStatus === 'available' || 
                data.media?.status === 'available' || data.media?.mediaStatus === 'available') {
              console.log('[INFO] Media is already available');
            } else {
              console.log('[INFO] Media is already requested');
            }
          } else {
            console.error('[ERROR] Unexpected response from Jellyseerr:', res.status, res.data);
          }
          
          await sendText(wahaClient, cfg, chatId, statusMessage);
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
  const port = cfg.webhook.port;
  const path = cfg.webhook.path;

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
    console.log(`[INFO] WhatsApp bot webhook server listening on port ${port}`);
    console.log(`[INFO] Webhook path: ${path}`);
    try {
      const webhookUrl = getWebhookUrl(cfg);
      console.log(`[INFO] Configure WAHA to send webhooks to: ${webhookUrl}`);
    } catch {
      console.log('[WARN] protocol/host is not set in config.json, so the bot cannot print a public webhook URL. Set protocol + host, or configure the WAHA webhook URL manually.');
    }
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
  const cfg = loadConfig({ requireWaha: true, requireWebhook: true });
  const jellyseerrClient = createHttpClient(cfg.jellyseerr.baseUrl);
  const wahaClient = createWahaClient(cfg.waha.baseUrl);

  console.log('[INFO] Starting WhatsApp bot for Jellyseerr...');
  console.log(`[INFO] Jellyseerr: ${cfg.jellyseerr.baseUrl}`);
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
