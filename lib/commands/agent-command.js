/**
 * Agent command - allows users to request to speak with an agent
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getUsernameFromChatId } from '../utils.js';
import { getStateManager } from '../state/cache-state.js';
import { getErrorDetails } from '../errors/error-formatter.js';

export class AgentCommand extends BaseCommand {
  constructor() {
    super('agent', 'Request to speak with an agent');
  }

  match(messageText, context) {
    const trimmed = messageText?.toLowerCase().trim();
    
    // Only match if user is not in selection mode
    if (trimmed === 'agent') {
      const stateManager = getStateManager();
      const { chatId } = context;
      
      // Check if user has pending search results or TV selections
      if (stateManager.hasUserResults(chatId) || stateManager.hasPendingSelection(chatId)) {
        return null; // Don't match if in selection mode
      }
      
      return {
        matched: true,
        command: 'agent'
      };
    }
    
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, logger } = context;
    
    logger?.info('User requested to speak with agent', { chatId });
    
    // Get user info for the notification
    const username = await getUsernameFromChatId(cfg, chatId, wahaClient);
    const userDisplayName = username || chatId;
    
    // Send confirmation to user
    await sendMessage(wahaClient, cfg, chatId, 
      '✅ Your request has been sent to an agent. They will respond shortly.'
    );
    
    // Send notification to admin (sendMessage handles LID conversion internally)
    const adminPhoneNumber = cfg.jellyseerr?.adminDetails?.phoneNumber;
    if (adminPhoneNumber) {
      const adminPhoneChatId = `${adminPhoneNumber}@c.us`;
      const notificationMessage = `💬 Agent Request\n\n👤 User: ${userDisplayName}\n📱 Chat ID: ${chatId}\n\nUser requested to speak with an agent.`;
      
      try {
        await sendMessage(wahaClient, cfg, adminPhoneChatId, notificationMessage);
        logger?.info('Agent request notification sent to admin', {
          userChatId: chatId,
          username,
          adminPhoneNumber
        });
      } catch (err) {
        logger?.error('Failed to send agent request notification to admin', {
          ...getErrorDetails(err, 'sendAgentNotification'),
          userChatId: chatId,
          adminPhoneNumber
        });
      }
    } else {
      logger?.warn('Admin phone number not configured, cannot send agent request notification', {
        userChatId: chatId
      });
    }
  }
}

