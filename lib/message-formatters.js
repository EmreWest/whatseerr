/**
 * Message formatting utilities
 */

import { MAX_RESULTS_DISPLAY } from './constants.js';
import { formatMedia } from './request.js';

/**
 * Formats search results into a numbered list message
 * @param {Array} results - Search results array
 * @param {number} limit - Maximum results to display
 * @returns {string} Formatted message
 */
export function formatSearchResults(results, limit = MAX_RESULTS_DISPLAY) {
  const top = results.slice(0, limit);
  if (top.length === 0) {
    return '❌ No results found. Try a different search.';
  }

  let message = '📋 Results:\n';
  top.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    message += `${idx + 1}. ${title} (${year}) [${typeStr}]\n`;
  });
  message += '\n0. Cancel\n';
  message += '\nReply with a number to request.';

  return message;
}

