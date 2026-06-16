using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Emby.MyAnimeList.Plugin.MyAnimeList
{
    public class MyAnimeListTokenResponse
    {
        [JsonPropertyName("token_type")]
        public string TokenType { get; set; } = string.Empty;

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = string.Empty;

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class MyAnimeListUser
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    public class MyAnimeListAnime
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("num_episodes")]
        public int? EpisodeCount { get; set; }

        [JsonPropertyName("my_list_status")]
        public MyAnimeListAnimeStatus? MyListStatus { get; set; }
    }

    public class MyAnimeListAnimeStatus
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("score")]
        public int Score { get; set; }

        [JsonPropertyName("num_episodes_watched")]
        public int EpisodesWatched { get; set; }

        [JsonPropertyName("is_rewatching")]
        public bool IsRewatching { get; set; }

        [JsonPropertyName("updated_at")]
        public string UpdatedAt { get; set; } = string.Empty;
    }

    public class MyAnimeListSearchResponse
    {
        [JsonPropertyName("data")]
        public IReadOnlyList<MyAnimeListSearchEdge> Data { get; set; } = new List<MyAnimeListSearchEdge>();
    }

    public class MyAnimeListSearchEdge
    {
        [JsonPropertyName("node")]
        public MyAnimeListAnime Node { get; set; } = new MyAnimeListAnime();
    }
}
