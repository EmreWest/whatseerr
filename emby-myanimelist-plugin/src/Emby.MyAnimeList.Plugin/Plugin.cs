using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Emby.MyAnimeList.Plugin.Configuration;

namespace Emby.MyAnimeList.Plugin
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public const string PluginName = "MyAnimeList Anime Status";

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        public static Plugin? Instance { get; private set; }

        public override string Name => PluginName;

        public override string Description => "Ruft Anime-Listenstatus aus MyAnimeList ab und aktualisiert ihn ueber die offizielle MyAnimeList API v2.";

        public override Guid Id => Guid.Parse("8c42041b-7e66-4e29-9e5f-384df45b4c32");

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "myAnimeListConfigurationPage",
                    DisplayName = "MyAnimeList",
                    EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html",
                    EnableInMainMenu = false,
                    IsMainConfigPage = true
                }
            };
        }
    }
}
