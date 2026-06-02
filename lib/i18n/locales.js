/**
 * i18n Locale Definitions
 * Contains all translatable strings for the bot in different languages
 */

export const locales = {
  en: {
    // Search Results
    'search.results.title': (query) => `✅ Search Results for "${query}"`,
    'search.results.noResults': 'No results found. Try a different search.',
    'search.results.showMore': 'Show more',
    'search.results.cancel': 'Cancel',
    'search.results.reply': 'Reply with a number to request.',

    // Search Command
    'search.empty': (cmd) => `💬 ${cmd} <name>\nExample: ${cmd} Matrix`,
    'search.searching': '🔍 Searching...',
    'search.active': (query) => `⏳ Please finish your current "${query}" request before starting a new search.\n\nYour new request has not started.\n\nSend 0 to cancel current request.`,
    'search.log': '🔍 Searching for',

    // Help Command
    'help.greeting': (username) => username ? `👋 Hello ${username}!\n\n` : '👋 Hello!\n\n',
    'help.title': '📌 Available Commands:\n',
    'help.standard': '🎬 Standard Request:',
    'help.example': 'Example:',
    '4k.section': '🖥️ 4K Request:',
    'help.other': '📋 Other Commands:',
    'help.agent': 'agent - Speak with an agent',
    'help.help': 'help - Show this help message',
    'help.log': '💬 Help requested',

    // Selection Command
    'selection.log': '🎬 Selection made',
    'selection.cancelled': '🚫 Request cancelled.',
    'selection.invalid': '⚠️ Invalid selection.',

    // Request Status
    'request.success': (seasons) => `✅ Your request for ${seasons} was sent successfully!`,
    'request.failed': (status, message) => `❌ Request failed (${status}): ${message}`,
    'request.failedStatus': (status) => `❌ Request failed with status ${status}`,
    'request.error': (msg) => `❌ ${msg}`,

    // Media Status
    'media.movie': '🎬',
    'media.tv': '📺',
    'media.season': (season) => `Season ${season}`,
    'media.seasons': (seasons) => `Seasons ${seasons}`,
    'media.available': 'is now available',

    // Webhooks
    'webhook.approved': '✅',
    'webhook.available': '✅',
    'webhook.failed': '❌',
    'webhook.auto_approved': '✅',
    'webhook.resolved': '✅',
    'webhook.error': (msg) => `❌ Error: ${msg}`,
    'webhook.approve': (requestId) => `✅ React with ✅ or reply "approve ${requestId}" to approve`,
    'webhook.decline': (requestId) => `🚫 React with ❌ or reply "decline ${requestId}" to decline`,
    'webhook.requestNotFound': '❌ Error: Request ID not found',
    'webhook.processingFailed': '❌ Request Processing Failed',
    'webhook.notInitiated': '❌ Reason: User has not initiated a chat with the bot yet.',

    // Agent Command
    'agent.active': (query) => `⏳ Please finish your current "${query}" request before requesting an agent.\n\nSend 0 to cancel current request.`,

    // General
    'general.error': 'An error occurred. Please try again.',
  },

  de: {
    // Search Results
    'search.results.title': (query) => `✅ Suchergebnisse für "${query}"`,
    'search.results.noResults': 'Keine Ergebnisse gefunden. Versuche eine andere Suche.',
    'search.results.showMore': 'Mehr anzeigen',
    'search.results.cancel': 'Abbrechen',
    'search.results.reply': 'Antworte mit einer Nummer um die Anfrage zu stellen.',

    // Search Command
    'search.empty': (cmd) => `💬 ${cmd} <Name>\nBeispiel: ${cmd} Matrix`,
    'search.searching': '🔍 Suche läuft...',
    'search.active': (query) => `⏳ Bitte beende deine aktuelle "${query}" Anfrage, bevor du eine neue Suche startest.\n\nDeine neue Anfrage wurde nicht gestartet.\n\nSende 0 um die aktuelle Anfrage abzubrechen.`,
    'search.log': '🔍 Suche nach',

    // Help Command
    'help.greeting': (username) => username ? `👋 Hallo ${username}!\n\n` : '👋 Hallo!\n\n',
    'help.title': '📌 Verfügbare Befehle:\n',
    'help.standard': '🎬 Normale Anfrage:',
    'help.example': 'Beispiel:',
    '4k.section': '🖥️ 4K Anfrage:',
    'help.other': '📋 Weitere Befehle:',
    'help.agent': 'agent - Mit einem Agent sprechen',
    'help.help': 'help - Diese Hilfemeldung anzeigen',
    'help.log': '💬 Hilfe angefordert',

    // Selection Command
    'selection.log': '🎬 Auswahl getroffen',
    'selection.cancelled': '🚫 Anfrage abgebrochen.',
    'selection.invalid': '⚠️ Ungültige Auswahl.',

    // Request Status
    'request.success': (seasons) => `✅ Deine Anfrage für ${seasons} wurde erfolgreich gesendet!`,
    'request.failed': (status, message) => `❌ Anfrage fehlgeschlagen (${status}): ${message}`,
    'request.failedStatus': (status) => `❌ Anfrage fehlgeschlagen mit Status ${status}`,
    'request.error': (msg) => `❌ ${msg}`,

    // Media Status
    'media.movie': '🎬',
    'media.tv': '📺',
    'media.season': (season) => `Staffel ${season}`,
    'media.seasons': (seasons) => `Staffel ${seasons}`,
    'media.available': 'ist nun verfügbar',

    // Webhooks
    'webhook.approved': '✅',
    'webhook.available': '✅',
    'webhook.failed': '❌',
    'webhook.auto_approved': '✅',
    'webhook.resolved': '✅',
    'webhook.error': (msg) => `❌ Fehler: ${msg}`,
    'webhook.approve': (requestId) => `✅ Reagiere mit ✅ oder antworte "approve ${requestId}" um zu bestätigen`,
    'webhook.decline': (requestId) => `🚫 Reagiere mit ❌ oder antworte "decline ${requestId}" um abzulehnen`,
    'webhook.requestNotFound': '❌ Fehler: Anfrage-ID nicht gefunden',
    'webhook.processingFailed': '❌ Anfrage-Verarbeitung fehlgeschlagen',
    'webhook.notInitiated': '❌ Grund: Benutzer hat noch keinen Chat mit dem Bot initiiert.',

    // Agent Command
    'agent.active': (query) => `⏳ Bitte beende deine aktuelle "${query}" Anfrage bevor du einen Agent anfordest.\n\nSende 0 um die aktuelle Anfrage abzubrechen.`,

    // General
    'general.error': 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
  }
};

/**
 * Get a specific locale dictionary
 * @param {string} lang - Language code (e.g., 'en', 'de')
 * @returns {Object} Locale dictionary
 */
export function getLocale(lang = 'en') {
  return locales[lang] || locales.en;
}
