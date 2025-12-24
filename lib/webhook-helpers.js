/**
 * Helper functions for webhook handling (shared between server and webhook handlers)
 * 
 * GUIDELINE: Always use LID format for all operations
 * ====================================================
 * - Phone numbers (@c.us format) should ONLY be used for mapping lookups (getPhoneNumberFromUserId)
 * - All operations (sendMessage, getMessageById, isAdminChatId, etc.) MUST use LID format (@lid)
 * - Convert phone numbers to LID format immediately after lookup using ensureLidFormatForMessaging()
 * - Store and pass LID format chatIds throughout the codebase
 * - Admin checks: Use isUserIdAdmin() when checking by userId, use isAdminChatId() when checking by chatId
 * - This ensures consistency across chat ID operations
 */

import fs from 'fs';
import { getConfigPath, getUserIdFromEmail, getPhoneNumberFromUserId, isAdminChatId, getLidFromPhoneNumber, isPhoneNumberConfigured, isUserIdAdmin } from './utils.js';
import { sendMessage, getMessageById, ensureLidFormatForMessaging } from './waha-client.js';
import { getMediaDetails, approveRequest, declineRequest } from './request.js';
import { getErrorDetails } from './errors/error-formatter.js';
import { getSubscriptionManager } from './subscriptions/subscription-manager.js';
import { MEDIA_TYPE_TV, STATUS_AVAILABLE } from './constants.js';

/**
 * In-memory set to track media IDs currently being processed
 * Prevents race conditions when multiple MEDIA_AVAILABLE webhooks arrive simultaneously
 */
const processingMediaIds = new Set();

/**
 * Reads config file and returns parsed JSON
 */
export function readConfigFile(logger) {
  try {
    const configPath = getConfigPath();
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (err) {
    logger?.debug('Could not read config file', {
      ...getErrorDetails(err, 'readConfigFile')
    });
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
    logger?.warn('Failed to write config file', {
      ...getErrorDetails(err, 'writeConfigFile')
    });
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
    logger?.warn('Failed to fetch media details for available seasons', {
      ...getErrorDetails(err, 'getAvailableSeasons')
    });
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
 * Attempts to remove both standard and 4K subscriptions if media is available
 */
function removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable) {
  if (isStandardAvailable) {
    subscriptionManager.removeSubscription(mediaId, mediaType, false, subscriberChatId);
  }
  if (is4kAvailable) {
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

    // Create unique key for this media (mediaId:mediaType)
    const mediaKey = `${mediaId}:${mediaType}`;
    
    // Check if this media is already being processed (race condition prevention)
    if (processingMediaIds.has(mediaKey)) {
      logger?.info(`⏭️ Skipping duplicate MEDIA_AVAILABLE notification for ${mediaKey} (already processing)`);
      return;
    }
    
    // Mark as processing
    processingMediaIds.add(mediaKey);
    
    try {
      // Status can be number (5) or string ('AVAILABLE') from webhook
      // Parse to number for consistent comparison if it's a string
      const statusStandard = typeof seerrData.media?.status === 'string' 
        ? parseInt(seerrData.media.status, 10) 
        : seerrData.media?.status;
      const status4k = typeof seerrData.media?.status4k === 'string'
        ? parseInt(seerrData.media.status4k, 10)
        : seerrData.media?.status4k;
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
        // No subscribers to notify, but still need to clean up processing lock
        return;
      }

      logger?.info(`📬 Notifying ${allSubscriberChatIds.length} subscriber${allSubscriberChatIds.length !== 1 ? 's' : ''} that media is available`);

      // Track successful notifications for accurate cleanup count
      let successfulNotifications = 0;
      let removedSubscriptions = 0;

      // GUIDELINE: subscriberChatId is already in LID format (from subscriptions)
      for (const subscriberChatId of allSubscriberChatIds) {
        // Check if phone number is configured - only send to configured users
        const isConfigured = await isPhoneNumberConfigured(cfg, subscriberChatId, wahaClient);
        if (!isConfigured) {
          logger?.info('⏭️ Skipping notification to non-configured subscriber');
          // Remove subscription for non-configured users (they won't receive notifications)
          removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable);
          removedSubscriptions++;
          continue;
        }

        try {
          await sendMessage(wahaClient, cfg, subscriberChatId, notificationMessage);
          logger?.debug('Notification sent to subscriber', { 
            subscriberChatId,
            mediaId,
            mediaType,
            isStandardAvailable,
            is4kAvailable
          });
          // Only remove subscription after successful notification send
          // This ensures users don't lose subscriptions due to temporary errors
          removeSubscriptions(subscriptionManager, mediaId, mediaType, subscriberChatId, isStandardAvailable, is4kAvailable);
          successfulNotifications++;
          removedSubscriptions++;
        } catch (err) {
          logger?.warn('Failed to send notification to subscriber', {
            ...getErrorDetails(err, 'sendSubscriberNotification'),
            subscriberChatId
          });
          // Don't remove subscription on failure - user should still be notified when retry succeeds
        }
      }

      if (removedSubscriptions > 0) {
        logger?.info(`🧹 Cleaned up ${removedSubscriptions} subscription${removedSubscriptions !== 1 ? 's' : ''} (${successfulNotifications} successful notification${successfulNotifications !== 1 ? 's' : ''})`);
      }
    } finally {
      // Always remove from processing set, even if an error occurred
      processingMediaIds.delete(mediaKey);
    }
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
export async function convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, context = 'notification') {
  const phoneChatId = `${phoneNumber}@c.us`;
  try {
    const lidChatId = await ensureLidFormatForMessaging(wahaClient, cfg, phoneChatId);
    if (!lidChatId) {
      // Expected case: user hasn't initiated a chat with the bot yet
      logger?.warn(`No LID found for ${context} - user may not have initiated a chat with the bot yet`, {
        phoneNumber,
        phoneChatId,
        context,
        reason: 'LID cannot be resolved until user sends a message to the bot first'
      });
    }
    return lidChatId;
  } catch (err) {
    logger?.error(`Unexpected error converting phone number to LID format for ${context}`, {
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
/**
 * Checks if media status indicates availability
 * Handles both number (5) and string ('AVAILABLE') formats
 * @param {number|string} status - Status value (number or string)
 * @returns {boolean} True if status indicates availability
 */
function isStatusAvailable(status) {
  // Handle both number constant (5) and string ('AVAILABLE') formats
  // STATUS_AVAILABLE constant is 5
  if (typeof status === 'number') {
    return status === STATUS_AVAILABLE;
  }
  if (typeof status === 'string') {
    return status === 'AVAILABLE' || parseInt(status, 10) === STATUS_AVAILABLE;
  }
  return false;
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
    if (!config.mappings) {
      config.mappings = {};
    }
    if (!config.mappings.emailMappings) {
      config.mappings.emailMappings = {};
    }
    config.mappings.emailMappings[email] = userId;

    if (writeConfigFile(config, logger)) {
      if (!cfg.mappings) cfg.mappings = {};
      cfg.mappings.emailMappings = config.mappings.emailMappings;
      logger?.info(`💾 Saved email mapping: ${email} → user ${userId}`);
    } else {
      logger?.info(`⚠️ Manually add to config.json: "mappings": { "emailMappings": { "${email}": ${userId} } }`);
    }
  } else if (wasInFile) {
    logger?.debug('Email mapping already exists in config', { email, userId });
  } else if (!config) {
    logger?.warn('Failed to read config file for email mapping update');
    logger?.info(`⚠️ Manually add to config.json: "mappings": { "emailMappings": { "${email}": ${userId} } }`);
  }
}

/**
 * Gets base notification message (user format) for any notification type
 * @param {Object} seerrData - Seerr webhook data
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} cfg - Configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Base notification message
 */
async function getBaseNotificationMessage(seerrData, jellyseerrClient, cfg, logger) {
  if (isMediaAvailableNotification(seerrData)) {
    return await formatAvailableNotificationMessage(seerrData, jellyseerrClient, cfg, logger);
  }
  
  const notificationType = seerrData.notification_type;
  const userFormatter = USER_NOTIFICATION_FORMATTERS[notificationType];
  return userFormatter ? userFormatter(seerrData) : formatGenericNotification(seerrData);
}

/**
 * Appends admin-specific information to base notification message
 * @param {string} baseMessage - Base notification message
 * @param {Object} seerrData - Seerr webhook data
 * @returns {string} Notification message with admin info appended
 */
function appendAdminInfo(baseMessage, seerrData) {
  const notificationType = seerrData.notification_type;
  
  // Helper to build admin info section
  const buildAdminSection = (title, lines) => {
    let section = `\n\n━━━ ${title} ━━━\n`;
    section += lines.join('\n');
    return baseMessage + section;
  };
  
  // Helper to extract issue ID consistently (handles both issue_id and id fields)
  const getIssueId = (seerrData) => {
    if (seerrData.issue?.issue_id != null) {
      return String(seerrData.issue.issue_id);
    }
    if (seerrData.issue?.id != null) {
      return String(seerrData.issue.id);
    }
    return null;
  };
  
  // Only append admin info for specific notification types
  if (notificationType === 'MEDIA_PENDING') {
    const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
    // Properly handle null/undefined vs 0 (request IDs are typically positive, but 0 is valid)
    const requestId = seerrData.request?.request_id != null ? String(seerrData.request.request_id) : null;
    
    if (!requestId || requestId === '') {
      return `${baseMessage}\n\n❌ Error: Request ID not found`;
    }
    
    return buildAdminSection('Admin Info', [
      `👤 Requested by: ${requestedBy}`,
      `🆔 Request ID: ${requestId}`,
      '',
      `✅ React with ✅ or reply "approve ${requestId}" to approve`,
      `🚫 React with ❌ or reply "decline ${requestId}" to decline`,
      `0️⃣ Reply "0" to cancel`
    ]);
  }
  
  if (notificationType === 'MEDIA_FAILED') {
    const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
    const { mediaType } = getMediaTypeAndEmoji(seerrData);
    const lines = [
      `👤 Requested by: ${requestedBy}`,
      `Failed to add to ${mediaType === 'Movie' ? 'Radarr' : 'Sonarr'}. Please check system logs and configuration.`
    ];
    
    if (seerrData.message) {
      lines.push('', `Error: ${seerrData.message}`);
    }
    
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'MEDIA_APPROVED') {
    const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
    const requestId = seerrData.request?.request_id != null ? String(seerrData.request.request_id) : null;
    const lines = [
      `👤 Requested by: ${requestedBy}`
    ];
    
    if (requestId) {
      lines.push(`🆔 Request ID: ${requestId}`);
    }
    
    lines.push('Request has been approved.');
    
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'MEDIA_DECLINED') {
    const requestedBy = seerrData.request?.requestedBy_username || 'Unknown User';
    const requestId = seerrData.request?.request_id != null ? String(seerrData.request.request_id) : null;
    const lines = [
      `👤 Requested by: ${requestedBy}`
    ];
    
    if (requestId) {
      lines.push(`🆔 Request ID: ${requestId}`);
    }
    
    lines.push('Request has been declined.');
    
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'ISSUE_CREATED') {
    const reportedBy = seerrData.issue?.reportedBy_username || 'Unknown User';
    const issueId = getIssueId(seerrData);
    const lines = [`👤 Reported by: ${reportedBy}`];
    
    if (issueId) {
      lines.push(`🆔 Issue ID: ${issueId}`);
    }
    
    lines.push('Please review and resolve the issue.');
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'ISSUE_COMMENT') {
    const commentedBy = seerrData.comment?.commentedBy_username || seerrData.issue?.reportedBy_username || 'Unknown User';
    const issueId = getIssueId(seerrData);
    const lines = [`👤 Commented by: ${commentedBy}`];
    
    if (issueId) {
      lines.push(`🆔 Issue ID: ${issueId}`);
    }
    
    lines.push('New comment added to issue.');
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'ISSUE_RESOLVED') {
    const resolvedBy = seerrData.issue?.resolvedBy_username || 'Unknown User';
    const issueId = getIssueId(seerrData);
    const lines = [`👤 Resolved by: ${resolvedBy}`];
    
    if (issueId) {
      lines.push(`🆔 Issue ID: ${issueId}`);
    }
    
    lines.push('Issue has been resolved.');
    return buildAdminSection('Admin Info', lines);
  }
  
  if (notificationType === 'ISSUE_REOPENED') {
    const reopenedBy = seerrData.issue?.reportedBy_username || 'Unknown User';
    const issueId = getIssueId(seerrData);
    const lines = [`👤 Reopened by: ${reopenedBy}`];
    
    if (issueId) {
      lines.push(`🆔 Issue ID: ${issueId}`);
    }
    
    lines.push('Issue has been reopened.');
    return buildAdminSection('Admin Info', lines);
  }
  
  // For other notification types, return base message as-is
  return baseMessage;
}

/**
 * Formats a pending request message for user (confirmation message)
 */
function formatPendingRequestMessageForUser(seerrData) {
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
 * Formats a failed request message for user (user-friendly message)
 */
function formatFailedMessageForUser(seerrData) {
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
 * Formats an issue created message for user (confirmation message)
 */
function formatIssueCreatedMessageForUser(seerrData) {
  const subject = getSubject(seerrData);
  
  let message = `✅ Issue Reported\n\n`;
  message += `📺 ${subject}\n\n`;
  message += `Your issue has been reported successfully. `;
  message += `An administrator will review it and get back to you soon.`;
  
  return message.trimEnd();
}

/**
 * User formatters for notification types (shared constant)
 * Defined after formatter functions to ensure they're available
 */
const USER_NOTIFICATION_FORMATTERS = {
  'MEDIA_PENDING': formatPendingRequestMessageForUser,
  'MEDIA_FAILED': formatFailedMessageForUser,
  'ISSUE_CREATED': formatIssueCreatedMessageForUser
};

/**
 * Parses approval request message body to extract request ID and other info
 * Matches new format: base message + "━━━ Admin Info ━━━" section
 */
export function parseApprovalMessage(messageBody) {
  if (!messageBody || typeof messageBody !== 'string') {
    return null;
  }
  
  // Check for admin info section (only admins get this)
  if (!messageBody.includes('━━━ Admin Info ━━━')) {
    return null;
  }
  
  // Extract request ID from admin info section
  const requestIdMatch = messageBody.match(/🆔 Request ID:\s*(\d+)/);
  if (!requestIdMatch || !requestIdMatch[1]) {
    return null;
  }
  
  const requestId = requestIdMatch[1];
  
  // Extract subject from base message (before admin info section)
  const subjectMatch = messageBody.match(/(?:🎬|📺)\s+(.+?)(?:\n|$)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : null;
  
  // Extract requested by from admin info section
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
    logger?.warn('Invalid reaction payload, ignoring', { payload });
    return;
  }
  
  const reactionText = payload.reaction.text || '';
  const messageId = payload.reaction.messageId;
  
  logger?.info('🔄 Reaction event received', {
    messageId,
    reactionText: reactionText || '(empty)',
    from: payload.from
  });
  
  if (!reactionText || reactionText.trim() === '') {
    logger?.info('🔄 Reaction removed (empty text), ignoring', { messageId });
    return;
  }
  
  const messageIdParts = messageId.split('_');
  if (messageIdParts.length < 3) {
    logger?.warn('Invalid messageId format, cannot extract chatId', { messageId });
    return;
  }
  
  // GUIDELINE: Extract chatId from messageId and convert to LID format immediately
  const chatIdFromMessage = messageIdParts[1];
  logger?.debug('Extracting chatId from messageId for LID conversion', { 
    messageId, 
    chatIdFromMessage,
    messageIdParts: messageIdParts.length
  });
  
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
    logger?.info('⏭️ Reaction not for approval message, ignoring', { 
      messageId, 
      messageBody: message.body?.substring(0, 100) 
    });
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
    reactorChatIdRaw,
    isAdminReaction,
    reactionText,
    requestId: approvalInfo.requestId
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
    logger?.info('⏭️ Reaction is not approve or decline emoji, ignoring', {
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
      logger?.debug('Error notification sent to admin after reaction failure', { 
        requestId,
        errorType: isApprove ? 'approve' : 'decline',
        reactionText
      });
    } catch (sendErr) {
      logger?.error('Failed to send error message to admin', {
        ...getErrorDetails(sendErr, 'sendErrorMessage'),
        requestId
      });
    }
  }
}

/**
 * Helper function to iterate through all admins and send a message
 * @param {Object} cfg - Configuration
 * @param {Object} wahaClient - WAHA API client
 * @param {Object} logger - Logger instance
 * @param {string} message - Message to send
 * @param {string} context - Context for logging (e.g., 'admin notification')
 * @param {string|null} excludeLidChatId - LID chat ID to exclude
 * @returns {Promise<Array<string>>} Array of LID chat IDs that received notifications
 */
async function sendToAllAdmins(cfg, wahaClient, logger, message, context, excludeLidChatId = null) {
  // Reload mappings from file to get latest changes (dynamic mapping updates)
  const { reloadMappings } = await import('./utils.js');
  reloadMappings(cfg, logger);
  
  const mappings = cfg.mappings?.userIdMappings || {};
  const notifiedChatIds = [];
  const adminMappings = [];

  // Collect all admin mappings
  for (const [phoneNumber, mapping] of Object.entries(mappings)) {
    if (mapping && typeof mapping === 'object' && mapping.admin === true) {
      adminMappings.push({ phoneNumber, mapping });
    }
  }

  if (adminMappings.length === 0) {
    logger?.warn('No admin users found in userIdMappings');
    return notifiedChatIds;
  }

  logger?.info(`📬 Notifying ${adminMappings.length} admin${adminMappings.length !== 1 ? 's' : ''} (${context})`);

  for (const { phoneNumber, mapping } of adminMappings) {
    const lidChatId = await convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, context);
    if (!lidChatId) {
      logger?.warn(`Cannot notify admin - LID cannot be resolved`, {
        phoneNumber,
        userId: mapping.userId
      });
      continue;
    }

    // Check exclusion BEFORE sending notification
    if (excludeLidChatId && lidChatId === excludeLidChatId) {
      logger?.debug('Excluding requester from admin notifications', { lidChatId, phoneNumber });
      continue;
    }

    // Check if phone number is configured - only send to configured users
    const isConfigured = await isPhoneNumberConfigured(cfg, lidChatId, wahaClient);
    if (!isConfigured) {
      logger?.info(`⏭️ Skipping notification to non-configured admin`, { phoneNumber });
      continue;
    }

    try {
      await sendMessage(wahaClient, cfg, lidChatId, message);
      notifiedChatIds.push(lidChatId);
      logger?.debug(`Sent ${context} to admin`, {
        phoneNumber,
        userId: mapping.userId,
        lidChatId
      });
    } catch (err) {
      logger?.error(`Failed to send ${context} to admin`, {
        ...getErrorDetails(err, 'sendToAllAdmins'),
        phoneNumber,
        userId: mapping.userId
      });
    }
  }

  logger?.info(`✅ Notified ${notifiedChatIds.length} admin${notifiedChatIds.length !== 1 ? 's' : ''}`);
  return notifiedChatIds;
}

/**
 * Notifies all admins about LID resolution failure
 * @param {Object} cfg - Configuration
 * @param {Object} wahaClient - WAHA API client
 * @param {Object} seerrData - Seerr webhook data
 * @param {Object} logger - Logger instance
 * @param {Object} details - Failure details
 */
async function notifyAllAdminsAboutLidResolutionFailure(cfg, wahaClient, seerrData, logger, details) {
  // Reload mappings from file to get latest changes (dynamic mapping updates)
  const { reloadMappings } = await import('./utils.js');
  reloadMappings(cfg, logger);
  
  const mappings = cfg.mappings?.userIdMappings || {};
  const { mediaEmoji } = getMediaTypeAndEmoji(seerrData);
  const notificationSubject = getSubject(seerrData);
  
  // Get username from userIdMappings if available
  const userMapping = details.phoneNumber ? mappings[details.phoneNumber] : null;
  const username = userMapping?.username || null;
  
  let message = `⚠️ Notification Delivery Failed\n\n`;
  message += `📋 Notification: ${details.notificationType || seerrData.event || 'Unknown'}\n`;
  message += `${mediaEmoji} ${notificationSubject}\n\n`;
  message += `👤 User Details:\n`;
  if (username) {
    message += `   • Username: ${username}\n`;
  }
  message += `   • User ID: ${details.userId}\n`;
  message += `   • Email: ${details.email}\n`;
  message += `   • Phone: ${details.phoneNumber}\n\n`;
  message += `❌ Reason: User has not initiated a chat with the bot yet.\n`;
  message += `LID cannot be resolved until user sends a message to the bot first.\n\n`;
  message += `💡 Action: User needs to send a message to the bot to establish a chat session.`;

  const notifiedChatIds = await sendToAllAdmins(
    cfg, 
    wahaClient, 
    logger, 
    message, 
    'notify about LID resolution failure',
    null
  );

  if (notifiedChatIds.length > 0) {
    logger?.info(`📤 Sent LID resolution failure notification to ${notifiedChatIds.length} admin${notifiedChatIds.length !== 1 ? 's' : ''}`, {
      userId: details.userId,
      email: details.email,
      phoneNumber: details.phoneNumber,
      notificationType: details.notificationType
    });
  } else {
    logger?.warn('No admins could be notified about LID resolution failure', {
      userId: details.userId,
      email: details.email,
      phoneNumber: details.phoneNumber
    });
  }
}

/**
 * Handles Seerr webhook notifications
 * Simple unified approach: send to requester + admins (for admin-relevant types)
 */
export async function handleSeerrWebhook(cfg, jellyseerrClient, wahaClient, seerrData, logger) {
  const notificationType = seerrData.notification_type;
  const subject = getSubject(seerrData);
  logger?.info(`📋 Notification: ${seerrData.event || notificationType}${subject !== 'Unknown' ? ` - "${subject}"` : ''}`);

  // Determine which users should receive this notification
  const isTestNotification = notificationType === 'TEST_NOTIFICATION';
  // Note: MEDIA_AUTO_APPROVED is intentionally excluded from admin-relevant notifications
  // because admin requests are auto-approved in Seerr, so no admin action is needed
  const isAdminRelevant = isTestNotification || 
    notificationType === 'MEDIA_PENDING' ||  // Non-admin requests requiring approval
    notificationType === 'MEDIA_APPROVED' ||  // Admin needs to know when requests are approved
    notificationType === 'MEDIA_FAILED' || 
    notificationType === 'MEDIA_DECLINED' ||  // Admin needs to know when requests are declined
    notificationType === 'ISSUE_CREATED' ||  // Issue reported
    notificationType === 'ISSUE_COMMENT' ||  // Issue has new comment
    notificationType === 'ISSUE_RESOLVED' ||  // Issue resolved
    notificationType === 'ISSUE_REOPENED';  // Issue reopened

  const email = isTestNotification ? null : extractEmail(seerrData);
  
  // Log when email is missing for non-test notifications (info level for visibility)
  if (!isTestNotification && !email) {
    logger?.info(`ℹ️ No email found for notification type "${notificationType}"${subject !== 'Unknown' ? ` - "${subject}"` : ''} - requester notification skipped`);
  }
  
  let requesterLidChatId = null;
  let requesterIsAdmin = false;

  // Get base message once (used for both requester and admins)
  // Wrap in try-catch to handle errors gracefully with fallback message
  let baseMessage;
  try {
    baseMessage = await getBaseNotificationMessage(seerrData, jellyseerrClient, cfg, logger);
  } catch (err) {
    logger?.error('Failed to generate base notification message', {
      ...getErrorDetails(err, 'getBaseNotificationMessage'),
      notificationType,
      subject
    });
    // Fallback to a simple message to ensure notifications still go out
    const emoji = getNotificationEmoji(notificationType);
    baseMessage = `${emoji} ${seerrData.event || notificationType || 'Notification'}\n\n${subject !== 'Unknown' ? `${subject}\n\n` : ''}An error occurred while formatting this notification.`;
  }

  // Pre-compute admin message if needed (avoid redundant computation)
  // If requester is admin and notification is admin-relevant, we'll use this for both requester and other admins
  let adminMessage = null;
  if (isAdminRelevant) {
    adminMessage = appendAdminInfo(baseMessage, seerrData);
  }

  // Handle requester (if email present)
  if (email) {
    const userId = await getUserIdFromEmail(cfg, jellyseerrClient, email);
    if (userId) {
      saveEmailMappingIfNeeded(cfg, email, userId, logger);
      requesterIsAdmin = isUserIdAdmin(cfg, userId);
      const phoneNumber = getPhoneNumberFromUserId(cfg, userId);
      
      if (phoneNumber) {
        const lidChatId = await convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, 'requester notification');
        if (!lidChatId) {
          // LID resolution failed - notify all admins about the failure
          // Continue processing to ensure admins and subscribers still get notified
          await notifyAllAdminsAboutLidResolutionFailure(cfg, wahaClient, seerrData, logger, {
            userId,
            email,
            phoneNumber,
            notificationType,
            subject
          });
          // Don't return early - continue to notify admins and subscribers
        } else {
          requesterLidChatId = lidChatId;
          
          // Send to requester (base format, admin info if admin)
          // Use pre-computed adminMessage if available, otherwise compute on-demand
          const notificationMessage = requesterIsAdmin 
            ? (adminMessage || appendAdminInfo(baseMessage, seerrData))
            : baseMessage;

          const isConfigured = await isPhoneNumberConfigured(cfg, lidChatId, wahaClient);
          if (isConfigured) {
            try {
              await sendMessage(wahaClient, cfg, lidChatId, notificationMessage);
              logger?.info(`📤 Sent notification to ${requesterIsAdmin ? 'admin' : 'requester'}${subject !== 'Unknown' ? ` - "${subject}"` : ''}`);
            } catch (err) {
              logger?.error('Failed to send notification to requester', {
                ...getErrorDetails(err, 'handleSeerrWebhook')
              });
            }
          }
        }
      }
    }
  }

  // Send to all admins for admin-relevant notifications (excluding requester if they're admin)
  if (isAdminRelevant) {
    await sendToAllAdmins(cfg, wahaClient, logger, adminMessage, 'admin notification', requesterIsAdmin ? requesterLidChatId : null);
  }

  // Handle MEDIA_AVAILABLE subscribers (separate from user notifications)
  // Reuse baseMessage since it already contains the formatted MEDIA_AVAILABLE message
  if (isMediaAvailableNotification(seerrData)) {
    await notifySubscribersAndCleanup(cfg, wahaClient, seerrData, logger, baseMessage, requesterLidChatId);
  }
}

