/**
 * Queue management for message processing and API calls
 */

import PQueue from 'p-queue';

class QueueManager {
  constructor(cfg = {}) {
    const queueConfig = cfg.queues || {};
    
    // Message processing queue (handles incoming messages - fallback for messages without chatId)
    this.messageQueue = new PQueue({
      concurrency: queueConfig.messageConcurrency || 5,
      interval: 1000,
      intervalCap: queueConfig.messageConcurrency || 5
    });

    // Per-user message queues (ensures sequential processing per user)
    // Each user gets their own queue with concurrency 1 to prevent race conditions
    this.userQueues = new Map(); // chatId -> PQueue
    this.userQueueCleanupInterval = 5 * 60 * 1000; // 5 minutes
    this.userQueueTimestamps = new Map(); // chatId -> lastUsed timestamp
    
    // Start cleanup timer for idle user queues
    this.cleanupTimer = setInterval(() => this.cleanupIdleUserQueues(), this.userQueueCleanupInterval);

    // API request queue (handles Jellyseerr API calls)
    this.apiQueue = new PQueue({
      concurrency: queueConfig.apiConcurrency || 3,
      interval: 1000,
      intervalCap: queueConfig.apiConcurrency || 3
    });

    // Webhook processing queue (handles incoming webhooks)
    this.webhookQueue = new PQueue({
      concurrency: queueConfig.webhookConcurrency || 10,
      interval: 1000,
      intervalCap: queueConfig.webhookConcurrency || 10
    });
  }

  /**
   * Add a task to the message processing queue
   * Use this for messages without a chatId (fallback)
   */
  async addMessageTask(fn) {
    return this.messageQueue.add(fn, { priority: 1 });
  }

  /**
   * Add a task to a per-user message queue
   * Ensures sequential processing per user to prevent race conditions
   * @param {string} chatId - User's chat ID
   * @param {Function} fn - Task function to execute
   * @returns {Promise} Promise that resolves when task completes
   */
  async addUserMessageTask(chatId, fn) {
    if (!chatId) {
      // Fallback to global queue if no chatId
      return this.addMessageTask(fn);
    }

    // Get or create per-user queue (concurrency: 1 ensures sequential processing)
    if (!this.userQueues.has(chatId)) {
      this.userQueues.set(chatId, new PQueue({ concurrency: 1 }));
    }
    
    // Update last used timestamp
    this.userQueueTimestamps.set(chatId, Date.now());
    
    const userQueue = this.userQueues.get(chatId);
    return userQueue.add(fn, { priority: 1 });
  }

  /**
   * Clean up idle user queues to prevent memory leaks
   */
  cleanupIdleUserQueues() {
    const now = Date.now();
    const idleThreshold = this.userQueueCleanupInterval;

    for (const [chatId, timestamp] of this.userQueueTimestamps.entries()) {
      const idleTime = now - timestamp;
      if (idleTime >= idleThreshold) {
        const queue = this.userQueues.get(chatId);
        // Only cleanup if queue is empty and idle
        if (queue && queue.size === 0 && queue.pending === 0) {
          this.userQueues.delete(chatId);
          this.userQueueTimestamps.delete(chatId);
        }
      }
    }
  }

  /**
   * Add a task to the API request queue
   */
  async addApiTask(fn) {
    return this.apiQueue.add(fn, { priority: 1 });
  }

  /**
   * Add a task to the webhook processing queue
   */
  async addWebhookTask(fn) {
    return this.webhookQueue.add(fn, { priority: 1 });
  }

  /**
   * Get queue stats
   */
  getStats() {
    return {
      messageQueue: {
        size: this.messageQueue.size,
        pending: this.messageQueue.pending,
        concurrency: this.messageQueue.concurrency
      },
      userQueues: {
        count: this.userQueues.size,
        totalSize: Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.size, 0),
        totalPending: Array.from(this.userQueues.values()).reduce((sum, q) => sum + q.pending, 0)
      },
      apiQueue: {
        size: this.apiQueue.size,
        pending: this.apiQueue.pending,
        concurrency: this.apiQueue.concurrency
      },
      webhookQueue: {
        size: this.webhookQueue.size,
        pending: this.webhookQueue.pending,
        concurrency: this.webhookQueue.concurrency
      }
    };
  }

  /**
   * Clear all queues
   */
  clear() {
    this.messageQueue.clear();
    this.apiQueue.clear();
    this.webhookQueue.clear();
    // Clear all user queues
    for (const queue of this.userQueues.values()) {
      queue.clear();
    }
    this.userQueues.clear();
    this.userQueueTimestamps.clear();
  }

  /**
   * Destroy queue manager and cleanup resources
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Export singleton instance
let queueManager = null;

export function createQueueManager(cfg) {
  if (!queueManager) {
    queueManager = new QueueManager(cfg);
  }
  return queueManager;
}

export function getQueueManager() {
  if (!queueManager) {
    throw new Error('QueueManager not initialized. Call createQueueManager() first.');
  }
  return queueManager;
}

