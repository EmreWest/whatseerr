using System;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Logging;

namespace Emby.MyAnimeList.Plugin
{
    public class PluginEntryPoint : IServerEntryPoint
    {
        private readonly ILogger _logger;

        public PluginEntryPoint(ILogger logger)
        {
            _logger = logger;
        }

        public void Run()
        {
            _logger.Info("{0} started. Configure a MyAnimeList OAuth app before using the status endpoints.", Plugin.PluginName);
        }

        public void Dispose()
        {
        }
    }
}
