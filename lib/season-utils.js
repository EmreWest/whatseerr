/**
 * Season-related utilities
 * Handles season parsing, formatting, and filtering
 */

import { checkSeasonRequestStatus } from './media-status.js';

/**
 * Parses season selection input from user
 * @param {string} input - User input (e.g., "1,2,3" or "all")
 * @param {number} maxSeasons - Maximum number of seasons available
 * @returns {Object} { seasons: number[] | null, cancelled: boolean, error: string | null }
 */
export function parseSeasonSelection(input, maxSeasons) {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === '0' || trimmed === 'cancel') {
    return { seasons: null, cancelled: true, error: null };
  }
  
  if (trimmed === 'all') {
    // "all" excludes season 0 (Specials) - only seasons 1 to maxSeasons
    return { seasons: Array.from({ length: maxSeasons }, (_, i) => i + 1), cancelled: false, error: null };
  }
  
  // Parse comma or space-separated numbers
  const numbers = trimmed.split(/[,\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  
  if (numbers.length === 0) {
    return { seasons: null, cancelled: false, error: 'Invalid format. Use numbers (e.g., "1" or "1,2,3") or "all"' };
  }
  
  // Filter out season 0 (Specials) - never allow requesting specials
  const filteredNumbers = numbers.filter(n => n !== 0);
  if (filteredNumbers.length === 0) {
    return { seasons: null, cancelled: false, error: 'Season 0 (Specials) cannot be requested' };
  }
  
  // Validate all numbers are within range (1 to maxSeasons)
  const invalid = filteredNumbers.filter(n => n < 1 || n > maxSeasons);
  if (invalid.length > 0) {
    return { seasons: null, cancelled: false, error: `Invalid season numbers: ${invalid.join(', ')}. Valid range: 1-${maxSeasons}` };
  }
  
  // Remove duplicates and sort
  const uniqueSeasons = [...new Set(filteredNumbers)].sort((a, b) => a - b);
  
  return { seasons: uniqueSeasons, cancelled: false, error: null };
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
 * @returns {string} Formatted message
 */
export function formatSeasons(seasons, mediaDetails = null) {
  if (!seasons || seasons.length === 0) {
    return '❌ No seasons available.';
  }
  
  // Filter out season 0 (Specials) - never show or allow requesting specials
  const filteredSeasons = filterOutSpecials(seasons);
  
  if (filteredSeasons.length === 0) {
    return '❌ No seasons available.';
  }
  
  let message = '📺 Select seasons:\n';
  filteredSeasons.forEach((season, idx) => {
    // Handle different season object structures
    const seasonNum = getSeasonNumber(season) ?? (idx + 1);
    const name = (season.name || season.seasonName) ? ` - ${season.name || season.seasonName}` : '';
    const episodeCount = (season.episodeCount || season.episode_count) ? 
                         ` (${season.episodeCount || season.episode_count} eps)` : '';
    
    // Check season status and show indicators
    let indicator = '';
    if (mediaDetails) {
      const seasonStatus = checkSeasonRequestStatus(mediaDetails, seasonNum);
      if (seasonStatus.isAvailable) {
        indicator = ' ✅'; // Available in library
      } else if (seasonStatus.isRequested) {
        indicator = ' 📋'; // Requested but not available
      }
    }
    
    message += `${seasonNum}. S${seasonNum}${name}${episodeCount}${indicator}\n`;
  });
  message += '\n0. Cancel | all. All seasons\n';
  message += '\nReply: number(s) or "all"';
  
  return message;
}

