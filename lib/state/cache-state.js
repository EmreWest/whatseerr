/**
 * node-cache based state management for the WhatsApp bot
 * Replaces in-memory Maps/Sets with cache that supports TTL
 */

import NodeCache from 'node-cache';

// Default TTLs (in seconds)
const DEFAULT_TTLS = {
  searchResults: 3600,      // 1 hour
  pendingSelections: 1800,  // 30 minutes
  processedMessages: 86400, // 24 hours
  promptTimestamps: 3600    // 1 hour (same as search results)
};

class CacheStateManager {
  constructor(cfg = {}) {
    const cacheConfig = cfg.cache || {};
    // node-cache uses seconds for TTL, config is also in seconds
    const ttls = {
      searchResults: cacheConfig.searchResultsTTL || DEFAULT_TTLS.searchResults,
      pendingSelections: cacheConfig.pendingSelectionsTTL || DEFAULT_TTLS.pendingSelections,
      processedMessages: cacheConfig.processedMessagesTTL || DEFAULT_TTLS.processedMessages,
      promptTimestamps: cacheConfig.promptTimestampsTTL || DEFAULT_TTLS.promptTimestamps
    };

    // Create cache instances with different TTL settings
    this.searchCache = new NodeCache({ stdTTL: ttls.searchResults, checkperiod: 600 });
    this.pendingCache = new NodeCache({ stdTTL: ttls.pendingSelections, checkperiod: 300 });
    this.processedCache = new NodeCache({ stdTTL: ttls.processedMessages, checkperiod: 600 });
    this.promptCache = new NodeCache({ stdTTL: ttls.promptTimestamps, checkperiod: 600 });
    
    // Flow lock cache (TTL should be max of all active state TTLs to prevent lock/state desync)
    // Lock should exist at least as long as any active flow state (search results or pending selections)
    // Use max to ensure lock never outlives any active state, preventing orphaned locks
    const flowLockTTL = Math.max(
      ttls.searchResults,
      ttls.pendingSelections
    );
    this.flowLockCache = new NodeCache({
      stdTTL: flowLockTTL,
      checkperiod: 600
    });
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

  // Flow lock management (prevents new commands during active flows)
  hasFlowLock(chatId) {
    const key = `flowLock:${chatId}`;
    return this.flowLockCache.has(key);
  }

  acquireFlowLock(chatId) {
    const key = `flowLock:${chatId}`;
    this.flowLockCache.set(key, true);
  }

  /**
   * Try to acquire flow lock atomically (check-and-set)
   * Returns true if lock was acquired, false if lock already exists
   * This prevents race conditions between checking and acquiring
   * @param {string} chatId - User's chat ID
   * @returns {boolean} True if lock was acquired, false if already locked
   */
  tryAcquireFlowLock(chatId) {
    const key = `flowLock:${chatId}`;
    // Check if lock already exists
    if (this.flowLockCache.has(key)) {
      return false; // Lock already exists
    }
    // Acquire lock atomically
    this.flowLockCache.set(key, true);
    return true; // Lock acquired successfully
  }

  releaseFlowLock(chatId) {
    const key = `flowLock:${chatId}`;
    this.flowLockCache.del(key);
  }

  // Prompt timestamp management (for race condition prevention)
  setPromptSentAt(chatId, timestamp) {
    const key = `prompt:${chatId}`;
    this.promptCache.set(key, timestamp);
  }

  getPromptSentAt(chatId) {
    const key = `prompt:${chatId}`;
    return this.promptCache.get(key) || null;
  }

  clearPromptSentAt(chatId) {
    const key = `prompt:${chatId}`;
    this.promptCache.del(key);
  }

  // Clear all flow state (lock + results + selections + prompt timestamps)
  clearUserFlow(chatId) {
    this.releaseFlowLock(chatId);
    this.deleteUserResults(chatId);
    this.deletePendingSelection(chatId);
    this.clearPromptSentAt(chatId);
  }

  // Validate lock/state consistency - clear orphaned locks
  validateFlowState(chatId) {
    const hasLock = this.hasFlowLock(chatId);
    const hasResults = this.hasUserResults(chatId);
    const hasPending = this.hasPendingSelection(chatId);
    
    // If lock exists but no state, it's an orphaned lock - clear it
    if (hasLock && !hasResults && !hasPending) {
      this.releaseFlowLock(chatId);
      return false;
    }
    
    return hasLock;
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
    this.flowLockCache.flushAll();
    this.promptCache.flushAll();
  }
}

// Export singleton instance
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

