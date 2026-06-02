/**
 * Subscriptions command - allows users to view their subscribed notifications
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getSubscriptionManager } from '../subscriptions/subscription-manager.js';
import { formatQualityText } from '../request.js';
import { getErrorDetails } from '../errors/error-formatter.js';
import { t } from '../i18n/translator.js';

const EMPTY_SUBSCRIPTIONS_MESSAGE = () => `📋 ${t('subscriptions.empty')}`;

export class SubscriptionsCommand extends BaseCommand {
  constructor() {
    super('subscriptions', 'View your subscribed notifications');
  }

  match(messageText, context) {
    // Match "subscriptions" or "subs" (case insensitive)
    const trimmed = messageText?.toLowerCase().trim();
    
    if (trimmed === 'subscriptions' || trimmed === 'subs') {
      return {
        matched: true,
        command: 'subscriptions'
      };
    }
    
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, logger } = context;
    const subscriptionManager = getSubscriptionManager();
    
    logger?.info('📋 User viewing subscriptions');
    
    try {
      // Get user subscriptions
      const subscriptions = subscriptionManager.getUserSubscriptions(chatId);
      
      if (subscriptions.length === 0) {
        await sendMessage(wahaClient, cfg, chatId, EMPTY_SUBSCRIPTIONS_MESSAGE());
        return;
      }
      
      // Use stored subscription metadata for display
      // Note: Subscriptions are cleaned up by webhook notifications when media becomes available,
      // so we don't need to check status here
      const subscriptionDetails = subscriptions.map(sub => ({
        ...sub,
        title: sub.title || `Media ID ${sub.mediaId}`,
        year: sub.year || '????',
        typeStr: sub.typeStr || (sub.mediaType === 'movie' ? 'Movie' : 'TV Show')
      }));
      
      if (subscriptionDetails.length === 0) {
        await sendMessage(wahaClient, cfg, chatId, EMPTY_SUBSCRIPTIONS_MESSAGE());
        return;
      }
      
      const movies = subscriptionDetails.filter(s => s.mediaType === 'movie');
      const tvShows = subscriptionDetails.filter(s => s.mediaType === 'tv');
      
      let message = `📋 ${t('subscriptions.title')}\n\n`;
      
      if (movies.length > 0) {
        message += `🎬 ${t('subscriptions.movies')}\n`;
        movies.forEach(movie => {
          message += `  • ${movie.title} (${movie.year})${formatQualityText(movie.is4k)}\n`;
        });
        message += '\n';
      }
      
      if (tvShows.length > 0) {
        message += `📺 ${t('subscriptions.tvshows')}\n`;
        tvShows.forEach(show => {
          message += `  • ${show.title} (${show.year})${formatQualityText(show.is4k)}\n`;
        });
      }
      
      message += `\n${t('subscriptions.total', subscriptionDetails.length)}`;
      
      await sendMessage(wahaClient, cfg, chatId, message);
      
      logger?.info(`📋 Sent subscriptions list: ${subscriptionDetails.length} notification${subscriptionDetails.length !== 1 ? 's' : ''} (${movies.length} movie${movies.length !== 1 ? 's' : ''}, ${tvShows.length} TV show${tvShows.length !== 1 ? 's' : ''})`);
    } catch (err) {
      logger?.error('Failed to get user subscriptions', {
        ...getErrorDetails(err, 'getUserSubscriptions'),
        chatId
      });
      
      try {
        await sendMessage(wahaClient, cfg, chatId,
          `❌ ${t('subscriptions.error')}`
        );
      } catch (sendErr) {
        logger?.error('Failed to send error message for subscriptions', {
          ...getErrorDetails(sendErr, 'sendSubscriptionsErrorMessage'),
          chatId
        });
      }
    }
  }
}

