/**
 * node-cache based state management for the WhatsApp bot
 * Replaces in-memory Maps/Sets with cache that supports TTL
 */

import NodeCache from 'node-cache';

// Default TTLs (in seconds)
const DEFAULT_TTLS = {
  searchResults: 3600,      // 1 hour
  pendingSelections: 1800,  // 30 minutes
  processedMessages: 86400  // 24 hours
};

class CacheStateManager {
  constructor(cfg = {}) {
    const cacheConfig = cfg.cache || {};
    // node-cache uses seconds for TTL, config is also in seconds
    const ttls = {
      searchResults: cacheConfig.searchResultsTTL || DEFAULT_TTLS.searchResults,
      pendingSelections: cacheConfig.pendingSelectionsTTL || DEFAULT_TTLS.pendingSelections,
      processedMessages: cacheConfig.processedMessagesTTL || DEFAULT_TTLS.processedMessages
    };

    // Create cache instances with different TTL settings
    this.searchCache = new NodeCache({ stdTTL: ttls.searchResults, checkperiod: 600 });
    this.pendingCache = new NodeCache({ stdTTL: ttls.pendingSelections, checkperiod: 300 });
    this.processedCache = new NodeCache({ stdTTL: ttls.processedMessages, checkperiod: 600 });
  }

  // Search results management
  getUserResults(chatId) {
    const key = `search:${chatId}`;
    return this.searchCache.get(key) || null;
  }

  setUserResults(chatId, data) {
    const key = `search:${chatId}`;
    this.searchCache.set(key, data);
  }

  deleteUserResults(chatId) {
    const key = `search:${chatId}`;
    this.searchCache.del(key);
  }

  hasUserResults(chatId) {
    const key = `search:${chatId}`;
    return this.searchCache.has(key);
  }

  // Pending TV selections management
  getPendingSelection(chatId) {
    const key = `pending:${chatId}`;
    return this.pendingCache.get(key) || null;
  }

  setPendingSelection(chatId, data) {
    const key = `pending:${chatId}`;
    this.pendingCache.set(key, data);
  }

  deletePendingSelection(chatId) {
    const key = `pending:${chatId}`;
    this.pendingCache.del(key);
  }

  hasPendingSelection(chatId) {
    const key = `pending:${chatId}`;
    return this.pendingCache.has(key);
  }

  // Processed messages management
  isMessageProcessed(messageId) {
    const key = `processed:${messageId}`;
    return this.processedCache.has(key);
  }

  addProcessedMessage(messageId) {
    const key = `processed:${messageId}`;
    this.processedCache.set(key, true);
  }

  // Stats for monitoring
  getStats() {
    return {
      searchResults: {
        keys: this.searchCache.keys().length,
        hits: this.searchCache.getStats().hits,
        misses: this.searchCache.getStats().misses
      },
      pendingSelections: {
        keys: this.pendingCache.keys().length,
        hits: this.pendingCache.getStats().hits,
        misses: this.pendingCache.getStats().misses
      },
      processedMessages: {
        keys: this.processedCache.keys().length,
        hits: this.processedCache.getStats().hits,
        misses: this.processedCache.getStats().misses
      }
    };
  }

  // Clear all caches (for testing/cleanup)
  clearAll() {
    this.searchCache.flushAll();
    this.pendingCache.flushAll();
    this.processedCache.flushAll();
  }
}

// Export singleton instance (will be initialized by app)
let stateManager = null;

export function createStateManager(cfg) {
  if (!stateManager) {
    stateManager = new CacheStateManager(cfg);
  }
  return stateManager;
}

export function getStateManager() {
  if (!stateManager) {
    throw new Error('StateManager not initialized. Call createStateManager() first.');
  }
  return stateManager;
}

