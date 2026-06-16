using System;
using System.Security.Cryptography;

namespace Emby.MyAnimeList.Plugin.MyAnimeList
{
    internal static class Pkce
    {
        public static string CreateCodeVerifier()
        {
            var bytes = new byte[64];
            using (var generator = RandomNumberGenerator.Create())
            {
                generator.GetBytes(bytes);
            }

            return Convert.ToBase64String(bytes)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }
    }
}
