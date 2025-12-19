/**
 * Request handling logic for movies and TV shows
 * Handles duplicate prevention, status checking, and request creation
 */

import { getMediaDetails, createRequest, formatMedia, extractMediaStatus } from './request.js';
import { isRequested, isAvailable, canBeRequested, getRequestStatusMessage } from './media-status.js';
import { checkSeasonRequestStatus } from './media-status.js';
import { filterOutSpecials, getSeasonNumber } from './season-utils.js';
import { sendText } from './waha-client.js';
import {
  getMovieMessage,
  getSeasonMessage,
  getShowEndedMessage,
  getGenericErrorMessage,
  hasNotificationSetUp
} from './message-mapper.js';

/**
 * Handles TV show season selection and request creation
 * @param {Object} cfg - Configuration
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} wahaClient - WAHA API client
 * @param {string} chatId - Chat ID
 * @param {string} messageText - User's season selection message
 * @param {Object} tvShow - Selected TV show object
 * @param {Object} logger - Logger instance
 * @param {boolean} is4k - Whether this is a 4K request
 * @returns {Promise<void>}
 */
export async function handleTvSeasonSelection(cfg, jellyseerrClient, wahaClient, chatId, messageText, tvShow, logger, is4k = false) {
  const { title: chosenTitle } = formatMedia(tvShow);
  
  // is4k flag propagates through all status checks and request creation
  logger?.info(`📺 Season selection for: "${chosenTitle}"${is4k ? ' (4K)' : ''}`);
  
  // Parse season selection - use actual seasons array length
  const availableSeasons = tvShow.seasons || [];
  const maxSeasons = availableSeasons.length > 0 ? availableSeasons.length : (tvShow.numberOfSeasons || 10);
  const { parseSeasonSelection } = await import('./season-utils.js');
  const seasonSelection = parseSeasonSelection(messageText, maxSeasons);
  
  if (seasonSelection.cancelled) {
    logger?.info('🚫 Cancelled season selection');
    return { cancelled: true };
  }
  
  if (seasonSelection.error) {
    await sendText(wahaClient, cfg, chatId, seasonSelection.error);
    return { error: seasonSelection.error };
  }
  
  // Check season status before creating request (duplicate prevention)
  // Filter out season 0 (Specials) - never allow requesting specials
  let seasons = (seasonSelection.seasons || []).filter(s => s !== 0);
  
  if (seasons.length === 0) {
    await sendText(wahaClient, cfg, chatId, `No valid seasons selected. Season 0 (Specials) cannot be requested.`);
    return { error: 'No valid seasons' };
  }
  
  // Get fresh media details to check current season status
  let mediaDetails = tvShow.mediaDetails;
  if (!mediaDetails) {
    logger?.debug('Fetching fresh media details for season status check');
    try {
      mediaDetails = await getMediaDetails(jellyseerrClient, cfg, tvShow.id, 2);
    } catch (err) {
      logger?.warn('Failed to fetch media details for status check, proceeding with request', err?.message);
    }
  }
  
  // Check if selected seasons are already requested (duplicate prevention)
  if (mediaDetails) {
    const alreadyRequestedSeasons = [];
    const alreadyAvailableSeasons = [];
    const canRequestSeasons = [];
    
    for (const seasonNum of seasons) {
      const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum, is4k);
      if (seasonStatus.isRequested) {
        if (seasonStatus.isAvailable) {
          alreadyAvailableSeasons.push(seasonNum);
        } else {
          alreadyRequestedSeasons.push(seasonNum);
        }
      } else {
        canRequestSeasons.push(seasonNum);
      }
    }
    
    // If all selected seasons are already requested or available
    if (canRequestSeasons.length === 0 && (alreadyRequestedSeasons.length > 0 || alreadyAvailableSeasons.length > 0)) {
      // Use message mapper for individual season messages
      const messages = [];
      for (const seasonNum of alreadyAvailableSeasons) {
        const hasNotification = hasNotificationSetUp(mediaDetails, cfg.jellyseerr.defaultUserId);
        const message = getSeasonMessage({
          seasonNumber: seasonNum,
          tvShowTitle: chosenTitle,
          isRequested: true,
          isAvailable: true,
          hasNotification
        });
        messages.push(message);
      }
      for (const seasonNum of alreadyRequestedSeasons) {
        const hasNotification = hasNotificationSetUp(mediaDetails, cfg.jellyseerr.defaultUserId);
        const message = getSeasonMessage({
          seasonNumber: seasonNum,
          tvShowTitle: chosenTitle,
          isRequested: true,
          isAvailable: false,
          hasNotification
        });
        messages.push(message);
      }
      if (messages.length > 0) {
        logger?.info(`All selected seasons are already requested/available`);
        await sendText(wahaClient, cfg, chatId, messages.join('\n\n'));
      }
      return { allRequested: true };
    }
    
    // If some seasons are already requested/available, only request the ones that can be requested
    if (alreadyRequestedSeasons.length > 0 || alreadyAvailableSeasons.length > 0) {
      const messages = [];
      const hasNotification = hasNotificationSetUp(mediaDetails, cfg.jellyseerr.defaultUserId);
      for (const seasonNum of alreadyAvailableSeasons) {
        const message = getSeasonMessage({
          seasonNumber: seasonNum,
          tvShowTitle: chosenTitle,
          isRequested: true,
          isAvailable: true,
          hasNotification
        });
        messages.push(message);
      }
      for (const seasonNum of alreadyRequestedSeasons) {
        const message = getSeasonMessage({
          seasonNumber: seasonNum,
          tvShowTitle: chosenTitle,
          isRequested: true,
          isAvailable: false,
          hasNotification
        });
        messages.push(message);
      }
      logger?.info(`Some seasons already requested/available, requesting only seasons ${canRequestSeasons.join(', ')}`);
      if (messages.length > 0) {
        await sendText(wahaClient, cfg, chatId, messages.join('\n\n'));
      }
      seasons = canRequestSeasons; // Update to only request requestable seasons
    }
  }
  
  // Create request with selected seasons
  const seasonsText = seasons.length === maxSeasons ? 'all seasons' : `season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`;
  const qualityText = is4k ? ' (4K)' : '';
  logger?.info(`📨 Requesting "${chosenTitle}" (${seasonsText})${qualityText}`);
  
  try {
    const res = await createRequest(jellyseerrClient, cfg, tvShow, seasons, is4k, logger, chatId, wahaClient);
    logger?.debug('Create request response', { status: res.status, data: res.data });
    
    const statusMessage = getRequestStatusMessage(res, 'TV', true, is4k, tvShow, seasons);
    await sendText(wahaClient, cfg, chatId, statusMessage);
  } catch (err) {
    logger?.error('Failed to create request', err?.message || err);
    logger?.debug('Request error stack', err?.stack);
    const errorMsg = getGenericErrorMessage();
    await sendText(wahaClient, cfg, chatId, errorMsg);
  }
  
  return { success: true };
}

/**
 * Handles TV show selection - fetches seasons and shows selection
 * @param {Object} cfg - Configuration
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} wahaClient - WAHA API client
 * @param {string} chatId - Chat ID
 * @param {Object} chosen - Selected TV show object
 * @param {Object} logger - Logger instance
 * @param {boolean} is4k - Whether this is a 4K request
 * @returns {Promise<Object|null>} Updated chosen object with seasons, or null if handled
 */
export async function handleTvShowSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, is4k = false) {
  const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
  
  // is4k flag propagates through all status checks, season formatting, and request creation
  logger?.info(`📺 TV selected: "${chosenTitle}" — fetching seasons...${is4k ? ' (4K)' : ''}`);
  await sendText(wahaClient, cfg, chatId, `📺 Loading seasons for "${chosenTitle}"...`);
  
  try {
    const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 2);
    // Filter out season 0 (Specials) - never show or allow requesting specials
    const allSeasons = mediaDetails.seasons || [];
    const seasons = filterOutSpecials(allSeasons);
    logger?.debug('TV media details seasons', { seasonCount: seasons.length, totalIncludingSpecials: allSeasons.length });
    
    if (seasons.length === 0) {
      // No season info available, check overall status before requesting all seasons
      logger?.warn('No season info returned; checking overall status');
      const statusInfo = extractMediaStatus(mediaDetails, is4k);
      
      if (statusInfo) {
        const requested = isRequested(statusInfo.status);
        const available = isAvailable(statusInfo.status);
        
        if (available) {
          logger?.info(`✅ "${chosenTitle}" is already available`);
          const message = getShowEndedMessage({
            allSeasonsAvailable: true,
            allSeasonsRequested: false
          });
          await sendText(wahaClient, cfg, chatId, message);
          return null; // Handled, don't proceed
        } else if (requested) {
          const hasNotification = hasNotificationSetUp(mediaDetails, cfg.jellyseerr.defaultUserId);
          // For TV shows without season info, use show ended message
          const message = getShowEndedMessage({
            allSeasonsAvailable: false,
            allSeasonsRequested: true
          });
          logger?.info(`📋 "${chosenTitle}" is already requested`);
          await sendText(wahaClient, cfg, chatId, message);
          return null; // Handled, don't proceed
        }
      }
      
      // Can be requested - proceed
      const res = await createRequest(jellyseerrClient, cfg, chosen, null, is4k, logger, chatId, wahaClient);
      const statusMessage = getRequestStatusMessage(res, typeStr, true, is4k, chosen, null);
      await sendText(wahaClient, cfg, chatId, statusMessage);
      return null; // Handled, don't proceed
    }
    
    // Check season-level status
    const requestedSeasons = [];
    const canRequestSeasons = [];
    
    for (const season of seasons) {
      const seasonNum = getSeasonNumber(season);
      if (seasonNum === null) continue;
      
      const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum, is4k);
      
      if (seasonStatus.isRequested) {
        requestedSeasons.push({ seasonNum, status: seasonStatus });
      } else {
        canRequestSeasons.push(seasonNum);
      }
    }
    
    // If all seasons are already requested
    if (canRequestSeasons.length === 0 && requestedSeasons.length > 0) {
      logger?.info(`📋 All seasons of "${chosenTitle}" are already requested`);
      // Check if all are available or just requested
      const allAvailable = requestedSeasons.every(s => s.status.isAvailable);
      const message = getShowEndedMessage({
        allSeasonsAvailable: allAvailable,
        allSeasonsRequested: !allAvailable
      });
      await sendText(wahaClient, cfg, chatId, message);
      return null; // Handled, don't proceed
    }
    
    // Store TV show with all seasons for selection
    chosen.seasons = seasons;
    chosen.mediaDetails = mediaDetails;
    
    // Show season selection
    const { formatSeasons } = await import('./season-utils.js');
    const seasonsMessage = formatSeasons(chosen.seasons, mediaDetails, is4k);
    await sendText(wahaClient, cfg, chatId, seasonsMessage);
    
    return chosen; // Return updated chosen object
  } catch (err) {
    logger?.error('Failed to get TV media details', err?.message || err);
    const errorMsg = getGenericErrorMessage();
    await sendText(wahaClient, cfg, chatId, errorMsg);
    return null; // Cancel the request
  }
}

/**
 * Handles movie selection - checks status and creates request
 * @param {Object} cfg - Configuration
 * @param {Object} jellyseerrClient - Jellyseerr API client
 * @param {Object} wahaClient - WAHA API client
 * @param {string} chatId - Chat ID
 * @param {Object} chosen - Selected movie object
 * @param {Object} logger - Logger instance
 * @param {boolean} is4k - Whether this is a 4K request
 * @returns {Promise<void>}
 */
export async function handleMovieSelection(cfg, jellyseerrClient, wahaClient, chatId, chosen, logger, is4k = false) {
  const { title: chosenTitle, year: chosenYear, typeStr } = formatMedia(chosen);
  
  // is4k flag propagates through all status checks and request creation
  logger?.info(`📨 Checking status for ${typeStr}: "${chosenTitle}" (${chosenYear})${is4k ? ' (4K)' : ''}`);
  
  try {
    // Get media details to check current status
    const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, chosen.id, 1);
    const statusInfo = extractMediaStatus(mediaDetails, is4k);
    
    if (statusInfo) {
      const requested = isRequested(statusInfo.status);
      const available = isAvailable(statusInfo.status);
      
      // Check if can be requested (duplicate prevention)
      if (!canBeRequested(statusInfo.status)) {
        if (available) {
          // Already available in library
          logger?.info(`✅ "${chosenTitle}" is already available in your library`);
          const message = getMovieMessage({
            movieTitle: chosenTitle,
            status: statusInfo.status,
            isRequested: false,
            isAvailable: true,
            hasNotification: false
          });
          await sendText(wahaClient, cfg, chatId, message);
          return;
        } else if (requested) {
          // Already requested but not available
          const hasNotification = hasNotificationSetUp(mediaDetails, cfg.jellyseerr.defaultUserId);
          const message = getMovieMessage({
            movieTitle: chosenTitle,
            status: statusInfo.status,
            isRequested: true,
            isAvailable: false,
            hasNotification
          });
          logger?.info(`📋 "${chosenTitle}" is already requested`);
          await sendText(wahaClient, cfg, chatId, message);
          return;
        }
      }
    }
    
    // Can be requested - proceed with request
    const qualityText = is4k ? ' (4K)' : '';
    logger?.info(`📨 Requesting ${typeStr}: "${chosenTitle}" (${chosenYear})${qualityText}`);
    
    const res = await createRequest(jellyseerrClient, cfg, chosen, null, is4k, logger, chatId, wahaClient);
    logger?.debug('Create request response', { status: res.status, data: res.data });
    
    const statusMessage = getRequestStatusMessage(res, typeStr, false, is4k, chosen, null);
    await sendText(wahaClient, cfg, chatId, statusMessage);
  } catch (err) {
    logger?.error('Failed to check status or create request', err?.message || err);
    logger?.debug('Request error stack', err?.stack);
    const errorMsg = getGenericErrorMessage();
    await sendText(wahaClient, cfg, chatId, errorMsg);
  }
}

