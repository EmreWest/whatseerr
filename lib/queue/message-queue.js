/**
 * Queue management for message processing and API calls
 */

import PQueue from 'p-queue';

class QueueManager {
  constructor(cfg = {}) {
    const queueConfig = cfg.queues || {};
    
    // Message processing queue (handles incoming messages)
    this.messageQueue = new PQueue({
      concurrency: queueConfig.messageConcurrency || 5,
      interval: 1000,
      intervalCap: queueConfig.messageConcurrency || 5
    });

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
   */
  async addMessageTask(fn) {
    return this.messageQueue.add(fn, { priority: 1 });
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

