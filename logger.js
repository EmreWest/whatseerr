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
  return new Date().toISOString();
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
      if (details === null || details === undefined || details === '') {
        logStdout(title);
        return;
      }
      logStdout(title);
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


