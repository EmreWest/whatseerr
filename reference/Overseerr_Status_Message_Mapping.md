# Requestrr User Messages Based on Overseerr Status

This document lists all user-friendly messages that Requestrr sends to users based on Overseerr API responses and status information.

## Movies

### Movie Available
**Message:** "This movie is already available, enjoy!"

### Movie Can Be Requested
**Message:** "If you want to request this movie please click on the request button directly under this message."

### Movie Already Requested (Notification Not Set Up)
**Message:** "This movie has already been requested, you can click on the notify me button directly under this message to be notified when it becomes available."

### Movie Already Requested (Notification Already Set Up)
**Message:** "This movie has already been requested and you will be notified when it becomes available."

### Movie Request Success
**Message:** "Your request for **[MovieTitle]** was sent successfully!"

### Movie Request Denied
**Message:** "Your request was denied by the provider due to insufficient permissions or quota limits."

### Movie Notification Success
**Message:** "You will now receive a notification as soon as **[MovieTitle]** becomes available to watch."

### Movie Not Found (by name)
**Message:** "I could not find any movie with the name \"[MovieTitle]\", please try something different."

### Movie Not Found (by TMDB ID)
**Message:** "I could not find any movie with TheMovieDbId of \"[MovieTMDB]\", please try something different."

---

## TV Shows - Normal Seasons

### Season Can Be Requested
**Message:** "If you want to request **season [SeasonNumber]** of this tv show please click on the request button directly under this message."

### Season Already Available
**Message:** "**Season [SeasonNumber]** is already available, enjoy!"

### Season Already Requested (Notification Not Set Up)
**Message:** "**Season [SeasonNumber]** has already been requested, you can click on the notify me button directly under this message to be notified when it becomes available."

### Season Already Requested (Notification Already Set Up)
**Message:** "**Season [SeasonNumber]** has already been requested and you will be notified when it becomes available."

### Season Request Success
**Message:** "Your request for the **season [SeasonNumber]** of **[TvShowTitle]** was sent successfully!"

### Season Notification Success
**Message:** "You will now receive a notification as soon as **season [SeasonNumber]** of **[TvShowTitle]** becomes available to watch."

---

## TV Shows - All Seasons

### All Seasons Can Be Requested
**Message:** "If you want to request **all seasons** of this tv show please click on the request button directly under this message."

### All Seasons Request Success
**Message:** "Your request for **all seasons** of **[TvShowTitle]** was sent successfully!"

---

## TV Shows - Future Seasons

### Future Seasons Can Be Requested
**Message:** "If you want to request **future seasons** of this tv show please click on the request button directly under this message."

### Future Seasons Already Requested (Some Future Seasons Requested, Not All)
**Message:** "**Future seasons** have already been requested, you can click on the notify me button directly under this message to be notified when future seasons becomes available."

### Future Seasons Already Requested (All Seasons Requested)
**Message:** "**All seasons** have been already requested, you can click on the notify me button directly under this message to be notified when future seasons becomes available."

### Future Seasons Already Requested (All Seasons Available)
**Message:** "**All seasons** are already available, you can click on the notify me button directly under this message to be notified when future seasons becomes available."

### Future Seasons Already Requested with Notification (Some Future Seasons Requested, Not All)
**Message:** "**Future seasons** have already been requested and you will be notified when they becomes available."

### Future Seasons Already Requested with Notification (All Seasons Requested)
**Message:** "**All seasons** have already been requested and you will be notified when new seasons become available."

### Future Seasons Already Requested with Notification (All Seasons Available)
**Message:** "**All seasons** are available and you will be notified when new seasons become available."

### Future Seasons Request Success
**Message:** "Your request for **future seasons** of **[TvShowTitle]** was sent successfully!"

### Future Seasons Notification Success
**Message:** "You will now receive a notification as soon as any **future seasons** of **[TvShowTitle]** becomes available to watch."

---

## TV Shows - Series Level Messages

### Show Has Ended (All Seasons Available)
**Message:** "This show has ended, and **all seasons** are available."

### Show Has Ended (All Seasons Requested, Not All Available)
**Message:** "This show has ended, and **all seasons** have been requested."

### Show Cannot Be Requested
**Message:** "This show cannot be automatically requested, please ask the server owner to manually add it."

---

## TV Shows - Request Denied

### Season Request Denied
**Message:** "Your request was denied by the provider due to an insufficient quota limit or insufficient roles."

---

## TV Shows - Not Found

### TV Show Not Found (by name)
**Message:** "I could not find any tv show with the name \"[TvShowTitle]\", please try something different."

### TV Show Not Found (by TVDB ID)
**Message:** "I could not find any tv show with the TvDbId of \"[TvShowTVDBID]\", please try something different."

---

## Notifications

### Movie Notification (Channel)
**Message:** "The movie **[MovieTitle]** has finished downloading!"

### Movie Notification (Direct Message)
**Message:** "The movie **[MovieTitle]** you requested has finished downloading!"

### TV Show Season Notification (Channel - Full Season)
**Message:** "The **season [SeasonNumber]** of **[TvShowTitle]** has finished downloading!"

### TV Show Season Notification (Channel - First Episode)
**Message:** "The first episode of **season [SeasonNumber]** of **[TvShowTitle]** has finished downloading!"

### TV Show Season Notification (Direct Message - Full Season)
**Message:** "The **season [SeasonNumber]** of **[TvShowTitle]** that you requested has finished downloading!"

### TV Show Season Notification (Direct Message - First Episode)
**Message:** "The first episode of **season [SeasonNumber]** of **[TvShowTitle]** that you requested has finished downloading!"

---

## Error Messages

### Generic Error
**Message:** "An unexpected error occurred while trying to process your request."

---

## Button Labels

- **"Request"** - Button to submit a request
- **"Requested"** - Button showing item is already requested (disabled)
- **"Available"** - Button showing item is available (disabled)
- **"Notify me"** - Button to set up notifications
- **"You will now be notified"** - Button showing notification was set up (disabled)
- **"Request sent successfully"** - Button showing request succeeded (disabled)
- **"Request denied"** - Button showing request was denied (disabled)
