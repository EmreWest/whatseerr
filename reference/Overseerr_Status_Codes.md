# Overseerr Status Codes Reference

This document provides a simplified reference for Overseerr status codes, what they mean, and how to retrieve them.

## Status Code Enum

Overseerr uses the following status codes:

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

## Status Code Meanings

| Code | Name | Description |
|------|------|-------------|
| **1** | `UNKNOWN` | Status is not determined or media is not tracked in Overseerr |
| **2** | `PENDING` | Media has been requested but not yet approved or started downloading |
| **3** | `PROCESSING` | Media is currently being downloaded or processed by the download client |
| **4** | `PARTIALLY_AVAILABLE` | Some content is available (e.g., some episodes of a season, but not all) |
| **5** | `AVAILABLE` | Media is fully available in your media library (Plex/Jellyfin) |

## How to Get Status Codes

### For Movies

**API Endpoint:**
```
GET /api/v{version}/movie/{theMovieDbId}
```

**Response Structure:**
```json
{
  "id": 12345,
  "title": "Movie Title",
  "mediaInfo": {
    "status": 2,
    "status4k": 1,
    "plexUrl": "https://...",
    "mediaUrl": "https://..."
  }
}
```

**Status Fields:**
- `mediaInfo.status` - Standard quality status (1-5)
- `mediaInfo.status4k` - 4K quality status (1-5, if applicable)

**Example Request:**
```bash
curl -X GET "https://your-overseerr.com/api/v1/movie/550" \
  -H "X-Api-Key: your-api-key"
```

### For TV Shows

**API Endpoint:**
```
GET /api/v{version}/tv/{theTvDbId}
```

**Response Structure:**
```json
{
  "id": 12345,
  "name": "TV Show Title",
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
            "seasonNumber": 2
          }
        ]
      }
    ]
  },
  "seasons": [
    {
      "seasonNumber": 1,
      "status": 5
    },
    {
      "seasonNumber": 2,
      "status": 2
    }
  ]
}
```

**Status Fields:**
- `mediaInfo.status` - Overall show status (1-5)
- `mediaInfo.status4k` - Overall show 4K status (1-5, if applicable)
- `mediaInfo.seasons[].status` - Status per season (1-5)
- `mediaInfo.seasons[].status4k` - 4K status per season (1-5)
- `seasons[].status` - Season metadata status (1-5)
- `mediaInfo.requests[].status` - Request status (1=PENDING, 2=APPROVED, 3=DECLINED)

**Example Request:**
```bash
curl -X GET "https://your-overseerr.com/api/v1/tv/1396" \
  -H "X-Api-Key: your-api-key"
```

## What Information Each Status Provides

### Status Code 1: UNKNOWN
- **Available**: ❌ No
- **Requested**: ❌ No
- **In Library**: ❌ No
- **Meaning**: Media is not tracked or status cannot be determined

### Status Code 2: PENDING
- **Available**: ❌ No
- **Requested**: ✅ Yes
- **In Library**: ❌ No
- **Meaning**: Request exists but waiting for approval or hasn't started downloading

### Status Code 3: PROCESSING
- **Available**: ❌ No
- **Requested**: ✅ Yes
- **In Library**: ❌ No
- **Meaning**: Currently downloading or being processed by Radarr/Sonarr

### Status Code 4: PARTIALLY_AVAILABLE
- **Available**: ❌ No (treated as not available)
- **Requested**: ✅ Yes
- **In Library**: ⚠️ Partial
- **Meaning**: Some content is available (e.g., some episodes downloaded, but not all)

### Status Code 5: AVAILABLE
- **Available**: ✅ Yes
- **Requested**: ✅ Yes
- **In Library**: ✅ Yes
- **Meaning**: Fully available in media library and ready to watch

## Status Code Usage in Requestrr

### Movies

Requestrr uses the status code to determine:

```csharp
// Availability
Available = (status == 5)  // Only AVAILABLE means available

// Requested State
Requested = (status != 1)  // Any status except UNKNOWN means requested
```

### TV Shows

For TV shows, status is checked per season:

```csharp
// Season Availability
IsAvailable = (seasonStatus == 5)  // Only AVAILABLE means available

// Season Requested State
IsRequested = (seasonStatus == 3 || seasonStatus == 4 || seasonStatus == 5)
             // PROCESSING, PARTIALLY_AVAILABLE, or AVAILABLE = Full
             // UNKNOWN or PENDING = None
```

**Important for TV Shows:**
- If `mediaInfo.requests[]` contains a PENDING or APPROVED request for a season, that season is always considered requested (regardless of status code)
- Status codes are checked in this priority order:
  1. Pending/approved requests (highest priority)
  2. `mediaInfo.seasons[].status`
  3. `seasons[].status` (lowest priority)

## Request Status Codes

When checking `mediaInfo.requests[].status` for TV shows:

| Code | Name | Description |
|------|------|-------------|
| **1** | `PENDING` | Request is pending approval |
| **2** | `APPROVED` | Request has been approved |
| **3** | `DECLINED` | Request has been declined |

## Quick Reference Table

| Status | Code | Available? | Requested? | In Library? | Can Request? |
|--------|------|------------|------------|------------|--------------|
| UNKNOWN | 1 | ❌ | ❌ | ❌ | ✅ Yes |
| PENDING | 2 | ❌ | ✅ | ❌ | ❌ No (already requested) |
| PROCESSING | 3 | ❌ | ✅ | ❌ | ❌ No (already requested) |
| PARTIALLY_AVAILABLE | 4 | ❌ | ✅ | ⚠️ Partial | ❌ No (already requested) |
| AVAILABLE | 5 | ✅ | ✅ | ✅ | ❌ No (already available) |

## API Authentication

All Overseerr API requests require authentication via API key:

```
X-Api-Key: your-api-key-here
```

For user-specific requests, you may also need:

```
X-API-User: user-id-here
```

## Example: Checking Movie Status

```bash
# Get movie status
curl -X GET "https://overseerr.example.com/api/v1/movie/550" \
  -H "X-Api-Key: abc123xyz"

# Response shows:
# {
#   "mediaInfo": {
#     "status": 5,        # AVAILABLE
#     "status4k": 1       # UNKNOWN (no 4K version)
#   }
# }
```

## Example: Checking TV Show Status

```bash
# Get TV show status
curl -X GET "https://overseerr.example.com/api/v1/tv/1396" \
  -H "X-Api-Key: abc123xyz"

# Response shows:
# {
#   "mediaInfo": {
#     "status": 3,        # PROCESSING (overall)
#     "seasons": [
#       {
#         "seasonNumber": 1,
#         "status": 5      # AVAILABLE
#       },
#       {
#         "seasonNumber": 2,
#         "status": 2      # PENDING
#       }
#     ]
#   }
# }
```

## Notes

1. **4K Status**: Movies and TV shows have separate status tracking for standard and 4K quality. Check `status4k` field for 4K availability.

2. **Status Precedence**: For TV shows, pending/approved requests always override status codes. A season with a pending request is always considered requested, even if the status code suggests otherwise.

3. **Status Source**: Overseerr determines status by checking:
   - Connected media server (Plex/Jellyfin) for availability
   - Connected download client (Radarr/Sonarr) for download/request status
   - Internal request database for pending requests

4. **Status Updates**: Status codes are updated automatically by Overseerr when:
   - Media is added to the library
   - Downloads complete
   - Requests are approved/declined
   - Media is removed from the library

