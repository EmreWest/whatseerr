#!/usr/bin/env node

/**
 * Lightweight logger with configurable levels.
 *
 * - info: user-facing, friendly, emoji-organized
 * - debug: verbose step-by-step details
 */

const LEVELS = {
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
  
  // Get timezone offset as +HH:MM or -HH:MM
  // Create a date in the target timezone to calculate offset
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(now.toLocaleString('en-US', { timeZone }));
  const offsetMs = localDate - utcDate;
  const offsetMins = Math.round(offsetMs / 60000);
  const sign = offsetMins >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMins) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offsetMins) % 60).toString().padStart(2, '0');
  const offsetStr = `${sign}${hours}:${minutes}`;
  
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

export function createLogger(cfg = {}) {
  const level = normalizeLevel(cfg.logging?.level);
  const includeTimestamps = Boolean(cfg.logging?.timestamps);

  const prefix = (tag) => (includeTimestamps ? `${ts()} ${tag}` : tag);

  const logStdout = (...args) => console.log(...args);
  const logStderr = (...args) => console.error(...args);

  return {
    level,

    info(title, details = null) {
      if (!shouldLog(level, 'info')) return;
      const message = includeTimestamps ? `${ts()} ${title}` : title;
      if (details === null || details === undefined || details === '') {
        logStdout(message);
        return;
      }
      logStdout(message);
      logStdout(stringifyExtra(details));
    },

    debug(title, details = null) {
      if (!shouldLog(level, 'debug')) return;
      const tag = prefix('🐛 [DEBUG]');
      if (details === null || details === undefined || details === '') {
        logStdout(`${tag} ${title}`);
        return;
      }
      logStdout(`${tag} ${title}`);
      logStdout(stringifyExtra(details));
    },

    warn(title, details = null) {
      if (!shouldLog(level, 'warn')) return;
      const tag = prefix('⚠️ [WARN]');
      if (details === null || details === undefined || details === '') {
        logStderr(`${tag} ${title}`);
        return;
      }
      logStderr(`${tag} ${title}`);
      logStderr(stringifyExtra(details));
    },

    error(title, details = null) {
      if (!shouldLog(level, 'error')) return;
      const tag = prefix('❌ [ERROR]');
      if (details === null || details === undefined || details === '') {
        logStderr(`${tag} ${title}`);
        return;
      }
      logStderr(`${tag} ${title}`);
      logStderr(stringifyExtra(details));
    },
  };
}


