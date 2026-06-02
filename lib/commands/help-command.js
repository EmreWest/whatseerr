/**
 * Help command - displays available commands
 */

import { BaseCommand } from './base-command.js';
import { sendMessage } from '../waha-client.js';
import { getUsernameFromChatId } from '../utils.js';
import { parseCommands } from '../command-parser.js';
import { t } from '../i18n/translator.js';

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
    const greeting = t('help.greeting', username);
    let helpText = greeting;
    
    helpText += t('help.title');
    
    // Parse commands
    const searchCommands = parseCommands(cfg.commands?.command || '');
    const searchCommands4k = parseCommands(cfg.commands?.command4k || '');
    
    // Standard request section
    const primaryCommand = searchCommands[0] || 'r';
    helpText += `\n${t('help.standard')}:\n\n${primaryCommand} <title>\n${t('help.example')}: ${primaryCommand} Matrix\n`;
    
    // 4K request section (if configured and help4k is enabled)
    if (cfg.commands?.help4k && searchCommands4k.length > 0) {
      const fourKExample = searchCommands4k[0];
      helpText += `\n${t('4k.section')}:\n\n${fourKExample} <title>\n${t('help.example')}: ${fourKExample} Matrix\n`;
    }
    
    // helpText += '\n📝 Just type the command followed by the movie or show title.';
    helpText += `\n\n${t('help.other')}\n`;
    // helpText += '\n• "subscriptions" or "subs" - View your notifications';
    helpText += `\n• agent - ${t('help.agent').split(' - ')[1]}`;
    helpText += `\n• help - ${t('help.help').split(' - ')[1]}`;
    
    await sendMessage(wahaClient, cfg, chatId, helpText);
    logger?.info(t('help.log'));
  }
}

