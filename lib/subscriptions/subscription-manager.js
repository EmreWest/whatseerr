/**
 * Subscription Manager for Media Notification Subscriptions
 * 
 * Handles persistent storage of user subscriptions to media availability notifications.
 * Subscriptions are stored in a separate JSON file for persistence across restarts.
 */

import fs from 'fs';
import path from 'path';
import { getConfigPath } from '../utils.js';
import { getErrorDetails } from '../errors/error-formatter.js';

/**
 * Gets the subscriptions file path (same location as config.json)
 * @returns {string} Path to subscriptions.json
 */
function getSubscriptionsPath() {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  return path.join(configDir, 'subscriptions.json');
}

/**
 * Creates a subscription key from media details
 * @param {number} mediaId - Media ID (TMDB ID)
 * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
 * @param {boolean} is4k - Whether this is a 4K subscription
 * @returns {string} Subscription key
 */
function createSubscriptionKey(mediaId, mediaType, is4k) {
  // Normalize mediaType to string
  const type = typeof mediaType === 'number' 
    ? (mediaType === 1 ? 'movie' : 'tv')
    : mediaType;
  return `${mediaId}:${type}:${is4k ? '4k' : 'standard'}`;
}

class SubscriptionManager {
  constructor(logger = null) {
    this.logger = logger;
    this.subscriptionsPath = getSubscriptionsPath();
    this.subscriptions = {}; // In-memory cache: { key: [chatIds] }
    this.loadSubscriptions();
  }

  /**
   * Loads subscriptions from file into memory
   */
  loadSubscriptions() {
    try {
      if (fs.existsSync(this.subscriptionsPath)) {
        const content = fs.readFileSync(this.subscriptionsPath, 'utf8');
        const data = JSON.parse(content);
        this.subscriptions = data.subscriptions || {};
        this.logger?.debug('Loaded subscriptions from file', {
          path: this.subscriptionsPath,
          count: Object.keys(this.subscriptions).length
        });
      } else {
        this.subscriptions = {};
        this.logger?.debug('Subscriptions file not found, starting with empty subscriptions', {
          path: this.subscriptionsPath
        });
      }
    } catch (err) {
      this.logger?.warn('Failed to load subscriptions file', {
        ...getErrorDetails(err, 'loadSubscriptions'),
        path: this.subscriptionsPath
      });
      this.subscriptions = {};
    }
  }

  /**
   * Saves subscriptions to file
   * @returns {boolean} True if successful, false otherwise
   */
  saveSubscriptions() {
    try {
      // Ensure directory exists before writing
      const dir = path.dirname(this.subscriptionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {
        subscriptions: this.subscriptions,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.subscriptionsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      this.logger?.debug('Saved subscriptions to file', {
        path: this.subscriptionsPath,
        count: Object.keys(this.subscriptions).length
      });
      return true;
    } catch (err) {
      this.logger?.warn('Failed to save subscriptions file', {
        ...getErrorDetails(err, 'saveSubscriptions'),
        path: this.subscriptionsPath
      });
      return false;
    }
  }

  /**
   * Adds a subscription for a user to receive notifications for specific media
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @param {string} chatId - User's chat ID
   * @returns {boolean} True if subscription was added, false if already exists
   */
  addSubscription(mediaId, mediaType, is4k, chatId) {
    if (!mediaId || !chatId) {
      this.logger?.warn('Invalid parameters for addSubscription', { mediaId, chatId });
      return false;
    }

    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    
    if (!this.subscriptions[key]) {
      this.subscriptions[key] = [];
    }

    // Check if already subscribed
    if (this.subscriptions[key].includes(chatId)) {
      this.logger?.debug('User already subscribed', { key, chatId });
      return false;
    }

    this.subscriptions[key].push(chatId);
    this.saveSubscriptions();
    
    this.logger?.info('Subscription added', { key, chatId, totalSubscribers: this.subscriptions[key].length });
    return true;
  }

  /**
   * Removes a subscription for a user
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @param {string} chatId - User's chat ID
   * @returns {boolean} True if subscription was removed, false if it didn't exist
   */
  removeSubscription(mediaId, mediaType, is4k, chatId) {
    if (!mediaId || !chatId) {
      this.logger?.warn('Invalid parameters for removeSubscription', { mediaId, chatId });
      return false;
    }

    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    
    if (!this.subscriptions[key]) {
      return false;
    }

    const index = this.subscriptions[key].indexOf(chatId);
    if (index === -1) {
      return false;
    }

    this.subscriptions[key].splice(index, 1);
    
    // Clean up empty keys
    if (this.subscriptions[key].length === 0) {
      delete this.subscriptions[key];
    }

    this.saveSubscriptions();
    
    this.logger?.info('Subscription removed', { key, chatId });
    return true;
  }

  /**
   * Gets all subscribers for a specific media item
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @returns {string[]} Array of chat IDs subscribed to this media
   */
  getSubscribers(mediaId, mediaType, is4k) {
    if (!mediaId) {
      return [];
    }

    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    return this.subscriptions[key] || [];
  }

  /**
   * Checks if a user is subscribed to a specific media item
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @param {string} chatId - User's chat ID
   * @returns {boolean} True if user is subscribed
   */
  isSubscribed(mediaId, mediaType, is4k, chatId) {
    const subscribers = this.getSubscribers(mediaId, mediaType, is4k);
    return subscribers.includes(chatId);
  }

  /**
   * Gets all subscriptions for a specific user
   * @param {string} chatId - User's chat ID
   * @returns {Array} Array of subscription objects { mediaId, mediaType, is4k }
   */
  getUserSubscriptions(chatId) {
    if (!chatId) {
      return [];
    }
    
    const userSubscriptions = [];
    
    for (const [key, chatIds] of Object.entries(this.subscriptions)) {
      if (chatIds.includes(chatId)) {
        // Parse key: "mediaId:mediaType:quality"
        const parts = key.split(':');
        if (parts.length !== 3) {
          this.logger?.warn('Invalid subscription key format', { key });
          continue;
        }
        
        const [mediaId, mediaType, quality] = parts;
        const parsedMediaId = parseInt(mediaId, 10);
        if (isNaN(parsedMediaId)) {
          this.logger?.warn('Invalid mediaId in subscription key', { key, mediaId });
          continue;
        }
        
        userSubscriptions.push({
          mediaId: parsedMediaId,
          mediaType: mediaType === 'movie' ? 'movie' : 'tv',
          is4k: quality === '4k'
        });
      }
    }
    
    return userSubscriptions;
  }

  /**
   * Removes all subscriptions for a specific user
   * @param {string} chatId - User's chat ID
   * @returns {number} Number of subscriptions removed
   */
  removeAllUserSubscriptions(chatId) {
    let removed = 0;
    
    for (const [key, chatIds] of Object.entries(this.subscriptions)) {
      const index = chatIds.indexOf(chatId);
      if (index !== -1) {
        chatIds.splice(index, 1);
        removed++;
        
        // Clean up empty keys
        if (chatIds.length === 0) {
          delete this.subscriptions[key];
        }
      }
    }
    
    if (removed > 0) {
      this.saveSubscriptions();
      this.logger?.info('Removed all user subscriptions', { chatId, count: removed });
    }
    
    return removed;
  }

  /**
   * Gets statistics about subscriptions
   * @returns {Object} Statistics object
   */
  getStats() {
    const totalKeys = Object.keys(this.subscriptions).length;
    const totalSubscriptions = Object.values(this.subscriptions).reduce((sum, chatIds) => sum + chatIds.length, 0);
    
    return {
      totalMediaItems: totalKeys,
      totalSubscriptions,
      filePath: this.subscriptionsPath
    };
  }

  /**
   * Clears all subscriptions (for testing/cleanup)
   */
  clearAll() {
    this.subscriptions = {};
    this.saveSubscriptions();
    this.logger?.info('Cleared all subscriptions');
  }
}

// Export singleton instance
let subscriptionManager = null;

/**
 * Creates the subscription manager instance
 * @param {Object} logger - Logger instance
 * @returns {SubscriptionManager} Subscription manager instance
 */
export function createSubscriptionManager(logger = null) {
  if (!subscriptionManager) {
    subscriptionManager = new SubscriptionManager(logger);
  }
  return subscriptionManager;
}

/**
 * Gets the subscription manager instance
 * @returns {SubscriptionManager} Subscription manager instance
 */
export function getSubscriptionManager() {
  if (!subscriptionManager) {
    throw new Error('SubscriptionManager not initialized. Call createSubscriptionManager() first.');
  }
  return subscriptionManager;
}

