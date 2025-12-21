/**
 * Message Mapping for Overseerr/Jellyseerr Status Responses
 * 
 * Based on Requestrr's message mapping logic, provides user-friendly messages
 * based on Overseerr API responses and status information.
 */

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
    return `✅ This movie is already available, enjoy!`;
  }
  
  if (!isRequested && !isAvailable) {
    // Can be requested
    return `💬 If you want to request this movie please click on the request button directly under this message.`;
  }
  
  if (isRequested && !isAvailable) {
    // Already requested
    if (isSelfRequested) {
      // User is the original requester
      if (requestDate) {
        const date = new Date(requestDate);
        const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `📋 You already requested this movie on ${formattedDate}.`;
      } else {
        return `📋 You already requested this movie.`;
      }
    } else {
      // Someone else requested it
      if (hasNotification) {
        return `📋 This movie has already been requested. You will be notified when it becomes available.`;
      } else {
        return `📋 This movie has already been requested. You will be notified when it becomes available.`;
      }
    }
  }
  
  // Fallback
  return `✅ This movie is already available, enjoy!`;
}

/**
 * Gets the appropriate message for a movie request success
 * @param {string} movieTitle - Movie title
 * @returns {string} Success message
 */
export function getMovieRequestSuccessMessage(movieTitle) {
  return `✅ Your request for **${movieTitle}** was sent successfully!`;
}

/**
 * Gets the appropriate message for a movie request denied
 * @returns {string} Denied message
 */
export function getMovieRequestDeniedMessage() {
  return `❌ Your request was denied by the provider due to insufficient permissions or quota limits.`;
}

/**
 * Gets the appropriate message for a movie notification success
 * @param {string} movieTitle - Movie title
 * @returns {string} Notification success message
 */
export function getMovieNotificationSuccessMessage(movieTitle) {
  return `🔔 You will now receive a notification as soon as **${movieTitle}** becomes available to watch.`;
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
    return `❌ I could not find any movie with TheMovieDbId of "${movieTMDB}", please try something different.`;
  }
  return `❌ I could not find any movie with the name "${movieTitle}", please try something different.`;
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
    return `✅ **Season ${seasonNumber}** is already available, enjoy!`;
  }
  
  if (!isRequested && !isAvailable) {
    // Can be requested
    return `💬 If you want to request **season ${seasonNumber}** of this tv show please click on the request button directly under this message.`;
  }
  
  if (isRequested && !isAvailable) {
    // Already requested
    if (hasNotification) {
      return `📋 **Season ${seasonNumber}** has already been requested and you will be notified when it becomes available.`;
    } else {
      return `📋 **Season ${seasonNumber}** has already been requested.`;
    }
  }
  
  // Fallback
  return `✅ **Season ${seasonNumber}** is already available, enjoy!`;
}

/**
 * Gets the appropriate message for a season request success
 * @param {number} seasonNumber - Season number
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getSeasonRequestSuccessMessage(seasonNumber, tvShowTitle) {
  return `✅ Your request for the **season ${seasonNumber}** of **${tvShowTitle}** was sent successfully!`;
}

/**
 * Gets the appropriate message for a season notification success
 * @param {number} seasonNumber - Season number
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Notification success message
 */
export function getSeasonNotificationSuccessMessage(seasonNumber, tvShowTitle) {
  return `🔔 You will now receive a notification as soon as **season ${seasonNumber}** of **${tvShowTitle}** becomes available to watch.`;
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
    return `💬 If you want to request **all seasons** of this tv show please click on the request button directly under this message.`;
  }
  // If not all can be requested, individual season messages should be used
  return `ℹ️ Some seasons of **${tvShowTitle}** are already requested or available.`;
}

/**
 * Gets the appropriate message for all seasons request success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getAllSeasonsRequestSuccessMessage(tvShowTitle) {
  return `✅ Your request for **all seasons** of **${tvShowTitle}** was sent successfully!`;
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
    return `💬 If you want to request **future seasons** of this tv show please click on the request button directly under this message.`;
  }
  
  // Already requested scenarios
  if (allSeasonsAvailable) {
    if (hasNotification) {
      return `✅ **All seasons** are available and you will be notified when new seasons become available.`;
    } else {
      return `✅ **All seasons** are already available.`;
    }
  }
  
  if (allSeasonsRequested) {
    if (hasNotification) {
      return `📋 **All seasons** have already been requested and you will be notified when new seasons become available.`;
    } else {
      return `📋 **All seasons** have been already requested.`;
    }
  }
  
  // Some future seasons requested, not all
  if (hasNotification) {
    return `📋 **Future seasons** have already been requested and you will be notified when they becomes available.`;
  } else {
    return `📋 **Future seasons** have already been requested.`;
  }
}

/**
 * Gets the appropriate message for future seasons request success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Success message
 */
export function getFutureSeasonsRequestSuccessMessage(tvShowTitle) {
  return `✅ Your request for **future seasons** of **${tvShowTitle}** was sent successfully!`;
}

/**
 * Gets the appropriate message for future seasons notification success
 * @param {string} tvShowTitle - TV show title
 * @returns {string} Notification success message
 */
export function getFutureSeasonsNotificationSuccessMessage(tvShowTitle) {
  return `🔔 You will now receive a notification as soon as any **future seasons** of **${tvShowTitle}** becomes available to watch.`;
}

/**
 * Gets the appropriate message for a TV show that has ended
 * @param {Object} options - Options object
 * @param {boolean} options.allSeasonsAvailable - Whether all seasons are available
 * @param {boolean} options.allSeasonsRequested - Whether all seasons are requested
 * @returns {string} User-friendly message
 */
export function getShowEndedMessage({ allSeasonsAvailable, allSeasonsRequested }) {
  if (allSeasonsAvailable) {
    return `🏁 This show has ended, and **all seasons** are available.`;
  }
  if (allSeasonsRequested) {
    return `🏁 This show has ended, and **all seasons** have been requested.`;
  }
  return `🏁 This show has ended.`;
}

/**
 * Gets the appropriate message for a show that cannot be requested
 * @returns {string} User-friendly message
 */
export function getShowCannotBeRequestedMessage() {
  return `⚠️ This show cannot be automatically requested, please ask the server owner to manually add it.`;
}

/**
 * Gets the appropriate message for a season request denied
 * @returns {string} Denied message
 */
export function getSeasonRequestDeniedMessage() {
  return `❌ Your request was denied by the provider due to an insufficient quota limit or insufficient roles.`;
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
    return `❌ I could not find any tv show with the TvDbId of "${tvShowTVDBID}", please try something different.`;
  }
  return `❌ I could not find any tv show with the name "${tvShowTitle}", please try something different.`;
}

/**
 * Gets the appropriate message for a generic error
 * @returns {string} Error message
 */
export function getGenericErrorMessage() {
  return `❌ An unexpected error occurred while trying to process your request.`;
}

/**
 * Helper function to check if user has notification set up for media
 * This would need to check the Overseerr API for user notification preferences
 * For now, returns false as we don't have notification checking implemented
 * @param {Object} mediaDetails - Media details from API
 * @param {string} userId - User ID (optional)
 * @returns {boolean} Whether notification is set up
 */
export function hasNotificationSetUp(mediaDetails, userId = null) {
  // Note: Notification checking via Overseerr API is not currently implemented
  // This would require checking user notification preferences or request notification status
  // For now, we'll assume notifications are not set up
  return false;
}

