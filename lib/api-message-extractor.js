/**
 * Utility to extract API messages from responses
 * Handles both string and object responses
 */

import { MAX_USER_MESSAGE_LENGTH } from './constants.js';

/**
 * Extracts API message from response data
 * @param {Object|string} data - Response data
 * @param {number} maxLength - Maximum message length (default: MAX_USER_MESSAGE_LENGTH)
 * @returns {string|null} Extracted message or null
 */
export function extractApiMessage(data, maxLength = MAX_USER_MESSAGE_LENGTH) {
  if (typeof data === 'string') {
    const s = data.trim();
    return s ? s.slice(0, maxLength) : null;
  }
  if (data && typeof data === 'object') {
    const m = data.message || data.error || data.details || data.reason;
    return typeof m === 'string' && m.trim() ? m.trim().slice(0, maxLength) : null;
  }
  return null;
}

