#!/usr/bin/env node

/**
 * WAHA API Client
 * 
 * Handles communication with WAHA (WhatsApp HTTP API) server
 * for sending messages via WhatsApp.
 */

import { createHttpClient as createBaseHttpClient } from './http-client.js';

/**
 * Creates an HTTP client for WAHA API
 * @param {string} baseUrl - WAHA API base URL (e.g., https://waha.devlike.pro)
 * @returns {Object} Client with request method
 */
export function createWahaClient(baseUrl) {
  // WAHA client uses default Content-Type header
  return createBaseHttpClient(baseUrl, { defaultContentType: true });
}

/**
 * Sends a text message via WAHA API
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us")
 * @param {string} text - Message text to send
 * @param {Object} options - Optional parameters
 * @param {string} options.replyTo - Message ID to reply to
 * @param {boolean} options.linkPreview - Enable link preview (default: true)
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function sendText(client, cfg, chatId, text, options = {}) {
  const { replyTo = null, linkPreview = true } = options;

  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  const body = {
    chatId,
    text,
    session: cfg.waha?.session || 'default',
    linkPreview,
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  const res = await client.request('POST', '/api/sendText', {
    headers,
    body,
  });

  return res;
}

