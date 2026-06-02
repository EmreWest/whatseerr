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
    'media.available_single_season': (season) => `Season ${season} is now available`,
    'media.available_multiple_seasons': (seasons) => `Seasons ${seasons.join(', ')} are now available`,
    'media.available_many_seasons': (count) => `${count} seasons are now available`,
    'media.available_show': 'The show is now available',
    'media.already_available_movie': 'This movie is already available, enjoy!',
    'media.already_available_season': (season) => `Season ${season} is already available, enjoy!`,
    'media.enjoy_movie': 'Enjoy your movie!',
    'media.enjoy_show': 'Enjoy your TV show!',

    // Webhooks
    'webhook.approved': '✅',
    'webhook.available': '✅',
    'webhook.failed': '❌',
    'webhook.auto_approved': '✅',
    'webhook.auto_approved_title': 'Request Automatically Approved',
    'webhook.auto_approved_movie': (title) => `✅ Request Automatically Approved\n\n🎬 ${title}`,
    'webhook.auto_approved_tv': (title) => `✅ Request Automatically Approved\n\n📺 ${title}`,
    'webhook.pending_title': 'Request Submitted',
    'webhook.pending_status': 'Your request is pending approval. You\'ll be notified once it\'s reviewed.',
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
    'message.already_available': 'This movie is already available, enjoy!',
    'message.request_button': 'If you want to request this movie please click on the request button directly under this message.',
    'message.already_requested': 'You already requested this movie.',
    'message.already_requested_date': (date) => `You already requested this movie on ${date}.`,
    'message.already_requested_other': 'This movie has already been requested. You will be notified when it becomes available.',
    'message.season_already_available': (season) => `**Season ${season}** is already available, enjoy!`,
    'message.season_request_button': (season) => `If you want to request **season ${season}** of this tv show please click on the request button directly under this message.`,
    'message.season_already_requested': (season) => `**Season ${season}** has already been requested.`,
    'message.season_already_requested_notify': (season) => `**Season ${season}** has already been requested and you will be notified when it becomes available.`,
    'message.request_success': (title) => `✅ Your request for **${title}** was sent successfully!`,
    'message.request_success_season': (season, title) => `✅ Your request for the **season ${season}** of **${title}** was sent successfully!`,
    'message.request_success_all_seasons': (title) => `✅ Your request for **all seasons** of **${title}** was sent successfully!`,
    'message.notification_success': (title) => `🔔 You will now receive a notification as soon as **${title}** becomes available to watch.`,
    'message.notification_success_season': (season, title) => `🔔 You will now receive a notification as soon as **season ${season}** of **${title}** becomes available to watch.`,
    'request.no_valid_seasons': 'No valid seasons selected. Season 0 (Specials) cannot be requested',
    'request.invalid_selection': 'Invalid season selection',
    'request.loading_seasons': (title) => `📺 Loading seasons for "${title}"...`,
    'request.season_select_all': 'Request all seasons',
    'request.season_select_specific': 'Select specific seasons',
    'request.error': 'An error occurred. Please try again',
    'selection.invalid': 'Invalid selection. Please search again',
    'selection.no_results': 'No results available. Please search again',
    'selection.cancelled_message': (query) => `Your search for "${query}" has been cancelled. You can start a new search anytime.`,
    'selection.invalid_range': (max) => `Invalid selection. Reply with 0-${max} (0 = cancel)`,
    'subscriptions.empty': 'You have no active notifications.\n\nYou will be automatically subscribed when you make a request.',
    'subscriptions.title': 'Your Notifications:',
    'subscriptions.movies': 'Movies:',
    'subscriptions.tvshows': 'TV Shows:',
    'subscriptions.total': (count) => `Total: ${count} notification${count !== 1 ? 's' : ''}`,
    'subscriptions.error': 'An error occurred while retrieving your notifications. Please try again later.',
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
    'media.available_single_season': (season) => `Staffel ${season} ist nun verfügbar`,
    'media.available_multiple_seasons': (seasons) => `Staffel ${seasons.join(', ')} sind nun verfügbar`,
    'media.available_many_seasons': (count) => `${count} Staffeln sind nun verfügbar`,
    'media.available_show': 'Die Serie ist nun verfügbar',
    'media.already_available_movie': 'Dieser Film ist bereits verfügbar, viel Spaß!',
    'media.already_available_season': (season) => `Staffel ${season} ist bereits verfügbar, viel Spaß!`,
    'media.enjoy_movie': 'Viel Spaß mit deinem Film!',
    'media.enjoy_show': 'Viel Spaß mit deiner Serie!',

    // Webhooks
    'webhook.approved': '✅',
    'webhook.available': '✅',
    'webhook.failed': '❌',
    'webhook.auto_approved': '✅',
    'webhook.auto_approved_title': 'Anfrage automatisch genehmigt',
    'webhook.auto_approved_movie': (title) => `✅ Anfrage automatisch genehmigt\n\n🎬 ${title}`,
    'webhook.auto_approved_tv': (title) => `✅ Anfrage automatisch genehmigt\n\n📺 ${title}`,
    'webhook.pending_title': 'Anfrage eingereicht',
    'webhook.pending_status': 'Deine Anfrage wird gerade überprüft. Du wirst benachrichtigt, sobald sie bearbeitet wurde.',
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
    'message.already_available': 'Dieser Film ist bereits verfügbar, viel Spaß!',
    'message.request_button': 'Wenn du diesen Film anfordern möchtest, klicke bitte auf die Schaltfläche "Anfrage stellen" direkt unter dieser Nachricht.',
    'message.already_requested': 'Du hast diesen Film bereits angefordert.',
    'message.already_requested_date': (date) => `Du hast diesen Film am ${date} bereits angefordert.`,
    'message.already_requested_other': 'Dieser Film wurde bereits angefordert. Du wirst benachrichtigt, wenn er verfügbar wird.',
    'message.season_already_available': (season) => `**Staffel ${season}** ist bereits verfügbar, viel Spaß!`,
    'message.season_request_button': (season) => `Wenn du **Staffel ${season}** dieser Serie anfordern möchtest, klicke bitte auf die Schaltfläche "Anfrage stellen" direkt unter dieser Nachricht.`,
    'message.season_already_requested': (season) => `**Staffel ${season}** wurde bereits angefordert.`,
    'message.season_already_requested_notify': (season) => `**Staffel ${season}** wurde bereits angefordert und du wirst benachrichtigt, wenn sie verfügbar wird.`,
    'message.request_success': (title) => `✅ Deine Anfrage für **${title}** wurde erfolgreich gesendet!`,
    'message.request_success_season': (season, title) => `✅ Deine Anfrage für **Staffel ${season}** von **${title}** wurde erfolgreich gesendet!`,
    'message.request_success_all_seasons': (title) => `✅ Deine Anfrage für **alle Staffeln** von **${title}** wurde erfolgreich gesendet!`,
    'message.notification_success': (title) => `🔔 Du erhältst ab sofort eine Benachrichtigung, sobald **${title}** verfügbar ist zum Anschauen.`,
    'message.notification_success_season': (season, title) => `🔔 Du erhältst ab sofort eine Benachrichtigung, sobald **Staffel ${season}** von **${title}** verfügbar ist zum Anschauen.`,
    'request.no_valid_seasons': 'Keine gültigen Staffeln ausgewählt. Staffel 0 (Specials) kann nicht angefordert werden',
    'request.invalid_selection': 'Ungültige Staffelauswahl',
    'request.loading_seasons': (title) => `📺 Lade Staffeln für "${title}"...`,
    'request.season_select_all': 'Alle Staffeln anfordern',
    'request.season_select_specific': 'Spezifische Staffeln auswählen',
    'request.error': 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
    'selection.invalid': 'Ungültige Auswahl. Bitte suche erneut.',
    'selection.no_results': 'Keine Ergebnisse verfügbar. Bitte suche erneut.',
    'selection.cancelled_message': (query) => `Deine Suche nach "${query}" wurde abgebrochen. Du kannst jederzeit eine neue Suche starten.`,
    'selection.invalid_range': (max) => `Ungültige Auswahl. Antworte mit 0-${max} (0 = abbrechen)`,
    'subscriptions.empty': 'Du hast keine aktiven Benachrichtigungen.\n\nDu wirst automatisch benachrichtigt, wenn du eine Anfrage stellst.',
    'subscriptions.title': 'Deine Benachrichtigungen:',
    'subscriptions.movies': 'Filme:',
    'subscriptions.tvshows': 'Serien:',
    'subscriptions.total': (count) => `Gesamt: ${count} Benachrichtigung${count !== 1 ? 'en' : ''}`,
    'subscriptions.error': 'Ein Fehler ist aufgetreten beim Abrufen deiner Benachrichtigungen. Bitte versuche es später erneut.',
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
