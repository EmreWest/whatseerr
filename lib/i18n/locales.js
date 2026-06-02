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

    // Agent Command
    'agent.confirmation': '✅ Your request has been sent to an agent. They will respond shortly.',
    'agent.admin_notification': (username, chatId) => `💬 Agent Request\n\n👤 User: ${username}\n📱 Chat ID: ${chatId}\n\nUser requested to speak with an agent.`,

    // Search error
    'search.error': (msg) => `❌ Search error: ${msg}`,

    // Request - season cancellation
    'request.season_cancelled': (title, qualityText) => `❌ Season selection cancelled for "${title}"${qualityText}\n\nYou can start a new search anytime.`,

    // Season utils
    'season.invalid_format': '❌ Invalid format. Use numbers (e.g., "1" or "1,2,3") or "all"',
    'season.specials_not_allowed': '❌ Season 0 (Specials) cannot be requested',
    'season.invalid_numbers': (invalid, max) => `❌ Invalid season numbers: ${invalid}. Valid range: 1-${max}`,
    'season.no_seasons_available': '❌ No seasons available.',
    'season.show_status': (status) => `📺 Show Status: ${status}`,
    'season.select_prompt': '📺 Select seasons:',
    'season.cancel_option': '0️⃣ Cancel',
    'season.reply_prompt': '📥 Reply: number(s) or "all"',

    // Message mapper - movie
    'message.movie_not_found_tmdb': (tmdb) => `❌ I could not find any movie with TheMovieDbId of "${tmdb}", please try something different.`,
    'message.movie_not_found_name': (name) => `❌ I could not find any movie with the name "${name}", please try something different.`,

    // Message mapper - all seasons
    'message.all_seasons_request_button': '💬 If you want to request **all seasons** of this tv show please click on the request button directly under this message.',
    'message.some_seasons_info': (title) => `ℹ️ Some seasons of **${title}** are already requested or available.`,

    // Message mapper - future seasons
    'message.future_seasons_request_button': '💬 If you want to request **future seasons** of this tv show please click on the request button directly under this message.',
    'message.all_seasons_available_notify': '✅ **All seasons** are available and you will be notified when new seasons become available.',
    'message.all_seasons_available': '✅ **All seasons** are already available.',
    'message.all_seasons_requested_notify': '📋 **All seasons** have already been requested and you will be notified when new seasons become available.',
    'message.all_seasons_requested': '📋 **All seasons** have been already requested.',
    'message.future_seasons_requested_notify': '📋 **Future seasons** have already been requested and you will be notified when they become available.',
    'message.future_seasons_requested': '📋 **Future seasons** have already been requested.',
    'message.future_seasons_request_success': (title) => `✅ Your request for **future seasons** of **${title}** was sent successfully!`,
    'message.future_seasons_notify_success': (title) => `🔔 You will now receive a notification as soon as any **future seasons** of **${title}** become available to watch.`,

    // Message mapper - all seasons status
    'message.all_seasons_status_available': '📋 **All seasons** are available.',
    'message.all_seasons_status_requested': '📋 **All seasons** have been requested.',
    'message.all_seasons_status_show': (status) => `📺 Show Status: ${status}`,
    'message.all_seasons_status_availability': (text) => `✅ Availability: ${text}`,

    // Message mapper - tv show
    'message.show_cannot_be_requested': '⚠️ This show cannot be automatically requested, please ask the server owner to manually add it.',
    'message.tvshow_not_found_tvdb': (tvdb) => `❌ I could not find any tv show with the TvDbId of "${tvdb}", please try something different.`,
    'message.tvshow_not_found_name': (name) => `❌ I could not find any tv show with the name "${name}", please try something different.`,
    'message.generic_error': '❌ An unexpected error occurred while trying to process your request.',

    // Webhook - additional
    'webhook.requested_seasons': (value) => `📋 Requested: ${value}`,
    'webhook.failed_type': (type) => `📋 Type: ${type}`,
    'webhook.failed_body': 'Unfortunately, your request could not be processed at this time. The administrator has been notified and will investigate.',

    // Media type names (for display)
    'media.type_movie': 'Movie',
    'media.type_tv': 'TV Show',

    // Webhook - pending message
    'webhook.pending_type': (type) => `📋 Type: ${type}`,
    'webhook.pending_seasons': (emoji, value) => `${emoji} Seasons: ${value}`,

    // Webhook - admin section
    'webhook.admin_section_title': 'Admin Info',
    'webhook.requested_by': (name) => `👤 Requested by: ${name}`,
    'webhook.request_id': (id) => `🆔 Request ID: ${id}`,
    'webhook.cancel_hint': '0️⃣ Reply "0" to cancel',
    'webhook.failed_add_radarr': 'Failed to add to Radarr. Please check system logs and configuration.',
    'webhook.failed_add_sonarr': 'Failed to add to Sonarr. Please check system logs and configuration.',
    'webhook.failed_error_detail': (msg) => `Error: ${msg}`,
    'webhook.approved_by': (name) => `Approved by ${name}`,
    'webhook.declined_by': (name) => `Declined by ${name}`,

    // Webhook - issue admin
    'webhook.issue_id': (id) => `🆔 Issue ID: ${id}`,
    'webhook.issue_type_display': (emoji, type) => `${emoji} Issue Type: ${type}`,
    'webhook.issue_type_admin': (type) => `📋 Issue Type: ${type}`,
    'webhook.issue_message_label': (msg) => `📝 Message: ${msg}`,
    'webhook.issue_comment_label': (msg) => `💬 Comment: ${msg}`,
    'webhook.issue_action_by': (label, name) => `👤 ${label} by: ${name}`,
    'webhook.issue_action_reported': 'Reported',
    'webhook.issue_action_commented': 'Commented',
    'webhook.issue_action_resolved': 'Resolved',
    'webhook.issue_action_reopened': 'Reopened',
    'webhook.issue_desc_created': 'Please review and resolve the issue.',
    'webhook.issue_desc_comment': 'New comment added to issue.',
    'webhook.issue_desc_resolved': 'Issue has been resolved.',
    'webhook.issue_desc_reopened': 'Issue has been reopened.',

    // Webhook - issue user messages
    'webhook.issue_created_body': 'Your issue has been reported successfully. An administrator will review it and get back to you soon.',
    'webhook.issue_resolved_body': 'Your issue has been marked as resolved. If you still experience problems, you can reopen the issue.',
    'webhook.issue_reopened_body': 'Your issue has been reopened. An administrator will review it again.',
    'webhook.issue_comment_body': 'A new comment has been added to your issue.',
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

    // Agent Command
    'agent.confirmation': '✅ Deine Anfrage wurde an einen Agenten weitergeleitet. Er wird sich in Kürze melden.',
    'agent.admin_notification': (username, chatId) => `💬 Agent-Anfrage\n\n👤 Benutzer: ${username}\n📱 Chat-ID: ${chatId}\n\nBenutzer hat darum gebeten, mit einem Agenten zu sprechen.`,

    // Search error
    'search.error': (msg) => `❌ Suchfehler: ${msg}`,

    // Request - season cancellation
    'request.season_cancelled': (title, qualityText) => `❌ Staffelauswahl für "${title}"${qualityText} abgebrochen.\n\nDu kannst jederzeit eine neue Suche starten.`,

    // Season utils
    'season.invalid_format': '❌ Ungültiges Format. Verwende Zahlen (z.B. "1" oder "1,2,3") oder "all"',
    'season.specials_not_allowed': '❌ Staffel 0 (Specials) kann nicht angefordert werden',
    'season.invalid_numbers': (invalid, max) => `❌ Ungültige Staffelnummern: ${invalid}. Gültiger Bereich: 1-${max}`,
    'season.no_seasons_available': '❌ Keine Staffeln verfügbar.',
    'season.show_status': (status) => `📺 Serien-Status: ${status}`,
    'season.select_prompt': '📺 Staffeln auswählen:',
    'season.cancel_option': '0️⃣ Abbrechen',
    'season.reply_prompt': '📥 Antwort: Nummer(n) oder "all"',

    // Message mapper - movie
    'message.movie_not_found_tmdb': (tmdb) => `❌ Es konnte kein Film mit der TheMovieDbId "${tmdb}" gefunden werden. Bitte versuche etwas anderes.`,
    'message.movie_not_found_name': (name) => `❌ Es konnte kein Film mit dem Namen "${name}" gefunden werden. Bitte versuche etwas anderes.`,

    // Message mapper - all seasons
    'message.all_seasons_request_button': '💬 Wenn du **alle Staffeln** dieser Serie anfordern möchtest, klicke bitte auf die Schaltfläche "Anfrage stellen" direkt unter dieser Nachricht.',
    'message.some_seasons_info': (title) => `ℹ️ Einige Staffeln von **${title}** sind bereits angefordert oder verfügbar.`,

    // Message mapper - future seasons
    'message.future_seasons_request_button': '💬 Wenn du **zukünftige Staffeln** dieser Serie anfordern möchtest, klicke bitte auf die Schaltfläche "Anfrage stellen" direkt unter dieser Nachricht.',
    'message.all_seasons_available_notify': '✅ **Alle Staffeln** sind verfügbar und du wirst benachrichtigt, wenn neue Staffeln erscheinen.',
    'message.all_seasons_available': '✅ **Alle Staffeln** sind bereits verfügbar.',
    'message.all_seasons_requested_notify': '📋 **Alle Staffeln** wurden bereits angefordert und du wirst benachrichtigt, wenn neue Staffeln verfügbar werden.',
    'message.all_seasons_requested': '📋 **Alle Staffeln** wurden bereits angefordert.',
    'message.future_seasons_requested_notify': '📋 **Zukünftige Staffeln** wurden bereits angefordert und du wirst benachrichtigt, wenn sie verfügbar werden.',
    'message.future_seasons_requested': '📋 **Zukünftige Staffeln** wurden bereits angefordert.',
    'message.future_seasons_request_success': (title) => `✅ Deine Anfrage für **zukünftige Staffeln** von **${title}** wurde erfolgreich gesendet!`,
    'message.future_seasons_notify_success': (title) => `🔔 Du erhältst ab sofort eine Benachrichtigung, sobald neue **zukünftige Staffeln** von **${title}** verfügbar sind.`,

    // Message mapper - all seasons status
    'message.all_seasons_status_available': '📋 **Alle Staffeln** sind verfügbar.',
    'message.all_seasons_status_requested': '📋 **Alle Staffeln** wurden angefordert.',
    'message.all_seasons_status_show': (status) => `📺 Serien-Status: ${status}`,
    'message.all_seasons_status_availability': (text) => `✅ Verfügbarkeit: ${text}`,

    // Message mapper - tv show
    'message.show_cannot_be_requested': '⚠️ Diese Serie kann nicht automatisch angefordert werden. Bitte frage den Server-Administrator, sie manuell hinzuzufügen.',
    'message.tvshow_not_found_tvdb': (tvdb) => `❌ Es konnte keine Serie mit der TvDbId "${tvdb}" gefunden werden. Bitte versuche etwas anderes.`,
    'message.tvshow_not_found_name': (name) => `❌ Es konnte keine Serie mit dem Namen "${name}" gefunden werden. Bitte versuche etwas anderes.`,
    'message.generic_error': '❌ Ein unerwarteter Fehler ist beim Verarbeiten deiner Anfrage aufgetreten.',

    // Webhook - additional
    'webhook.requested_seasons': (value) => `📋 Angefordert: ${value}`,
    'webhook.failed_type': (type) => `📋 Typ: ${type}`,
    'webhook.failed_body': 'Leider konnte deine Anfrage derzeit nicht verarbeitet werden. Der Administrator wurde benachrichtigt und wird sich darum kümmern.',

    // Media type names (for display)
    'media.type_movie': 'Film',
    'media.type_tv': 'Serie',

    // Webhook - pending message
    'webhook.pending_type': (type) => `📋 Typ: ${type}`,
    'webhook.pending_seasons': (emoji, value) => `${emoji} Staffeln: ${value}`,

    // Webhook - admin section
    'webhook.admin_section_title': 'Admin-Info',
    'webhook.requested_by': (name) => `👤 Angefordert von: ${name}`,
    'webhook.request_id': (id) => `🆔 Anfrage-ID: ${id}`,
    'webhook.cancel_hint': '0️⃣ Antworte "0" zum Abbrechen',
    'webhook.failed_add_radarr': 'Konnte nicht zu Radarr hinzugefügt werden. Bitte überprüfe die Systemprotokolle und Konfiguration.',
    'webhook.failed_add_sonarr': 'Konnte nicht zu Sonarr hinzugefügt werden. Bitte überprüfe die Systemprotokolle und Konfiguration.',
    'webhook.failed_error_detail': (msg) => `Fehler: ${msg}`,
    'webhook.approved_by': (name) => `Genehmigt von ${name}`,
    'webhook.declined_by': (name) => `Abgelehnt von ${name}`,

    // Webhook - issue admin
    'webhook.issue_id': (id) => `🆔 Problem-ID: ${id}`,
    'webhook.issue_type_display': (emoji, type) => `${emoji} Problemtyp: ${type}`,
    'webhook.issue_type_admin': (type) => `📋 Problemtyp: ${type}`,
    'webhook.issue_message_label': (msg) => `📝 Nachricht: ${msg}`,
    'webhook.issue_comment_label': (msg) => `💬 Kommentar: ${msg}`,
    'webhook.issue_action_by': (label, name) => `👤 ${label} von: ${name}`,
    'webhook.issue_action_reported': 'Gemeldet',
    'webhook.issue_action_commented': 'Kommentiert',
    'webhook.issue_action_resolved': 'Behoben',
    'webhook.issue_action_reopened': 'Wiedereröffnet',
    'webhook.issue_desc_created': 'Bitte prüfe und behebe das Problem.',
    'webhook.issue_desc_comment': 'Neuer Kommentar zum Problem hinzugefügt.',
    'webhook.issue_desc_resolved': 'Das Problem wurde behoben.',
    'webhook.issue_desc_reopened': 'Das Problem wurde wiedereröffnet.',

    // Webhook - issue user messages
    'webhook.issue_created_body': 'Dein Problem wurde erfolgreich gemeldet. Ein Administrator wird es prüfen und sich bald bei dir melden.',
    'webhook.issue_resolved_body': 'Dein Problem wurde als behoben markiert. Falls du weiterhin Probleme hast, kannst du das Problem wieder öffnen.',
    'webhook.issue_reopened_body': 'Dein Problem wurde wiedereröffnet. Ein Administrator wird es erneut prüfen.',
    'webhook.issue_comment_body': 'Dein Problem hat einen neuen Kommentar erhalten.',
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
