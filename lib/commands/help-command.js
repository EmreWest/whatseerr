/**
 * Help command - displays available commands
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getUsernameFromChatId } from '../utils.js';
import { parseCommands } from '../command-parser.js';

export class HelpCommand extends BaseCommand {
  constructor() {
    super('help', 'Display help information');
  }

  match(messageText, context) {
    const trimmed = messageText?.toLowerCase().trim();
    if (trimmed === 'help') {
      return { matched: true, command: 'help' };
    }
    return null;
  }

  async execute(context) {
    const { cfg, chatId, wahaClient, logger } = context;
    
    // Get username from mappings if available
    const username = await getUsernameFromChatId(cfg, chatId, wahaClient);
    
    // Build help message
    const greeting = username ? `👋 Hello ${username}!\n\n` : '👋 Hello!\n\n';
    let helpText = greeting;
    
    helpText += '📌 Available Commands:\n\n';
    
    // Parse commands
    const searchCommands = parseCommands(cfg.command);
    const searchCommands4k = parseCommands(cfg.command4k);
    
    // Standard request section
    const primaryCommand = searchCommands[0] || 'r';
    helpText += `🎬 Standard Request\n${primaryCommand} <name>\nExample: ${primaryCommand} Matrix\n`;
    
    // 4K request section (if configured and help4k is enabled)
    if (cfg.help4k && searchCommands4k.length > 0) {
      const fourKExample = searchCommands4k[0];
      helpText += `\n🖥️ 4K Request\n${fourKExample} <name>\nExample: ${fourKExample} Matrix\n`;
    }
    
    helpText += '\n📝 Just type the command followed by the movie or show name.';
    helpText += '\n\n💬 Need help? Reply "agent" to speak with an agent.';
    
    await sendMessage(wahaClient, cfg, chatId, helpText);
    logger?.info('Help command executed', { chatId });
  }
}

