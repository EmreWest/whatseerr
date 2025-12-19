/**
 * Message formatting utilities
 */

import { MAX_RESULTS_DISPLAY } from './constants.js';
import { formatMedia } from './request.js';

/**
 * Converts a number to its emoji digit representation (0️⃣-9️⃣)
 * @param {number} num - Number to convert (0-9)
 * @returns {string} Emoji digit
 */
function numberToEmoji(num) {
  const emojiDigits = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  if (num >= 0 && num <= 9) {
    return emojiDigits[num];
  }
  // For numbers > 9, combine multiple emoji digits
  return String(num).split('').map(d => emojiDigits[parseInt(d, 10)]).join('');
}

/**
 * Formats search results into a numbered list message
 * @param {Array} results - Search results array
 * @param {string} query - Search query string
 * @param {number} limit - Maximum results to display
 * @returns {string} Formatted message
 */
export function formatSearchResults(results, query = '', limit = MAX_RESULTS_DISPLAY) {
  const top = results.slice(0, limit);
  if (top.length === 0) {
    return '❌ No results found. Try a different search.';
  }

  let message = `✅ Search Results for "${query}"\n\n`;
  top.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    const emojiNum = numberToEmoji(idx + 1);
    const typeEmoji = typeStr === 'Movie' ? '🎬' : '📺';
    const typeLabel = typeStr === 'TV' ? ' TV' : '';
    message += `${emojiNum}${typeEmoji} ${title} (${year})${typeLabel ? ` [${typeLabel}]` : ''}\n`;
  });
  message += '\n0️⃣ Cancel\n';
  message += '\n📥 Reply with a number to request.';

  return message;
}

