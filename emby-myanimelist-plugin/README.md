# Emby MyAnimeList Plugin

Emby server plugin for reading and updating the current user's anime status in MyAnimeList through the official MyAnimeList API v2.

## Features

- OAuth2 Authorization Code with PKCE setup for MyAnimeList.
- Emby plugin configuration page for Client ID, Client Secret and Redirect URI.
- API endpoints for authorization, connection test, anime search, current status lookup and status updates.
- Targets `netstandard2.0` and references `MediaBrowser.Server.Core`, matching Emby's current plugin guidance.

## Build

```bash
dotnet build emby-myanimelist-plugin/Emby.MyAnimeList.sln
```

To copy the plugin and local dependencies into an Emby plugin folder after build:

```bash
dotnet build emby-myanimelist-plugin/Emby.MyAnimeList.sln -p:EmbyPluginPath="$HOME/.config/emby-server/plugins"
```

Restart Emby Server after copying the plugin.

## MyAnimeList setup

Create an API client at `https://myanimelist.net/apiconfig`, then enter the Client ID, Client Secret and Redirect URI on the plugin settings page.

Use the settings page to generate the authorization URL. After approving access in MyAnimeList, paste the returned `code` value into the Authorization Code field and save it.

## Plugin API

- `GET /emby/MyAnimeList/Auth/Url`
- `POST /emby/MyAnimeList/Auth/Token` with `{ "Code": "..." }`
- `GET /emby/MyAnimeList/Auth/Test`
- `GET /emby/MyAnimeList/Search/Anime?Query=one%20piece&Limit=10`
- `GET /emby/MyAnimeList/Anime/{AnimeId}/Status`
- `POST /emby/MyAnimeList/Anime/{AnimeId}/Status`

Example status update body:

```json
{
  "Status": "watching",
  "Score": 8,
  "EpisodesWatched": 12,
  "IsRewatching": false
}
```

Valid status values are `watching`, `completed`, `on_hold`, `dropped` and `plan_to_watch`.
