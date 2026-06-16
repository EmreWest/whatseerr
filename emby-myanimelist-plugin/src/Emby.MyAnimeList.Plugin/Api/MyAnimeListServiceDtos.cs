using System.Collections.Generic;
using MediaBrowser.Model.Services;
using Emby.MyAnimeList.Plugin.MyAnimeList;

namespace Emby.MyAnimeList.Plugin.Api
{
    [Route("/MyAnimeList/Auth/Url", "GET", Summary = "Creates a MyAnimeList OAuth authorization URL.")]
    public class GetMyAnimeListAuthorizationUrl : IReturn<MyAnimeListAuthorizationUrlResponse>
    {
    }

    public class MyAnimeListAuthorizationUrlResponse
    {
        public string Url { get; set; } = string.Empty;
    }

    [Route("/MyAnimeList/Auth/Token", "POST", Summary = "Exchanges a MyAnimeList OAuth authorization code for tokens.")]
    public class ExchangeMyAnimeListAuthorizationCode : IReturn<MyAnimeListTokenResponse>
    {
        public string Code { get; set; } = string.Empty;
    }

    [Route("/MyAnimeList/Auth/Test", "GET", Summary = "Tests the configured MyAnimeList connection.")]
    public class TestMyAnimeListConnection : IReturn<MyAnimeListUser>
    {
    }

    [Route("/MyAnimeList/Search/Anime", "GET", Summary = "Searches anime in MyAnimeList.")]
    public class SearchMyAnimeListAnime : IReturn<IReadOnlyList<MyAnimeListAnime>>
    {
        public string Query { get; set; } = string.Empty;

        public int Limit { get; set; } = 10;
    }

    [Route("/MyAnimeList/Anime/{AnimeId}/Status", "GET", Summary = "Gets the current user's MyAnimeList status for an anime.")]
    public class GetMyAnimeListAnimeStatus : IReturn<MyAnimeListAnime>
    {
        public long AnimeId { get; set; }
    }

    [Route("/MyAnimeList/Anime/{AnimeId}/Status", "POST", Summary = "Updates the current user's MyAnimeList status for an anime.")]
    public class UpdateMyAnimeListAnimeStatus : UpdateAnimeListStatus, IReturn<MyAnimeListAnimeStatus>
    {
        public long AnimeId { get; set; }
    }
}
