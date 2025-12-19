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
 * Creates WAHA API headers with optional API key
 * @param {Object} cfg - Configuration object with waha settings
 * @returns {Object} Headers object
 */
function createWahaHeaders(cfg) {
  const headers = {};
  if (cfg.waha?.apiKey) {
    headers['X-Api-Key'] = cfg.waha.apiKey;
  }
  return headers;
}

/**
 * Creates WAHA API body with chatId and session
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID
 * @param {Object} additionalFields - Additional fields to include in body
 * @returns {Object} Body object
 */
function createWahaBody(cfg, chatId, additionalFields = {}) {
  return {
    chatId,
    session: cfg.waha?.session || 'default',
    ...additionalFields
  };
}

/**
 * Gets identifier type information for logging (with dynamic import to avoid circular dependency)
 * @param {string} chatId - WAHA chatId
 * @returns {Promise<Object>} Identifier type information
 */
async function getIdentifierTypeInfo(chatId) {
  const { getIdentifierType } = await import('./utils.js');
  return getIdentifierType(chatId);
}

/**
 * Gets phone number from LID (Linked ID) via WAHA API
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} lid - LID format chatId (e.g., "151169980723349@lid")
 * @returns {Promise<string|null>} Phone number in @c.us format or null if not found
 */
export async function getPhoneNumberByLid(client, cfg, lid) {
  const logger = cfg.__logger;
  
  logger?.debug('Starting LID resolution', { lid });
  
  if (!lid || typeof lid !== 'string' || !lid.endsWith('@lid')) {
    logger?.warn('Invalid LID format - must end with @lid', { lid, type: typeof lid });
    return null;
  }

  // Extract LID number (part before @lid)
  const lidNumber = lid.replace('@lid', '');
  logger?.debug('Extracted LID number', { lid, lidNumber });
  
  if (!lidNumber || !/^\d+$/.test(lidNumber)) {
    logger?.warn('Invalid LID number format - must be numeric', { lid, lidNumber });
    return null;
  }

  const headers = createWahaHeaders(cfg);
  if (cfg.waha?.apiKey) {
    logger?.debug('Using API key for LID resolution');
  } else {
    logger?.debug('No API key configured for LID resolution');
  }

  const session = cfg.waha?.session || 'default';
  const url = `/api/${session}/lids/${lidNumber}`;

  logger?.debug('Calling WAHA API to resolve LID', { 
    lid, 
    lidNumber, 
    session, 
    url,
    hasApiKey: !!cfg.waha?.apiKey
  });

  try {
    const res = await client.request('GET', url, { headers });
    
    logger?.debug('WAHA API response received', { 
      lid, 
      status: res.status,
      hasData: !!res.data
    });

    if (res.status !== 200) {
      logger?.warn('WAHA API returned non-200 status for LID resolution', { 
        lid, 
        status: res.status,
        responseData: res.data
      });
      return null;
    }

    // Response format: { "lid": "151169980723349@lid", "pn": "96566674323@c.us" }
    const phoneNumber = res.data?.pn;
    logger?.debug('Extracted phone number from API response', { 
      lid, 
      phoneNumber,
      fullResponse: res.data
    });
    
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      logger?.warn('Invalid phone number in API response', { 
        lid, 
        phoneNumber,
        response: res.data 
      });
      return null;
    }

    logger?.debug('LID successfully resolved to phone number', { 
      lid, 
      phoneNumber,
      lidNumber
    });
    
    // Extract just the phone number part (without @c.us) for logging
    // Use extractPhoneNumber from utils to avoid duplicating regex
    const { extractPhoneNumber: extractPhone } = await import('./utils.js');
    const phoneNumberOnly = extractPhone(phoneNumber);
    if (phoneNumberOnly) {
      logger?.info(`📞 LID resolved: ${lid} → ${phoneNumber} → extracted phone number: ${phoneNumberOnly}`);
    } else {
      logger?.info(`📞 LID resolved: ${lid} → ${phoneNumber}`);
    }
    
    return phoneNumber;
  } catch (err) {
    logger?.warn('Exception during LID resolution', { 
      lid, 
      error: err?.message || err,
      errorType: err?.constructor?.name,
      stack: err?.stack
    });
    return null;
  }
}

/**
 * Sends a "seen" indicator to mark a message as read
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us" or "151169980723349@lid")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function sendSeen(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = createWahaHeaders(cfg);
  const body = createWahaBody(cfg, chatId);

  const identifierInfo = await getIdentifierTypeInfo(chatId);
  logger?.debug('Sending seen indicator [USES LID FORMAT]', { 
    chatId, 
    session: body.session,
    ...identifierInfo
  });

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
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us" or "151169980723349@lid")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function startTyping(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = createWahaHeaders(cfg);
  const body = createWahaBody(cfg, chatId);

  const identifierInfo = await getIdentifierTypeInfo(chatId);
  logger?.debug('Starting typing indicator [USES LID FORMAT]', { 
    chatId, 
    session: body.session,
    ...identifierInfo
  });

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
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us" or "151169980723349@lid")
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function stopTyping(client, cfg, chatId) {
  const logger = cfg.__logger;
  const headers = createWahaHeaders(cfg);
  const body = createWahaBody(cfg, chatId);

  const identifierInfo = await getIdentifierTypeInfo(chatId);
  logger?.debug('Stopping typing indicator [USES LID FORMAT]', { 
    chatId, 
    session: body.session,
    ...identifierInfo
  });

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
 * @param {string} chatId - WhatsApp chat ID (e.g., "11111111111@c.us" or "151169980723349@lid")
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
  const headers = createWahaHeaders(cfg);
  const body = createWahaBody(cfg, chatId, {
    text,
    linkPreview,
    ...(replyTo && { reply_to: replyTo })
  });

  const identifierInfo = await getIdentifierTypeInfo(chatId);
  logger?.debug('Sending WAHA message [USES LID FORMAT]', {
    chatId,
    textLength: text.length,
    replyTo,
    linkPreview,
    session: body.session,
    ...identifierInfo
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

