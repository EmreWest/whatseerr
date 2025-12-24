#!/usr/bin/env node

/**
 * Lightweight logger with configurable levels.
 *
 * - trace: very verbose, detailed technical information (API requests/responses, internal state)
 * - debug: verbose step-by-step details (flow control, important state changes)
 * - info: user-facing, friendly, emoji-organized
 * - warn: warnings
 * - error: errors
 */

const LEVELS = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function normalizeLevel(level) {
  const v = String(level || 'info').toLowerCase().trim();
  return LEVELS[v] !== undefined ? v : 'info';
}

function shouldLog(currentLevel, msgLevel) {
  return LEVELS[currentLevel] <= LEVELS[msgLevel];
}

function ts() {
  // Use system timezone (set via TZ env var) instead of always UTC
  const now = new Date();
  const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Format date part: YYYY-MM-DD
  const dateStr = now.toLocaleDateString('en-CA', { timeZone });
  
  // Format time part: HH:mm:ss.mmm
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
  
  // Calculate timezone offset by comparing UTC time with timezone time
  // Use a fixed UTC date to get consistent offset calculation
  const utcDate = new Date('2020-01-01T12:00:00.000Z');
  const tzFormatter = new Intl.DateTimeFormat('en', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  // Format the UTC date in the target timezone to get offset
  const tzParts = tzFormatter.formatToParts(utcDate);
  const tzName = tzParts.find(p => p.type === 'timeZoneName')?.value || '';
  
  // Extract offset from formats like "GMT+3", "GMT-5", "GMT+03:00", etc.
  let offsetStr = '+00:00'; // Default fallback
  const offsetMatch = tzName.match(/([+-])(\d{1,2}):?(\d{2})?/);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = offsetMatch[2].padStart(2, '0');
    const minutes = (offsetMatch[3] || '00').padStart(2, '0');
    offsetStr = `${sign}${hours}:${minutes}`;
  }
  
  return `${dateStr}T${timeStr}${offsetStr}`;
}

function stringifyExtra(extra) {
  if (extra === undefined) return '';
  if (typeof extra === 'string') return extra;
  try {
    return JSON.stringify(extra, null, 2);
  } catch {
    return String(extra);
  }
}

function hasDetails(details) {
  return details !== null && details !== undefined && details !== '';
}

export function createLogger(cfg = {}) {
  const level = normalizeLevel(cfg.logging?.level);
  const includeTimestamps = Boolean(cfg.logging?.timestamps);
  const includeApiResponses = Boolean(cfg.logging?.apiResponse);

  const prefix = (tag) => (includeTimestamps ? `${ts()} ${tag}` : tag);

  const logStdout = (...args) => console.log(...args);
  const logStderr = (...args) => console.error(...args);

  /**
   * Filters out API response data from details object if apiResponse is disabled
   * @param {Object} details - Details object that may contain API response data
   * @returns {Object} Filtered details object
   */
  const filterApiResponseData = (details) => {
    if (includeApiResponses || !details || typeof details !== 'object') {
      return details;
    }

    const filtered = { ...details };
    const apiResponseFields = ['data', 'responseData', 'response', 'responseBody', 'fullResponse', 'body'];

    for (const field of apiResponseFields) {
      if (field in filtered) {
        delete filtered[field];
      }
    }

    return filtered;
  };

  const logMessage = (outputFn, message, details) => {
    outputFn(message);
    if (hasDetails(details)) {
      const filteredDetails = filterApiResponseData(details);
      outputFn(stringifyExtra(filteredDetails));
    }
  };

  return {
    level,

    info(title, details = null) {
      if (!shouldLog(level, 'info')) return;
      const message = includeTimestamps ? `${ts()} ${title}` : title;
      logMessage(logStdout, message, details);
    },

    trace(title, details = null) {
      if (!shouldLog(level, 'trace')) return;
      const message = `${prefix('🔍 [TRACE]')} ${title}`;
      logMessage(logStdout, message, details);
    },

    debug(title, details = null) {
      if (!shouldLog(level, 'debug')) return;
      const message = `${prefix('🐛 [DEBUG]')} ${title}`;
      logMessage(logStdout, message, details);
    },

    warn(title, details = null) {
      if (!shouldLog(level, 'warn')) return;
      const message = `${prefix('⚠️ [WARN]')} ${title}`;
      logMessage(logStderr, message, details);
    },

    error(title, details = null) {
      if (!shouldLog(level, 'error')) return;
      const message = `${prefix('❌ [ERROR]')} ${title}`;
      logMessage(logStderr, message, details);
    },
  };
}


