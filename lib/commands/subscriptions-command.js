/**
 * Subscriptions command - allows users to view their subscribed notifications
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getSubscriptionManager } from '../subscriptions/subscription-manager.js';
import { getMediaDetails, formatMedia, extractMediaStatus } from '../request.js';
import { isAvailable } from '../media-status.js';
import { getErrorDetails } from '../errors/error-formatter.js';
import { MEDIA_TYPE_MOVIE, MEDIA_TYPE_TV } from '../constants.js';

const EMPTY_SUBSCRIPTIONS_MESSAGE = '📋 You have no active notifications.\n\nYou will be automatically subscribed when you make a request.';

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
    const { cfg, chatId, wahaClient, jellyseerrClient, logger } = context;
    const subscriptionManager = getSubscriptionManager();
    
    logger?.info('📋 User viewing subscriptions');
    
    try {
      // Get user subscriptions
      const subscriptions = subscriptionManager.getUserSubscriptions(chatId);
      
      if (subscriptions.length === 0) {
        await sendMessage(wahaClient, cfg, chatId, EMPTY_SUBSCRIPTIONS_MESSAGE);
        return;
      }
      
      const subscriptionDetails = [];
      const subscriptionsToRemove = [];
      
      for (const sub of subscriptions) {
        try {
          const mediaType = sub.mediaType === 'movie' ? MEDIA_TYPE_MOVIE : MEDIA_TYPE_TV;
          const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, sub.mediaId, mediaType, logger);
          const statusInfo = extractMediaStatus(mediaDetails, sub.is4k);
          
          // Remove subscription if media is available (status 5 = AVAILABLE)
          if (statusInfo && isAvailable(statusInfo.status)) {
            subscriptionsToRemove.push(sub);
            logger?.info('🧹 Removing available subscription');
            continue;
          }
          
          const formatted = formatMedia(mediaDetails);
          
          // Update subscription title if it's missing or different
          subscriptionManager.updateTitle(sub.mediaId, sub.mediaType, sub.is4k, formatted.title);
          
          subscriptionDetails.push({
            ...sub,
            title: formatted.title,
            year: formatted.year,
            typeStr: formatted.typeStr
          });
        } catch (err) {
          logger?.warn('Failed to fetch media details for subscription', {
            ...getErrorDetails(err, 'fetchSubscriptionMediaDetails'),
            mediaId: sub.mediaId,
            mediaType: sub.mediaType,
            chatId
          });
          subscriptionDetails.push({
            ...sub,
            title: `Media ID ${sub.mediaId}`,
            year: '????',
            typeStr: sub.mediaType === 'movie' ? 'Movie' : 'TV'
          });
        }
      }
      
      // Remove available subscriptions
      for (const subToRemove of subscriptionsToRemove) {
        subscriptionManager.removeSubscription(
          subToRemove.mediaId,
          subToRemove.mediaType,
          subToRemove.is4k,
          chatId
        );
      }
      
      if (subscriptionsToRemove.length > 0) {
        logger?.info(`🧹 Cleaned up ${subscriptionsToRemove.length} available subscription${subscriptionsToRemove.length !== 1 ? 's' : ''}`);
      }
      
      if (subscriptionDetails.length === 0) {
        await sendMessage(wahaClient, cfg, chatId, EMPTY_SUBSCRIPTIONS_MESSAGE);
        return;
      }
      
      const movies = subscriptionDetails.filter(s => s.mediaType === 'movie');
      const tvShows = subscriptionDetails.filter(s => s.mediaType === 'tv');
      
      let message = '📋 Your Notifications:\n\n';
      
      if (movies.length > 0) {
        message += '🎬 Movies:\n';
        movies.forEach(movie => {
          const quality = movie.is4k ? ' (4K)' : '';
          message += `  • ${movie.title} (${movie.year})${quality}\n`;
        });
        message += '\n';
      }
      
      if (tvShows.length > 0) {
        message += '📺 TV Shows:\n';
        tvShows.forEach(show => {
          const quality = show.is4k ? ' (4K)' : '';
          message += `  • ${show.title} (${show.year})${quality}\n`;
        });
      }
      
      message += `\n📊 Total: ${subscriptionDetails.length} notification${subscriptionDetails.length !== 1 ? 's' : ''}`;
      
      await sendMessage(wahaClient, cfg, chatId, message);
      
      logger?.info(`📋 Sent subscriptions list: ${subscriptionDetails.length} notification${subscriptionDetails.length !== 1 ? 's' : ''} (${movies.length} movie${movies.length !== 1 ? 's' : ''}, ${tvShows.length} TV show${tvShows.length !== 1 ? 's' : ''})`);
    } catch (err) {
      logger?.error('Failed to get user subscriptions', {
        ...getErrorDetails(err, 'getUserSubscriptions'),
        chatId
      });
      
      try {
        await sendMessage(wahaClient, cfg, chatId,
          '❌ An error occurred while retrieving your notifications. Please try again later.'
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

