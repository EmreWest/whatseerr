#!/usr/bin/env node

/**
 * Shared utilities for Jellyseerr requester
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config is expected at /config/config.json (primary location for Docker containers)
// Falls back to root directory config.json for local development
function getConfigPath() {
  // Primary location: /config/config.json (used in Docker containers)
  const primaryConfigPath = '/config/config.json';
  if (fs.existsSync(primaryConfigPath)) {
    return primaryConfigPath;
  }
  // Fallback: root directory config.json (for local development)
  return path.join(__dirname, '..', 'config.json');
}

function buildBaseUrl({ protocol, host, port }) {
  if (!protocol || !host || !port) return null;
  return `${protocol}://${host}:${port}`;
}

function buildOverseerrApiBaseUrl(baseUrl) {
  if (!baseUrl) return null;
  const u = new URL(baseUrl);
  const normalizedPath = u.pathname.replace(/\/+$/, '');
  if (normalizedPath.endsWith('/api/v1')) {
    u.pathname = normalizedPath;
  } else {
    u.pathname = `${normalizedPath}/api/v1`;
  }
  // IMPORTANT: Ensure trailing slash so URL resolution keeps the /api/v1/ prefix.
  // (new URL("request", "http://host/api/v1/") => http://host/api/v1/request)
  return u.toString().replace(/\/+$/, '') + '/';
}

function normalizeConfig(rawCfg) {
  const cfg = { ...rawCfg };

  // Detect legacy schema (top-level baseUrl/apiKey)
  const hasLegacyJellyseerr = typeof cfg.baseUrl === 'string' || typeof cfg.apiKey === 'string';

  // If jellyseerr object is missing, build it from legacy keys.
  if (!cfg.jellyseerr) {
    cfg.jellyseerr = {};
  }

  if (!cfg.jellyseerr.baseUrl && typeof cfg.baseUrl === 'string') {
    cfg.jellyseerr.baseUrl = cfg.baseUrl;
  }
  if (!cfg.jellyseerr.apiKey && typeof cfg.apiKey === 'string') {
    cfg.jellyseerr.apiKey = cfg.apiKey;
  }
  if (cfg.jellyseerr.defaultUserId === undefined && cfg.defaultUserId !== undefined) {
    cfg.jellyseerr.defaultUserId = cfg.defaultUserId;
  }
  if (cfg.jellyseerr.defaultServer === undefined && cfg.defaultServer !== undefined) {
    cfg.jellyseerr.defaultServer = cfg.defaultServer;
  }

  // Ensure waha object exists.
  if (!cfg.waha) {
    cfg.waha = {};
  }

  // If using new-style host+port, derive base URLs (but do not override explicit baseUrl).
  if (!cfg.jellyseerr.baseUrl && cfg.protocol && cfg.host && cfg.jellyseerr?.port) {
    cfg.jellyseerr.baseUrl = buildBaseUrl({ protocol: cfg.protocol, host: cfg.host, port: cfg.jellyseerr.port });
  }
  if (!cfg.waha.baseUrl && cfg.protocol && cfg.host && cfg.waha?.port) {
    cfg.waha.baseUrl = buildBaseUrl({ protocol: cfg.protocol, host: cfg.host, port: cfg.waha.port });
  }

  // Derived API base URL for Overseerr/Jellyseerr that includes the /api/v1 prefix.
  // This lets call sites use paths like "/request" to match the official API reference.
  if (cfg.jellyseerr?.baseUrl) {
    cfg.jellyseerr.apiBaseUrl = buildOverseerrApiBaseUrl(cfg.jellyseerr.baseUrl);
  }

  // Back-compat: if caller code still references legacy keys, keep them aligned.
  if (hasLegacyJellyseerr || cfg.jellyseerr?.baseUrl) {
    cfg.baseUrl = cfg.jellyseerr.baseUrl;
    cfg.apiKey = cfg.jellyseerr.apiKey;
    cfg.defaultUserId = cfg.jellyseerr.defaultUserId;
    cfg.defaultServer = cfg.jellyseerr.defaultServer;
  }

  return cfg;
}

/**
 * Loads and validates configuration from config.json
 * @param {Object} options - Options for config loading
 * @param {boolean} options.requireWaha - Whether WAHA config is required
 * @param {boolean} options.requireWebhook - Whether webhook config is required
 * @param {boolean} options.requireWebhookHost - Whether protocol+host are required to build a public webhook URL
 * @returns {Object} Configuration object
 */
export function loadConfig(options = {}) {
  const { requireWaha = false, requireWebhook = false, requireWebhookHost = false } = options;
  const logger = createLogger({ logging: { level: 'error' } });

  const configPath = getConfigPath();
  
  // Log which config path is being used (at debug level to avoid noise)
  if (logger && logger.debug) {
    logger.debug(`Loading config from: ${configPath}`);
  }
  
  if (!fs.existsSync(configPath)) {
    logger.error(`Config file not found at ${configPath}. Please create config.json and fill it in.`);
    if (configPath === '/config/config.json') {
      logger.error('Expected config at /config/config.json (Docker container). Make sure config volume is mounted correctly.');
    }
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = normalizeConfig(JSON.parse(raw));

    if (!cfg.jellyseerr?.baseUrl || !cfg.jellyseerr?.apiKey) {
      logger.error('config.json missing Jellyseerr config. Provide either jellyseerr.baseUrl+apiKey or protocol+host+jellyseerr.port+apiKey.');
      process.exit(1);
    }

    if (requireWaha && !cfg.waha?.baseUrl) {
      logger.error('config.json missing WAHA config. Provide either waha.baseUrl or protocol+host+waha.port.');
      process.exit(1);
    }

    if (requireWebhook) {
      if (!cfg.webhook?.port || typeof cfg.webhook.port !== 'number') {
        logger.error('config.json must contain webhook.port (number).');
        process.exit(1);
      }
      if (!cfg.webhook?.path || typeof cfg.webhook.path !== 'string') {
        logger.error('config.json must contain webhook.path (string).');
        process.exit(1);
      }
    }

    if (requireWebhookHost) {
      if (!cfg.protocol || typeof cfg.protocol !== 'string') {
        logger.error('config.json must contain protocol (string), e.g. "http" or "https".');
        process.exit(1);
      }
      if (!cfg.host || typeof cfg.host !== 'string') {
        logger.error('config.json must contain host (string), e.g. "192.168.1.10".');
        process.exit(1);
      }
    }

    return cfg;
  } catch (err) {
    logger.error('Failed to read config.json', err?.message || err);
    process.exit(1);
  }
}

/**
 * Gets the webhook URL from config, with optional host override
 * @param {Object} cfg - Configuration object
 * @param {string} hostOverride - Optional host override (if provided, takes precedence over config.host)
 * @returns {string} Webhook URL
 */
export function getWebhookUrl(cfg, hostOverride = null) {
  const protocol = cfg.protocol;
  const host = hostOverride || cfg.host;
  const port = cfg.webhook?.port;
  const webhookPath = cfg.webhook?.path;
  if (!protocol || !host || !port || !webhookPath) {
    throw new Error('Missing webhook config: expected protocol, host, webhook.port, webhook.path in config.json');
  }
  return `${protocol}://${host}:${port}${webhookPath}`;
}

/**
 * Extracts phone number from WAHA chatId
 * ChatId format: "96566674323@c.us" -> "96566674323"
 * @param {string} chatId - WAHA chatId
 * @returns {string|null} Phone number or null if not found
 */
export function extractPhoneNumber(chatId) {
  if (!chatId || typeof chatId !== 'string') {
    return null;
  }
  // Match phone number before @c.us
  const match = chatId.match(/^(\d+)@c\.us$/);
  return match ? match[1] : null;
}

/**
 * Gets userId from mappings based on chatId, or falls back to defaultUserId
 * @param {Object} cfg - Configuration object
 * @param {string} chatId - WAHA chatId (e.g., "96566674323@c.us")
 * @returns {number|null} User ID or null if not found
 */
export function getUserIdFromChatId(cfg, chatId) {
  if (!chatId) {
    // Fallback to defaultUserId if no chatId provided
    return cfg.jellyseerr?.defaultUserId || cfg.defaultUserId || null;
  }

  const phoneNumber = extractPhoneNumber(chatId);
  if (!phoneNumber) {
    // Invalid chatId format, fallback to defaultUserId
    return cfg.jellyseerr?.defaultUserId || cfg.defaultUserId || null;
  }

  // Check userIdMappings first
  const mappings = cfg.userIdMappings || {};
  if (mappings[phoneNumber] !== undefined) {
    return mappings[phoneNumber];
  }

  // Fallback to defaultUserId
  return cfg.jellyseerr?.defaultUserId || cfg.defaultUserId || null;
}

