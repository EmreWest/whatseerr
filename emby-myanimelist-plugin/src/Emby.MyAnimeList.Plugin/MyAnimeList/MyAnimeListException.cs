using System;

namespace Emby.MyAnimeList.Plugin.MyAnimeList
{
    public class MyAnimeListException : Exception
    {
        public MyAnimeListException(string message)
            : base(message)
        {
        }
    }
}
