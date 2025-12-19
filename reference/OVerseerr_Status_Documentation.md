# Overseerr Status and Availability Detection

This document explains how Requestrr determines the availability and request status of movies and TV shows when using Overseerr as the download client.

## Overview

Requestrr queries Overseerr's API to get media information, which includes status information. Overseerr tracks the status of media based on whether it exists in your connected media server (Plex/Jellyfin) and download client (Radarr/Sonarr).

## MediaStatus Enum Values

Overseerr uses the following status values (defined in `OverseerrClient.cs`):

```csharp
public enum MediaStatus
{
    UNKNOWN = 1,
    PENDING = 2,
    PROCESSING = 3,
    PARTIALLY_AVAILABLE = 4,
    AVAILABLE = 5,
}
```

### Status Meanings

- **UNKNOWN (1)**: Status is not determined or media is not tracked
- **PENDING (2)**: Media has been requested but not yet approved/started downloading
- **PROCESSING (3)**: Media is currently being downloaded or processed
- **PARTIALLY_AVAILABLE (4)**: Some content is available (e.g., some episodes of a season)
- **AVAILABLE (5)**: Media is fully available in your media library

## API Endpoints

### Movies

When searching for a movie, Requestrr calls:
```
GET /api/v{version}/movie/{theMovieDbId}
```

The response includes a `MediaInfo` object with:
- `status` - Standard quality status
- `status4k` - 4K quality status (if applicable)

### TV Shows

When searching for a TV show, Requestrr calls:
```
GET /api/v{version}/tv/{theTvDbId}
```

The response includes:
- `MediaInfo.status` - Overall show status
- `MediaInfo.status4k` - Overall show 4K status
- `MediaInfo.seasons[]` - Array of season statuses
- `seasons[]` - Array of season metadata

## Movie Status Mapping

### Availability

A movie is considered **available** only when:
```csharp
Available = mediaStatus == MediaStatus.AVAILABLE
```

This means only status `5` (AVAILABLE) sets `Available = true`. All other statuses result in `Available = false`.

### Request Status

A movie is considered **requested** when:
```csharp
Requested = mediaStatus == MediaStatus.PENDING
         || mediaStatus == MediaStatus.PROCESSING
         || mediaStatus == MediaStatus.PARTIALLY_AVAILABLE
         || mediaStatus == MediaStatus.AVAILABLE
```

This means any status except `UNKNOWN` indicates the movie has been requested.

### 4K Handling

For 4K content, Requestrr checks the category's `Is4K` setting:
- If `Is4K = true`: Uses `MediaInfo.Status4k`
- If `Is4K = false`: Uses `MediaInfo.Status`

```csharp
var mediaStatus = category.Is4K ? movie.MediaInfo?.Status4k : movie.MediaInfo?.Status;
return ConvertMovie(movie, mediaStatus);
```

## TV Show Status Mapping

TV show status is more complex because it's tracked at the season level.

### Season Availability

Seasons have their availability determined through a multi-step process:

#### Step 1: Initial Status from Season Metadata

First, status is set from the `seasons[]` array in the API response:
```csharp
IsAvailable = x.Status == MediaStatus.AVAILABLE
```

#### Step 2: Override from MediaInfo.Seasons

If `MediaInfo.Seasons` exists, it overrides the initial status:
```csharp
var mediaSeason = jsonMedia.MediaInfo.Seasons.FirstOrDefault(x => x.SeasonNumber == season.SeasonNumber);

if (mediaSeason != null && (
    mediaSeason.Status == MediaStatus.PROCESSING || 
    mediaSeason.Status == MediaStatus.PARTIALLY_AVAILABLE || 
    mediaSeason.Status == MediaStatus.AVAILABLE))
{
    season.IsAvailable = mediaSeason.Status == MediaStatus.AVAILABLE;
    season.IsRequested = ConvertRequestedState(mediaSeason.Status);
}
```

#### Step 3: Pending Requests Override

If there are pending or approved requests for a season, availability is overridden:
```csharp
var request = jsonMedia.MediaInfo.Requests
    .Where(x => x.Seasons.Any(s => s.SeasonNumber == season.SeasonNumber))
    .Where(x => x.Status == MediaRequestStatus.PENDING || x.Status == MediaRequestStatus.APPROVED)
    .FirstOrDefault();

if (request != null)
{
    season.IsAvailable = false;  // Not available if there's a pending request
    season.IsRequested = RequestedState.Full;
}
```

### Season Request Status

The `IsRequested` property uses `ConvertRequestedState()`:

```csharp
private RequestedState ConvertRequestedState(MediaStatus status)
{
    if (status == MediaStatus.UNKNOWN || status == MediaStatus.PENDING)
    {
        return RequestedState.None;
    }

    if (status == MediaStatus.AVAILABLE || 
        status == MediaStatus.PROCESSING || 
        status == MediaStatus.PARTIALLY_AVAILABLE)
    {
        return RequestedState.Full;
    }

    return RequestedState.None;
}
```

**Mapping:**
- `UNKNOWN` or `PENDING` → `RequestedState.None`
- `AVAILABLE`, `PROCESSING`, or `PARTIALLY_AVAILABLE` → `RequestedState.Full`

## Preventing Duplicate Requests

The bot checks if content is already requested **before** allowing a new request to be created. This prevents duplicate requests from being submitted to Overseerr.

### Movie Duplicate Request Prevention

When a user attempts to request a movie, the bot first checks if it can be requested:

```csharp
private static bool CanBeRequested(Movie movie)
{
    return !movie.Available && !movie.Requested;
}
```

**Logic:**
- If `movie.Requested == true`: The movie has already been requested (status is PENDING, PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE)
- If `movie.Available == true`: The movie is already in the library
- Only if both are `false` can a new request be created

**Workflow in `HandleMovieSelectionAsync()`:**
```csharp
if (CanBeRequested(movie))
{
    // Show movie details and allow request
    await _userInterface.DisplayMovieDetailsAsync(...);
}
else
{
    if (movie.Available)
    {
        // Already available - warn user
        await _userInterface.WarnMovieAlreadyAvailableAsync(movie);
    }
    else
    {
        // Already requested - offer notifications instead
        await _notificationWorkflow.NotifyForExistingRequestAsync(...);
    }
}
```

**Note:** The `RequestMovieAsync()` method does not perform this check - it relies on Overseerr's API to handle duplicate requests. However, the UI workflow prevents users from even attempting to request already-requested content.

### TV Show Duplicate Request Prevention

For TV shows, the check is performed at the season level in `NormalTvSeasonRequestingWorkflow.HandleSelectionAsync()`:

```csharp
if (selectedSeason.IsRequested == RequestedState.Full)
{
    // Season already requested - offer notifications instead
    await RequestNotificationsForSeasonAsync(...);
}
else
{
    // Can be requested - show request details
    await _userInterface.DisplayTvShowDetailsForSeasonAsync(...);
}
```

**Season Requested State Determination:**

The `IsRequested` property is set through the 3-step process in `ConvertSeasons()`:

1. **Pending/Approved Requests (Highest Priority)**: If `MediaInfo.Requests` contains a PENDING or APPROVED request for the season, `IsRequested = RequestedState.Full` (regardless of status)

2. **MediaInfo.Seasons Status**: If the season exists in `MediaInfo.Seasons` with status PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE, `IsRequested = RequestedState.Full`

3. **Season Metadata Status**: Initial status from `seasons[]` array, converted via `ConvertRequestedState()`

**Key Point:** The presence of a pending/approved request in `MediaInfo.Requests` always results in `IsRequested = RequestedState.Full`, which blocks new requests for that season.

## Status Flow Diagram

### Movie Request Flow

```
User requests movie
    ↓
Requestrr queries: GET /api/v{version}/movie/{id}
    ↓
Overseerr returns JSONMedia with MediaInfo
    ↓
Extract status based on Is4K setting:
  - Standard: MediaInfo.Status
  - 4K: MediaInfo.Status4k
    ↓
Convert to Movie object:
  - Available = (status == AVAILABLE)
  - Requested = (status != UNKNOWN)
    ↓
Check availability in MovieRequestingWorkflow:
  - If Available: Warn user (already available)
  - If Requested but not Available: Offer notification
  - If neither: Show request details
```

### TV Show Request Flow

```
User requests TV show
    ↓
Requestrr queries: GET /api/v{version}/tv/{id}
    ↓
Overseerr returns JSONMedia with:
  - MediaInfo (overall status)
  - seasons[] (metadata)
  - MediaInfo.Seasons[] (status per season)
  - MediaInfo.Requests[] (pending requests)
    ↓
For each season:
  1. Set initial status from seasons[]
  2. Override with MediaInfo.Seasons if exists
  3. Override with Requests if pending/approved
    ↓
Convert to TvShow object with season availability
    ↓
Check availability in TvShowRequestingWorkflow:
  - If season IsAvailable: Warn user
  - If season IsRequested: Offer notification
  - Otherwise: Show request details
```

## Key Code Locations

- **Status Enum Definition**: `Requestrr.WebApi/RequestrrBot/DownloadClients/Overseerr/OverseerrClient.cs` lines 1369-1376
- **Movie Conversion**: `Requestrr.WebApi/RequestrrBot/DownloadClients/Overseerr/OverseerrClient.cs` `ConvertMovie()` method (lines 900-918)
- **TV Show Conversion**: `Requestrr.WebApi/RequestrrBot/DownloadClients/Overseerr/OverseerrClient.cs` `ConvertTvShow()` and `ConvertSeasons()` methods (lines 931-1000)
- **Request Status Conversion**: `Requestrr.WebApi/RequestrrBot/DownloadClients/Overseerr/OverseerrClient.cs` `ConvertRequestedState()` method (lines 1002-1015)
- **Movie Duplicate Request Check**: `Requestrr.WebApi/RequestrrBot/Movies/MovieRequestingWorkflow.cs` `CanBeRequested()` method (lines 123-126) and `HandleMovieSelectionAsync()` (lines 88-105)
- **TV Show Duplicate Request Check**: `Requestrr.WebApi/RequestrrBot/TvShows/SeasonsRequestWorkflows/NormalTvSeasonRequestingWorkflow.cs` `HandleSelectionAsync()` (lines 24-34)

## Status Decision Matrix

### Movies

| Overseerr Status | Available | Requested | Bot Action |
|-----------------|-----------|-----------|------------|
| UNKNOWN (1) | ❌ | ❌ | Show request details |
| PENDING (2) | ❌ | ✅ | Offer notification |
| PROCESSING (3) | ❌ | ✅ | Offer notification |
| PARTIALLY_AVAILABLE (4) | ❌ | ✅ | Offer notification |
| AVAILABLE (5) | ✅ | ✅ | Warn: already available |

### TV Show Seasons

| Overseerr Status | IsAvailable | IsRequested | Bot Action |
|-----------------|-------------|-------------|------------|
| UNKNOWN (1) | ❌ | None | Show request details |
| PENDING (2) | ❌ | None | Show request details |
| PROCESSING (3) | ❌ | Full | Offer notification |
| PARTIALLY_AVAILABLE (4) | ❌ | Full | Offer notification |
| AVAILABLE (5) | ✅ | Full | Warn: already available |

**Note**: If a season has a pending/approved request, `IsAvailable` is always `false` and `IsRequested` is always `Full`, regardless of the status value.

## Important Notes

1. **Availability is strict**: Only `AVAILABLE` (5) status results in `Available = true`. Even `PARTIALLY_AVAILABLE` is considered not available.

2. **4K is separate**: Standard and 4K content have independent status tracking. A movie can be available in standard but not 4K, or vice versa.

3. **TV shows are season-based**: Availability and request status are determined per season, not per show.

4. **Pending requests override**: If a season has a pending or approved request, it's always marked as not available, even if some episodes might be in the library.

5. **Overseerr is the source of truth**: Requestrr doesn't directly query Radarr/Sonarr/Plex. It relies entirely on Overseerr's status, which Overseerr determines from its connections to those services.

6. **Status precedence for TV shows**: When determining season availability, the order of precedence is:
   - Pending/approved requests (highest priority - always overrides)
   - MediaInfo.Seasons status (if exists)
   - seasons[] metadata status (lowest priority)

## Example Scenarios

### Scenario 1: Movie Available in Library
- Overseerr Status: `AVAILABLE (5)`
- Result: `Available = true`, `Requested = true`
- Bot Action: User sees warning "Movie already available"

### Scenario 2: Movie Requested but Not Downloaded
- Overseerr Status: `PENDING (2)` or `PROCESSING (3)`
- Result: `Available = false`, `Requested = true`
- Bot Action: User is offered notification when movie becomes available

### Scenario 3: TV Show Season Partially Available
- Overseerr Status: `PARTIALLY_AVAILABLE (4)`
- Result: `IsAvailable = false`, `IsRequested = Full`
- Bot Action: User is offered notification for remaining episodes

### Scenario 4: TV Show Season with Pending Request
- Overseerr Status: Any status
- Pending Request: Exists for the season
- Result: `IsAvailable = false`, `IsRequested = Full` (overridden by request)
- Bot Action: User is offered notification when season becomes available

### Scenario 5: Movie Already Requested (Duplicate Prevention)
- User attempts to request a movie
- Overseerr Status: `PENDING (2)` (request exists but not approved/started)
- Result: `Available = false`, `Requested = true`
- Bot Action: `CanBeRequested()` returns `false`, so bot offers notifications instead of allowing duplicate request

### Scenario 6: TV Show Season Already Requested (Duplicate Prevention)
- User attempts to request a season
- Overseerr Status: `PROCESSING (3)` (season is being downloaded)
- Result: `IsAvailable = false`, `IsRequested = Full`
- Bot Action: `HandleSelectionAsync()` detects `IsRequested == RequestedState.Full`, offers notifications instead of allowing duplicate request

