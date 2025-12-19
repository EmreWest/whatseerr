# TV Shows and Seasons: Duplicate Request Prevention with Overseerr

This document explains how Requestrr detects available/requested seasons and prevents duplicate requests for TV shows using the Overseerr API.

## Overview

Requestrr prevents duplicate TV show season requests by:
1. Querying Overseerr's API to get detailed season status information
2. Analyzing multiple data sources to determine season availability and request status
3. Blocking new requests for seasons that are already requested or available
4. Offering notifications instead of allowing duplicate requests

## API Endpoints

### 1. Search Endpoint (Initial Search)

**Endpoint:**
```
GET /api/v{version}/search/?query={query}&page=1&language=en
```

**Parameters:**
- `{version}` - API version (typically `1`)
- `{query}` - Search query (URL encoded, e.g., "breaking bad" or "tvdb:1396")

**Headers:**
```
X-Api-Key: your-api-key
```

**Example Request:**
```bash
curl -X GET "https://overseerr.example.com/api/v1/search/?query=breaking%20bad&page=1&language=en" \
  -H "X-Api-Key: your-api-key"
```

**Response Structure:**
```json
{
  "results": [
    {
      "id": 1396,
      "name": "Breaking Bad",
      "mediaType": "tv",
      "posterPath": "/path/to/poster.jpg",
      "firstAirDate": "2008-01-20",
      "mediaInfo": {
        "status": 3,
        "status4k": 1
      }
    }
  ]
}
```

**Note:** Search endpoint returns minimal information. Season details are NOT included in search results.

---

### 2. TV Show Details Endpoint (Full Information)

**Endpoint:**
```
GET /api/v{version}/tv/{theTvDbId}
```

**Parameters:**
- `{version}` - API version (typically `1`)
- `{theTvDbId}` - The TVDB ID of the TV show (from search results)

**Headers:**
```
X-Api-Key: your-api-key
```

**Example Request:**
```bash
curl -X GET "https://overseerr.example.com/api/v1/tv/1396" \
  -H "X-Api-Key: your-api-key"
```

## API Response Structure (TV Show Details)

The Overseerr API returns comprehensive information about the TV show, including season-level status. This is the **critical endpoint** for duplicate detection:

```json
{
  "id": 1396,
  "name": "Breaking Bad",
  "mediaInfo": {
    "status": 3,
    "status4k": 1,
    "seasons": [
      {
        "seasonNumber": 1,
        "status": 5,
        "status4k": 1
      },
      {
        "seasonNumber": 2,
        "status": 3,
        "status4k": 1
      },
      {
        "seasonNumber": 3,
        "status": 2,
        "status4k": 1
      }
    ],
    "requests": [
      {
        "id": 100,
        "status": 1,
        "seasons": [
          {
            "seasonNumber": 3
          }
        ]
      }
    ],
    "plexUrl": "https://plex.example.com/...",
    "mediaUrl": "https://..."
  },
  "seasons": [
    {
      "seasonNumber": 1,
      "status": 5
    },
    {
      "seasonNumber": 2,
      "status": 3
    },
    {
      "seasonNumber": 3,
      "status": 2
    }
  ]
}
```

### Key Response Fields

**Top-Level Fields:**
- `id` - TVDB ID of the show
- `name` - Show name
- `overview` - Show description
- `firstAirDate` - First air date
- `inProduction` - Whether show is still in production
- `status` - Show status string (e.g., "Ended", "Returning Series")
- `posterPath` - Path to poster image
- `networks[]` - Array of network objects
- `seasons[]` - **Season metadata array** (used in Step 1 of status detection)

**MediaInfo Object (Critical for Duplicate Detection):**
- `mediaInfo.status` - Overall show status (1-5)
- `mediaInfo.status4k` - Overall show 4K status (1-5)
- `mediaInfo.seasons[]` - **Array of season status objects** (used in Step 3 of status detection):
  - `seasonNumber` - Season number
  - `status` - Season status code (1-5)
  - `status4k` - Season 4K status code (1-5)
- `mediaInfo.requests[]` - **Array of pending/approved requests** (used in Step 2, highest priority):
  - `id` - Request ID
  - `status` - Request status (1=PENDING, 2=APPROVED, 3=DECLINED)
  - `seasons[]` - Array of season objects with `seasonNumber`
- `mediaInfo.plexUrl` - Plex URL if available
- `mediaInfo.mediaUrl` - Media URL if available

**Important:** The `seasons[]` array at the top level contains metadata, while `mediaInfo.seasons[]` contains the actual status information. Requestrr uses both, with `mediaInfo.seasons[]` taking precedence (but `mediaInfo.requests[]` takes highest precedence).

## How Requestrr Detects Season Status

Requestrr uses a **3-step priority system** to determine season availability and request status:

### Step 1: Initial Status from Season Metadata

First, Requestrr extracts initial status from the `seasons[]` array:

```csharp
var seasons = jsonMedia.Seasons.Select(x =>
    new NormalTvSeason
    {
        SeasonNumber = x.SeasonNumber,
        IsAvailable = x.Status == MediaStatus.AVAILABLE,  // Only status 5 = available
        IsRequested = ConvertRequestedState(x.Status)
    }).ToArray();
```

**Status Mapping:**
- `UNKNOWN (1)` or `PENDING (2)` → `IsRequested = None`
- `PROCESSING (3)`, `PARTIALLY_AVAILABLE (4)`, or `AVAILABLE (5)` → `IsRequested = Full`

### Step 2: Override with Pending/Approved Requests (Highest Priority)

If `mediaInfo.requests[]` contains pending or approved requests, they **always override** the status:

```csharp
if (jsonMedia.MediaInfo.Requests != null && jsonMedia.MediaInfo.Requests.Any())
{
    foreach (var season in seasons)
    {
        var request = jsonMedia.MediaInfo.Requests
            .Where(x => x.Seasons.Any(s => s.SeasonNumber == season.SeasonNumber))
            .Where(x => x.Status == MediaRequestStatus.PENDING || x.Status == MediaRequestStatus.APPROVED)
            .FirstOrDefault();

        if (request != null)
        {
            season.IsAvailable = false;  // Always false if request exists
            season.IsRequested = RequestedState.Full;  // Always Full if request exists
        }
    }
}
```

**Key Points:**
- Pending/approved requests have **highest priority**
- If a request exists, `IsAvailable = false` and `IsRequested = Full` (regardless of other status)
- This prevents duplicate requests even if the season status suggests it's not requested

### Step 3: Override with MediaInfo.Seasons Status

If `mediaInfo.seasons[]` exists, it overrides the initial status (but not pending requests):

```csharp
if (jsonMedia.MediaInfo.Seasons.Any())
{
    foreach (var season in seasons)
    {
        var mediaSeason = jsonMedia.MediaInfo.Seasons
            .FirstOrDefault(x => x.SeasonNumber == season.SeasonNumber);

        if (mediaSeason != null && (
            mediaSeason.Status == MediaStatus.PROCESSING || 
            mediaSeason.Status == MediaStatus.PARTIALLY_AVAILABLE || 
            mediaSeason.Status == MediaStatus.AVAILABLE))
        {
            season.IsAvailable = mediaSeason.Status == MediaStatus.AVAILABLE;
            season.IsRequested = ConvertRequestedState(mediaSeason.Status);
        }
    }
}
```

**Priority Order:**
1. **Pending/Approved Requests** (Step 2) - Highest priority
2. **MediaInfo.Seasons Status** (Step 3) - Medium priority
3. **Seasons Metadata Status** (Step 1) - Lowest priority

## Duplicate Request Prevention

### Pre-Request Validation

Before allowing a user to request a season, Requestrr checks if it's already requested:

**Code Location:** `NormalTvSeasonRequestingWorkflow.HandleSelectionAsync()`

```csharp
public async Task HandleSelectionAsync(TvShowRequest request, TvShow tvShow, NormalTvSeason selectedSeason)
{
    if (selectedSeason.IsRequested == RequestedState.Full)
    {
        // Season already requested - offer notifications instead
        await RequestNotificationsForSeasonAsync(request, tvShow, selectedSeason);
    }
    else
    {
        // Can be requested - show request details
        await _userInterface.DisplayTvShowDetailsForSeasonAsync(request, tvShow, selectedSeason);
    }
}
```

**Logic:**
- If `IsRequested == RequestedState.Full`: Season is already requested → Block new request, offer notifications
- If `IsRequested == RequestedState.None` or `RequestedState.Partial`: Season can be requested → Show request details

### Notification Workflow

When a season is already requested, Requestrr offers notifications instead:

```csharp
private async Task RequestNotificationsForSeasonAsync(TvShowRequest request, TvShow tvShow, TvSeason selectedSeason)
{
    if (selectedSeason.IsAvailable)
    {
        // Already available - warn user
        await _userInterface.WarnSeasonAlreadyAvailableAsync(tvShow, selectedSeason);
    }
    else
    {
        // Already requested but not available - offer notification
        await _tvShowNotificationWorkflow.NotifyForExistingRequestAsync(request.User.UserId, tvShow, selectedSeason);
    }
}
```

## Complete Step-by-Step Request Flow

### Step 1: User Searches for TV Show

**User Action:**
```
User types: "!tv breaking bad"
```

**Requestrr API Call:**
```http
GET /api/v1/search/?query=breaking%20bad&page=1&language=en
Headers:
  X-Api-Key: your-api-key
```

**Expected Response Structure:**
```json
{
  "results": [
    {
      "id": 1396,
      "name": "Breaking Bad",
      "mediaType": "tv",
      "posterPath": "/path/to/poster.jpg",
      "firstAirDate": "2008-01-20",
      "mediaInfo": {
        "status": 3,
        "status4k": 1
      }
    },
    {
      "id": 12345,
      "name": "Another Show",
      "mediaType": "tv",
      ...
    }
  ]
}
```

**Requestrr Processing:**
```csharp
// Filter to TV shows only
var tvShows = jsonResponse.Results
    .Where(x => x.MediaType == MediaTypes.TV)
    .ToArray();

// Convert to SearchedTvShow objects (only basic info: id, name, banner, firstAired)
return tvShows.Select(ConvertSearchedTvShow).ToArray();
```

**Result:** User sees list of matching TV shows (no season details yet)

---

### Step 2: User Selects TV Show

**User Action:**
```
User selects: "Breaking Bad" (TheTvDbId: 1396)
```

**Requestrr API Call:**
```http
GET /api/v1/tv/1396
Headers:
  X-Api-Key: your-api-key
```

**Expected Response Structure:**
```json
{
  "id": 1396,
  "name": "Breaking Bad",
  "overview": "A high school chemistry teacher...",
  "firstAirDate": "2008-01-20",
  "inProduction": false,
  "status": "Ended",
  "posterPath": "/path/to/poster.jpg",
  "networks": [
    {
      "name": "AMC"
    }
  ],
  "seasons": [
    {
      "seasonNumber": 1,
      "status": 5,
      "status4k": 1
    },
    {
      "seasonNumber": 2,
      "status": 3,
      "status4k": 1
    },
    {
      "seasonNumber": 3,
      "status": 2,
      "status4k": 1
    }
  ],
  "mediaInfo": {
    "id": 500,
    "status": 3,
    "status4k": 1,
    "seasons": [
      {
        "seasonNumber": 1,
        "status": 5,
        "status4k": 1
      },
      {
        "seasonNumber": 2,
        "status": 3,
        "status4k": 1
      },
      {
        "seasonNumber": 3,
        "status": 2,
        "status4k": 1
      }
    ],
    "requests": [
      {
        "id": 100,
        "status": 1,
        "seasons": [
          {
            "seasonNumber": 3
          }
        ]
      }
    ],
    "plexUrl": "https://plex.example.com/...",
    "mediaUrl": "https://..."
  },
  "externalIds": {
    "tvdbId": 81189
  }
}
```

**Requestrr Processing:**
1. Deserialize JSON to `JSONMedia` object
2. Determine which status to use (standard or 4K) based on category settings
3. Call `ConvertTvShow()` which calls `ConvertSeasons()`

---

### Step 3: Requestrr Processes Season Status (3-Step Priority System)

**Code Location:** `OverseerrClient.ConvertSeasons()` (line 955)

#### Step 3.1: Initial Status from Season Metadata

```csharp
// Extract from jsonMedia.Seasons[] array
var seasons = jsonMedia.Seasons.Select(x =>
    new NormalTvSeason
    {
        SeasonNumber = x.SeasonNumber,
        IsAvailable = x.Status == MediaStatus.AVAILABLE,  // Only status 5 = true
        IsRequested = ConvertRequestedState(x.Status)     // Maps status to RequestedState
    }).ToArray();
```

**Example for Season 1:**
- `x.Status = 5` (AVAILABLE)
- `IsAvailable = true`
- `IsRequested = RequestedState.Full`

**Example for Season 3:**
- `x.Status = 2` (PENDING)
- `IsAvailable = false`
- `IsRequested = RequestedState.None`

#### Step 3.2: Override with Pending/Approved Requests (Highest Priority)

```csharp
if (jsonMedia.MediaInfo.Requests != null && jsonMedia.MediaInfo.Requests.Any())
{
    foreach (var season in seasons)
    {
        var request = jsonMedia.MediaInfo.Requests
            .Where(x => x.Seasons.Any(s => s.SeasonNumber == season.SeasonNumber))
            .Where(x => x.Status == MediaRequestStatus.PENDING || x.Status == MediaRequestStatus.APPROVED)
            .FirstOrDefault();

        if (request != null)
        {
            season.IsAvailable = false;  // Always false if request exists
            season.IsRequested = RequestedState.Full;  // Always Full if request exists
        }
    }
}
```

**Example for Season 3:**
- Found pending request (status 1) for season 3
- **Override:** `IsAvailable = false`, `IsRequested = RequestedState.Full`
- This happens even though season metadata showed status 2 (PENDING → None)

#### Step 3.3: Override with MediaInfo.Seasons Status

```csharp
if (jsonMedia.MediaInfo.Seasons.Any())
{
    foreach (var season in seasons)
    {
        var mediaSeason = jsonMedia.MediaInfo.Seasons
            .FirstOrDefault(x => x.SeasonNumber == season.SeasonNumber);

        if (mediaSeason != null && (
            mediaSeason.Status == MediaStatus.PROCESSING || 
            mediaSeason.Status == MediaStatus.PARTIALLY_AVAILABLE || 
            mediaSeason.Status == MediaStatus.AVAILABLE))
        {
            season.IsAvailable = mediaSeason.Status == MediaStatus.AVAILABLE;
            season.IsRequested = ConvertRequestedState(mediaSeason.Status);
        }
    }
}
```

**Note:** This only overrides if status is PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE. It does NOT override if pending requests exist (Step 3.2 has higher priority).

**Final Result for Each Season:**
- Season 1: `IsAvailable = true`, `IsRequested = Full` (available in library)
- Season 2: `IsAvailable = false`, `IsRequested = Full` (processing/downloading)
- Season 3: `IsAvailable = false`, `IsRequested = Full` (pending request found)

---

### Step 4: User Attempts to Request Season

**User Action:**
```
User clicks: "Request Season 3"
```

**Requestrr Processing:**
**Code Location:** `NormalTvSeasonRequestingWorkflow.HandleSelectionAsync()` (line 24)

```csharp
public async Task HandleSelectionAsync(TvShowRequest request, TvShow tvShow, NormalTvSeason selectedSeason)
{
    if (selectedSeason.IsRequested == RequestedState.Full)
    {
        // Season already requested - offer notifications instead
        await RequestNotificationsForSeasonAsync(request, tvShow, selectedSeason);
    }
    else
    {
        // Can be requested - show request details
        await _userInterface.DisplayTvShowDetailsForSeasonAsync(request, tvShow, selectedSeason);
    }
}
```

**For Season 3 (IsRequested = Full):**
```
Check: IsRequested == RequestedState.Full? → YES
    ↓
Call: RequestNotificationsForSeasonAsync()
    ↓
Check: IsAvailable == true?
    ↓
If YES: Warn "Season 3 already available"
If NO: Offer notification "Get notified when Season 3 becomes available"
```

**For Season 4 (IsRequested = None):**
```
Check: IsRequested == RequestedState.Full? → NO
    ↓
Call: DisplayTvShowDetailsForSeasonAsync()
    ↓
Show request details to user
User can confirm and create request
```

---

### Step 5: Creating the Request (If Allowed)

**User Action:**
```
User confirms: "Yes, request Season 4"
```

**Requestrr API Call:**
```http
POST /api/v1/request
Headers:
  X-Api-Key: your-api-key
  X-API-User: user-id (if user-specific)
  Content-Type: application/json
```

**Request Body:**
```json
{
  "mediaId": 1396,
  "mediaType": "tv",
  "seasons": [4],
  "is4k": false,
  "serverId": 1,
  "profileId": 1,
  "languageProfileId": 0,
  "rootFolder": "/tv",
  "tags": [1, 2],
  "userId": 123
}
```

**Note:** If user doesn't have auto-approve permissions, Requestrr may:
1. First create request with `POST /api/v1/request` (minimal data)
2. Then update it with `PUT /api/v1/request/{requestId}` (full category settings)

**Expected Response:**
```json
{
  "id": 101,
  "status": 1,
  "media": {
    "id": 1396,
    "name": "Breaking Bad"
  },
  "seasons": [
    {
      "seasonNumber": 4
    }
  ]
}
```

**Requestrr Processing:**
- If successful: Show success message to user
- If denied (403): Show "Request denied" message
- Add notification tracking if enabled

## Status Code Reference

### MediaStatus Codes

| Code | Name | IsAvailable | IsRequested |
|------|------|-------------|-------------|
| 1 | UNKNOWN | ❌ | None |
| 2 | PENDING | ❌ | None |
| 3 | PROCESSING | ❌ | Full |
| 4 | PARTIALLY_AVAILABLE | ❌ | Full |
| 5 | AVAILABLE | ✅ | Full |

### Request Status Codes

| Code | Name | Description |
|------|------|-------------|
| 1 | PENDING | Request is pending approval |
| 2 | APPROVED | Request has been approved |
| 3 | DECLINED | Request has been declined |

## Example Scenarios

### Scenario 1: Season Already Available

**API Response:**
```json
{
  "mediaInfo": {
    "seasons": [
      {
        "seasonNumber": 1,
        "status": 5
      }
    ]
  }
}
```

**Requestrr Processing:**
- `IsAvailable = true` (status == 5)
- `IsRequested = Full` (status == 5)
- **Result:** User sees warning "Season 1 already available"

### Scenario 2: Season with Pending Request

**API Response:**
```json
{
  "mediaInfo": {
    "seasons": [
      {
        "seasonNumber": 2,
        "status": 2
      }
    ],
    "requests": [
      {
        "id": 100,
        "status": 1,
        "seasons": [
          {
            "seasonNumber": 2
          }
        ]
      }
    ]
  }
}
```

**Requestrr Processing:**
1. Initial: `IsAvailable = false`, `IsRequested = None` (status == 2)
2. Override with request: `IsAvailable = false`, `IsRequested = Full` (pending request found)
3. **Result:** User is offered notification, duplicate request blocked

### Scenario 3: Season Being Downloaded

**API Response:**
```json
{
  "mediaInfo": {
    "seasons": [
      {
        "seasonNumber": 3,
        "status": 3
      }
    ]
  }
}
```

**Requestrr Processing:**
- `IsAvailable = false` (status != 5)
- `IsRequested = Full` (status == 3)
- **Result:** User is offered notification, duplicate request blocked

### Scenario 4: Season Can Be Requested

**API Response:**
```json
{
  "mediaInfo": {
    "seasons": [
      {
        "seasonNumber": 4,
        "status": 1
      }
    ]
  }
}
```

**Requestrr Processing:**
- `IsAvailable = false` (status != 5)
- `IsRequested = None` (status == 1)
- **Result:** User can request the season

## Key Code Locations

- **TV Show Details API Call**: `OverseerrClient.GetTvShowDetailsAsync()` (line 664)
- **Season Status Conversion**: `OverseerrClient.ConvertSeasons()` (line 955)
- **Request Status Conversion**: `OverseerrClient.ConvertRequestedState()` (line 1002)
- **Duplicate Request Check**: `NormalTvSeasonRequestingWorkflow.HandleSelectionAsync()` (line 24)
- **Request Creation**: `OverseerrClient.RequestTvShowAsync()` (line 685)

## Important Notes

1. **Request Priority**: Pending/approved requests always override status codes. A season with a pending request is always considered requested, even if the status code suggests otherwise.

2. **4K Handling**: Standard and 4K content have separate status tracking. Check `status4k` field for 4K availability.

3. **Status Precedence**: The order of precedence for determining season status is:
   - Pending/approved requests (highest priority)
   - MediaInfo.Seasons status
   - Seasons metadata status (lowest priority)

4. **No Direct API Check**: Requestrr doesn't make a separate API call to check for duplicates. It relies on the comprehensive data returned by `GET /api/v1/tv/{id}` which includes all necessary information.

5. **Request Blocking**: Duplicate requests are blocked at the UI level before they reach Overseerr's API. This prevents unnecessary API calls and provides better user experience.

6. **Notification Alternative**: When a duplicate request is detected, Requestrr offers notifications instead, allowing users to be notified when the season becomes available.

## Detection and Prevention Summary

### How Detection Works

Requestrr detects which seasons are available/requested through a **single API call** to `GET /api/v1/tv/{id}` which returns:

1. **Season metadata** (`seasons[]`) - Initial status for each season
2. **Season status** (`mediaInfo.seasons[]`) - Detailed status per season
3. **Pending requests** (`mediaInfo.requests[]`) - Active requests that override status

The 3-step priority system ensures accurate detection:
- **Step 1:** Extract initial status from `seasons[]` metadata
- **Step 2:** Override with `mediaInfo.requests[]` if pending/approved requests exist (highest priority)
- **Step 3:** Override with `mediaInfo.seasons[]` if detailed status exists (medium priority)

### How Prevention Works

Duplicate request prevention happens **before** the request is sent to Overseerr:

1. **Pre-Request Check:** When user selects a season, Requestrr checks `IsRequested` property
2. **Blocking Logic:** If `IsRequested == RequestedState.Full`, the request is blocked
3. **Alternative Action:** Instead of allowing duplicate request, Requestrr offers:
   - Notification if season is not available
   - Warning if season is already available
4. **UI-Level Prevention:** This happens in `NormalTvSeasonRequestingWorkflow.HandleSelectionAsync()` before any API call to create a request

### Key Points

1. **Single API Call:** Only one call to `GET /api/v1/tv/{id}` is needed - it contains all information for duplicate detection
2. **No Separate Check:** Requestrr doesn't make a separate API call to check for duplicates
3. **Request Priority:** Pending/approved requests always override status codes
4. **UI-Level Blocking:** Duplicate requests are blocked before reaching Overseerr's API
5. **User Experience:** Users get helpful notifications instead of error messages

## Summary

Requestrr prevents duplicate TV show season requests by:

1. **Querying Overseerr API** (`GET /api/v1/tv/{id}`) for comprehensive TV show details including season status and pending requests
2. **Analyzing multiple data sources** using a 3-step priority system to determine accurate season status:
   - Priority 1: Pending/approved requests (always override)
   - Priority 2: MediaInfo.Seasons status (detailed status)
   - Priority 3: Seasons metadata status (initial status)
3. **Checking `IsRequested` property** in `HandleSelectionAsync()` before allowing new requests
4. **Blocking duplicate requests** at the UI level (before API call) and offering notifications instead
5. **Relying on Overseerr's comprehensive data** which includes pending requests, season status, and availability information in a single response

This approach ensures users cannot create duplicate requests while providing a smooth experience with notification options for already-requested content.

