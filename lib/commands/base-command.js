/**
 * Base command class that all commands extend
 */

export class BaseCommand {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * Checks if this command matches the message
   * @param {string} messageText - The message text
   * @param {Object} context - Message context
   * @returns {Object|null} Match result with parsed data, or null if no match
   */
  match(messageText, context) {
    throw new Error('match() must be implemented by subclass');
  }

  /**
   * Validates the command context (permissions, input, etc.)
   * @param {Object} context - Command context
   * @returns {Promise<boolean>} True if valid, throws error if not
   */
  async validate(context) {
    // Default implementation - no validation
    return true;
  }

  /**
   * Executes the command
   * @param {Object} context - Command context with all necessary data
   * @returns {Promise<void>}
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }
}

