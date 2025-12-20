/**
 * In-memory state management for the WhatsApp bot
 */

// Store user search results (chatId -> results array)
export const userSearchResults = new Map();

// Store selected TV shows waiting for season selection (chatId -> media object)
export const pendingTvSelections = new Map();

// Track processed message IDs to prevent duplicates
export const processedMessages = new Set();

// Store pending request approvals waiting for admin response (adminChatId -> request info)
export const pendingRequestApprovals = new Map();

