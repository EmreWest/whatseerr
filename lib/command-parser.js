/**
 * Command parsing utilities
 */

/**
 * Parses comma-separated commands from config
 * @param {string|string[]} commandConfig - Command config (string or array)
 * @returns {string[]} Array of normalized commands
 */
export function parseCommands(commandConfig) {
  if (!commandConfig) {
    return ['r'];
  }
  
  if (Array.isArray(commandConfig)) {
    return commandConfig.map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
  }
  
  // Split by comma and normalize
  return String(commandConfig)
    .split(',')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0);
}

/**
 * Extracts search query from message, handling command prefix
 * @param {string} messageText - The message text
 * @param {string[]} commands - Array of command strings to check
 * @param {string[]} commands4k - Array of 4K command strings to check (optional)
 * @returns {object|null} Object with `query`, `matchedCommand`, and `is4k`, or null if no match
 */
export function extractSearchQuery(messageText, commands, commands4k = []) {
  const trimmed = messageText.trim();
  
  // Sort commands by length (longest first) to match longer commands before shorter ones
  // e.g., "request" should match before "r" if both are configured
  // Check 4K commands first (they may be longer/shorter, but we want to prioritize them)
  const allCommands = [
    ...commands4k.map(cmd => ({ cmd, is4k: true })),
    ...commands.map(cmd => ({ cmd, is4k: false }))
  ].sort((a, b) => b.cmd.length - a.cmd.length);
  
  // Check if message starts with any of the commands
  for (const { cmd, is4k } of allCommands) {
    const lowerCommand = cmd.toLowerCase();
    const lowerTrimmed = trimmed.toLowerCase();
    
    if (lowerTrimmed.startsWith(lowerCommand)) {
      // Check if it's a complete word match (command followed by space or end of string)
      const afterCommand = trimmed.slice(cmd.length);
      if (afterCommand.length === 0 || afterCommand[0] === ' ') {
        const query = afterCommand.trim();
        // Return match even if query is empty (will be handled by caller)
        return { query: query || '', matchedCommand: cmd, is4k };
      }
    }
  }
  
  return null;
}

