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
 * Sends a "seen" indicator to mark a message as read
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function sendSeen(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  const body = {
    chatId,
    session: cfg.waha?.session || 'default',
  };

  logger?.debug('Sending seen indicator', { chatId, session: body.session });

  const res = await client.request('POST', '/api/sendSeen', {
    headers,
    body,
  });

  logger?.debug('WAHA sendSeen response', { status: res.status });

  return res;
}

/**
 * Starts typing indicator
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function startTyping(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  const body = {
    chatId,
    session: cfg.waha?.session || 'default',
  };

  logger?.debug('Starting typing indicator', { chatId, session: body.session });

  const res = await client.request('POST', '/api/startTyping', {
    headers,
    body,
  });

  logger?.debug('WAHA startTyping response', { status: res.status });

  return res;
}

/**
 * Stops typing indicator
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function stopTyping(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }

  const body = {
    chatId,
    session: cfg.waha?.session || 'default',
  };

  logger?.debug('Stopping typing indicator', { chatId, session: body.session });

  const res = await client.request('POST', '/api/stopTyping', {
    headers,
    body,
  });

  logger?.debug('WAHA stopTyping response', { status: res.status });

  return res;
}

/**
 * Calculates a random typing interval based on message size
 * @param {number} messageLength - Length of the message in characters
 * @returns {number} Typing interval in milliseconds
 */
function calculateTypingInterval(messageLength) {
  // Base time: 500ms
  // Per character: 10-20ms (randomized)
  // Max time: 5000ms (5 seconds)
  const baseTime = 500;
  const perCharMin = 10;
  const perCharMax = 20;
  const maxTime = 5000;
  
  const perCharTime = Math.random() * (perCharMax - perCharMin) + perCharMin;
  const calculatedTime = baseTime + (messageLength * perCharTime);
  
  return Math.min(calculatedTime, maxTime);
}

/**
 * Sends a text message via WAHA API following the recommended message processing flow:
 * 1. Start typing indicator
 * 2. Wait for random interval based on message size
 * 3. Stop typing indicator
 * 4. Send the text message
 * 
 * Note: sendSeen should be called separately when receiving a message (before processing)
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us")
 * @param {string} text - Message text to send
 * @param {Object} options - Optional parameters
 * @param {string} options.replyTo - Message ID to reply to
 * @param {boolean} options.linkPreview - Enable link preview (default: true)
 * @param {boolean} options.skipTyping - Skip typing indicators (default: false)
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function sendText(client, cfg, chatId, text, options = {}) {
  const { replyTo = null, linkPreview = true, skipTyping = false } = options;
  const logger = cfg.__logger;

  // Log outgoing message at info level with proper formatting
  // Show full message if short, or first 150 chars with ellipsis if long
  const maxPreviewLength = 150;
  const preview = text.length > maxPreviewLength 
    ? text.substring(0, maxPreviewLength).trim() + '...' 
    : text;
  logger?.info(`📤 Message to ${chatId}: ${preview}`);

  if (!skipTyping) {
    try {
      // Step 1: Start typing indicator
      await startTyping(client, cfg, chatId);

      // Step 2: Wait for random interval based on message size
      const typingInterval = calculateTypingInterval(text.length);
      logger?.debug('Typing interval calculated', { 
        messageLength: text.length, 
        intervalMs: typingInterval 
      });
      await new Promise(resolve => setTimeout(resolve, typingInterval));

      // Step 3: Stop typing indicator
      await stopTyping(client, cfg, chatId);
    } catch (err) {
      // Log error but continue with sending the message
      logger?.warn('Error in typing indicator flow', err?.message || err);
    }
  }

  // Step 4: Send the text message
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

  logger?.debug('Sending WAHA message', {
    chatId,
    textLength: text.length,
    replyTo,
    linkPreview,
    session: body.session,
  });

  const res = await client.request('POST', '/api/sendText', {
    headers,
    body,
  });

  logger?.debug('WAHA sendText response', {
    status: res.status,
    messageId: res.data?.id,
  });

  return res;
}

