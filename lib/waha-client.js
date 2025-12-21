#!/usr/bin/env node

/**
 * WAHA API Client
 * 
 * Handles communication with WAHA (WhatsApp HTTP API) server
 * for sending messages via WhatsApp.
 */

import { createHttpClient as createBaseHttpClient } from './http-client.js';
import { isLidFormat, ensureLidFormat, setLidMapping, extractPhoneNumber } from './utils.js';

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
    const phoneNumberOnly = extractPhoneNumber(phoneNumber);
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
 * Gets LID (Linked ID) from phone number via WAHA API
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} phoneChatId - Phone number format chatId (e.g., "96566674323@c.us")
 * @returns {Promise<string|null>} LID format chatId (e.g., "151169980723349@lid") or null if not found
 */
export async function getLidByPhoneNumber(client, cfg, phoneChatId) {
  const logger = cfg.__logger;
  
  logger?.debug('Starting phone number to LID resolution', { phoneChatId });
  
  if (!phoneChatId || typeof phoneChatId !== 'string' || !phoneChatId.endsWith('@c.us')) {
    logger?.warn('Invalid phone number format - must end with @c.us', { phoneChatId, type: typeof phoneChatId });
    return null;
  }

  // Extract phone number (part before @c.us) - use utility function for consistency
  const phoneNumber = extractPhoneNumber(phoneChatId);
  logger?.debug('Extracted phone number', { phoneChatId, phoneNumber });
  
  // extractPhoneNumber already validates format, so just check for null
  if (!phoneNumber) {
    logger?.warn('Invalid phone number format', { phoneChatId });
    return null;
  }

  const headers = createWahaHeaders(cfg);
  const session = cfg.waha?.session || 'default';
  const url = `/api/${session}/lids/pn/${phoneNumber}`;

  logger?.debug('Calling WAHA API to get LID from phone number', { 
    phoneChatId, 
    phoneNumber, 
    session, 
    url,
    hasApiKey: !!cfg.waha?.apiKey
  });

  try {
    const res = await client.request('GET', url, { headers });
    
    logger?.debug('WAHA API response received for LID lookup', { 
      phoneChatId, 
      status: res.status,
      hasData: !!res.data
    });

    if (res.status !== 200) {
      logger?.warn('WAHA API returned non-200 status for LID lookup', { 
        phoneChatId, 
        status: res.status,
        responseData: res.data
      });
      return null;
    }

    // Response format: { "lid": "151169980723349@lid", "pn": "96566674323@c.us" }
    const lid = res.data?.lid;
    logger?.debug('Extracted LID from API response', { 
      phoneChatId, 
      lid,
      fullResponse: res.data
    });
    
    if (!lid || typeof lid !== 'string') {
      logger?.warn('Invalid LID in API response', { 
        phoneChatId, 
        lid,
        response: res.data 
      });
      return null;
    }

    logger?.debug('Phone number successfully resolved to LID', { 
      phoneChatId, 
      lid
    });
    
    return lid;
  } catch (err) {
    logger?.warn('Exception during phone number to LID resolution', { 
      phoneChatId, 
      error: err?.message || err,
      errorType: err?.constructor?.name,
      stack: err?.stack
    });
    return null;
  }
}

/**
 * Helper function for WAHA chat actions (seen, typing indicators)
 * Internal function - only called by sendMessage after LID conversion
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} lidChatId - WhatsApp chat ID in LID format (already converted)
 * @param {string} endpoint - API endpoint (e.g., '/api/sendSeen', '/api/startTyping')
 * @param {string} actionName - Name for logging (e.g., 'seen indicator', 'typing indicator')
 * @returns {Promise<Object>} Response from WAHA API
 */
async function sendChatAction(client, cfg, lidChatId, endpoint, actionName) {
  const logger = cfg.__logger;
  const headers = createWahaHeaders(cfg);
  const body = createWahaBody(cfg, lidChatId);

  logger?.debug(`Sending ${actionName}`, { 
    chatId: lidChatId, 
    session: body.session
  });

  const res = await client.request('POST', endpoint, {
    headers,
    body,
  });

  logger?.debug(`WAHA ${actionName} response`, { status: res.status });
  return res;
}

/**
 * Sends a "seen" indicator to mark a message as read
 * Internal function - only called by sendMessage after LID conversion
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} lidChatId - WhatsApp chat ID in LID format (already converted by sendMessage)
 * @returns {Promise<Object>} Response from WAHA API
 */
async function sendSeen(client, cfg, lidChatId) {
  return sendChatAction(client, cfg, lidChatId, '/api/sendSeen', 'seen indicator');
}

/**
 * Starts typing indicator
 * Internal function - only called by sendMessage after LID conversion
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} lidChatId - WhatsApp chat ID in LID format (already converted by sendMessage)
 * @returns {Promise<Object>} Response from WAHA API
 */
async function startTyping(client, cfg, lidChatId) {
  return sendChatAction(client, cfg, lidChatId, '/api/startTyping', 'typing indicator start');
}

/**
 * Stops typing indicator
 * Internal function - only called by sendMessage after LID conversion
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} lidChatId - WhatsApp chat ID in LID format (already converted by sendMessage)
 * @returns {Promise<Object>} Response from WAHA API
 */
async function stopTyping(client, cfg, lidChatId) {
  return sendChatAction(client, cfg, lidChatId, '/api/stopTyping', 'typing indicator stop');
}

/**
 * Counts only alphanumeric characters (excludes emojis, spaces, and punctuation)
 * This simulates actual typing time more accurately since only letters/numbers require typing
 * @param {string} text - Message text
 * @returns {number} Count of alphanumeric characters only
 */
function countRegularTextChars(text) {
  // Match only letters and numbers - excludes emojis, spaces, punctuation, and special symbols
  const alphanumericPattern = /[a-zA-Z0-9]/g;
  const matches = text.match(alphanumericPattern);
  return matches ? matches.length : 0;
}

/**
 * Calculates a random typing interval based on message size
 * Only counts regular text characters (excludes emojis/special symbols)
 * Simulates realistic human typing speed (40-50 WPM = ~200-250 chars/min = ~240-300ms per char)
 * @param {string} text - Message text
 * @returns {number} Typing interval in milliseconds
 */
function calculateTypingInterval(text) {
  // Count only regular text characters (excludes emojis and special symbols)
  const regularCharCount = countRegularTextChars(text);
  
  // Base time: 500ms (minimum time to show typing started)
  // Per character: 200-300ms (realistic typing speed: 40-50 WPM = ~3-4 chars/sec)
  // Max time: 5000ms (5 seconds max to avoid excessive delays)
  const baseTime = 500;
  const perCharMin = 200;
  const perCharMax = 300;
  const maxTime = 5000;
  
  // Randomize per-character time to simulate natural typing variation
  const perCharTime = Math.random() * (perCharMax - perCharMin) + perCharMin;
  const calculatedTime = baseTime + (regularCharCount * perCharTime);
  
  return Math.min(calculatedTime, maxTime);
}

/**
 * Ensures chatId is in LID format. Converts phone number to LID if needed using WAHA API.
 * LID format is required for all messaging operations per WAHA API requirements.
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object
 * @param {string} chatId - Chat ID in any format
 * @returns {Promise<string>} LID format chatId (throws error if cannot convert)
 */
export async function ensureLidFormatForMessaging(client, cfg, chatId) {
  const logger = cfg.__logger;
  
  if (!chatId || typeof chatId !== 'string') {
    throw new Error(`Invalid chatId: ${chatId}`);
  }
  
  // Already in LID format - return as is
  if (chatId.endsWith('@lid')) {
    return chatId;
  }
  
  // Phone number format - convert to LID
  if (chatId.endsWith('@c.us')) {
    // First try config mapping (fast, synchronous)
    const lidFromConfig = ensureLidFormat(cfg, chatId);
    if (lidFromConfig) {
      logger?.debug('Using LID from config mapping', { phoneChatId: chatId, lidChatId: lidFromConfig });
      return lidFromConfig;
    }
    
    // If not in config, lookup via WAHA API
    logger?.debug('LID not in config, looking up via WAHA API', { phoneChatId: chatId });
    const lidFromApi = await getLidByPhoneNumber(client, cfg, chatId);
    
    if (!lidFromApi) {
      throw new Error(`Cannot resolve LID for phone number: ${chatId}. LID format is required for messaging.`);
    }
    
    // Save mapping for future use
    setLidMapping(cfg, chatId, lidFromApi, logger);
    logger?.debug('Converted phone number to LID via API', { phoneChatId: chatId, lidChatId: lidFromApi });
    
    return lidFromApi;
  }
  
  // Unknown format
  throw new Error(`Invalid chatId format: ${chatId}. Expected format ending with @lid or @c.us`);
}

/**
 * Sends a text message via WAHA API following WhatsApp guidelines:
 * 1. Convert chatId to LID format if needed (LID is REQUIRED for all messaging)
 * 2. Send seen indicator (always)
 * 3. Start typing indicator
 * 4. Wait for random interval based on message size
 * 5. Stop typing indicator
 * 6. Send the text message
 * 
 * This is the main function to use for all message sending to ensure compliance.
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (will be converted to LID format if phone number)
 * @param {string} text - Message text to send
 * @param {Object} options - Optional parameters
 * @param {string} options.replyTo - Message ID to reply to
 * @param {boolean} options.linkPreview - Enable link preview (default: true)
 * @returns {Promise<Object>} Response from WAHA API
 */
export async function sendMessage(client, cfg, chatId, text, options = {}) {
  const { replyTo = null, linkPreview = true } = options;
  const logger = cfg.__logger;

  // Convert to LID format (REQUIRED for messaging)
  let lidChatId;
  try {
    lidChatId = await ensureLidFormatForMessaging(client, cfg, chatId);
  } catch (err) {
    logger?.error('Failed to convert chatId to LID format', { 
      chatId, 
      error: err?.message || err 
    });
    throw err;
  }

  // Log outgoing message at info level with proper formatting
  // Show full message if short, or first 150 chars with ellipsis if long
  const maxPreviewLength = 150;
  const preview = text.length > maxPreviewLength 
    ? text.substring(0, maxPreviewLength).trim() + '...' 
    : text;
  logger?.info(`📤 Message to ${lidChatId}: ${preview}`);

  try {
    // Step 1: ALWAYS send seen indicator first (using LID format)
    try {
      await sendSeen(client, cfg, lidChatId);
      logger?.debug('Sent seen indicator');
    } catch (err) {
      // Log error but continue - seen is best effort
      logger?.warn('Failed to send seen indicator', err?.message || err);
    }

    // Step 2: Start typing indicator (using LID format)
    try {
      await startTyping(client, cfg, lidChatId);
      logger?.debug('Started typing indicator');
    } catch (err) {
      logger?.warn('Failed to start typing indicator', err?.message || err);
    }

    // Step 3: Wait for random interval based on message size (alphanumeric chars only)
    const typingInterval = calculateTypingInterval(text);
    const regularCharCount = countRegularTextChars(text);
    logger?.debug('Typing interval calculated', { 
      messageLength: text.length,
      regularCharCount,
      intervalMs: typingInterval 
    });
    await new Promise(resolve => setTimeout(resolve, typingInterval));

    // Step 4: Stop typing indicator (using LID format)
    try {
      await stopTyping(client, cfg, lidChatId);
      logger?.debug('Stopped typing indicator');
    } catch (err) {
      logger?.warn('Failed to stop typing indicator', err?.message || err);
    }

    // Step 5: Send the text message (using LID format)
    const headers = createWahaHeaders(cfg);
    const body = createWahaBody(cfg, lidChatId, {
      text,
      linkPreview,
      ...(replyTo && { reply_to: replyTo })
    });

    logger?.debug('Sending WAHA message', {
      originalChatId: chatId,
      lidChatId,
      textLength: text.length,
      replyTo,
      linkPreview,
      session: body.session
    });

    const res = await client.request('POST', '/api/sendText', {
      headers,
      body,
    });

    // API returns 201 Created for successful message sends (200 also acceptable)
    if (res.status !== 201 && res.status !== 200) {
      logger?.warn('Unexpected status code from sendText', {
        status: res.status,
        expected: [200, 201],
        responseData: res.data
      });
    }

    logger?.debug('WAHA message response', {
      status: res.status,
      messageId: res.data?.id,
    });

    return res;
  } catch (err) {
    logger?.error('Error in sendMessage flow', err?.message || err);
    if (err?.stack) {
      logger?.debug('sendMessage error stack', err.stack);
    }
    throw err;
  }
}

/**
 * Gets a message by ID from WAHA API
 * @param {Object} client - WAHA HTTP client
 * @param {Object} cfg - Configuration object with waha settings
 * @param {string} chatId - WhatsApp chat ID (can be phone or LID format)
 * @param {string} messageId - Full message ID to fetch (format: {fromMe}_{chatId}_{message_id})
 * @returns {Promise<Object|null>} Message object or null if not found
 */
export async function getMessageById(client, cfg, chatId, messageId) {
  const logger = cfg.__logger;
  
  if (!chatId || !messageId) {
    logger?.warn('Invalid parameters for getMessageById', { chatId, messageId });
    return null;
  }
  
  // Ensure LID format for chatId (required by WAHA API)
  let lidChatId;
  try {
    if (chatId.endsWith('@lid')) {
      lidChatId = chatId;
    } else if (chatId.endsWith('@c.us')) {
      // Convert phone to LID format
      const lidFromConfig = ensureLidFormat(cfg, chatId);
      if (lidFromConfig) {
        lidChatId = lidFromConfig;
      } else {
        const lidFromApi = await getLidByPhoneNumber(client, cfg, chatId);
        if (!lidFromApi) {
          logger?.warn('Cannot resolve LID for chatId in getMessageById', { chatId });
          return null;
        }
        lidChatId = lidFromApi;
      }
    } else {
      logger?.warn('Invalid chatId format in getMessageById', { chatId });
      return null;
    }
  } catch (err) {
    logger?.warn('Error converting chatId to LID format in getMessageById', {
      chatId,
      error: err?.message || err
    });
    return null;
  }
  
  const headers = createWahaHeaders(cfg);
  const session = cfg.waha?.session || 'default';
  // WAHA API requires the full serialized message ID format: {fromMe}_{chatId}_{message_id}
  // Per API docs: messageId format is "{fromMe}_{chat}_{message_id}[_{participant}]"
  // Example: "true_123456789@c.us_BAE6A33293978B16"
  // The messageId from reaction events is already in this format
  // We need to URL encode it properly for the path parameter
  const encodedMessageId = encodeURIComponent(messageId);
  const url = `/api/${session}/chats/${lidChatId}/messages/${encodedMessageId}`;
  
  logger?.debug('Fetching message by ID', { chatId, lidChatId, messageId, encodedMessageId, url });
  
  try {
    const res = await client.request('GET', url, { headers });
    
    if (res.status !== 200) {
      logger?.warn('Failed to fetch message by ID', {
        chatId,
        messageId,
        status: res.status,
        responseData: res.data
      });
      return null;
    }
    
    return res.data;
  } catch (err) {
    logger?.warn('Exception fetching message by ID', {
      chatId,
      messageId,
      error: err?.message || err
    });
    return null;
  }
}

