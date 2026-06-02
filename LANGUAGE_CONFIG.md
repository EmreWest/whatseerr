# Bot Language Configuration

## Overview

WhatseerBot now supports multiple languages through environment variables and configuration. Currently supported languages are:

- **English** (en) - Default
- **Deutsch/German** (de)

## Configuration Methods

### Method 1: Environment Variable (Docker - Recommended)

Set `BOT_LANGUAGE` environment variable:

```dockerfile
ENV BOT_LANGUAGE=de
```

Or in docker-compose.yml:

```yaml
services:
  whatseerr:
    environment:
      - BOT_LANGUAGE=de
```

### Method 2: Configuration File

Set the language in `config.json`:

```json
{
  "system": {
    "language": "de"
  }
}
```

## Environment Variable Priority

The bot uses the following priority for language selection:

1. `BOT_LANGUAGE` environment variable (highest priority)
2. `system.language` in config.json
3. Default: `en` (English)

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `de` | Deutsch (German) |

## Adding New Languages

To add support for a new language (e.g., Spanish):

1. Open `/lib/i18n/locales.js`
2. Add new locale object:

```javascript
export const locales = {
  en: { /* ... */ },
  de: { /* ... */ },
  es: {  // Add Spanish
    'search.results.title': (query) => `✅ Resultados de búsqueda para "${query}"`,
    // ... add all other keys
  }
};
```

3. Set `BOT_LANGUAGE=es` to use Spanish

## Bot Messages

The bot sends messages in different contexts:

- **Search Results** - `/search <query>` or `/r <query>`
- **Help Messages** - `/help` or `help`
- **Selection Messages** - Numeric selections from search results
- **Error Messages** - When something goes wrong
- **Webhook Notifications** - When media status changes

## Translation Keys

All message strings are mapped to keys in `locales.js` for easy translation. Key format: `domain.context.message`

Example:
- `search.results.title` - Search results header
- `help.greeting` - Help command greeting
- `selection.cancelled` - Selection cancelled message

## Testing Language Changes

1. Update docker-compose.yml or Dockerfile with desired language
2. Restart the container: `docker-compose restart`
3. Send a test message to the bot
4. Verify the response is in the selected language

## Contributing Translations

To contribute translations for a new language:

1. Fork the repository
2. Add your language to `locales.js` with all message keys translated
3. Test thoroughly with the bot
4. Submit a pull request with the new language

## Troubleshooting

**Bot messages still in English?**
- Ensure environment variable is set correctly: `BOT_LANGUAGE=de`
- Restart the Docker container after changing the setting
- Check container logs: `docker logs whatseerr-bot`

**Language not supported?**
- Check that the language code is valid (e.g., `de` not `deutsch`)
- Add the language to `locales.js` if needed

**Partial translations showing English?**
- Some advanced messages may still be in English
- This is expected during ongoing localization
- Report missing translations as GitHub issues
