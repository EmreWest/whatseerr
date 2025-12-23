/**
 * Agent command - allows users to request to speak with an agent
 */

import { BaseCommand } from './base-command.js';
import { sendMessage, ensureLidFormatForMessaging } from '../waha-client.js';
import { getUsernameFromChatId } from '../utils.js';
import { getStateManager } from '../state/cache-state.js';
import { getErrorDetails } from '../errors/error-formatter.js';

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
    
    // GUIDELINE: Convert admin phone number to LID format immediately (per "always use LID" principle)
    // Send notification to admin
    const adminPhoneNumber = cfg.system?.admin?.phoneNumber;
    if (adminPhoneNumber) {
      // GUIDELINE: Phone number only used for mapping lookup, convert to LID immediately
      const adminPhoneChatId = `${adminPhoneNumber}@c.us`;
      let adminLidChatId;
      try {
        adminLidChatId = await ensureLidFormatForMessaging(wahaClient, cfg, adminPhoneChatId);
      } catch (err) {
        logger?.error('Failed to convert admin phone number to LID format', {
          ...getErrorDetails(err, 'ensureLidFormatForMessaging'),
          adminPhoneNumber,
          userChatId: chatId
        });
        adminLidChatId = null;
      }
      
      if (adminLidChatId) {
        const notificationMessage = `💬 Agent Request\n\n👤 User: ${userDisplayName}\n📱 Chat ID: ${chatId}\n\nUser requested to speak with an agent.`;
        
        try {
          await sendMessage(wahaClient, cfg, adminLidChatId, notificationMessage);
          logger?.info(`📤 Agent request notification sent to admin (user: ${userDisplayName})`);
        } catch (err) {
          logger?.error('Failed to send agent request notification to admin', {
            ...getErrorDetails(err, 'sendAgentNotification'),
            userChatId: chatId,
            adminPhoneNumber,
            adminLidChatId
          });
        }
      }
    } else {
      logger?.warn('Admin phone number not configured, cannot send agent request notification', {
        userChatId: chatId
      });
    }
  }
}

