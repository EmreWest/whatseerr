/**
 * Helper functions for webhook handling (shared between server and webhook handlers)
 */

import fs from 'fs';
import { getConfigPath, getUserIdFromEmail, getPhoneNumberFromUserId, isLidFormat, isAdminChatId } from './utils.js';
import { sendMessage, getPhoneNumberByLid, getMessageById } from './waha-client.js';
import { getMediaDetails, approveRequest, declineRequest } from './request.js';
import { getErrorDetails } from './errors/error-formatter.js';
import { getSubscriptionManager } from './subscriptions/subscription-manager.js';

// Constants for media types and status codes
const MEDIA_TYPE_TV = 2;
const STATUS_AVAILABLE = 5;

/**
 * Reads config file and returns parsed JSON
 */
export function readConfigFile(logger) {
  try {
    const configPath = getConfigPath();
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (err) {
    logger?.debug('Could not read config file', getErrorDetails(err, 'readConfigFile'));
    return null;
  }
}

/**
 * Writes config object to file
 */
export function writeConfigFile(config, logger) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return true;
  } catch (err) {
    logger?.warn('Failed to write config file', getErrorDetails(err, 'writeConfigFile'));
    return false;
  }
}

/**
 * Gets emoji for notification type
 */
export function getNotificationEmoji(notificationType) {
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
 */
export function formatNotificationMessage({ notificationType, event, subject, extra = [], availableSeasons = null, isMovie = false }) {
  const emoji = getNotificationEmoji(notificationType || 'TEST_NOTIFICATION');
  const eventText = event || 'Notification';
  let message = `${emoji} ${eventText}\n\n`;
  
  if (subject && subject.trim()) {
    const mediaEmoji = isMovie ? '🎬' : '📺';
    message += `${mediaEmoji} ${subject}\n\n`;
  }
  
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
    
    if (extra && Array.isArray(extra)) {
      const requestedSeasonsEntry = extra.find(e => 
        e && e.name && e.name.toLowerCase() === 'requested seasons'
      );
      if (requestedSeasonsEntry && requestedSeasonsEntry.value) {
        message += `\n📋 Requested: ${requestedSeasonsEntry.value}`;
      }
    }
  } else if (isMovie && notificationType === 'MEDIA_AVAILABLE') {
    message += `🎉 Enjoy your movie!`;
  }
  
  return message;
}

/**
 * Formats a generic Seerr notification message
 */
export function formatGenericNotification(seerrData) {
  const isMovie = seerrData.media?.media_type === 'movie';
  return formatNotificationMessage({
    notificationType: seerrData.notification_type || 'TEST_NOTIFICATION',
    event: seerrData.event || 'Notification',
    subject: seerrData.subject || '',
    extra: seerrData.extra || [],
    availableSeasons: null,
    isMovie: isMovie
  });
}

/**
 * Formats a pending request message for admin approval
 */
export function formatPendingRequestMessage(seerrData) {
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
 */
export function parseApprovalMessage(messageBody) {
  if (!messageBody || typeof messageBody !== 'string') {
    return null;
  }
  
  if (!messageBody.includes('⏳ Pending Request Approval')) {
    return null;
  }
  
  const requestIdMatch = messageBody.match(/🆔 Request ID:\s*(\d+)/);
  if (!requestIdMatch || !requestIdMatch[1]) {
    return null;
  }
  
  const requestId = requestIdMatch[1];
  const subjectMatch = messageBody.match(/(?:🎬|📺)\s+(.+?)(?:\n|$)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : null;
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
 */
export async function handleReaction(cfg, jellyseerrClient, wahaClient, webhookData) {
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
  
  if (!reactionText || reactionText.trim() === '') {
    logger?.debug('Reaction removed, ignoring', { messageId });
    return;
  }
  
  const messageIdParts = messageId.split('_');
  if (messageIdParts.length < 3) {
    logger?.warn('Invalid messageId format, cannot extract chatId', { messageId });
    return;
  }
  
  const chatId = messageIdParts[1];
  logger?.debug('Extracted chatId from messageId', { messageId, chatId });
  
  const message = await getMessageById(wahaClient, cfg, chatId, messageId);
  if (!message || !message.body) {
    logger?.warn('Could not fetch message or message has no body', { messageId, chatId });
    return;
  }
  
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
      ...getErrorDetails(err, `${isApprove ? 'approve' : 'decline'}Request`),
      requestId,
      method: 'emoji',
      reactionEmoji: reactionText
    });
    
    try {
      const errorMsg = err?.message || `Failed to ${isApprove ? 'approve' : 'decline'} request ${requestId}`;
      await sendMessage(wahaClient, cfg, reactorChatId, `❌ Error: ${errorMsg}`);
      logger?.debug('Error notification sent to admin', { requestId });
    } catch (sendErr) {
      logger?.error('Failed to send error message to admin', {
        ...getErrorDetails(sendErr, 'sendErrorMessage'),
        requestId
      });
    }
  }
}

/**
 * Handles Seerr webhook notifications
 */
export async function handleSeerrWebhook(cfg, jellyseerrClient, wahaClient, seerrData, logger) {
  logger?.info('📋 Seerr notification data:', JSON.stringify(seerrData, null, 2));
  logger?.debug('Seerr notification type:', seerrData.notification_type);
  logger?.debug('Seerr event:', seerrData.event);
  logger?.debug('Seerr subject:', seerrData.subject);

  // Handle MEDIA_PENDING notifications - send to admin for approval
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
        await sendMessage(wahaClient, cfg, adminPhoneChatId, pendingMessage);
        logger?.info(`✅ Pending request notification sent to admin`, {
          requestId,
          adminPhoneNumber,
          subject: seerrData.subject,
          requestedBy: seerrData.request.requestedBy_username
        });
      } catch (err) {
        logger?.error('Failed to send pending request notification to admin', {
          ...getErrorDetails(err, 'sendPendingNotification'),
          requestId,
          adminPhoneNumber
        });
      }
    } else {
      logger?.warn('Admin phone number not configured, cannot send pending request notification', {
        requestId,
        subject: seerrData.subject
      });
    }
  }

  // Extract email from notification data
  const email = seerrData.notifyuser?.email 
    || seerrData.request?.requestedBy_email 
    || seerrData.issue?.reportedBy_email 
    || seerrData.comment?.commentedBy_email;
  const skipRequesterNotification = seerrData.notification_type === 'MEDIA_PENDING';
  
  if (email && !skipRequesterNotification) {
    logger?.info(`📧 Looking up user ID for email: ${email}`);
    
    const fileConfig = readConfigFile(logger);
    const wasInFile = fileConfig?.emailMappings?.[email] !== undefined;
    
    const userId = await getUserIdFromEmail(cfg, jellyseerrClient, email);
    
    if (userId) {
      if (!wasInFile) {
        const config = readConfigFile(logger);
        if (config) {
          if (!config.emailMappings) {
            config.emailMappings = {};
          }
          config.emailMappings[email] = userId;
          
          if (writeConfigFile(config, logger)) {
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
      
      const phoneNumber = getPhoneNumberFromUserId(cfg, userId);
      
      if (phoneNumber) {
        const phoneChatId = `${phoneNumber}@c.us`;
        let notificationMessage = '';
        
        const isMovie = seerrData.media?.media_type === 'movie';
        
        // Special handling for MEDIA_AVAILABLE notifications
        if (seerrData.notification_type === 'MEDIA_AVAILABLE' && seerrData.media?.tmdbId && seerrData.media?.media_type) {
          let availableSeasons = null;
          
          try {
            if (!isMovie && seerrData.media?.tmdbId) {
              const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, seerrData.media?.tmdbId, MEDIA_TYPE_TV);
              
              if (mediaDetails?.seasons && Array.isArray(mediaDetails.seasons)) {
                availableSeasons = mediaDetails.seasons
                  .filter(s => {
                    const seasonNum = s.seasonNumber || s.season_number || 0;
                    if (seasonNum === 0) return false;
                    
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
            logger?.warn('Failed to fetch media details for MEDIA_AVAILABLE notification', 
              getErrorDetails(err, 'fetchMediaDetailsForNotification'));
          }
          
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
          notificationMessage = formatGenericNotification(seerrData);
        }
        
        try {
          await sendMessage(wahaClient, cfg, phoneChatId, notificationMessage);
          logger?.info(`✅ Notification sent to ${phoneNumber} (userId: ${userId})`);
        } catch (err) {
          logger?.error('Failed to send WhatsApp notification', 
            getErrorDetails(err, 'sendWhatsAppNotification'));
        }
        
        // Notify subscribers for MEDIA_AVAILABLE notifications
        if (seerrData.notification_type === 'MEDIA_AVAILABLE' && seerrData.media?.tmdbId && seerrData.media?.media_type) {
          try {
            const subscriptionManager = getSubscriptionManager();
            const mediaId = parseInt(seerrData.media.tmdbId, 10);
            const mediaType = isMovie ? 'movie' : 'tv';
            
            if (!isNaN(mediaId)) {
              // Check which quality is available and notify appropriate subscribers
              const statusStandard = seerrData.media?.status;
              const status4k = seerrData.media?.status4k;
              
              // Status can be string ("AVAILABLE") or number (5)
              const isStandardAvailable = statusStandard === 'AVAILABLE' || statusStandard === 5;
              const is4kAvailable = status4k === 'AVAILABLE' || status4k === 5;
              
              // Get subscribers for both qualities
              const standardSubscribers = isStandardAvailable 
                ? subscriptionManager.getSubscribers(mediaId, mediaType, false)
                : [];
              const subscribers4k = is4kAvailable 
                ? subscriptionManager.getSubscribers(mediaId, mediaType, true)
                : [];
              
              // Combine and deduplicate subscribers, excluding the original requester
              const allSubscriberChatIds = [...new Set([...standardSubscribers, ...subscribers4k])]
                .filter(chatId => chatId !== phoneChatId);
              
              if (allSubscriberChatIds.length > 0) {
                logger?.info(`Notifying ${allSubscriberChatIds.length} subscribers for media availability`, {
                  mediaId,
                  mediaType,
                  standardAvailable: isStandardAvailable,
                  fourKAvailable: is4kAvailable,
                  subscriberCount: allSubscriberChatIds.length
                });
                
                // Send notification to all subscribers
                for (const subscriberChatId of allSubscriberChatIds) {
                  try {
                    await sendMessage(wahaClient, cfg, subscriberChatId, notificationMessage);
                    logger?.debug('Notification sent to subscriber', { subscriberChatId });
                  } catch (err) {
                    logger?.warn('Failed to send notification to subscriber', {
                      ...getErrorDetails(err, 'sendSubscriberNotification'),
                      subscriberChatId
                    });
                  }
                }
              }
            }
          } catch (err) {
            logger?.warn('Failed to notify subscribers', {
              ...getErrorDetails(err, 'notifySubscribers')
            });
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
    
    // Even if there's no original requester email, we should still notify subscribers
    // This handles cases where the notification doesn't have an email but media is available
    if (seerrData.notification_type === 'MEDIA_AVAILABLE' && seerrData.media?.tmdbId && seerrData.media?.media_type) {
      try {
        const subscriptionManager = getSubscriptionManager();
        const mediaId = parseInt(seerrData.media.tmdbId, 10);
        const isMovie = seerrData.media?.media_type === 'movie';
        const mediaType = isMovie ? 'movie' : 'tv';
        
        if (!isNaN(mediaId)) {
          // Check which quality is available
          const statusStandard = seerrData.media?.status;
          const status4k = seerrData.media?.status4k;
          
          const isStandardAvailable = statusStandard === 'AVAILABLE' || statusStandard === 5;
          const is4kAvailable = status4k === 'AVAILABLE' || status4k === 5;
          
          // Get subscribers for both qualities
          const standardSubscribers = isStandardAvailable 
            ? subscriptionManager.getSubscribers(mediaId, mediaType, false)
            : [];
          const subscribers4k = is4kAvailable 
            ? subscriptionManager.getSubscribers(mediaId, mediaType, true)
            : [];
          
          // Combine and deduplicate subscribers
          const allSubscriberChatIds = [...new Set([...standardSubscribers, ...subscribers4k])];
          
          if (allSubscriberChatIds.length > 0) {
            // Format notification message for subscribers
            let availableSeasons = null;
            
            try {
              if (!isMovie && seerrData.media?.tmdbId) {
                const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, seerrData.media?.tmdbId, MEDIA_TYPE_TV);
                
                if (mediaDetails?.seasons && Array.isArray(mediaDetails.seasons)) {
                  availableSeasons = mediaDetails.seasons
                    .filter(s => {
                      const seasonNum = s.seasonNumber || s.season_number || 0;
                      if (seasonNum === 0) return false;
                      
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
              logger?.warn('Failed to fetch media details for subscriber notification', 
                getErrorDetails(err, 'fetchMediaDetailsForSubscribers'));
            }
            
            const notificationMessage = formatNotificationMessage({
              notificationType: seerrData.notification_type,
              event: seerrData.event || 'Media Available',
              subject: seerrData.subject || 'Unknown',
              extra: seerrData.extra || [],
              availableSeasons: availableSeasons,
              isMovie: isMovie
            });
            
            logger?.info(`Notifying ${allSubscriberChatIds.length} subscribers (no original requester)`, {
              mediaId,
              mediaType,
              standardAvailable: isStandardAvailable,
              fourKAvailable: is4kAvailable,
              subscriberCount: allSubscriberChatIds.length
            });
            
            // Send notification to all subscribers
            for (const subscriberChatId of allSubscriberChatIds) {
              try {
                await sendMessage(wahaClient, cfg, subscriberChatId, notificationMessage);
                logger?.debug('Notification sent to subscriber', { subscriberChatId });
              } catch (err) {
                logger?.warn('Failed to send notification to subscriber', {
                  ...getErrorDetails(err, 'sendSubscriberNotification'),
                  subscriberChatId
                });
              }
            }
          }
        }
      } catch (err) {
        logger?.warn('Failed to notify subscribers (no original requester)', {
          ...getErrorDetails(err, 'notifySubscribersNoRequester')
        });
      }
    }
  }
}

