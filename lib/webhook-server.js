/**
 * Webhook server creation and management
 */

import http from 'http';
import { MAX_ERROR_BODY_LENGTH } from './constants.js';
import { processedMessages } from './state.js';
import { getUserIdFromEmail, getConfigPath, getPhoneNumberFromUserId } from './utils.js';
import { sendMessage } from './waha-client.js';
import { getMediaDetails, formatMedia } from './request.js';
import fs from 'fs';

/**
 * Reads config file and returns parsed JSON
 * @param {Object} logger - Logger instance
 * @returns {Object|null} Parsed config or null on error
 */
function readConfigFile(logger) {
  try {
    const configPath = getConfigPath();
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (err) {
    logger?.debug('Could not read config file', err?.message || err);
    return null;
  }
}

/**
 * Writes config object to file
 * @param {Object} config - Config object to write
 * @param {Object} logger - Logger instance
 * @returns {boolean} True if successful, false otherwise
 */
function writeConfigFile(config, logger) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return true;
  } catch (err) {
    logger?.warn('Failed to write config file', err?.message || err);
    return false;
  }
}

/**
 * Formats a generic Seerr notification message
 * @param {Object} seerrData - Seerr webhook payload
 * @returns {string} Formatted notification message
 */
function formatGenericNotification(seerrData) {
  const messageParts = [];
  
  if (seerrData.subject) {
    messageParts.push(`📬 ${seerrData.subject}`);
  }
  
  if (seerrData.message) {
    messageParts.push(seerrData.message);
  }
  
  // Add media info if available
  if (seerrData.media) {
    const mediaInfo = [];
    if (seerrData.media.media_type) {
      mediaInfo.push(`🎬 Type: ${seerrData.media.media_type === 'movie' ? 'Movie' : 'TV Show'}`);
    }
    if (seerrData.media.tmdbId) {
      mediaInfo.push(`🆔 TMDB ID: ${seerrData.media.tmdbId}`);
    }
    if (mediaInfo.length > 0) {
      messageParts.push(mediaInfo.join('\n'));
    }
  }
  
  // Add request info if available
  if (seerrData.request?.request_id) {
    messageParts.push(`📋 Request ID: ${seerrData.request.request_id}`);
  }
  
  // Build final message or use default
  return messageParts.length > 0 
    ? messageParts.join('\n\n')
    : '📬 You have a new notification from Seerr';
}

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
  const requestsPort = cfg.requests.port;
  const requestsPath = cfg.requests.path;
  const seerrPort = cfg.seerr?.port || requestsPort; // Default to same port if not specified
  const seerrPath = cfg.seerr?.path || '/seerr';
  const logger = cfg.__logger;

  const server = http.createServer(async (req, res) => {
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        service: 'WhatsApp Jellyseerr Bot',
        endpoints: {
          requests: requestsPath,
          seerr: seerrPath
        },
        port: requestsPort
      }));
      return;
    }

    // Handle Seerr webhook endpoint
    if (req.method === 'POST' && req.url === seerrPath) {
      logger?.info('📥 Seerr webhook received', { url: req.url });

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const seerrData = JSON.parse(body);
          
          // Log the received Seerr notification data for testing
          logger?.info('📋 Seerr notification data:', JSON.stringify(seerrData, null, 2));
          logger?.debug('Seerr notification type:', seerrData.notification_type);
          logger?.debug('Seerr event:', seerrData.event);
          logger?.debug('Seerr subject:', seerrData.subject);

          // Extract email from notification data
          const email = seerrData.notifyuser?.email || seerrData.requestedBy_email || seerrData.reportedBy_email || seerrData.commentedBy_email;
          
          if (email) {
            logger?.info(`📧 Looking up user ID for email: ${email}`);
            
            // Check if mapping already exists in config file before API call
            const fileConfig = readConfigFile(logger);
            const wasInFile = fileConfig?.emailMappings?.[email] !== undefined;
            
            // Get user ID from email (will check mappings first, then API)
            const userId = await getUserIdFromEmail(cfg, jellyseerrClient, email);
            
            if (userId) {
              // Update config file with new email mapping if it was fetched from API
              // (getUserIdFromEmail already updated in-memory config)
              if (!wasInFile) {
                const config = readConfigFile(logger);
                if (config) {
                  // Initialize emailMappings if it doesn't exist
                  if (!config.emailMappings) {
                    config.emailMappings = {};
                  }
                  
                  // Add the new mapping
                  config.emailMappings[email] = userId;
                  
                  // Write back to config file
                  if (writeConfigFile(config, logger)) {
                    // Sync in-memory config with file
                    cfg.emailMappings = config.emailMappings;
                    logger?.info(`💾 Email mapping saved to config: "${email}": ${userId}`);
                  } else {
                    logger?.info(`⚠️  Manually add to config.json: "emailMappings": { "${email}": ${userId} }`);
                  }
                } else {
                  logger?.warn('Failed to read config file for email mapping update');
                  logger?.info(`⚠️  Manually add to config.json: "emailMappings": { "${email}": ${userId} }`);
                }
              } else {
                logger?.debug(`Email mapping already exists in config file: "${email}": ${userId}`);
              }
              
              // Look up phone number from userId
              const phoneNumber = getPhoneNumberFromUserId(cfg, userId);
              
              if (phoneNumber) {
                // Format chatId from phone number (WAHA format: phoneNumber@c.us)
                const chatId = `${phoneNumber}@c.us`;
                
                let notificationMessage = '';
                
                // Special handling for MEDIA_AVAILABLE notifications
                if (seerrData.notification_type === 'MEDIA_AVAILABLE' && seerrData.media?.tmdbId && seerrData.media?.media_type) {
                  try {
                    // Fetch media details to get title and season information
                    const isMovie = seerrData.media.media_type === 'movie';
                    const mediaType = isMovie ? 1 : 2;
                    const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, seerrData.media.tmdbId, mediaType);
                    
                    // Format media title and year (use webhook media_type since API response may not include it)
                    const { title, year } = formatMedia(mediaDetails);
                    const typeStr = isMovie ? 'Movie' : 'TV';
                    
                    // Build availability message
                    notificationMessage = `✅ ${typeStr} Available!\n\n`;
                    notificationMessage += `🎬 ${title}${year !== '????' ? ` (${year})` : ''}\n\n`;
                    
                    // For TV shows, add available seasons information
                    if (!isMovie && mediaDetails.seasons && Array.isArray(mediaDetails.seasons)) {
                      // Extract requested seasons from extra array
                      let requestedSeasonsText = '';
                      if (seerrData.extra && Array.isArray(seerrData.extra)) {
                        const requestedSeasonsEntry = seerrData.extra.find(e => 
                          e && e.name && e.name.toLowerCase() === 'requested seasons'
                        );
                        if (requestedSeasonsEntry && requestedSeasonsEntry.value) {
                          requestedSeasonsText = requestedSeasonsEntry.value;
                        }
                      }
                      
                      // Filter out specials (season 0) and get available seasons
                      // Check both standard and 4K status (if 4K status is available, prefer it)
                      const availableSeasons = mediaDetails.seasons
                        .filter(s => {
                          const seasonNum = s.seasonNumber || s.season_number || 0;
                          // Filter out season 0 (Specials)
                          if (seasonNum === 0) return false;
                          
                          // Check status (prefer status4k if available, fallback to status)
                          const status = (s.status4k !== undefined && s.status4k !== null) 
                            ? s.status4k 
                            : (s.status || 0);
                          
                          // Status 5 = AVAILABLE
                          return status === 5;
                        })
                        .map(s => s.seasonNumber || s.season_number || 0)
                        .sort((a, b) => a - b);
                      
                      if (availableSeasons.length > 0) {
                        if (availableSeasons.length === 1) {
                          notificationMessage += `📺 Season ${availableSeasons[0]} is now available`;
                        } else if (availableSeasons.length <= 5) {
                          notificationMessage += `📺 Seasons ${availableSeasons.join(', ')} are now available`;
                        } else {
                          notificationMessage += `📺 ${availableSeasons.length} seasons are now available`;
                        }
                        
                        // Add requested seasons information if available
                        if (requestedSeasonsText) {
                          notificationMessage += `\n📋 Requested: ${requestedSeasonsText}`;
                        }
                      } else {
                        // No specific seasons available, but show is available overall
                        notificationMessage += `📺 The show is now available`;
                        
                        // Add requested seasons information if available
                        if (requestedSeasonsText) {
                          notificationMessage += `\n📋 Requested: ${requestedSeasonsText}`;
                        }
                      }
                    } else {
                      // For movies
                      notificationMessage += `🎉 Your requested ${typeStr.toLowerCase()} is now available!`;
                    }
                    
                    logger?.debug('Formatted MEDIA_AVAILABLE notification', { 
                      title, 
                      year, 
                      typeStr,
                      hasSeasons: !isMovie && mediaDetails.seasons?.length > 0
                    });
                  } catch (err) {
                    logger?.warn('Failed to fetch media details for MEDIA_AVAILABLE notification', err?.message || err);
                    // Fallback to generic message
                    notificationMessage = formatGenericNotification(seerrData);
                  }
                } else {
                  // Generic notification formatting for other types
                  notificationMessage = formatGenericNotification(seerrData);
                }
                
                // Send notification via WhatsApp
                try {
                  await sendMessage(wahaClient, cfg, chatId, notificationMessage);
                  logger?.info(`✅ Notification sent to ${phoneNumber} (userId: ${userId})`);
                } catch (err) {
                  logger?.error('Failed to send WhatsApp notification', err?.message || err);
                  if (err?.stack) {
                    logger?.debug('Send notification error stack', err.stack);
                  }
                }
              } else {
                logger?.warn(`No phone number mapping found for userId ${userId}, discarding notification`);
              }
            } else {
              logger?.warn(`User ID not found for email: ${email}, discarding notification`);
            }
          } else {
            logger?.debug('No email found in Seerr notification data');
          }

          // Always respond with 200 to acknowledge receipt
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true, message: 'Seerr notification logged' }));

        } catch (err) {
          logger?.error('Error parsing Seerr webhook JSON', err?.message || err);
          if (body.length < MAX_ERROR_BODY_LENGTH) {
            logger?.debug('Seerr webhook raw body', body);
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON', message: err?.message || 'Unknown error' }));
        }
      });

      req.on('error', (err) => {
        logger?.error('Seerr webhook request stream error', err?.message || err);
        if (err?.stack) {
          logger?.debug('Seerr webhook request error stack', err.stack);
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });

      return;
    }

    // Handle WAHA requests webhook endpoint
    if (req.method !== 'POST' || req.url !== requestsPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    logger?.debug('WAHA requests webhook POST received', { url: req.url });

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
            if (err?.stack) {
              logger?.debug('handleMessage stack', err.stack);
            }
          });
        } else if (webhookData.event === 'message' && webhookData.payload) {
          // Only process 'message' event if we don't have 'message.any' configured
          // Check if this message ID was already processed (might have come as 'message.any' first)
          const messageId = webhookData.payload?.id;
          if (messageId && !processedMessages.has(messageId)) {
            handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
              logger?.error('Error in handleMessage', err?.message || err);
              if (err?.stack) {
                logger?.debug('handleMessage stack', err.stack);
              }
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
        res.end(JSON.stringify({ error: 'Invalid JSON', message: err?.message || 'Unknown error' }));
      }
    });

    req.on('error', (err) => {
      logger?.error('Webhook request stream error', err?.message || err);
      if (err?.stack) {
        logger?.debug('Webhook request error stack', err.stack);
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(requestsPort, () => {
    logger?.info(`🚀 Webhook server listening`);
    logger?.info(`📍 WAHA requests path: ${requestsPath}`);
    logger?.info(`📍 Seerr notifications path: ${seerrPath}`);
    logger?.info(`🔌 Port: ${requestsPort}`);
    try {
      const webhookUrl = getWebhookUrl(cfg);
      logger?.info(`🔗 WAHA webhook URL: ${webhookUrl}`);
      if (cfg.protocol && cfg.host) {
        const seerrWebhookUrl = `${cfg.protocol}://${cfg.host}:${seerrPort}${seerrPath}`;
        logger?.info(`🔗 Seerr webhook URL: ${seerrWebhookUrl}`);
      }
    } catch {
      logger?.warn('protocol/host not set; cannot print public webhook URLs. Set protocol + host, or configure manually.');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger?.error(`Port ${requestsPort} is already in use. Choose a different requests.port.`);
    } else {
      logger?.error('Server error', err?.message || err);
      if (err?.stack) {
        logger?.debug('Server error stack', err.stack);
      }
    }
    process.exit(1);
  });

  return server;
}

