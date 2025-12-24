/**
 * Agent command - allows users to request to speak with an agent
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getUsernameFromChatId } from '../utils.js';
import { getStateManager } from '../state/cache-state.js';
import { getErrorDetails } from '../errors/error-formatter.js';
import { convertPhoneToLid } from '../webhook-helpers.js';

export class AgentCommand extends BaseCommand {
  constructor() {
    super('agent', 'Request to speak with an agent');
  }

  match(messageText, context) {
    // Pure pattern matching - state checks moved to execute() to avoid match/execute gap
    // Per-user queues ensure sequential processing, so match() doesn't need flow lock checks
    const trimmed = messageText?.toLowerCase().trim();
    
    if (trimmed === 'agent') {
      return {
        matched: true,
        command: 'agent'
      };
    }
    
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, logger } = context;
    const stateManager = getStateManager();
    
    // Check flow state in execute() (not match()) to avoid match/execute gap
    // Validate and clean up any orphaned locks for consistency
    stateManager.validateFlowState(chatId);
    
    // Check if user has an active flow lock (more reliable than state checks)
    if (stateManager.hasFlowLock(chatId)) {
      logger?.info('⏳ Agent command blocked - user has active flow');
      
      // Get current active search query for informative message
      const currentResults = stateManager.getUserResults(chatId);
      const currentQuery = currentResults?.query || 'current request';
      
      try {
        await sendMessage(wahaClient, cfg, chatId,
          `⏳ Please finish your current "${currentQuery}" request before requesting an agent.\n\nSend 0 to cancel current request.`
        );
      } catch (err) {
        logger?.error('Error sending active flow message for agent', {
          ...getErrorDetails(err, 'sendActiveFlowAgentMessage'),
          chatId
        });
      }
      return; // Exit early - don't process agent request
    }
    
    logger?.info('💬 User requested to speak with agent');
    
    // Get user info for the notification
    const username = await getUsernameFromChatId(cfg, chatId, wahaClient);
    const userDisplayName = username || chatId;
    
    // Send confirmation to user
    await sendMessage(wahaClient, cfg, chatId, 
      '✅ Your request has been sent to an agent. They will respond shortly.'
    );
    
    // Send notification to all admins
    const mappings = cfg.mappings?.userIdMappings || {};
    const notificationMessage = `💬 Agent Request\n\n👤 User: ${userDisplayName}\n📱 Chat ID: ${chatId}\n\nUser requested to speak with an agent.`;
    
    let notifiedCount = 0;
    for (const [phoneNumber, mapping] of Object.entries(mappings)) {
      // Only notify admins
      if (!mapping || typeof mapping !== 'object' || mapping.admin !== true) {
        continue;
      }

      const adminLidChatId = await convertPhoneToLid(wahaClient, cfg, phoneNumber, logger, 'agent request notification');
      if (!adminLidChatId) {
        logger?.warn(`Cannot notify admin about agent request - LID cannot be resolved`, {
          phoneNumber,
          userId: mapping.userId
        });
        continue;
      }

      try {
        await sendMessage(wahaClient, cfg, adminLidChatId, notificationMessage);
        notifiedCount++;
        logger?.debug('Agent request notification sent to admin', {
          phoneNumber,
          userId: mapping.userId
        });
      } catch (err) {
        logger?.error('Failed to send agent request notification to admin', {
          ...getErrorDetails(err, 'sendAgentNotification'),
          userChatId: chatId,
          phoneNumber,
          userId: mapping.userId,
          adminLidChatId
        });
      }
    }

    if (notifiedCount > 0) {
      logger?.info(`📤 Agent request notification sent to ${notifiedCount} admin${notifiedCount !== 1 ? 's' : ''} (user: ${userDisplayName})`);
    } else {
      logger?.warn('No admins could be notified about agent request', {
        userChatId: chatId
      });
    }
  }
}

