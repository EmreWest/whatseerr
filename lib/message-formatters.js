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
export function numberToEmoji(num) {
  const emojiDigits = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  if (num >= 0 && num <= 9) {
    return emojiDigits[num];
  }
  // For numbers > 9, combine multiple emoji digits
  return String(num).split('').map(d => emojiDigits[parseInt(d, 10)]).join('');
}

/**
 * Formats search results into a numbered list message with pagination support
 * @param {Array} results - Search results array
 * @param {string} query - Search query string
 * @param {number} limit - Maximum results to display per page
 * @param {number} offset - Starting offset for pagination (default: 0)
 * @returns {Object} Object with formatted message and pagination info { message, hasMore, displayedCount, nextOffset }
 */
export function formatSearchResults(results, query = '', limit = MAX_RESULTS_DISPLAY, offset = 0) {
  const totalResults = results.length;
  const startIdx = offset;
  const endIdx = Math.min(offset + limit, totalResults);
  const displayed = results.slice(startIdx, endIdx);
  
  if (displayed.length === 0) {
    return {
      message: '❌ No results found. Try a different search.',
      hasMore: false,
      displayedCount: 0,
      nextOffset: offset
    };
  }

  let message = `✅ Search Results for "${query}"\n\n`;
  displayed.forEach((media, idx) => {
    const { title, year, typeStr } = formatMedia(media);
    const displayNum = idx + 1; // 1-based display number for current page
    const emojiNum = numberToEmoji(displayNum);
    const typeEmoji = typeStr === 'Movie' ? '🎬' : '📺';
    message += `${emojiNum}${typeEmoji} ${title} (${year})\n`;
  });
  
  const hasMore = endIdx < totalResults;
  const showMoreOption = hasMore ? displayed.length + 1 : null;
  
  if (showMoreOption) {
    const showMoreEmoji = numberToEmoji(showMoreOption);
    message += `\n${showMoreEmoji} Show more\n`;
  }
  
  message += '\n0️⃣ Cancel\n';
  message += '\n📥 Reply with a number to request.';

  return {
    message,
    hasMore,
    displayedCount: displayed.length,
    nextOffset: hasMore ? endIdx : offset
  };
}

