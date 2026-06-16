using System.Collections.Generic;
using System.Globalization;

namespace Emby.MyAnimeList.Plugin.MyAnimeList
{
    public class UpdateAnimeListStatus
    {
        public AnimeListStatus? Status { get; set; }

        public int? Score { get; set; }

        public int? EpisodesWatched { get; set; }

        public bool? IsRewatching { get; set; }

        public string? StartDate { get; set; }

        public string? FinishDate { get; set; }

        public string? Tags { get; set; }

        public string? Comments { get; set; }

        public Dictionary<string, string> ToFormFields()
        {
            var values = new Dictionary<string, string>();

            if (Status.HasValue)
            {
                values["status"] = Status.Value.ToString();
            }

            if (Score.HasValue)
            {
                values["score"] = Clamp(Score.Value, 0, 10).ToString(CultureInfo.InvariantCulture);
            }

            if (EpisodesWatched.HasValue)
            {
                values["num_watched_episodes"] = EpisodesWatched.Value.ToString(CultureInfo.InvariantCulture);
            }

            if (IsRewatching.HasValue)
            {
                values["is_rewatching"] = IsRewatching.Value ? "true" : "false";
            }

            AddIfPresent(values, "start_date", StartDate);
            AddIfPresent(values, "finish_date", FinishDate);
            AddIfPresent(values, "tags", Tags);
            AddIfPresent(values, "comments", Comments);

            return values;
        }

        private static void AddIfPresent(Dictionary<string, string> values, string key, string? value)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                values[key] = value!;
            }
        }

        private static int Clamp(int value, int min, int max)
        {
            if (value < min)
            {
                return min;
            }

            return value > max ? max : value;
        }
    }
}
