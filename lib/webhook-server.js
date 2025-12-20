/**
 * Webhook server creation and management
 */

import http from 'http';
import { MAX_ERROR_BODY_LENGTH } from './constants.js';
import { processedMessages } from './state.js';
import { getUserIdFromEmail, getConfigPath, getPhoneNumberFromUserId } from './utils.js';
import { sendMessage } from './waha-client.js';
import { getMediaDetails } from './request.js';
import { pendingRequestApprovals } from './state.js';
import fs from 'fs';

// Constants for media types and status codes
const MEDIA_TYPE_TV = 2;
const STATUS_AVAILABLE = 5;

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
 * Gets emoji for notification type
 * @param {string} notificationType - Notification type (e.g., "MEDIA_AVAILABLE")
 * @returns {string} Emoji for the notification type
 */
function getNotificationEmoji(notificationType) {
  const emojiMap = {
    'MEDIA_PENDING': '⏳',
    'MEDIA_APPROVED': '✅',
    'MEDIA_AVAILABLE': '✅',
    'MEDIA_FAILED': '❌',
    'MEDIA_DECLINED': '🚫',
    'MEDIA_AUTO_APPROVED': '✅',
    'MEDIA_AUTO_REQUESTED': '🤖',
    'ISSUE_CREATED': '🐛',
    'ISSUE_COMMENT': '💬',
    'ISSUE_RESOLVED': '✅',
    'ISSUE_REOPENED': '🔄',
    'TEST_NOTIFICATION': '🧪'
  };
  return emojiMap[notificationType] || '📬';
}

/**
 * Formats notification message with reusable parameters
 * @param {Object} params - Notification parameters
 * @param {string} params.notificationType - Notification type (e.g., "MEDIA_AVAILABLE")
 * @param {string} params.event - Event name (e.g., "Series Request Now Available")
 * @param {string} params.subject - Subject/title (e.g., "Lost (2004)")
 * @param {Array<Object>} params.extra - Extra data array (e.g., [{name: "Requested Seasons", value: "1"}])
 * @param {Array<number>} params.availableSeasons - Available season numbers (for TV shows)
 * @param {boolean} params.isMovie - Whether this is a movie
 * @returns {string} Formatted notification message
 */
function formatNotificationMessage({ notificationType, event, subject, extra = [], availableSeasons = null, isMovie = false }) {
  const emoji = getNotificationEmoji(notificationType || 'TEST_NOTIFICATION');
  const eventText = event || 'Notification';
  let message = `${emoji} ${eventText}\n\n`;
  
  // Add subject with TV emoji for TV shows, movie emoji for movies
  if (subject && subject.trim()) {
    const mediaEmoji = isMovie ? '🎬' : '📺';
    message += `${mediaEmoji} ${subject}\n\n`;
  }
  
  // For TV shows, add season information (only for MEDIA_AVAILABLE notifications)
  if (!isMovie && availableSeasons !== null && Array.isArray(availableSeasons) && notificationType === 'MEDIA_AVAILABLE') {
    if (availableSeasons.length > 0) {
      if (availableSeasons.length === 1) {
        message += `📺 Season ${availableSeasons[0]} is now available`;
      } else if (availableSeasons.length <= 5) {
        message += `📺 Seasons ${availableSeasons.join(', ')} are now available`;
      } else {
        message += `📺 ${availableSeasons.length} seasons are now available`;
      }
    } else {
      message += `📺 The show is now available`;
    }
    
    // Add requested seasons from extra array
    if (extra && Array.isArray(extra)) {
      const requestedSeasonsEntry = extra.find(e => 
        e && e.name && e.name.toLowerCase() === 'requested seasons'
      );
      if (requestedSeasonsEntry && requestedSeasonsEntry.value) {
        message += `\n📋 Requested: ${requestedSeasonsEntry.value}`;
      }
    }
  } else if (isMovie && notificationType === 'MEDIA_AVAILABLE') {
    // For movies, add a simple message (only for MEDIA_AVAILABLE notifications)
    message += `🎉 Your requested movie is now available!`;
  }
  
  return message;
}

/**
 * Formats a generic Seerr notification message for non-MEDIA_AVAILABLE types
 * Uses the reusable formatNotificationMessage function for consistency
 * @param {Object} seerrData - Seerr webhook payload
 * @returns {string} Formatted notification message
 */
function formatGenericNotification(seerrData) {
  // Determine if it's a movie based on media type
  const isMovie = seerrData.media?.media_type === 'movie';
  
  // Use the reusable formatNotificationMessage function for consistency
  return formatNotificationMessage({
    notificationType: seerrData.notification_type || 'TEST_NOTIFICATION',
    event: seerrData.event || 'Notification',
    subject: seerrData.subject || '',
    extra: seerrData.extra || [],
    availableSeasons: null, // Generic notifications don't have season info
    isMovie: isMovie
  });
}

/**
 * Formats a pending request message for admin approval
 * @param {Object} seerrData - Seerr webhook payload with MEDIA_PENDING notification
 * @returns {string} Formatted message for admin
 */
function formatPendingRequestMessage(seerrData) {
  const mediaType = seerrData.media?.media_type === 'movie' ? 'Movie' : 'TV Show';
  const mediaEmoji = seerrData.media?.media_type === 'movie' ? '🎬' : '📺';
  const subject = seerrData.subject || 'Unknown';
  const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
  const requestId = String(seerrData.request?.request_id || '');
  
  if (!requestId) {
    return `⏳ Pending Request Approval\n\n❌ Error: Request ID not found`;
  }
  
  let message = `⏳ Pending Request Approval\n\n`;
  message += `${mediaEmoji} ${subject}\n`;
  message += `👤 Requested by: ${requestedBy}\n`;
  message += `📋 Type: ${mediaType}\n`;
  
  // Add season information for TV shows if available
  if (seerrData.media?.media_type !== 'movie' && seerrData.extra && Array.isArray(seerrData.extra)) {
    const requestedSeasons = seerrData.extra.find(e => e && e.name && e.name.toLowerCase() === 'requested seasons');
    if (requestedSeasons && requestedSeasons.value) {
      message += `📺 Seasons: ${requestedSeasons.value}\n`;
    }
  }
  
  message += `\n🆔 Request ID: ${requestId}\n\n`;
  message += `✅ Reply "approve ${requestId}" to approve\n`;
  message += `🚫 Reply "decline ${requestId}" to decline\n`;
  message += `0️⃣ Reply "0" to cancel\n`;
  
  return message;
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

          // Special handling for MEDIA_PENDING notifications - send to admin for approval
          // This should be handled before email lookup since admin notification doesn't depend on requester's email
          if (seerrData.notification_type === 'MEDIA_PENDING' && seerrData.request?.request_id) {
            const adminPhoneNumber = cfg.jellyseerr?.adminDetails?.phoneNumber;
            if (adminPhoneNumber) {
              const adminPhoneChatId = `${adminPhoneNumber}@c.us`;
              // sendMessage will automatically convert phone number to LID format
              const pendingMessage = formatPendingRequestMessage(seerrData);
              
              // Store request info for admin approval response
              // We'll store with phone format key, but lookup will handle both formats
              pendingRequestApprovals.set(adminPhoneChatId, {
                requestId: String(seerrData.request.request_id),
                subject: seerrData.subject,
                requestedBy: seerrData.request.requestedBy_username,
                mediaType: seerrData.media?.media_type
              });
              
              try {
                // sendMessage automatically converts phone number to LID format
                await sendMessage(wahaClient, cfg, adminPhoneChatId, pendingMessage);
                logger?.info(`✅ Pending request notification sent to admin (${adminPhoneNumber})`, {
                  requestId: String(seerrData.request.request_id),
                  subject: seerrData.subject
                });
              } catch (err) {
                logger?.error('Failed to send pending request notification to admin', err?.message || err);
                if (err?.stack) {
                  logger?.debug('Admin notification error stack', err.stack);
                }
              }
            } else {
              logger?.warn('Admin phone number not configured, cannot send pending request notification');
            }
          }

          // Extract email from notification data (check multiple possible locations)
          const email = seerrData.notifyuser?.email || seerrData.request?.requestedBy_email || seerrData.reportedBy_email || seerrData.commentedBy_email;
          
          // Skip requester notification for MEDIA_PENDING (admin will handle approval, requester already got confirmation)
          const skipRequesterNotification = seerrData.notification_type === 'MEDIA_PENDING';
          
          if (email && !skipRequesterNotification) {
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
                // sendMessage will automatically convert phone number to LID format for messaging
                const chatId = `${phoneNumber}@c.us`;
                
                let notificationMessage = '';
                
                // Determine media type early (used in both branches)
                const isMovie = seerrData.media?.media_type === 'movie';
                
                // Special handling for MEDIA_AVAILABLE notifications
                if (seerrData.notification_type === 'MEDIA_AVAILABLE' && seerrData.media?.tmdbId && seerrData.media?.media_type) {
                  let availableSeasons = null;
                  
                  try {
                    // For TV shows, fetch media details only for season information
                    if (!isMovie && seerrData.media?.tmdbId) {
                      const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, seerrData.media?.tmdbId, MEDIA_TYPE_TV);
                      
                      // Extract available seasons from media details
                      if (mediaDetails?.seasons && Array.isArray(mediaDetails.seasons)) {
                        // Filter out specials (season 0) and get available seasons
                        // Check both standard and 4K status (if 4K status is available, prefer it)
                        availableSeasons = mediaDetails.seasons
                          .filter(s => {
                            const seasonNum = s.seasonNumber || s.season_number || 0;
                            // Filter out season 0 (Specials)
                            if (seasonNum === 0) return false;
                            
                            // Check status (prefer status4k if available, fallback to status)
                            const status = (s.status4k !== undefined && s.status4k !== null) 
                              ? s.status4k 
                              : (s.status || 0);
                            
                            return status === STATUS_AVAILABLE;
                          })
                          .map(s => s.seasonNumber || s.season_number || 0)
                          .sort((a, b) => a - b);
                      }
                    }
                  } catch (err) {
                    logger?.warn('Failed to fetch media details for MEDIA_AVAILABLE notification', err?.message || err);
                    // availableSeasons remains null, will use fallback format
                  }
                  
                  // Format notification using reusable function (works for both success and error cases)
                  notificationMessage = formatNotificationMessage({
                    notificationType: seerrData.notification_type,
                    event: seerrData.event || 'Media Available',
                    subject: seerrData.subject || 'Unknown',
                    extra: seerrData.extra || [],
                    availableSeasons: availableSeasons,
                    isMovie: isMovie
                  });
                  
                  logger?.debug('Formatted MEDIA_AVAILABLE notification', { 
                    notificationType: seerrData.notification_type,
                    event: seerrData.event,
                    subject: seerrData.subject,
                    isMovie,
                    availableSeasonsCount: availableSeasons?.length || 0
                  });
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

