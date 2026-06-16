using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Services;
using Emby.MyAnimeList.Plugin.MyAnimeList;

namespace Emby.MyAnimeList.Plugin.Api
{
    public class MyAnimeListService : IService
    {
        public object Get(GetMyAnimeListAuthorizationUrl request)
        {
            var client = CreateClient();
            return new MyAnimeListAuthorizationUrlResponse
            {
                Url = client.BuildAuthorizationUrl()
            };
        }

        public async Task<object> Post(ExchangeMyAnimeListAuthorizationCode request)
        {
            var client = CreateClient();
            return await client.ExchangeAuthorizationCodeAsync(request.Code, CancellationToken.None).ConfigureAwait(false);
        }

        public async Task<object> Get(TestMyAnimeListConnection request)
        {
            var client = CreateClient();
            return await client.GetCurrentUserAsync(CancellationToken.None).ConfigureAwait(false);
        }

        public async Task<object> Get(SearchMyAnimeListAnime request)
        {
            var client = CreateClient();
            return await client.SearchAnimeAsync(request.Query, request.Limit, CancellationToken.None).ConfigureAwait(false);
        }

        public async Task<object> Get(GetMyAnimeListAnimeStatus request)
        {
            var client = CreateClient();
            return await client.GetAnimeStatusAsync(request.AnimeId, CancellationToken.None).ConfigureAwait(false);
        }

        public async Task<object> Post(UpdateMyAnimeListAnimeStatus request)
        {
            var client = CreateClient();
            return await client.UpdateAnimeStatusAsync(request.AnimeId, request, CancellationToken.None).ConfigureAwait(false);
        }

        private static MyAnimeListClient CreateClient()
        {
            if (Plugin.Instance == null)
            {
                throw new MyAnimeListException("Plugin wurde noch nicht initialisiert.");
            }

            return new MyAnimeListClient(Plugin.Instance);
        }
    }
}
