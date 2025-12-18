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

/**
 * Loads and validates configuration from config.json
 * @param {Object} options - Options for config loading
 * @param {boolean} options.requireWaha - Whether WAHA config is required
 * @returns {Object} Configuration object
 */
export function loadConfig(options = {}) {
  const { requireWaha = false } = options;

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[FATAL] Config file not found. Please create config.json and fill it in.');
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);

    if (!cfg.baseUrl || !cfg.apiKey) {
      console.error('[FATAL] config.json must contain "baseUrl" and "apiKey" for Jellyseerr.');
      process.exit(1);
    }

    if (requireWaha && !cfg.waha?.baseUrl) {
      console.error('[FATAL] config.json must contain "waha.baseUrl" for WAHA API.');
      process.exit(1);
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
 * @param {string} hostOverride - Optional host override (defaults to "localhost" if not set in config)
 * @returns {string} Webhook URL
 */
export function getWebhookUrl(cfg, hostOverride = null) {
  const host = hostOverride || cfg.webhook?.host || 'localhost';
  const port = cfg.webhook?.port || 3003;
  const webhookPath = cfg.webhook?.path || '/webhook';
  return `http://${host}:${port}${webhookPath}`;
}

