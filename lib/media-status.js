/**
 * Media status checking and formatting utilities
 * Handles Overseerr/Jellyseerr status codes and formatting
 */

import { extractMediaStatus, formatStatusMessage, formatMedia } from './request.js';
import { extractApiMessage } from './api-message-extractor.js';
import {
  getMovieRequestSuccessMessage,
  getMovieRequestDeniedMessage,
  getSeasonRequestSuccessMessage,
  getSeasonRequestDeniedMessage,
  getAllSeasonsRequestSuccessMessage,
  getGenericErrorMessage
} from './message-mapper.js';

/**
 * Determines if media is requested based on status
 * According to docs: Requested = (status != UNKNOWN)
 * Status codes: 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if requested
 */
export function isRequested(status) {
  // Status 1 = UNKNOWN (not requested)
  // Status 2, 3, 4, 5 = PENDING, PROCESSING, PARTIALLY_AVAILABLE, AVAILABLE (all requested)
  // Status 6 = DELETED (not requested, but was previously available)
  return status !== 1 && status >= 2 && status <= 5;
}

/**
 * Determines if media is available based on status
 * According to docs: Available = (status == AVAILABLE)
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if available
 */
export function isAvailable(status) {
  // Only status 5 (AVAILABLE) means it's in the library
  return status === 5;
}

/**
 * Checks if a movie can be requested
 * According to docs: CanBeRequested = !Available && !Requested
 * @param {number} status - Status code (1-6)
 * @returns {boolean} True if can be requested
 */
export function canBeRequested(status) {
  return !isAvailable(status) && !isRequested(status);
}

/**
 * Converts season status to requested state
 * According to docs: IsRequested = (status == 3 || status == 4 || status == 5)
 * UNKNOWN (1) or PENDING (2) → None
 * PROCESSING (3), PARTIALLY_AVAILABLE (4), or AVAILABLE (5) → Full
 * @param {number} status - Status code (1-6)
 * @returns {string} 'None' or 'Full'
 */
export function convertRequestedState(status) {
  if (status === 1 || status === 2) {
    // UNKNOWN or PENDING → None
    return 'None';
  }
  if (status === 3 || status === 4 || status === 5) {
    // PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE → Full
    return 'Full';
  }
  // Status 6 (DELETED) or invalid → None
  return 'None';
}

/**
 * Checks if a TV show season is requested and available
 * Follows the 3-step priority system from Requestrr reference:
 * 1. Initial status from seasons[] metadata (lowest priority)
 * 2. Override with pending/approved requests (highest priority)
 * 3. Override with MediaInfo.Seasons status (medium priority, but not if pending request exists)
 * @param {Object} mediaDetails - Media details from getMediaDetails
 * @param {number} seasonNumber - Season number to check
 * @param {boolean} is4k - Whether to check 4K status instead of standard status
 * @returns {Object} { isRequested: boolean, isAvailable: boolean, reason: string }
 */
export function checkSeasonRequestStatus(mediaDetails, seasonNumber, is4k = false) {
  const mediaInfo = mediaDetails.mediaInfo || mediaDetails;
  
  // Step 1: Initial status from seasons[] metadata (lowest priority)
  // Match table columns exactly:
  // Status 1 (UNKNOWN): IsAvailable = false, IsRequested = None (false)
  // Status 2 (PENDING): IsAvailable = false, IsRequested = None (false)
  // Status 3 (PROCESSING): IsAvailable = false, IsRequested = Full (true)
  // Status 4 (PARTIALLY_AVAILABLE): IsAvailable = false, IsRequested = Full (true)
  // Status 5 (AVAILABLE): IsAvailable = true, IsRequested = Full (true)
  // For 4K, check status4k field; fallback to status if not available
  let isAvailable = false;
  let isRequested = false;
  let reason = 'seasons_metadata';
  
  if (mediaDetails.seasons && Array.isArray(mediaDetails.seasons)) {
    const seasonMeta = mediaDetails.seasons.find(s => (s.seasonNumber || s.season_number) === seasonNumber);
    if (seasonMeta) {
      const statusField = is4k ? 'status4k' : 'status';
      let status = seasonMeta[statusField];
      // Fallback to standard status if 4K status not available
      if (is4k && (status === undefined || status === null)) {
        status = seasonMeta.status;
      }
      if (status !== undefined && status !== null) {
        status = typeof status === 'string' ? parseInt(status, 10) : status;
        isAvailable = status === 5; // Only status 5 is available
        const requestedState = convertRequestedState(status);
        isRequested = requestedState === 'Full'; // Status 3, 4, 5 = Full (true), Status 1, 2 = None (false)
      }
    }
  }
  
  // Step 2: Override with pending/approved requests (highest priority)
  // According to reference: If a request exists, IsAvailable = false and IsRequested = Full (regardless of other status)
  // Request status codes: 1 = PENDING APPROVAL, 2 = APPROVED, 3 = DECLINED
  // IMPORTANT: Only consider requests matching the is4k type (4K requests don't block standard requests and vice versa)
  let hasPendingRequest = false;
  if (mediaInfo.requests && Array.isArray(mediaInfo.requests)) {
    const pendingRequest = mediaInfo.requests.find(req => {
      // Only PENDING (1) or APPROVED (2) requests count as requested
      // DECLINED (3) requests do not block new requests
      if (req.status !== 1 && req.status !== 2) {
        return false;
      }
      // Match request type: 4K requests only block 4K requests, standard only block standard
      // req.is4k can be true, false, or undefined (for backward compatibility)
      const reqIs4k = req.is4k === true;
      if (reqIs4k !== is4k) {
        return false; // Request type mismatch - don't consider this request
      }
      // Check if this request includes the season
      if (req.seasons && Array.isArray(req.seasons)) {
        return req.seasons.some(s => (s.seasonNumber || s.season_number) === seasonNumber);
      }
      return false;
    });
    
    if (pendingRequest) {
      // Pending/approved requests always override: IsAvailable = false, IsRequested = Full
      // This prevents duplicate requests even if the season status suggests it's not requested
      hasPendingRequest = true;
      isAvailable = false; // Always false if request exists (per reference)
      isRequested = true; // Always Full if request exists (per reference)
      reason = 'pending_request';
    }
  }
  
  // Step 3: Override with mediaInfo.seasons status (medium priority)
  // According to reference: Overrides initial status (but NOT if pending requests exist)
  // Only overrides if status is PROCESSING (3), PARTIALLY_AVAILABLE (4), or AVAILABLE (5)
  // Does not override if status is UNKNOWN (1) or PENDING (2)
  // API returns mediaInfo.seasons (lowercase) per OpenAPI spec and actual API responses
  // For 4K, check status4k field; fallback to status if not available
  if (!hasPendingRequest) {
    // Check lowercase first (actual API format), then uppercase for compatibility
    const mediaSeasons = mediaInfo.seasons || mediaInfo.Seasons;
    if (mediaSeasons && Array.isArray(mediaSeasons)) {
      const seasonInfo = mediaSeasons.find(s => (s.seasonNumber || s.season_number) === seasonNumber);
      if (seasonInfo) {
        const statusField = is4k ? 'status4k' : 'status';
        let status = seasonInfo[statusField];
        // Fallback to standard status if 4K status not available
        if (is4k && (status === undefined || status === null)) {
          status = seasonInfo.status;
        }
        if (status !== undefined && status !== null) {
          status = typeof status === 'string' ? parseInt(status, 10) : status;
          // Only override if status is 3, 4, or 5 (not 1 or 2)
          if (status === 3 || status === 4 || status === 5) {
            isAvailable = status === 5; // Only status 5 is available
            isRequested = true; // Status 3, 4, 5 = Full (true)
            reason = 'media_info_seasons';
          }
          // If status is 1 or 2, keep the initial status from Step 1
        }
      }
    }
  }
  
  return {
    isRequested,
    isAvailable,
    reason
  };
}

/**
 * Determines the status message for request responses
 * @param {Object} res - Response object from Jellyseerr API
 * @param {string} typeStr - Media type string (Movie/TV)
 * @param {boolean} isTvShow - Whether this is a TV show
 * @param {boolean} is4k - Whether this is a 4K request
 * @param {Object} media - Media object (optional, for title extraction)
 * @param {Array} requestedSeasons - Array of requested season numbers (optional, for TV shows)
 * @returns {string} Status message
 */
export function getRequestStatusMessage(res, typeStr, isTvShow = false, is4k = false, media = null, requestedSeasons = null) {
  const data = res.data || {};
  const apiMessage = extractApiMessage(data);
  
  // Extract media title if available
  let mediaTitle = null;
  if (media) {
    const formatted = formatMedia(media);
    mediaTitle = formatted.title;
  } else if (data.media) {
    const formatted = formatMedia(data.media);
    mediaTitle = formatted.title;
  }
  
  if (res.status === 201 || res.status === 200) {
    // For successful request creation
    if (isTvShow && mediaTitle) {
      if (requestedSeasons && requestedSeasons.length > 0) {
        // Check if it's all seasons or specific seasons
        const mediaDetails = data.media || data.mediaInfo || data;
        const allSeasons = mediaDetails?.seasons || [];
        const maxSeasons = allSeasons.length;
        
        if (requestedSeasons.length === maxSeasons || requestedSeasons.length === allSeasons.length) {
          return getAllSeasonsRequestSuccessMessage(mediaTitle);
        } else if (requestedSeasons.length === 1) {
          return getSeasonRequestSuccessMessage(requestedSeasons[0], mediaTitle);
        } else {
          // Multiple specific seasons
          return `✅ Your request for **seasons ${requestedSeasons.join(', ')}** of **${mediaTitle}** was sent successfully!`;
        }
      } else {
        // All seasons requested (no specific seasons array)
        return getAllSeasonsRequestSuccessMessage(mediaTitle);
      }
    } else if (mediaTitle) {
      return getMovieRequestSuccessMessage(mediaTitle);
    }
    // Fallback when we don't have media title
    return getGenericErrorMessage();
  }
  
  if (res.status === 202) {
    // For 202 Accepted, check if there's an API message
    if (apiMessage) {
      return apiMessage;
    }
    // Use success message if we have media title
    if (isTvShow && mediaTitle) {
      if (requestedSeasons && requestedSeasons.length === 1) {
        return getSeasonRequestSuccessMessage(requestedSeasons[0], mediaTitle);
      }
      return getAllSeasonsRequestSuccessMessage(mediaTitle);
    } else if (mediaTitle) {
      return getMovieRequestSuccessMessage(mediaTitle);
    }
    // Fallback when we don't have media title
    return getGenericErrorMessage();
  }

  if (res.status === 409) {
    // Conflict - already requested or available
    // Prioritize API message if available
    if (apiMessage) {
      return apiMessage;
    }
    
    // Extract numeric status from response (check 4K status if applicable)
    const statusInfo = extractMediaStatus(data, is4k);
    
    if (statusInfo) {
      // Use the same status formatting as successful requests
      const seasonStatuses = isTvShow && statusInfo.seasons && statusInfo.seasons.length > 0
        ? statusInfo.seasons
        : null;
      return formatStatusMessage(statusInfo.status, typeStr, isTvShow, seasonStatuses);
    }
    
    // Fallback message if status cannot be extracted
    return `ℹ️ Already requested or available`;
  }

  // Check for denied/forbidden statuses (403, 400 with specific messages)
  if (res.status === 403 || (res.status === 400 && apiMessage && (
    apiMessage.toLowerCase().includes('denied') ||
    apiMessage.toLowerCase().includes('permission') ||
    apiMessage.toLowerCase().includes('quota') ||
    apiMessage.toLowerCase().includes('limit')
  ))) {
    if (isTvShow) {
      return getSeasonRequestDeniedMessage();
    } else {
      return getMovieRequestDeniedMessage();
    }
  }

  // For other error statuses, try to extract API message
  if (apiMessage) {
    // Return API message as-is if available, otherwise use generic error
    return apiMessage;
  }

  // Generic error fallback
  return getGenericErrorMessage();
}

