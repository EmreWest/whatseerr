/**
 * Season-related utilities
 * Handles season parsing, formatting, and filtering
 */

import { checkSeasonRequestStatus } from './media-status.js';
import { numberToEmoji } from './message-formatters.js';
import { t } from './i18n/translator.js';

/**
 * Parses season selection input from user
 * @param {string} input - User input (e.g., "1,2,3" or "all")
 * @param {number} maxSeasons - Maximum number of seasons available
 * @returns {Object} { seasons: number[] | "all" | null, isAll: boolean, cancelled: boolean, error: string | null }
 */
export function parseSeasonSelection(input, maxSeasons) {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === '0' || trimmed === 'cancel') {
    return { seasons: null, isAll: false, cancelled: true, error: null };
  }
  
  if (trimmed === 'all') {
    // Return "all" as string per Overseerr API spec (seasons can be array or string "all")
    // API reference: seasons: oneOf: [array of numbers, string enum: ["all"]]
    return { seasons: 'all', isAll: true, cancelled: false, error: null };
  }
  
  // Parse comma or space-separated numbers
  const numbers = trimmed.split(/[,\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  
  if (numbers.length === 0) {
    return { seasons: null, isAll: false, cancelled: false, error: t('season.invalid_format') };
  }

  // Filter out season 0 (Specials) - never allow requesting specials
  // Note: Overseerr API spec allows season 0 (minimum: 0), but we intentionally filter it out
  // API reference: seasons array items have minimum: 0, but we enforce minimum: 1 as business logic
  const filteredNumbers = numbers.filter(n => n !== 0);
  if (filteredNumbers.length === 0) {
    return { seasons: null, isAll: false, cancelled: false, error: t('season.specials_not_allowed') };
  }

  // Validate all numbers are within range (1 to maxSeasons)
  const invalid = filteredNumbers.filter(n => n < 1 || n > maxSeasons);
  if (invalid.length > 0) {
    return { seasons: null, isAll: false, cancelled: false, error: t('season.invalid_numbers', invalid.join(', '), maxSeasons) };
  }
  
  // Remove duplicates and sort
  const uniqueSeasons = [...new Set(filteredNumbers)].sort((a, b) => a - b);
  
  return { seasons: uniqueSeasons, isAll: false, cancelled: false, error: null };
}

/**
 * Filters out season 0 (Specials) from seasons array
 * @param {Array} seasons - Array of season objects
 * @returns {Array} Filtered seasons array
 */
export function filterOutSpecials(seasons) {
  if (!seasons || !Array.isArray(seasons)) {
    return [];
  }
  
  return seasons.filter(season => {
    const seasonNum = season.seasonNumber !== undefined ? season.seasonNumber : 
                      season.season_number !== undefined ? season.season_number : null;
    return seasonNum !== null && seasonNum !== 0;
  });
}

/**
 * Extracts season number from season object
 * @param {Object} season - Season object
 * @returns {number|null} Season number or null
 */
export function getSeasonNumber(season) {
  if (!season) return null;
  return season.seasonNumber !== undefined ? season.seasonNumber : 
         season.season_number !== undefined ? season.season_number : null;
}

/**
 * Formats available seasons into a message
 * @param {Array} seasons - Array of season objects from Jellyseerr
 * @param {Object} mediaDetails - Media details for status checking
 * @param {boolean} is4k - Whether to check 4K status instead of standard status
 * @returns {string} Formatted message
 */
export function formatSeasons(seasons, mediaDetails = null, is4k = false) {
  if (!seasons || seasons.length === 0) {
    return t('season.no_seasons_available');
  }

  // Filter out season 0 (Specials) - never show or allow requesting specials
  const filteredSeasons = filterOutSpecials(seasons);

  if (filteredSeasons.length === 0) {
    return t('season.no_seasons_available');
  }

  // Get show status if available
  const showStatus = mediaDetails?.status || '';
  const statusPrefix = showStatus ? `${t('season.show_status', showStatus)}\n\n` : '';

  let message = `${statusPrefix}${t('season.select_prompt')}\n`;
  filteredSeasons.forEach((season, idx) => {
    // Handle different season object structures
    const seasonNum = getSeasonNumber(season) ?? (idx + 1);
    const name = (season.name || season.seasonName) ? ` - ${season.name || season.seasonName}` : '';
    const episodeCount = (season.episodeCount || season.episode_count) ?
                         ` (${season.episodeCount || season.episode_count} eps)` : '';

    // Check season status and show indicators
    let indicator = '';
    if (mediaDetails) {
      const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum, is4k);
      if (seasonStatus.isAvailable) {
        indicator = ' ✅'; // Available in library
      } else if (seasonStatus.isRequested) {
        indicator = ' 📋'; // Requested but not available
      }
    }

    const emojiNum = numberToEmoji(seasonNum);
    message += `${emojiNum} S${seasonNum}${name}${episodeCount}${indicator}\n`;
  });
  message += `\n${t('season.cancel_option')}\n`;
  message += `\n${t('season.reply_prompt')}`;

  return message;
}

