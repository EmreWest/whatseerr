using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Emby.MyAnimeList.Plugin.Configuration;

namespace Emby.MyAnimeList.Plugin.MyAnimeList
{
    public class MyAnimeListClient
    {
        private const string ApiBaseUrl = "https://api.myanimelist.net/v2";
        private const string OAuthAuthorizeUrl = "https://myanimelist.net/v1/oauth2/authorize";
        private const string OAuthTokenUrl = "https://myanimelist.net/v1/oauth2/token";

        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        private readonly Plugin _plugin;
        private readonly HttpClient _httpClient;

        public MyAnimeListClient(Plugin plugin)
        {
            _plugin = plugin;
            _httpClient = new HttpClient();
        }

        public string BuildAuthorizationUrl()
        {
            var configuration = _plugin.Configuration;
            ValidateOAuthConfiguration(configuration);

            if (string.IsNullOrWhiteSpace(configuration.CodeVerifier))
            {
                configuration.CodeVerifier = Pkce.CreateCodeVerifier();
                _plugin.SaveConfiguration();
            }

            var query = new Dictionary<string, string>
            {
                ["response_type"] = "code",
                ["client_id"] = configuration.ClientId,
                ["redirect_uri"] = configuration.RedirectUri,
                ["code_challenge"] = configuration.CodeVerifier,
                ["code_challenge_method"] = "plain"
            };

            return OAuthAuthorizeUrl + "?" + BuildQuery(query);
        }

        public async Task<MyAnimeListTokenResponse> ExchangeAuthorizationCodeAsync(string authorizationCode, CancellationToken cancellationToken)
        {
            var configuration = _plugin.Configuration;
            ValidateOAuthConfiguration(configuration);

            if (string.IsNullOrWhiteSpace(configuration.CodeVerifier))
            {
                throw new MyAnimeListException("CodeVerifier fehlt. Erzeuge zuerst eine AuthorizationUrl.");
            }

            var form = new Dictionary<string, string>
            {
                ["client_id"] = configuration.ClientId,
                ["client_secret"] = configuration.ClientSecret,
                ["grant_type"] = "authorization_code",
                ["code"] = authorizationCode,
                ["redirect_uri"] = configuration.RedirectUri,
                ["code_verifier"] = configuration.CodeVerifier
            };

            var token = await PostTokenAsync(form, cancellationToken).ConfigureAwait(false);
            StoreToken(token);
            return token;
        }

        public async Task<MyAnimeListUser> GetCurrentUserAsync(CancellationToken cancellationToken)
        {
            return await SendAsync<MyAnimeListUser>(HttpMethod.Get, ApiBaseUrl + "/users/@me", null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<IReadOnlyList<MyAnimeListAnime>> SearchAnimeAsync(string query, int limit, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                throw new MyAnimeListException("Der Suchbegriff darf nicht leer sein.");
            }

            var url = ApiBaseUrl + "/anime?" + BuildQuery(new Dictionary<string, string>
            {
                ["q"] = query,
                ["limit"] = Math.Max(1, Math.Min(limit, 20)).ToString(CultureInfo.InvariantCulture),
                ["fields"] = "num_episodes,my_list_status"
            });

            var response = await SendAsync<MyAnimeListSearchResponse>(HttpMethod.Get, url, null, cancellationToken).ConfigureAwait(false);
            return response.Data.Select(x => x.Node).ToList();
        }

        public async Task<MyAnimeListAnime> GetAnimeStatusAsync(long animeId, CancellationToken cancellationToken)
        {
            var url = ApiBaseUrl + "/anime/" + animeId.ToString(CultureInfo.InvariantCulture) + "?fields=title,num_episodes,my_list_status";
            return await SendAsync<MyAnimeListAnime>(HttpMethod.Get, url, null, cancellationToken).ConfigureAwait(false);
        }

        public async Task<MyAnimeListAnimeStatus> UpdateAnimeStatusAsync(long animeId, UpdateAnimeListStatus update, CancellationToken cancellationToken)
        {
            var form = update.ToFormFields();
            if (form.Count == 0)
            {
                throw new MyAnimeListException("Mindestens ein Statusfeld muss gesetzt sein.");
            }

            var url = ApiBaseUrl + "/anime/" + animeId.ToString(CultureInfo.InvariantCulture) + "/my_list_status";
            return await SendAsync<MyAnimeListAnimeStatus>(new HttpMethod("PATCH"), url, new FormUrlEncodedContent(form), cancellationToken).ConfigureAwait(false);
        }

        private async Task<T> SendAsync<T>(HttpMethod method, string url, HttpContent? content, CancellationToken cancellationToken)
        {
            var configuration = _plugin.Configuration;
            await EnsureAccessTokenAsync(configuration, cancellationToken).ConfigureAwait(false);

            using (var request = new HttpRequestMessage(method, url))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", configuration.AccessToken);
                request.Headers.Add("X-MAL-Client-ID", configuration.ClientId);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                request.Content = content;

                using (var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false))
                {
                    var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode)
                    {
                        throw new MyAnimeListException("MyAnimeList API Fehler " + (int)response.StatusCode + ": " + body);
                    }

                    var result = JsonSerializer.Deserialize<T>(body, JsonOptions);
                    if (result == null)
                    {
                        throw new MyAnimeListException("MyAnimeList lieferte eine leere Antwort.");
                    }

                    return result;
                }
            }
        }

        private async Task EnsureAccessTokenAsync(PluginConfiguration configuration, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(configuration.AccessToken) &&
                configuration.AccessTokenExpiresAtUtc > DateTime.UtcNow.AddMinutes(5))
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(configuration.RefreshToken))
            {
                throw new MyAnimeListException("MyAnimeList ist nicht verbunden. Bitte OAuth zuerst abschliessen.");
            }

            ValidateOAuthConfiguration(configuration);

            var form = new Dictionary<string, string>
            {
                ["client_id"] = configuration.ClientId,
                ["client_secret"] = configuration.ClientSecret,
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = configuration.RefreshToken
            };

            var token = await PostTokenAsync(form, cancellationToken).ConfigureAwait(false);
            StoreToken(token);
        }

        private async Task<MyAnimeListTokenResponse> PostTokenAsync(Dictionary<string, string> form, CancellationToken cancellationToken)
        {
            using (var content = new FormUrlEncodedContent(form))
            using (var response = await _httpClient.PostAsync(OAuthTokenUrl, content, cancellationToken).ConfigureAwait(false))
            {
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    throw new MyAnimeListException("MyAnimeList OAuth Fehler " + (int)response.StatusCode + ": " + body);
                }

                var token = JsonSerializer.Deserialize<MyAnimeListTokenResponse>(body, JsonOptions);
                if (token == null || string.IsNullOrWhiteSpace(token.AccessToken))
                {
                    throw new MyAnimeListException("MyAnimeList OAuth lieferte kein Access Token.");
                }

                return token;
            }
        }

        private void StoreToken(MyAnimeListTokenResponse token)
        {
            var configuration = _plugin.Configuration;
            configuration.AccessToken = token.AccessToken;
            configuration.RefreshToken = token.RefreshToken;
            configuration.AccessTokenExpiresAtUtc = DateTime.UtcNow.AddSeconds(Math.Max(60, token.ExpiresIn));
            _plugin.SaveConfiguration();
        }

        private static void ValidateOAuthConfiguration(PluginConfiguration configuration)
        {
            if (string.IsNullOrWhiteSpace(configuration.ClientId))
            {
                throw new MyAnimeListException("ClientId fehlt in der Plugin-Konfiguration.");
            }

            if (string.IsNullOrWhiteSpace(configuration.ClientSecret))
            {
                throw new MyAnimeListException("ClientSecret fehlt in der Plugin-Konfiguration.");
            }

            if (string.IsNullOrWhiteSpace(configuration.RedirectUri))
            {
                throw new MyAnimeListException("RedirectUri fehlt in der Plugin-Konfiguration.");
            }
        }

        private static string BuildQuery(Dictionary<string, string> values)
        {
            return string.Join("&", values.Select(x => Uri.EscapeDataString(x.Key) + "=" + Uri.EscapeDataString(x.Value)));
        }
    }
}
