#!/usr/bin/env node

/**
 * Shared utilities for Jellyseerr requester
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config.json');

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

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[FATAL] Config file not found. Please create config.json and fill it in.');
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = normalizeConfig(JSON.parse(raw));

    if (!cfg.jellyseerr?.baseUrl || !cfg.jellyseerr?.apiKey) {
      console.error('[FATAL] config.json must contain Jellyseerr config: either { "jellyseerr": { "baseUrl", "apiKey" } } or { "protocol", "host", "jellyseerr": { "port", "apiKey" } }.');
      process.exit(1);
    }

    if (requireWaha && !cfg.waha?.baseUrl) {
      console.error('[FATAL] config.json must contain WAHA config: either { "waha": { "baseUrl" } } or { "protocol", "host", "waha": { "port" } }.');
      process.exit(1);
    }

    if (requireWebhook) {
      if (!cfg.webhook?.port || typeof cfg.webhook.port !== 'number') {
        console.error('[FATAL] config.json must contain "webhook.port" (number).');
        process.exit(1);
      }
      if (!cfg.webhook?.path || typeof cfg.webhook.path !== 'string') {
        console.error('[FATAL] config.json must contain "webhook.path" (string).');
        process.exit(1);
      }
    }

    if (requireWebhookHost) {
      if (!cfg.protocol || typeof cfg.protocol !== 'string') {
        console.error('[FATAL] config.json must contain "protocol" (string), e.g. "http" or "https".');
        process.exit(1);
      }
      if (!cfg.host || typeof cfg.host !== 'string') {
        console.error('[FATAL] config.json must contain "host" (string), e.g. "192.168.1.10".');
        process.exit(1);
      }
    }

    return cfg;
  } catch (err) {
    console.error('[FATAL] Failed to read config.json:', err.message);
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

