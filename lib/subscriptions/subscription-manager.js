/**
 * Subscription Manager for Media Notification Subscriptions
 * 
 * Handles persistent storage of user subscriptions to media availability notifications.
 * Subscriptions are stored in a separate JSON file for persistence across restarts.
 * 
 * Enhanced format structure:
 * Key format: "mediaId:type:quality" (e.g., "307962:tv:standard")
 * {
 *   "key": {
 *     "title": "Show Title",
 *     "year": "2024",
 *     "typeStr": "TV Show",
 *     "subscribers": [
 *       {
 *         "lid": "151169980723349@lid",
 *         "phoneNumber": "96566674323",
 *         "userId": 1,
 *         "username": "User"
 *       }
 *     ]
 *   }
 * }
 */

import fs from 'fs';
import path from 'path';
import { getConfigPath } from '../utils.js';
import { getErrorDetails } from '../errors/error-formatter.js';
import { extractPhoneNumber, getLidFromPhoneNumber } from '../utils.js';
import { formatQualityText, formatMediaType } from '../request.js';

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

/**
 * Checks if a subscription entry is in the old format (array of chatIds)
 * @param {*} entry - Subscription entry
 * @returns {boolean} True if old format
 */
function isOldFormat(entry) {
  return Array.isArray(entry);
}

/**
 * Migrates old format subscription to new format
 * @param {string} key - Subscription key
 * @param {string[]} chatIds - Array of chat IDs (old format)
 * @param {Object} cfg - Configuration object for user mappings
 * @returns {Object} New format subscription entry
 */
function migrateToNewFormat(key, chatIds, cfg = null) {
  const parts = key.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid subscription key format: ${key}`);
  }
  
  const [mediaId, type, quality] = parts;
  const subscribers = chatIds.map(lid => {
    const subscriber = { lid };
    
    // Try to get phone number from lidMappings
    if (cfg?.lidMappings) {
      // Reverse lookup: find phoneChatId that maps to this lid
      for (const [phoneChatId, mappedLid] of Object.entries(cfg.mappings?.lidMappings || {})) {
        if (mappedLid === lid) {
          const phoneNumber = extractPhoneNumber(phoneChatId);
          if (phoneNumber) {
            subscriber.phoneNumber = phoneNumber;
            
            // Get userId and username from userIdMappings
            const userIdMappings = cfg.mappings?.userIdMappings || {};
            const userMapping = userIdMappings[phoneNumber];
            if (userMapping) {
              subscriber.userId = userMapping.userId;
              subscriber.username = userMapping.username || '';
            }
          }
          break;
        }
      }
    }
    
    return subscriber;
  });
  
  return {
    title: '',
    year: null,
    typeStr: null,
    subscribers
  };
}

/**
 * Gets chat IDs from a subscription entry (handles both old and new formats)
 * @param {*} entry - Subscription entry (array or object)
 * @returns {string[]} Array of chat IDs (LIDs)
 */
function getChatIdsFromEntry(entry) {
  if (isOldFormat(entry)) {
    return entry;
  }
  // New format: extract lids from subscribers array
  return entry.subscribers?.map(sub => sub.lid).filter(Boolean) || [];
}

class SubscriptionManager {
  constructor(logger = null, cfg = null) {
    this.logger = logger;
    this.cfg = cfg;
    this.subscriptionsPath = getSubscriptionsPath();
    this.subscriptions = {}; // In-memory cache: { key: entry (array or object) }
    this.loadSubscriptions();
  }

  /**
   * Loads subscriptions from file into memory
   * Migrates old format to new format if needed
   */
  loadSubscriptions() {
    try {
      if (fs.existsSync(this.subscriptionsPath)) {
        const content = fs.readFileSync(this.subscriptionsPath, 'utf8');
        const data = JSON.parse(content);
        const rawSubscriptions = data.subscriptions || {};
        
        // Migrate old format to new format if needed
        let migrated = false;
        this.subscriptions = {};
        
        for (const [key, entry] of Object.entries(rawSubscriptions)) {
          if (isOldFormat(entry)) {
            // Migrate old format to new format
            try {
              this.subscriptions[key] = migrateToNewFormat(key, entry, this.cfg);
              migrated = true;
              this.logger?.debug('Migrated subscription to new format', { key });
            } catch (err) {
              this.logger?.warn('Failed to migrate subscription', {
                key,
                error: getErrorDetails(err, 'migrateToNewFormat')
              });
              // Keep old format as fallback
              this.subscriptions[key] = entry;
            }
          } else {
            // Already in new format
            this.subscriptions[key] = entry;
          }
        }
        
        // Save if migration occurred
        if (migrated) {
          this.saveSubscriptions();
          this.logger?.info('🔄 Migrated subscriptions to enhanced format');
        }
        
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
   * @param {string} chatId - User's chat ID (LID format)
   * @param {string} title - Optional media title
   * @param {string|null} year - Optional media year
   * @param {string|null} typeStr - Optional media type string ('Movie' or 'TV Show')
   * @returns {boolean} True if subscription was added, false if already exists
   */
  addSubscription(mediaId, mediaType, is4k, chatId, title = '', year = null, typeStr = null) {
    if (!mediaId || !chatId) {
      this.logger?.warn('Invalid parameters for addSubscription', { mediaId, chatId });
      return false;
    }

    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    
    // Initialize entry if it doesn't exist
    if (!this.subscriptions[key]) {
      this.subscriptions[key] = {
        title: title || '',
        year: year || null,
        typeStr: typeStr || null,
        subscribers: []
      };
    } else if (isOldFormat(this.subscriptions[key])) {
      // Migrate old format entry
      this.subscriptions[key] = migrateToNewFormat(key, this.subscriptions[key], this.cfg);
    }
    
    const entry = this.subscriptions[key];

    // Check if already subscribed
    const existingSubscriber = entry.subscribers.find(sub => sub.lid === chatId);
    if (existingSubscriber) {
      this.logger?.debug('User already subscribed', { key, chatId });
      // Update metadata if provided and different
      let updated = false;
      if (title && title !== entry.title) {
        entry.title = title;
        updated = true;
      }
      if (year && year !== entry.year) {
        entry.year = year;
        updated = true;
      }
      if (typeStr && typeStr !== entry.typeStr) {
        entry.typeStr = typeStr;
        updated = true;
      }
      if (updated) {
        this.saveSubscriptions();
      }
      return false;
    }

    // Create subscriber object
    const subscriber = { lid: chatId };
    
    // Try to enrich with user info from config
    if (this.cfg?.lidMappings) {
      // Reverse lookup: find phoneChatId that maps to this lid
      for (const [phoneChatId, mappedLid] of Object.entries(this.cfg.mappings?.lidMappings || {})) {
        if (mappedLid === chatId) {
          const phoneNumber = extractPhoneNumber(phoneChatId);
          if (phoneNumber) {
            subscriber.phoneNumber = phoneNumber;
            
            // Get userId and username from userIdMappings
            const userIdMappings = this.cfg.mappings?.userIdMappings || {};
            const userMapping = userIdMappings[phoneNumber];
            if (userMapping) {
              subscriber.userId = userMapping.userId;
              subscriber.username = userMapping.username || '';
            }
          }
          break;
        }
      }
    }
    
    entry.subscribers.push(subscriber);
    
    // Update metadata if provided and different
    if (title && title !== entry.title) {
      entry.title = title;
    }
    if (year && year !== entry.year) {
      entry.year = year;
    }
    if (typeStr && typeStr !== entry.typeStr) {
      entry.typeStr = typeStr;
    }
    
    this.saveSubscriptions();
    
    this.logger?.info(`🔔 Subscription added (${entry.subscribers.length} subscriber${entry.subscribers.length !== 1 ? 's' : ''})`);
    return true;
  }

  /**
   * Removes a subscription for a user
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @param {string} chatId - User's chat ID (LID format)
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

    const entry = this.subscriptions[key];
    
    // Handle old format
    if (isOldFormat(entry)) {
      const index = entry.indexOf(chatId);
      if (index === -1) {
        return false;
      }
      entry.splice(index, 1);
      
      // Clean up empty keys
      if (entry.length === 0) {
        delete this.subscriptions[key];
      }
    } else {
      // New format: remove from subscribers array
      const index = entry.subscribers.findIndex(sub => sub.lid === chatId);
    if (index === -1) {
      return false;
    }

      entry.subscribers.splice(index, 1);
    
    // Clean up empty keys
      if (entry.subscribers.length === 0) {
      delete this.subscriptions[key];
      }
    }

    this.saveSubscriptions();
    
    // Include title in log if available
    const title = !isOldFormat(entry) && entry.title ? entry.title : null;
    const qualityText = formatQualityText(is4k);
    const mediaTypeText = formatMediaType(mediaType);
    if (title) {
      this.logger?.info(`🔔 Subscription removed: "${title}"${qualityText}`);
    } else {
      this.logger?.info(`🔔 Subscription removed: ${mediaTypeText} (ID: ${mediaId})${qualityText}`);
    }
    return true;
  }

  /**
   * Gets all subscribers for a specific media item
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @returns {string[]} Array of chat IDs (LIDs) subscribed to this media
   */
  getSubscribers(mediaId, mediaType, is4k) {
    if (!mediaId) {
      return [];
    }

    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    const entry = this.subscriptions[key];
    
    if (!entry) {
      return [];
    }
    
    return getChatIdsFromEntry(entry);
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
   * @param {string} chatId - User's chat ID (LID format)
   * @returns {Array} Array of subscription objects { mediaId, mediaType, is4k, title, year, typeStr }
   */
  getUserSubscriptions(chatId) {
    if (!chatId) {
      return [];
    }
    
    const userSubscriptions = [];
    
    for (const [key, entry] of Object.entries(this.subscriptions)) {
      const chatIds = getChatIdsFromEntry(entry);
      
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
        
        const subscription = {
          mediaId: parsedMediaId,
          mediaType: mediaType === 'movie' ? 'movie' : 'tv',
          is4k: quality === '4k'
        };
        
        // Add metadata if available (new format)
        if (!isOldFormat(entry)) {
          if (entry.title) {
            subscription.title = entry.title;
          }
          if (entry.year) {
            subscription.year = entry.year;
          }
          if (entry.typeStr) {
            subscription.typeStr = entry.typeStr;
          }
        }
        
        userSubscriptions.push(subscription);
      }
    }
    
    return userSubscriptions;
  }

  /**
   * Removes all subscriptions for a specific user
   * @param {string} chatId - User's chat ID (LID format)
   * @returns {number} Number of subscriptions removed
   */
  removeAllUserSubscriptions(chatId) {
    let removed = 0;
    
    for (const [key, entry] of Object.entries(this.subscriptions)) {
      if (isOldFormat(entry)) {
        const index = entry.indexOf(chatId);
        if (index !== -1) {
          entry.splice(index, 1);
          removed++;
          
          // Clean up empty keys
          if (entry.length === 0) {
            delete this.subscriptions[key];
          }
        }
      } else {
        // New format
        const index = entry.subscribers.findIndex(sub => sub.lid === chatId);
      if (index !== -1) {
          entry.subscribers.splice(index, 1);
        removed++;
        
        // Clean up empty keys
          if (entry.subscribers.length === 0) {
          delete this.subscriptions[key];
          }
        }
      }
    }
    
    if (removed > 0) {
      this.saveSubscriptions();
      this.logger?.info(`🔔 Removed ${removed} subscription${removed !== 1 ? 's' : ''} for user`);
    }
    
    return removed;
  }

  /**
   * Gets statistics about subscriptions
   * @returns {Object} Statistics object
   */
  getStats() {
    const totalKeys = Object.keys(this.subscriptions).length;
    const totalSubscriptions = Object.values(this.subscriptions).reduce((sum, entry) => {
      return sum + (isOldFormat(entry) ? entry.length : entry.subscribers?.length || 0);
    }, 0);
    
    return {
      totalMediaItems: totalKeys,
      totalSubscriptions,
      filePath: this.subscriptionsPath
    };
  }
  
  /**
   * Updates metadata for a subscription
   * @param {number} mediaId - Media ID (TMDB ID)
   * @param {string|number} mediaType - Media type ('movie'|'tv' or 1|2)
   * @param {boolean} is4k - Whether this is a 4K subscription
   * @param {string|null} title - Media title (optional)
   * @param {string|null} year - Media year (optional)
   * @param {string|null} typeStr - Media type string (optional)
   * @returns {boolean} True if metadata was updated
   */
  updateMetadata(mediaId, mediaType, is4k, title = null, year = null, typeStr = null) {
    if (!mediaId) {
      return false;
    }
    
    const key = createSubscriptionKey(mediaId, mediaType, is4k);
    const entry = this.subscriptions[key];
    
    if (!entry) {
      return false;
    }
    
    // Migrate old format if needed
    if (isOldFormat(entry)) {
      this.subscriptions[key] = migrateToNewFormat(key, entry, this.cfg);
    }
    
    let updated = false;
    if (title && this.subscriptions[key].title !== title) {
      this.subscriptions[key].title = title;
      updated = true;
    }
    if (year && this.subscriptions[key].year !== year) {
      this.subscriptions[key].year = year;
      updated = true;
    }
    if (typeStr && this.subscriptions[key].typeStr !== typeStr) {
      this.subscriptions[key].typeStr = typeStr;
      updated = true;
    }
    
    if (updated) {
      this.saveSubscriptions();
      this.logger?.debug('Updated subscription metadata', { key, title, year, typeStr });
    }
    return updated;
  }

  /**
   * Clears all subscriptions (for testing/cleanup)
   */
  clearAll() {
    this.subscriptions = {};
    this.saveSubscriptions();
    this.logger?.info('🔔 Cleared all subscriptions');
  }
}

// Export singleton instance
let subscriptionManager = null;

/**
 * Creates the subscription manager instance
 * @param {Object} logger - Logger instance
 * @param {Object} cfg - Configuration object (for user mappings)
 * @returns {SubscriptionManager} Subscription manager instance
 */
export function createSubscriptionManager(logger = null, cfg = null) {
  if (!subscriptionManager) {
    subscriptionManager = new SubscriptionManager(logger, cfg);
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

