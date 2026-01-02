# Notification Logic Analysis

## Overview

This document provides a comprehensive analysis of the notification system in `lib/webhook-helpers.js`. The system handles Seerr webhook notifications and routes them to appropriate recipients (requesters, admins, and subscribers).

## Architecture

### Main Entry Point: `handleSeerrWebhook()`

The notification flow follows this pattern:

1. **Notification Classification**: Determine notification type and who should receive it
2. **Base Message Generation**: Create the base notification message (with error handling)
3. **Requester Notification**: Send to the requester (if email present)
4. **Admin Notifications**: Send to all admins (for admin-relevant notifications)
5. **Subscriber Notifications**: Send to subscribers (for MEDIA_AVAILABLE only)

## Notification Routing Logic

### Notification Types

The system handles the following notification types:

- **MEDIA_PENDING**: Non-admin requests requiring approval
- **MEDIA_APPROVED**: Request has been approved
- **MEDIA_DECLINED**: Request has been declined
- **MEDIA_FAILED**: Request processing failed
- **MEDIA_AVAILABLE**: Media is now available
- **MEDIA_AUTO_APPROVED**: Admin request auto-approved (requester-only)
- **ISSUE_CREATED**: Issue reported
- **ISSUE_COMMENT**: Issue has new comment
- **ISSUE_RESOLVED**: Issue resolved
- **ISSUE_REOPENED**: Issue reopened
- **TEST_NOTIFICATION**: Test notification (admin-only)

### Admin-Relevant Notifications

Notifications that trigger admin notifications:

```javascript
const isAdminRelevant = isTestNotification || 
  notificationType === 'MEDIA_PENDING' ||   // Non-admin requests requiring approval
  notificationType === 'MEDIA_APPROVED' ||  // Admin needs to know when requests are approved
  notificationType === 'MEDIA_FAILED' || 
  notificationType === 'MEDIA_DECLINED' ||  // Admin needs to know when requests are declined
  notificationType === 'ISSUE_CREATED' ||    // Issue reported
  notificationType === 'ISSUE_COMMENT' ||   // Issue has new comment
  notificationType === 'ISSUE_RESOLVED' ||  // Issue resolved
  notificationType === 'ISSUE_REOPENED';   // Issue reopened
```

**Note**: `MEDIA_AUTO_APPROVED` is intentionally excluded because admin requests are auto-approved in Seerr, so no admin action is needed.

## Notification Flow

### 1. Requester Notification Path

**Conditions**:
- Email must be present (extracted from webhook data)
- Not a TEST_NOTIFICATION (email is null for test notifications)

**Process**:
1. Extract email from webhook data
2. Look up user ID from email
3. Save email mapping if needed
4. Check if requester is admin
5. Get phone number from user ID
6. Convert phone number to LID format
7. If LID resolution fails:
   - Notify all admins about the failure
   - Continue processing (don't return early)
8. Send notification to requester:
   - Admin requester: Gets admin-formatted message (with admin info)
   - Regular requester: Gets base message (user-friendly format)

**Edge Cases Handled**:
- ✅ Missing email: Logged at info level, requester path skipped
- ✅ LID resolution failure: Admins notified, processing continues
- ✅ Requester is admin: Gets admin-formatted message, excluded from "all admins" notification to prevent duplicate

### 2. Admin Notification Path

**Conditions**:
- Notification is admin-relevant (`isAdminRelevant === true`)

**Process**:
1. Pre-compute admin message (if admin-relevant)
2. Iterate through all admins in `userIdMappings`
3. For each admin:
   - Convert phone number to LID format
   - Check exclusion (skip if requester is admin)
   - Check if phone number is configured
   - Send admin-formatted message
4. Log success count

**Exclusion Logic**:
- If requester is admin, they're excluded from "all admins" notification
- This prevents duplicate notifications (they already got it as requester)

**Edge Cases Handled**:
- ✅ No admins found: Logged as warning, returns empty array
- ✅ LID resolution failure: Logged as warning, admin skipped
- ✅ Non-configured admin: Logged at info level, admin skipped
- ✅ Send failure: Logged as error, other admins still notified

### 3. Subscriber Notification Path

**Conditions**:
- Notification is `MEDIA_AVAILABLE`
- Media has valid `tmdbId` and `media_type`

**Process**:
1. Check for race condition (duplicate webhook)
2. Get subscribers for standard and 4K quality
3. Exclude requester (if present)
4. For each subscriber:
   - Check if phone number is configured
   - Send notification
   - Remove subscription only after successful send
5. Clean up processing lock

**Race Condition Prevention**:
- Uses in-memory `Set` to track processing media IDs
- Key format: `mediaId:mediaType`
- If already processing, skips duplicate notification
- Lock is always released in `finally` block

**Subscription Cleanup**:
- ✅ Only removes subscription after successful notification send
- ✅ Preserves subscription on send failure (allows retry)
- ✅ Removes subscription for non-configured users (they won't receive notifications)

**Edge Cases Handled**:
- ✅ Duplicate webhook: Detected and skipped
- ✅ Invalid media ID: Early return
- ✅ No subscribers: Early return (lock still cleaned up)
- ✅ Send failure: Subscription preserved
- ✅ Non-configured subscriber: Subscription removed (they can't receive notifications)

## Message Formatting

### Base Message Generation

**Function**: `getBaseNotificationMessage()`

**Process**:
1. Check if `MEDIA_AVAILABLE` notification
   - If yes: Format with available seasons (async, may fetch from API)
   - If no: Use formatter or generic formatter
2. Error handling: Wrapped in try-catch with fallback message

**Fallback Message**:
- If message generation fails, uses simple fallback
- Ensures notifications still go out even if formatting fails
- Error is logged with full context

### Admin Info Appending

**Function**: `appendAdminInfo()`

**Process**:
- Takes base message and appends admin-specific section
- Format: `━━━ Admin Info ━━━`
- Content varies by notification type:
  - **MEDIA_PENDING**: Requested by, Request ID, approval instructions
  - **MEDIA_FAILED**: Requested by, error details
  - **MEDIA_APPROVED**: Requested by, Request ID
  - **MEDIA_DECLINED**: Requested by, Request ID
  - **ISSUE_***: Reported/commented/resolved/reopened by, Issue ID

**Consistency**:
- All use same section title: "Admin Info"
- Consistent ID extraction (handles both `issue_id` and `id` fields)
- Proper null/undefined handling for IDs

## Error Handling

### Error Handling Patterns

**Consistent Pattern**:
```javascript
try {
  // operation
} catch (err) {
  logger?.error('Error message', {
    ...getErrorDetails(err, 'functionName'),
    // additional context
  });
}
```

**All error contexts use function names**:
- `readConfigFile`
- `writeConfigFile`
- `getAvailableSeasons`
- `notifySubscribersAndCleanup`
- `ensureLidFormatForMessaging`
- `sendToAllAdmins`
- `handleSeerrWebhook`

### Error Recovery

**Base Message Generation**:
- ✅ Try-catch with fallback message
- ✅ Ensures notifications still go out

**LID Resolution Failure**:
- ✅ Admins notified about failure
- ✅ Processing continues (doesn't block other notifications)

**Send Failures**:
- ✅ Logged as errors
- ✅ Other recipients still notified
- ✅ Subscriptions preserved on failure (for retry)

## Status Handling

### Status Format Support

**Function**: `isStatusAvailable()`

**Handles Both Formats**:
- Number: `5` (STATUS_AVAILABLE constant)
- String: `'AVAILABLE'` or `'5'` (from webhook)

**Rationale**: Webhooks may send status as string, while API responses use numbers.

**Implementation**:
```javascript
function isStatusAvailable(status) {
  if (typeof status === 'number') {
    return status === STATUS_AVAILABLE;
  }
  if (typeof status === 'string') {
    return status === 'AVAILABLE' || parseInt(status, 10) === STATUS_AVAILABLE;
  }
  return false;
}
```

## Edge Cases and Special Scenarios

### 1. TEST_NOTIFICATION

**Behavior**:
- Email is explicitly set to `null`
- Only admins receive test notifications
- No requester notification path

**Rationale**: Test notifications are for system verification, not user communication.

### 2. Missing Email

**Behavior**:
- Logged at info level
- Requester path skipped
- Admins still notified (if admin-relevant)

**Rationale**: Some notification types may not have email (edge cases).

### 3. Only Admin Scenario

**Behavior**:
- Admin gets notification as requester (with admin info)
- Admin is excluded from "all admins" notification
- No duplicate notification

**Rationale**: Admin already received notification, exclusion prevents duplicate.

### 4. Requester is Admin

**Behavior**:
- Gets admin-formatted message (with admin info)
- Excluded from "all admins" notification
- Other admins still get notified

**Rationale**: Admin requester needs admin info, but shouldn't get duplicate notification.

### 5. LID Resolution Failure

**Behavior**:
- All admins notified about failure
- Processing continues
- Admins and subscribers still get notifications

**Rationale**: Failure to notify requester shouldn't block other notifications.

### 6. Duplicate MEDIA_AVAILABLE Webhooks

**Behavior**:
- Race condition detection via in-memory lock
- Duplicate webhooks skipped
- Lock always released in `finally` block

**Rationale**: Prevents duplicate notifications and subscription cleanup race conditions.

## Code Quality Observations

### Strengths

1. **Defensive Programming**:
   - Handles edge cases (missing email, LID failures, etc.)
   - Graceful degradation (fallback messages)
   - Proper error recovery

2. **Race Condition Prevention**:
   - In-memory locking for MEDIA_AVAILABLE
   - Prevents duplicate processing

3. **Consistent Patterns**:
   - Error handling uses consistent function name pattern
   - Subject extraction uses helper function
   - Status handling supports both formats

4. **Proper Cleanup**:
   - Subscriptions only removed after successful send
   - Processing locks always released
   - Accurate logging of cleanup actions

5. **Multi-Admin Support**:
   - Iterates through all admins
   - Proper exclusion logic
   - Handles single-admin scenario correctly

### Potential Improvements

1. **Error Handling for Admin Message Generation**:
   - Currently, if `appendAdminInfo()` fails, it could throw
   - Consider wrapping in try-catch with fallback

2. **Retry Logic**:
   - No retry mechanism for failed sends
   - Could add exponential backoff for transient failures

3. **Monitoring**:
   - Could add metrics for notification success/failure rates
   - Track LID resolution failure rates

4. **Configuration Validation**:
   - Could validate admin configuration at startup
   - Warn if no admins configured

## Summary

The notification system is well-designed with:

- ✅ **Robust error handling**: Fallbacks, graceful degradation
- ✅ **Race condition prevention**: Locking mechanism for MEDIA_AVAILABLE
- ✅ **Proper cleanup**: Subscriptions only removed after success
- ✅ **Multi-admin support**: Handles multiple admins correctly
- ✅ **Edge case handling**: Missing email, LID failures, etc.
- ✅ **Consistent patterns**: Error handling, logging, formatting

The system handles all notification types correctly and routes them to appropriate recipients while maintaining system robustness and preventing duplicate notifications.

