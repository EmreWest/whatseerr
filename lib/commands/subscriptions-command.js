/**
 * Subscriptions command - allows users to view their subscribed notifications
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getSubscriptionManager } from '../subscriptions/subscription-manager.js';
import { getMediaDetails, formatMedia } from '../request.js';
import { getErrorDetails } from '../errors/error-formatter.js';

const MEDIA_TYPE_MOVIE = 1;
const MEDIA_TYPE_TV = 2;

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
    
    logger?.info('User requested to view subscriptions', { chatId });
    
    try {
      // Get user subscriptions
      const subscriptions = subscriptionManager.getUserSubscriptions(chatId);
      
      if (subscriptions.length === 0) {
        await sendMessage(wahaClient, cfg, chatId,
          '📋 You have no active notifications.\n\nYou will be automatically subscribed when you make a request.'
        );
        return;
      }
      
      // Fetch media details for each subscription
      const subscriptionDetails = [];
      
      for (const sub of subscriptions) {
        try {
          const mediaType = sub.mediaType === 'movie' ? MEDIA_TYPE_MOVIE : MEDIA_TYPE_TV;
          const mediaDetails = await getMediaDetails(jellyseerrClient, cfg, sub.mediaId, mediaType);
          const formatted = formatMedia(mediaDetails);
          
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
          // Include with minimal info if fetch fails
          subscriptionDetails.push({
            ...sub,
            title: `Media ID ${sub.mediaId}`,
            year: '????',
            typeStr: sub.mediaType === 'movie' ? 'Movie' : 'TV'
          });
        }
      }
      
      // Group by type for better organization
      const movies = subscriptionDetails.filter(s => s.mediaType === 'movie');
      const tvShows = subscriptionDetails.filter(s => s.mediaType === 'tv');
      
      // Build message
      let message = '📋 Your Notifications:\n\n';
      
      if (movies.length > 0) {
        message += '🎬 Movies:\n';
        for (const movie of movies) {
          const quality = movie.is4k ? ' (4K)' : '';
          message += `  • ${movie.title} (${movie.year})${quality}\n`;
        }
        message += '\n';
      }
      
      if (tvShows.length > 0) {
        message += '📺 TV Shows:\n';
        for (const show of tvShows) {
          const quality = show.is4k ? ' (4K)' : '';
          message += `  • ${show.title} (${show.year})${quality}\n`;
        }
      }
      
      message += `\n📊 Total: ${subscriptions.length} notification${subscriptions.length !== 1 ? 's' : ''}`;
      
      await sendMessage(wahaClient, cfg, chatId, message);
      
      logger?.info('Subscriptions list sent to user', {
        chatId,
        subscriptionCount: subscriptions.length,
        moviesCount: movies.length,
        tvShowsCount: tvShows.length
      });
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

