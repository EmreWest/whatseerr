/**
 * Webhook server creation and management
 */

import http from 'http';
import { MAX_ERROR_BODY_LENGTH } from './constants.js';
import { processedMessages } from './state.js';
import { getUserIdFromEmail, getConfigPath, getPhoneNumberFromUserId, isLidFormat, isAdminChatId } from './utils.js';
import { sendMessage, getPhoneNumberByLid, getMessageById } from './waha-client.js';
import { getMediaDetails, approveRequest, declineRequest } from './request.js';
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
    message += `🎉 Enjoy your movie!`;
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
  message += `✅ React with ✅ or reply "approve ${requestId}" to approve\n`;
  message += `🚫 React with ❌ or reply "decline ${requestId}" to decline\n`;
  message += `0️⃣ Reply "0" to cancel\n`;
  
  return message;
}

/**
 * Parses approval request message body to extract request ID and other info
 * @param {string} messageBody - Message body text
 * @returns {Object|null} Parsed approval info or null if not an approval message
 */
function parseApprovalMessage(messageBody) {
  if (!messageBody || typeof messageBody !== 'string') {
    return null;
  }
  
  // Check if this is an approval request message
  if (!messageBody.includes('⏳ Pending Request Approval')) {
    return null;
  }
  
  // Extract request ID using regex: "🆔 Request ID: 2576"
  const requestIdMatch = messageBody.match(/🆔 Request ID:\s*(\d+)/);
  if (!requestIdMatch || !requestIdMatch[1]) {
    return null;
  }
  
  const requestId = requestIdMatch[1];
  
  // Extract subject (title) - line after "⏳ Pending Request Approval"
  // Format: "🎬 Clayfist (2015)" or "📺 Show Name (2015)"
  const subjectMatch = messageBody.match(/(?:🎬|📺)\s+(.+?)(?:\n|$)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : null;
  
  // Extract requested by - format: "👤 Requested by: SuFx"
  const requestedByMatch = messageBody.match(/👤 Requested by:\s*(.+?)(?:\n|$)/);
  const requestedBy = requestedByMatch ? requestedByMatch[1].trim() : null;
  
  return {
    requestId,
    subject,
    requestedBy
  };
}

/**
 * Handles emoji reaction events for approval/decline
 * @param {Object} cfg - Configuration object
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} wahaClient - WAHA API client
 * @param {Object} webhookData - Webhook data with message.reaction event
 */
async function handleReaction(cfg, jellyseerrClient, wahaClient, webhookData) {
  const logger = cfg.__logger;
  const payload = webhookData.payload;
  
  if (!payload || !payload.reaction) {
    logger?.debug('Invalid reaction payload, ignoring', { payload });
    return;
  }
  
  const reactionText = payload.reaction.text || '';
  const messageId = payload.reaction.messageId;
  
  logger?.debug('Reaction event received', {
    messageId,
    reactionText: reactionText || '(empty)',
    from: payload.from
  });
  
  // Empty string means reaction was removed, ignore it
  if (!reactionText || reactionText.trim() === '') {
    logger?.debug('Reaction removed, ignoring', { messageId });
    return;
  }
  
  // Extract chatId from messageId format: "true_151169980723349@lid_3EB005CE7B06604A9DBACB"
  // Per WAHA API docs: messageId format is "{fromMe}_{chatId}_{message_id}[_{participant}]"
  // Example: "true_123456789@c.us_BAE6A33293978B16"
  logger?.debug('Extracting chatId from messageId', { messageId });
  const messageIdParts = messageId.split('_');
  if (messageIdParts.length < 3) {
    logger?.warn('Invalid messageId format, cannot extract chatId', { messageId });
    return;
  }
  
  // chatId is the middle part (index 1)
  const chatId = messageIdParts[1];
  logger?.debug('Extracted chatId from messageId', { messageId, chatId });
  
  // Fetch the message to parse its content
  logger?.debug('Fetching message content to check if it is an approval request', { messageId, chatId });
  const message = await getMessageById(wahaClient, cfg, chatId, messageId);
  if (!message || !message.body) {
    logger?.warn('Could not fetch message or message has no body', { messageId, chatId });
    return;
  }
  
  logger?.debug('Message fetched successfully, parsing for approval info', {
    messageId,
    bodyLength: message.body?.length || 0
  });
  
  // Parse the message to check if it's an approval request
  const approvalInfo = parseApprovalMessage(message.body);
  if (!approvalInfo || !approvalInfo.requestId) {
    logger?.debug('Reaction not for approval message, ignoring', { messageId });
    return;
  }
  
  const requestId = approvalInfo.requestId;
  logger?.info('Reaction detected on approval request message', {
    messageId,
    requestId,
    reactionText,
    subject: approvalInfo.subject,
    from: payload.from
  });
  
  // Validate that reaction is from admin (security check)
  const reactorChatId = payload.from;
  const isAdminReaction = await isAdminChatId(cfg, reactorChatId, wahaClient, logger);
  
  logger?.debug('Validating admin access for reaction', {
    reactorChatId,
    isAdminReaction,
    isLidFormat: isLidFormat(reactorChatId)
  });
  
  if (!isAdminReaction) {
    logger?.warn('Non-admin user attempted to react to approval message', {
      messageId,
      reactorChatId,
      requestId,
      reactionText
    });
    return;
  }
  
  logger?.info('Admin validated for reaction processing', {
    requestId,
    reactionText,
    adminChatId: reactorChatId
  });
  
  // Check if reaction is approve (✅) or decline (❌)
  // Support common emoji variations
  const approveEmojis = ['✅', '👍', '✓', '✔', '✔️'];
  const declineEmojis = ['❌', '👎', '✗', '✖', '✖️'];
  
  const isApprove = approveEmojis.includes(reactionText);
  const isDecline = declineEmojis.includes(reactionText);
  
  if (!isApprove && !isDecline) {
    logger?.debug('Reaction is not approve or decline emoji, ignoring', {
      reactionText,
      messageId,
      requestId
    });
    return;
  }
  
  logger?.info(`Processing ${isApprove ? 'approval' : 'decline'} via emoji reaction`, {
    requestId,
    reactionEmoji: reactionText,
    method: 'emoji',
    adminChatId: reactorChatId
  });
  
  // reactorChatId is from payload.from (sendMessage handles LID conversion if needed)
  try {
    if (isApprove) {
      await approveRequest(jellyseerrClient, cfg, requestId, logger);
      logger?.info(`✅ Request approved via emoji reaction`, {
        requestId,
        method: 'emoji',
        reactionEmoji: reactionText,
        subject: approvalInfo.subject,
        requestedBy: approvalInfo.requestedBy,
        adminChatId: reactorChatId
      });
      await sendMessage(wahaClient, cfg, reactorChatId, 
        `✅ Request approved!\n\n📋 ${approvalInfo.subject || 'Request'}\n👤 Requested by: ${approvalInfo.requestedBy || 'Unknown'}`
      );
    } else {
      await declineRequest(jellyseerrClient, cfg, requestId, logger);
      logger?.info(`🚫 Request declined via emoji reaction`, {
        requestId,
        method: 'emoji',
        reactionEmoji: reactionText,
        subject: approvalInfo.subject,
        requestedBy: approvalInfo.requestedBy,
        adminChatId: reactorChatId
      });
      await sendMessage(wahaClient, cfg, reactorChatId,
        `🚫 Request declined.\n\n📋 ${approvalInfo.subject || 'Request'}\n👤 Requested by: ${approvalInfo.requestedBy || 'Unknown'}`
      );
    }
    
  } catch (err) {
    logger?.error(`Failed to ${isApprove ? 'approve' : 'decline'} request via reaction`, {
      requestId,
      method: 'emoji',
      reactionEmoji: reactionText,
      error: err?.message || err,
      stack: err?.stack
    });
    
    // Try to send error message to admin
    try {
      await sendMessage(wahaClient, cfg, reactorChatId,
        `❌ Error: ${err?.message || 'Failed to process request'}`
      );
      logger?.debug('Error notification sent to admin', { requestId });
    } catch (sendErr) {
      logger?.error('Failed to send error message to admin', {
        requestId,
        error: sendErr?.message || sendErr,
        stack: sendErr?.stack
      });
    }
  }
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
  // Port defaults to 3006 (can be overridden via config.webhook.requests.port if needed)
  const requestsPort = cfg.webhook?.requests?.port || 3006;
  const requestsPath = cfg.webhook?.requests?.path;
  const seerrPort = requestsPort; // Always use same port as requests
  const seerrPath = cfg.webhook?.seerr?.path || '/seerr';
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
            const requestId = String(seerrData.request.request_id);
            logger?.info('MEDIA_PENDING notification received, sending approval request to admin', {
              requestId,
              subject: seerrData.subject,
              requestedBy: seerrData.request.requestedBy_username,
              mediaType: seerrData.media?.media_type
            });
            
            const adminPhoneNumber = cfg.jellyseerr?.adminDetails?.phoneNumber;
            if (adminPhoneNumber) {
              const adminPhoneChatId = `${adminPhoneNumber}@c.us`;
              const pendingMessage = formatPendingRequestMessage(seerrData);
              
              logger?.debug('Sending pending request notification to admin', {
                requestId,
                adminPhoneNumber,
                messageLength: pendingMessage.length
              });
              
              try {
                // sendMessage handles LID conversion internally
                await sendMessage(wahaClient, cfg, adminPhoneChatId, pendingMessage);
                logger?.info(`✅ Pending request notification sent to admin`, {
                  requestId,
                  adminPhoneNumber,
                  subject: seerrData.subject,
                  requestedBy: seerrData.request.requestedBy_username
                });
              } catch (err) {
                logger?.error('Failed to send pending request notification to admin', {
                  requestId,
                  adminPhoneNumber,
                  error: err?.message || err,
                  stack: err?.stack
                });
              }
            } else {
              logger?.warn('Admin phone number not configured, cannot send pending request notification', {
                requestId,
                subject: seerrData.subject
              });
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
                // sendMessage handles LID conversion internally
                const phoneChatId = `${phoneNumber}@c.us`;
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
                
                // Send notification via WhatsApp (sendMessage handles LID conversion internally)
                try {
                  await sendMessage(wahaClient, cfg, phoneChatId, notificationMessage);
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
          logger?.info('Webhook event received', {
            event: webhookData.event,
            session: webhookData.session || 'unknown',
            hasPayload: !!webhookData.payload
          });
        } else {
          logger?.warn('Webhook data has no event field', {
            keys: Object.keys(webhookData || {}),
            session: webhookData.session || 'unknown'
          });
        }

        // Handle message.reaction events for approval/decline
        if (webhookData.event === 'message.reaction' && webhookData.payload) {
          logger?.debug('Processing message.reaction event', {
            reactor: webhookData.payload?.from,
            messageId: webhookData.payload?.reaction?.messageId
          });
          handleReaction(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
            logger?.error('Error in handleReaction', {
              error: err?.message || err,
              stack: err?.stack
            });
          });
        }
        // Process message events - prefer 'message.any' to avoid duplicates
        // If both 'message' and 'message.any' are configured, they may send the same message
        // We'll process 'message.any' and skip 'message' for the same message ID
        else if (webhookData.event === 'message.any' && webhookData.payload) {
          // Process message asynchronously (don't block response)
          logger?.debug('Processing message.any event', {
            from: webhookData.payload?.from,
            messageId: webhookData.payload?.id,
            hasBody: !!webhookData.payload?.body
          });
          handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
            logger?.error('Error in handleMessage', {
              event: 'message.any',
              error: err?.message || err,
              stack: err?.stack
            });
          });
        } else if (webhookData.event === 'message' && webhookData.payload) {
          // Only process 'message' event if we don't have 'message.any' configured
          // Check if this message ID was already processed (might have come as 'message.any' first)
          const messageId = webhookData.payload?.id;
          if (messageId && !processedMessages.has(messageId)) {
            logger?.debug('Processing message event', {
              from: webhookData.payload?.from,
              messageId,
              hasBody: !!webhookData.payload?.body
            });
            handleMessage(cfg, jellyseerrClient, wahaClient, webhookData).catch((err) => {
              logger?.error('Error in handleMessage', {
                event: 'message',
                error: err?.message || err,
                stack: err?.stack
              });
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
        // Use same port logic as getWebhookUrl (env var > config > default)
        const externalPort = process.env.WEBHOOK_EXTERNAL_PORT 
          ? parseInt(process.env.WEBHOOK_EXTERNAL_PORT, 10)
          : (cfg.webhook?.requests?.port || 3006);
        const seerrWebhookUrl = `${cfg.protocol}://${cfg.host}:${externalPort}${seerrPath}`;
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

