/**
 * Helper functions for webhook handling (shared between server and webhook handlers)
 * 
 * GUIDELINE: Always use LID format for all operations
 * ====================================================
 * - Phone numbers (@c.us format) should ONLY be used for mapping lookups (getPhoneNumberFromUserId)
 * - All operations (sendMessage, getMessageById, isAdminChatId, etc.) MUST use LID format (@lid)
 * - Convert phone numbers to LID format immediately after lookup using ensureLidFormatForMessaging()
 * - Store and pass LID format chatIds throughout the codebase
 * - This ensures consistency and prevents duplicate notifications
 */

import fs from 'fs';
import { getConfigPath, getUserIdFromEmail, getPhoneNumberFromUserId, isLidFormat, isAdminChatId, getLidFromPhoneNumber, isPhoneNumberConfigured } from './utils.js';
import { sendMessage, getMessageById, ensureLidFormatForMessaging } from './waha-client.js';
import { getMediaDetails, approveRequest, declineRequest } from './request.js';
import { getErrorDetails } from './errors/error-formatter.js';
import { getSubscriptionManager } from './subscriptions/subscription-manager.js';
import { MEDIA_TYPE_TV, STATUS_AVAILABLE } from './constants.js';

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
  
  // Trim trailing whitespace/newlines to avoid empty space at the end
  return message.trimEnd();
}

/**
 * Formats a generic Seerr notification message
 */
export function formatGenericNotification(seerrData) {
  const { isMovie } = getMediaTypeAndEmoji(seerrData);
  return formatNotificationMessage({
    notificationType: seerrData.notification_type || 'TEST_NOTIFICATION',
    event: seerrData.event || 'Notification',
    subject: getSubject(seerrData),
    extra: seerrData.extra || [],
    availableSeasons: null,
    isMovie: isMovie
  });
}

/**
 * Fetches available seasons for TV shows from media details
 * Checks both standard and 4K status to show all available seasons
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} cfg - Configuration
 * @param {number} mediaId - Media ID
 * @param {Object} logger - Logger instance
 * @returns {Promise<number[]|null>} Array of available season numbers or null
 */
async function getAvailableSeasons(jellyseerrClient, cfg, mediaId, logger) {
  try {
    const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, mediaId, MEDIA_TYPE_TV, logger);
    const mediaInfo = mediaDetails?.mediaInfo || mediaDetails;
    
    // Check mediaInfo.seasons for status (has status and status4k fields)
    const mediaSeasons = mediaInfo?.seasons || mediaInfo?.Seasons;
    if (!mediaSeasons || !Array.isArray(mediaSeasons)) {
      return null;
    }
    
    // Get seasons that are available in either standard or 4K quality
    const availableSeasonNumbers = new Set();
    
    for (const season of mediaSeasons) {
      const seasonNum = season.seasonNumber || season.season_number || 0;
      if (seasonNum === 0) continue;
      
      // Check if available in standard OR 4K
      const standardStatus = typeof season.status === 'string' ? parseInt(season.status, 10) : (season.status || 0);
      const status4k = typeof season.status4k === 'string' ? parseInt(season.status4k, 10) : (season.status4k || 0);
      
      if (standardStatus === STATUS_AVAILABLE || status4k === STATUS_AVAILABLE) {
        availableSeasonNumbers.add(seasonNum);
      }
    }
    
    return availableSeasonNumbers.size > 0 
      ? Array.from(availableSeasonNumbers).sort((a, b) => a - b)
      : null;
  } catch (err) {
    logger?.warn('Failed to fetch media details for available seasons', 
      getErrorDetails(err, 'getAvailableSeasons'));
    return null;
  }
}

/**
 * Formats notification message for MEDIA_AVAILABLE with available seasons if needed
 * @param {Object} seerrData - Seerr webhook data
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} cfg - Configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Formatted notification message
 */
async function formatAvailableNotificationMessage(seerrData, jellyseerrClient, cfg, logger) {
  const { isMovie } = getMediaTypeAndEmoji(seerrData);
  const subject = getSubject(seerrData);
  const availableSeasons = (!isMovie && seerrData.media?.tmdbId)
    ? await getAvailableSeasons(jellyseerrClient, cfg, seerrData.media.tmdbId, logger)
    : null;

  return formatNotificationMessage({
    notificationType: seerrData.notification_type,
    event: seerrData.event || 'Media Available',
    subject,
    extra: seerrData.extra || [],
    availableSeasons,
    isMovie
  });
}

/**
 * Removes subscriptions for a subscriber (helper function)
 */
function removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable, standardSubscribers, subscribers4k) {
  if (isStandardAvailable && standardSubscribers.includes(subscriberChatId)) {
    subscriptionManager.removeSubscription(mediaId, mediaType, false, subscriberChatId);
  }
  if (is4kAvailable && subscribers4k.includes(subscriberChatId)) {
    subscriptionManager.removeSubscription(mediaId, mediaType, true, subscriberChatId);
  }
}

/**
 * Notifies subscribers and removes their subscriptions when media becomes available
 * @param {Object} cfg - Configuration
 * @param {Object} wahaClient - WAHA API client
 * @param {Object} seerrData - Seerr webhook data
 * @param {Object} logger - Logger instance
 * @param {string} notificationMessage - Pre-formatted notification message
 * @param {string|null} excludeChatId - Chat ID to exclude from subscribers (e.g., original requester)
 * @returns {Promise<void>}
 */
async function notifySubscribersAndCleanup(cfg, wahaClient, seerrData, logger, notificationMessage, excludeChatId = null) {
  if (!isMediaAvailableNotification(seerrData)) {
    return;
  }

  try {
    const subscriptionManager = getSubscriptionManager();
    const mediaId = parseInt(seerrData.media.tmdbId, 10);
    const isMovie = seerrData.media?.media_type === 'movie';
    const mediaType = isMovie ? 'movie' : 'tv';
    
    if (isNaN(mediaId)) {
      return;
    }

    const statusStandard = seerrData.media?.status;
    const status4k = seerrData.media?.status4k;
    const isStandardAvailable = isStatusAvailable(statusStandard);
    const is4kAvailable = isStatusAvailable(status4k);

    const standardSubscribers = isStandardAvailable 
      ? subscriptionManager.getSubscribers(mediaId, mediaType, false)
      : [];
    const subscribers4k = is4kAvailable 
      ? subscriptionManager.getSubscribers(mediaId, mediaType, true)
      : [];

    let allSubscriberChatIds = [...new Set([...standardSubscribers, ...subscribers4k])];
    if (excludeChatId) {
      // GUIDELINE: excludeChatId should already be in LID format (per "always use LID" principle)
      // But handle edge case where it might not be (defensive programming)
      let excludeLid = excludeChatId;
      if (!excludeChatId.endsWith('@lid')) {
        // If somehow phone number format slipped through, convert it
        if (excludeChatId.endsWith('@c.us')) {
          const lidFromMapping = getLidFromPhoneNumber(cfg, excludeChatId);
          if (lidFromMapping) {
            excludeLid = lidFromMapping;
            logger?.warn('excludeChatId was in phone number format, converted to LID', { 
              original: excludeChatId,
              converted: excludeLid
            });
          } else {
            logger?.warn('Could not resolve phone number to LID for exclusion, may result in duplicate notification', { 
              excludeChatId,
              subscriberCount: allSubscriberChatIds.length
            });
          }
        }
      }
      
      allSubscriberChatIds = allSubscriberChatIds.filter(chatId => chatId !== excludeLid);
    }

    if (allSubscriberChatIds.length === 0) {
      return;
    }

    logger?.info(`📬 Notifying ${allSubscriberChatIds.length} subscriber${allSubscriberChatIds.length !== 1 ? 's' : ''} that media is available`);

    // GUIDELINE: subscriberChatId is already in LID format (from subscriptions)
    for (const subscriberChatId of allSubscriberChatIds) {
      // Check if phone number is configured - only send to configured users
      const isConfigured = await isPhoneNumberConfigured(cfg, subscriberChatId, wahaClient);
      if (!isConfigured) {
        logger?.info('⏭️ Skipping notification to non-configured subscriber');
        // Remove subscription for non-configured users (they won't receive notifications)
        removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable, standardSubscribers, subscribers4k);
        continue;
      }

      try {
        await sendMessage(wahaClient, cfg, subscriberChatId, notificationMessage);
        logger?.debug('Notification sent to subscriber', { subscriberChatId });
        // Remove subscription after notifying (media is now available)
        removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable, standardSubscribers, subscribers4k);
      } catch (err) {
        logger?.warn('Failed to send notification to subscriber', {
          ...getErrorDetails(err, 'sendSubscriberNotification'),
          subscriberChatId
        });
      }
    }

    logger?.info(`🧹 Cleaned up ${allSubscriberChatIds.length} subscription${allSubscriberChatIds.length !== 1 ? 's' : ''} after notifying`);
  } catch (err) {
    logger?.warn('Failed to notify subscribers', {
      ...getErrorDetails(err, 'notifySubscribersAndCleanup')
    });
  }
}

/**
 * Gets media type and emoji from seerrData
 */
function getMediaTypeAndEmoji(seerrData) {
  const isMovie = seerrData.media?.media_type === 'movie';
  return {
    mediaType: isMovie ? 'Movie' : 'TV Show',
    mediaEmoji: isMovie ? '🎬' : '📺',
    isMovie
  };
}

/**
 * Gets requested seasons from extra data
 */
function getRequestedSeasons(seerrData) {
  if (seerrData.media?.media_type === 'movie' || !seerrData.extra || !Array.isArray(seerrData.extra)) {
    return null;
  }
  const requestedSeasons = seerrData.extra.find(e => e && e.name && e.name.toLowerCase() === 'requested seasons');
  return requestedSeasons?.value || null;
}

/**
 * Converts phone number to LID format with error handling
 * @param {Object} wahaClient - WAHA API client
 * @param {Object} cfg - Configuration
 * @param {string} phoneNumber - Phone number (without @c.us suffix, will be added automatically)
 * @param {Object} logger - Logger instance
 * @param {string} context - Context for error messages
 * @returns {Promise<string|null>} LID chat ID or null if conversion fails
 */
async function convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, context = 'notification') {
  const phoneChatId = `${phoneNumber}@c.us`;
  try {
    return await ensureLidFormatForMessaging(wahaClient, cfg, phoneChatId);
  } catch (err) {
    logger?.error(`Failed to convert phone number to LID format for ${context}`, {
      ...getErrorDetails(err, 'ensureLidFormatForMessaging'),
      phoneNumber,
      context
    });
    return null;
  }
}

/**
 * Checks if status indicates availability (handles both string and numeric status)
 * @param {string|number} status - Status value
 * @returns {boolean} True if status indicates availability
 */
function isStatusAvailable(status) {
  return status === 'AVAILABLE' || status === STATUS_AVAILABLE;
}

/**
 * Initializes config mappings structure if needed
 * @param {Object} config - Config object
 */
function ensureConfigMappings(config) {
  if (!config.mappings) {
    config.mappings = {};
  }
  if (!config.mappings.emailMappings) {
    config.mappings.emailMappings = {};
  }
}

/**
 * Gets safe subject from seerrData with fallback
 * @param {Object} seerrData - Seerr webhook data
 * @returns {string} Subject or 'Unknown'
 */
function getSubject(seerrData) {
  return seerrData.subject || 'Unknown';
}

/**
 * Checks if notification is MEDIA_AVAILABLE with valid media data
 * @param {Object} seerrData - Seerr webhook data
 * @returns {boolean} True if valid MEDIA_AVAILABLE notification
 */
function isMediaAvailableNotification(seerrData) {
  return seerrData.notification_type === 'MEDIA_AVAILABLE' &&
    seerrData.media?.tmdbId &&
    seerrData.media?.media_type;
}

/**
 * Extracts email from notification data
 * @param {Object} seerrData - Seerr webhook data
 * @returns {string|null} Email address or null
 */
function extractEmail(seerrData) {
  return seerrData.notifyuser?.email ||
    seerrData.request?.requestedBy_email ||
    seerrData.issue?.reportedBy_email ||
    seerrData.comment?.commentedBy_email ||
    null;
}

/**
 * Saves email mapping to config if not already present
 * @param {Object} cfg - Configuration object
 * @param {string} email - Email address
 * @param {number} userId - User ID
 * @param {Object} logger - Logger instance
 */
function saveEmailMappingIfNeeded(cfg, email, userId, logger) {
  const config = readConfigFile(logger);
  const emailMappings = config?.mappings?.emailMappings || {};
  const wasInFile = emailMappings[email] !== undefined;

  if (!wasInFile && config) {
    ensureConfigMappings(config);
    config.mappings.emailMappings[email] = userId;

    if (writeConfigFile(config, logger)) {
      if (!cfg.mappings) cfg.mappings = {};
      cfg.mappings.emailMappings = config.mappings.emailMappings;
      logger?.info(`💾 Saved email mapping: ${email} → user ${userId}`);
    } else {
      logger?.info(`⚠️ Manually add to config.json: "mappings": { "emailMappings": { "${email}": ${userId} } }`);
    }
  } else if (wasInFile) {
    logger?.debug(`Email mapping exists: "${email}": ${userId}`);
  } else if (!config) {
    logger?.warn('Failed to read config file for email mapping update');
    logger?.info(`⚠️ Manually add to config.json: "mappings": { "emailMappings": { "${email}": ${userId} } }`);
  }
}

/**
 * Formats notification message for user based on notification type
 * @param {Object} seerrData - Seerr webhook data
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} cfg - Configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Formatted notification message
 */
async function formatUserNotificationMessage(seerrData, jellyseerrClient, cfg, logger) {
  if (isMediaAvailableNotification(seerrData)) {
    return await formatAvailableNotificationMessage(seerrData, jellyseerrClient, cfg, logger);
  }
  
  const notificationType = seerrData.notification_type;
  
  const formatters = {
    'MEDIA_PENDING': formatPendingRequestMessageForUser,
    'MEDIA_FAILED': formatFailedMessageForUser,
    'ISSUE_CREATED': formatIssueCreatedMessageForUser
  };
  
  const formatter = formatters[notificationType];
  return formatter ? formatter(seerrData) : formatGenericNotification(seerrData);
}

/**
 * Formats a pending request message for admin (with action buttons)
 */
export function formatPendingRequestMessageForAdmin(seerrData) {
  const { mediaType, mediaEmoji } = getMediaTypeAndEmoji(seerrData);
  const subject = getSubject(seerrData);
  const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
  const requestId = String(seerrData.request?.request_id || '');
  
  if (!requestId) {
    return `⏳ Pending Request Approval\n\n❌ Error: Request ID not found`.trimEnd();
  }
  
  let message = `⏳ Pending Request Approval\n\n`;
  message += `${mediaEmoji} ${subject}\n`;
  message += `👤 Requested by: ${requestedBy}\n`;
  message += `📋 Type: ${mediaType}\n`;
  
  const requestedSeasons = getRequestedSeasons(seerrData);
  if (requestedSeasons) {
    message += `📺 Seasons: ${requestedSeasons}\n`;
  }
  
  message += `\n🆔 Request ID: ${requestId}\n\n`;
  message += `✅ React with ✅ or reply "approve ${requestId}" to approve\n`;
  message += `🚫 React with ❌ or reply "decline ${requestId}" to decline\n`;
  message += `0️⃣ Reply "0" to cancel\n`;
  
  return message.trimEnd();
}

/**
 * Formats a pending request message for user (confirmation message)
 */
export function formatPendingRequestMessageForUser(seerrData) {
  const { mediaType, mediaEmoji } = getMediaTypeAndEmoji(seerrData);
  const subject = getSubject(seerrData);
  
  let message = `⏳ Request Submitted\n\n`;
  message += `${mediaEmoji} ${subject}\n`;
  message += `📋 Type: ${mediaType}\n`;
  
  const requestedSeasons = getRequestedSeasons(seerrData);
  if (requestedSeasons) {
    message += `📺 Seasons: ${requestedSeasons}\n`;
  }
  
  message += `\nYour request is pending approval. You'll be notified once it's reviewed.`;
  
  return message.trimEnd();
}

/**
 * Formats a failed request message for admin (with technical details)
 */
export function formatFailedMessageForAdmin(seerrData) {
  const { mediaType, mediaEmoji } = getMediaTypeAndEmoji(seerrData);
  const subject = getSubject(seerrData);
  const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
  
  let message = `❌ Request Processing Failed (Admin Alert)\n\n`;
  message += `${mediaEmoji} ${subject}\n`;
  message += `📋 Type: ${mediaType}\n`;
  message += `👤 Requested by: ${requestedBy}\n\n`;
  message += `Failed to add to ${mediaType === 'Movie' ? 'Radarr' : 'Sonarr'}. `;
  message += `Please check system logs and configuration.`;
  
  if (seerrData.message) {
    message += `\n\nError: ${seerrData.message}`;
  }
  
  return message.trimEnd();
}

/**
 * Formats a failed request message for user (user-friendly message)
 */
export function formatFailedMessageForUser(seerrData) {
  const { mediaType, mediaEmoji } = getMediaTypeAndEmoji(seerrData);
  const subject = getSubject(seerrData);
  
  let message = `❌ Request Processing Failed\n\n`;
  message += `${mediaEmoji} ${subject}\n`;
  message += `📋 Type: ${mediaType}\n\n`;
  message += `Unfortunately, your request could not be processed at this time. `;
  message += `The administrator has been notified and will investigate.`;
  
  return message.trimEnd();
}

/**
 * Formats an issue created message for admin (with actionable details)
 */
export function formatIssueCreatedMessageForAdmin(seerrData) {
  const subject = getSubject(seerrData);
  const reportedBy = seerrData.issue?.reportedBy_username || 'Unknown User';
  const issueId = seerrData.issue?.issue_id || seerrData.issue?.id || '';
  
  let message = `🚨 New Issue Reported\n\n`;
  message += `📺 ${subject}\n`;
  message += `👤 Reported by: ${reportedBy}\n`;
  if (issueId) {
    message += `🆔 Issue ID: ${issueId}\n`;
  }
  message += `\nPlease review and resolve the issue.`;
  
  return message.trimEnd();
}

/**
 * Formats an issue created message for user (confirmation message)
 */
export function formatIssueCreatedMessageForUser(seerrData) {
  const subject = getSubject(seerrData);
  
  let message = `✅ Issue Reported\n\n`;
  message += `📺 ${subject}\n\n`;
  message += `Your issue has been reported successfully. `;
  message += `An administrator will review it and get back to you soon.`;
  
  return message.trimEnd();
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
  
  // GUIDELINE: Extract chatId from messageId and convert to LID format immediately
  const chatIdFromMessage = messageIdParts[1];
  logger?.debug('Extracted chatId from messageId', { messageId, chatIdFromMessage });
  
  let chatIdLid;
  try {
    chatIdLid = await ensureLidFormatForMessaging(wahaClient, cfg, chatIdFromMessage);
  } catch (err) {
    logger?.error('Failed to convert chatId from messageId to LID format', {
      ...getErrorDetails(err, 'ensureLidFormatForMessaging'),
      chatIdFromMessage,
      messageId
    });
    return;
  }
  
  const message = await getMessageById(wahaClient, cfg, chatIdLid, messageId);
  if (!message || !message.body) {
    logger?.warn('Could not fetch message or message has no body', { messageId, chatIdLid });
    return;
  }
  
  const approvalInfo = parseApprovalMessage(message.body);
  if (!approvalInfo || !approvalInfo.requestId) {
    logger?.debug('Reaction not for approval message, ignoring', { messageId });
    return;
  }
  
  const reactSubject = approvalInfo.subject || 'Unknown';
  logger?.info(`👤 Admin reacted ${reactionText} to request #${approvalInfo.requestId}${reactSubject !== 'Unknown' ? `: "${reactSubject}"` : ''}`);
  
  // GUIDELINE: Convert reactorChatId to LID format immediately (payload.from may be phone format)
  const reactorChatIdRaw = payload.from;
  let reactorChatId;
  try {
    reactorChatId = await ensureLidFormatForMessaging(wahaClient, cfg, reactorChatIdRaw);
  } catch (err) {
    logger?.error('Failed to convert reactorChatId to LID format', {
      ...getErrorDetails(err, 'ensureLidFormatForMessaging'),
      reactorChatIdRaw
    });
    return;
  }

  // Check if phone number is configured - ignore reactions from non-configured numbers
  const isConfigured = await isPhoneNumberConfigured(cfg, reactorChatId, wahaClient);
  if (!isConfigured) {
    logger?.info(`⏭️ Ignoring reaction ${reactionText} from non-configured user`);
    return;
  }
  
  const isAdminReaction = await isAdminChatId(cfg, reactorChatId, wahaClient, logger);
  
  logger?.debug('Validating admin access for reaction', {
    reactorChatId,
    isAdminReaction,
    isLidFormat: isLidFormat(reactorChatId)
  });
  
  const requestId = approvalInfo.requestId;
  
  if (!isAdminReaction) {
    logger?.warn('Non-admin user attempted to react to approval message', {
      messageId,
      reactorChatId,
      requestId,
      reactionText
    });
    return;
  }
  
  logger?.info(`✅ Admin validated - processing ${reactionText} reaction for request #${requestId}`);
  
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
  logger?.info(`👤 Admin ${isApprove ? 'approved' : 'declined'} request #${requestId} via ${reactionText} reaction`);
  
  try {
    if (isApprove) {
      await approveRequest(jellyseerrClient, cfg, requestId, logger);
      const approveSubject = approvalInfo.subject || 'Unknown';
      const approveRequester = approvalInfo.requestedBy || 'Unknown';
      logger?.info(`✅ Request #${requestId} approved${approveSubject !== 'Unknown' || approveRequester !== 'Unknown' ? `: "${approveSubject}"${approveRequester !== 'Unknown' ? ` (requested by ${approveRequester})` : ''}` : ''}`);
      // Confirmation will be sent via Seerr webhook notification
    } else {
      await declineRequest(jellyseerrClient, cfg, requestId, logger);
      const declineSubject = approvalInfo.subject || 'Unknown';
      const declineRequester = approvalInfo.requestedBy || 'Unknown';
      logger?.info(`🚫 Request #${requestId} declined${declineSubject !== 'Unknown' || declineRequester !== 'Unknown' ? `: "${declineSubject}"${declineRequester !== 'Unknown' ? ` (requested by ${declineRequester})` : ''}` : ''}`);
      // Confirmation will be sent via Seerr webhook notification
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
  const notificationType = seerrData.notification_type;
  const subject = seerrData.subject || 'Unknown';
  logger?.info(`📋 Notification: ${seerrData.event || notificationType}${subject !== 'Unknown' ? ` - "${subject}"` : ''}`);

  // Helper function to send notification to admin
  async function sendNotificationToAdmin(notificationType, messageFormatter, seerrData, logger) {
    const adminPhoneNumber = cfg.system?.admin?.phoneNumber;
    if (!adminPhoneNumber) {
      logger?.warn(`Admin phone number not configured, cannot send ${notificationType} notification to admin`, {
        subject: seerrData.subject
      });
      return;
    }

    const adminLidChatId = await convertPhoneToLid(wahaClient, cfg, adminPhoneNumber, logger, 'admin notification');
    if (!adminLidChatId) {
      return;
    }

    const adminMessage = messageFormatter(seerrData);

    try {
      await sendMessage(wahaClient, cfg, adminLidChatId, adminMessage);
      const adminSubject = seerrData.subject || 'Unknown';
      logger?.info(`📤 Sent notification to admin${adminSubject !== 'Unknown' ? `: "${adminSubject}"` : ''}`);
    } catch (err) {
      logger?.error(`Failed to send ${notificationType} notification to admin`, {
        ...getErrorDetails(err, 'sendAdminNotification'),
        notificationType,
        adminPhoneNumber,
        adminLidChatId
      });
    }
  }

  // Admin notification configuration
  // Action-required types use special admin formatters, others use generic
  const adminNotificationTypes = {
    'MEDIA_PENDING': { formatter: formatPendingRequestMessageForAdmin, requiresRequestId: true },
    'MEDIA_FAILED': { formatter: formatFailedMessageForAdmin, requiresRequestId: false },
    'ISSUE_CREATED': { formatter: formatIssueCreatedMessageForAdmin, requiresRequestId: false }
  };

  const adminNotificationConfig = adminNotificationTypes[notificationType];
  const adminFormatter = adminNotificationConfig
    ? adminNotificationConfig.formatter
    : formatGenericNotification;
  const isTestNotification = notificationType === 'TEST_NOTIFICATION';
  const shouldNotifyAdmin = isTestNotification ||
    !adminNotificationConfig ||
    (!adminNotificationConfig.requiresRequestId || seerrData.request?.request_id);

  if (shouldNotifyAdmin) {
    await sendNotificationToAdmin(notificationType, adminFormatter, seerrData, logger);
  }

  const email = isTestNotification ? null : extractEmail(seerrData);
  let requesterLidChatId = null;
  let subscribersNotified = false;

  if (email) {
    logger?.info(`📧 Looking up user...`);

    const userId = await getUserIdFromEmail(cfg, jellyseerrClient, email);

    if (userId) {
      saveEmailMappingIfNeeded(cfg, email, userId, logger);

      const phoneNumber = getPhoneNumberFromUserId(cfg, userId);
      
      if (phoneNumber) {
        const lidChatId = await convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, 'user notification');
        
        if (lidChatId) {
          // Check if phone number is configured - only send to configured users
          const isConfigured = await isPhoneNumberConfigured(cfg, lidChatId, wahaClient);
          if (!isConfigured) {
        logger?.info('⏭️ Skipping notification - user not configured');
            // Store LID for subscriber exclusion even if not configured
            requesterLidChatId = lidChatId;
            return;
          }

          // Skip user notification if recipient is admin (admin already received notification)
          const isAdmin = await isAdminChatId(cfg, lidChatId, wahaClient, logger);
          if (isAdmin) {
            logger?.debug('Skipping user notification - recipient is admin (already notified)', {
              phoneNumber,
              lidChatId,
              notificationType
            });
            requesterLidChatId = lidChatId;
            return;
          }

          const notificationMessage = await formatUserNotificationMessage(seerrData, jellyseerrClient, cfg, logger);

          try {
            await sendMessage(wahaClient, cfg, lidChatId, notificationMessage);
            const userSubject = seerrData.subject || 'Unknown';
            logger?.info(`📤 Sent notification to user${userSubject !== 'Unknown' ? `: "${userSubject}"` : ''}`);
          } catch (err) {
            logger?.error('Failed to send WhatsApp notification', getErrorDetails(err, 'sendWhatsAppNotification'));
          }

          requesterLidChatId = lidChatId;

          if (isMediaAvailableNotification(seerrData)) {
            await notifySubscribersAndCleanup(cfg, wahaClient, seerrData, logger, notificationMessage, lidChatId);
            subscribersNotified = true;
          }
        }
      } else {
        logger?.info(`⏭️ No phone number found - notification skipped`);
      }
    } else {
      logger?.info(`⏭️ User not found - notification skipped`);
    }
  } else {
    logger?.debug('No email found in Seerr notification data');
  }
  
  if (!subscribersNotified && isMediaAvailableNotification(seerrData)) {
    const notificationMessage = await formatAvailableNotificationMessage(seerrData, jellyseerrClient, cfg, logger);
    await notifySubscribersAndCleanup(cfg, wahaClient, seerrData, logger, notificationMessage, requesterLidChatId);
  }
}

