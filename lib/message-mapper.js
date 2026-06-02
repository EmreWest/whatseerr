/**
 * Message Mapping for Overseerr/Jellyseerr Status Responses
 * 
 * Based on Requestrr's message mapping logic, provides user-friendly messages
 * based on Overseerr API responses and status information.
 */

import { t } from './i18n/translator.js';

/**
 * Gets the appropriate message for a movie based on its status
 * @param {Object} options - Options object
 * @param {string} options.movieTitle - Movie title
 * @param {number} options.status - Status code (1-6)
 * @param {boolean} options.isRequested - Whether movie is already requested
 * @param {boolean} options.isAvailable - Whether movie is available
 * @param {boolean} options.hasNotification - Whether notification is set up (optional)
 * @param {boolean} options.isSelfRequested - Whether the current user is the original requester (optional)
 * @param {string} options.requestDate - Date when the request was made (optional, ISO string)
 * @returns {string} User-friendly message
 */
export function getMovieMessage({ movieTitle, status, isRequested, isAvailable, hasNotification = false, isSelfRequested = false, requestDate = null }) {
  if (isAvailable) {
    return `✅ ${t('message.already_available')}`;
  }
  
  if (!isRequested && !isAvailable) {
    // Can be requested
    return `💬 ${t('message.request_button')}`;
  }
  
  if (isRequested && !isAvailable) {
    // Already requested
    if (isSelfRequested) {
      // User is the original requester
      if (requestDate) {
        const date = new Date(requestDate);
        const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `📋 ${t('message.already_requested_date', formattedDate)}`;
      } else {
        return `📋 ${t('message.already_requested')}`;
      }
    } else {
      // Someone else requested it
      return `📋 ${t('message.already_requested_other')}`;
    }
  }
  
  // Fallback
  return `✅ ${t('message.already_available')}`;
}

/**
 * Gets the appropriate message for a movie request success
 * @param {string} movieTitle - Movie title
 * @returns {string} Success message
 */
export function getMovieRequestSuccessMessage(movieTitle) {
  return t('message.request_success', movieTitle);
}

/**
 * Gets the appropriate message for a movie notification success
 * @param {string} movieTitle - Movie title
 * @returns {string} Notification success message
 */
export function getMovieNotificationSuccessMessage(movieTitle) {
  return t('message.notification_success', movieTitle);
}

/**
 * Gets the appropriate message for a movie not found
 * @param {Object} options - Options object
 * @param {string} options.movieTitle - Movie title (if searched by name)
 * @param {string} options.movieTMDB - TMDB ID (if searched by ID)
 * @returns {string} Not found message
 */
export function getMovieNotFoundMessage({ movieTitle, movieTMDB }) {
  if (movieTMDB) {
    return t('message.movie_not_found_tmdb', movieTMDB);
  }
  return t('message.movie_not_found_name', movieTitle);
}

/**
 * Gets the appropriate message for a TV show season based on its status
 * @param {Object} options - Options object
 * @param {number} options.seasonNumber - Season number
 * @param {string} options.tvShowTitle - TV show title
 * @param {boolean} options.isRequested - Whether season is already requested
 * @param {boolean} options.isAvailable - Whether season is available
 * @param {boolean} options.hasNotification - Whether notification is set up (optional)
 * @returns {string} User-friendly message
 */
export function getSeasonMessage({ seasonNumber, tvShowTitle, isRequested, isAvailable, hasNotification = false }) {
  if (isAvailable) {
    return `✅ ${t('message.season_already_available', seasonNumber)}`;
  }
  
  if (!isRequested && !isAvailable) {
    // Can be requested
    return `💬 ${t('message.season_request_button', seasonNumber)}`;
  }
  
  if (isRequested && !isAvailable) {
    // Already requested
    if (hasNotification) {
      return `📋 ${t('message.season_already_requested_notify', seasonNumber)}`;
    } else {
      return `📋 ${t('message.season_already_requested', seasonNumber)}`;
    }
  }
  
  // Fallback
  return `✅ ${t('message.season_already_available', seasonNumber)}`;
}

/**
 * Gets the appropriate message for a season request success
 * @param {number} seasonNumber - Season number
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getSeasonRequestSuccessMessage(seasonNumber, tvShowTitle) {
  return t('message.request_success_season', seasonNumber, tvShowTitle);
}

/**
 * Gets the appropriate message for a season notification success
 * @param {number} seasonNumber - Season number
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Notification success message
 */
export function getSeasonNotificationSuccessMessage(seasonNumber, tvShowTitle) {
  return t('message.notification_success_season', seasonNumber, tvShowTitle);
}

/**
 * Gets the appropriate message for all seasons request
 * @param {Object} options - Options object
 * @param {string} options.tvShowTitle - TV show title
 * @param {boolean} options.canBeRequested - Whether all seasons can be requested
 * @returns {string} User-friendly message
 */
export function getAllSeasonsMessage({ tvShowTitle, canBeRequested }) {
  if (canBeRequested) {
    return t('message.all_seasons_request_button');
  }
  // If not all can be requested, individual season messages should be used
  return t('message.some_seasons_info', tvShowTitle);
}

/**
 * Gets the appropriate message for all seasons request success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getAllSeasonsRequestSuccessMessage(tvShowTitle) {
  return t('message.request_success_all_seasons', tvShowTitle);
}

/**
 * Gets the appropriate message for future seasons based on status
 * @param {Object} options - Options object
 * @param {string} options.tvShowTitle - TV show title
 * @param {boolean} options.canBeRequested - Whether future seasons can be requested
 * @param {boolean} options.allSeasonsRequested - Whether all seasons are requested
 * @param {boolean} options.allSeasonsAvailable - Whether all seasons are available
 * @param {boolean} options.hasNotification - Whether notification is set up (optional)
 * @returns {string} User-friendly message
 */
export function getFutureSeasonsMessage({
  tvShowTitle,
  canBeRequested,
  allSeasonsRequested,
  allSeasonsAvailable,
  hasNotification = false
}) {
  if (canBeRequested) {
    return t('message.future_seasons_request_button');
  }

  // Already requested scenarios
  if (allSeasonsAvailable) {
    if (hasNotification) {
      return t('message.all_seasons_available_notify');
    } else {
      return t('message.all_seasons_available');
    }
  }

  if (allSeasonsRequested) {
    if (hasNotification) {
      return t('message.all_seasons_requested_notify');
    } else {
      return t('message.all_seasons_requested');
    }
  }

  // Some future seasons requested, not all
  if (hasNotification) {
    return t('message.future_seasons_requested_notify');
  } else {
    return t('message.future_seasons_requested');
  }
}

/**
 * Gets the appropriate message for future seasons request success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getFutureSeasonsRequestSuccessMessage(tvShowTitle) {
  return t('message.future_seasons_request_success', tvShowTitle);
}

/**
 * Gets the appropriate message for future seasons notification success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Notification success message
 */
export function getFutureSeasonsNotificationSuccessMessage(tvShowTitle) {
  return t('message.future_seasons_notify_success', tvShowTitle);
}

/**
 * Gets an informative message about all seasons being requested/available
 * @param {Object} options - Options object
 * @param {boolean} options.allSeasonsAvailable - Whether all seasons are available
 * @param {Object|null} options.showDetails - TV show details with status and inProduction fields
 * @param {string} options.statusMessage - Formatted status message from formatStatusMessage
 * @returns {string} User-friendly message
 */
export function getAllSeasonsStatusMessage({ allSeasonsAvailable, showDetails = null, statusMessage = '' }) {
  // Get the show status string (e.g., "Returning Series", "Ended", "Canceled")
  const showStatus = showDetails?.status || '';

  // Build multi-line message with better formatting
  const lines = [];

  if (allSeasonsAvailable) {
    lines.push(t('message.all_seasons_status_available'));
  } else {
    lines.push(t('message.all_seasons_status_requested'));
  }

  if (showStatus) {
    lines.push(t('message.all_seasons_status_show', showStatus));
  }

  if (statusMessage) {
    // Extract emoji and text from status message (e.g., "📺 Partially available" -> "Partially available")
    // Remove leading emojis and whitespace
    const statusText = statusMessage.replace(/^[📺✅📋🏁\s]+/, '').trim();
    if (statusText) {
      lines.push(t('message.all_seasons_status_availability', statusText));
    }
  }

  return lines.join('\n');
}

/**
 * Gets the appropriate message for a show that cannot be requested
 * @returns {string} User-friendly message
 */
export function getShowCannotBeRequestedMessage() {
  return t('message.show_cannot_be_requested');
}

/**
 * Gets the appropriate message for a TV show not found
 * @param {Object} options - Options object
 * @param {string} options.tvShowTitle - TV show title (if searched by name)
 * @param {string} options.tvShowTVDBID - TVDB ID (if searched by ID)
 * @returns {string} Not found message
 */
export function getTvShowNotFoundMessage({ tvShowTitle, tvShowTVDBID }) {
  if (tvShowTVDBID) {
    return t('message.tvshow_not_found_tvdb', tvShowTVDBID);
  }
  return t('message.tvshow_not_found_name', tvShowTitle);
}

/**
 * Gets the appropriate message for a generic error
 * @returns {string} Error message
 */
export function getGenericErrorMessage() {
  return t('message.generic_error');
}


