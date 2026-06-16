using System;
using MediaBrowser.Model.Plugins;

namespace Emby.MyAnimeList.Plugin.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        public string ClientId { get; set; } = string.Empty;

        public string ClientSecret { get; set; } = string.Empty;

        public string RedirectUri { get; set; } = "http://localhost";

        public string CodeVerifier { get; set; } = string.Empty;

        public string AccessToken { get; set; } = string.Empty;

        public string RefreshToken { get; set; } = string.Empty;

        public DateTime AccessTokenExpiresAtUtc { get; set; } = DateTime.MinValue;
    }
}
