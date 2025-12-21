/**
 * Approval command - handles approve/decline commands for admin
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { approveRequest, declineRequest } from '../request.js';
import { getErrorDetails } from '../errors/error-formatter.js';

export class ApprovalCommand extends BaseCommand {
  constructor() {
    super('approval', 'Approve or decline requests');
  }

  match(messageText, context) {
    const trimmed = messageText?.toLowerCase().trim();
    
    // Match "approve 123" or "decline 123"
    const approveMatch = trimmed.match(/^approve\s+(\d+)$/);
    const declineMatch = trimmed.match(/^decline\s+(\d+)$/);
    
    if (approveMatch) {
      return {
        matched: true,
        command: 'approval',
        action: 'approve',
        requestId: approveMatch[1]
      };
    }
    
    if (declineMatch) {
      return {
        matched: true,
        command: 'approval',
        action: 'decline',
        requestId: declineMatch[1]
      };
    }
    
    return null;
  }

  async validate(context) {
    // This command requires admin access
    context.requiresAdmin = true;
    return true;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, jellyseerrClient, logger, matchResult } = context;
    const { action, requestId } = matchResult;
    const isApprove = action === 'approve';
    
    logger?.info(`Approval/decline command detected`, {
      command: action,
      requestId,
      chatId
    });
    
    try {
      if (isApprove) {
        await approveRequest(jellyseerrClient, cfg, requestId, logger);
        logger?.info(`Request approved via text command`, {
          requestId,
          method: 'text',
          adminChatId: chatId
        });
        await sendMessage(wahaClient, cfg, chatId, `✅ Request ${requestId} approved!`);
      } else {
        await declineRequest(jellyseerrClient, cfg, requestId, logger);
        logger?.info(`Request declined via text command`, {
          requestId,
          method: 'text',
          adminChatId: chatId
        });
        await sendMessage(wahaClient, cfg, chatId, `🚫 Request ${requestId} declined.`);
      }
    } catch (err) {
      logger?.error(`Failed to ${action} request via text command`, {
        ...getErrorDetails(err, `${action}Request`),
        requestId,
        method: 'text'
      });
      const errorMsg = err?.message || `Failed to ${action} request ${requestId}`;
      await sendMessage(wahaClient, cfg, chatId, `❌ Error: ${errorMsg}`);
    }
  }
}

