# Student Tracker System — Stabilization & Algeria Time Update

## Scope
This update preserves UTC instants in MongoDB and standardizes all user-facing calendar/time calculations to Algeria (`Africa/Algiers`, UTC+01:00).

## Fixed
- Removed manual `+1 hour` corrections from the frontend.
- Student last-update timestamps now use explicit Algeria timezone formatting.
- Admin and parent activity logs now use the same Algeria timezone.
- Parent attendance history now uses the same formatter without double-shifting.
- `isToday()` now evaluates "today" in Algeria time.
- Super Admin timestamps use `Africa/Algiers`.
- Super Admin `datetime-local` registration-code expiry is interpreted as Algeria local time before converting to UTC.
- Notification scheduler now evaluates school end time using Algeria local minutes.
- Notification daily idempotency keys use the Algeria calendar date.
- Smart-alert day/week/month calculations use Algeria calendar boundaries.
- Smart-alert tardiness calculations use Algeria local time.
- Leave/attendance day queries use explicit Algeria day boundaries.
- Super Admin "today" attendance statistics use Algeria day boundaries.
- Server process timezone is explicitly initialized to `Africa/Algiers` for legacy local-date code.
- Added a central backend Algeria-time utility to avoid duplicated timezone logic.
- Super Admin untranslated static/dynamic labels were localized across AR/FR/EN.
- Super Admin RTL/LTR direction continues to follow the selected language.
- Existing tenant-disabled, cross-tenant student protection, realtime status update, notification translation, and Push subscription logic were preserved.

## Important
MongoDB timestamps remain UTC instants. They are not artificially shifted by +1 hour. The +1 hour is applied only by timezone-aware display/calendar conversion, preventing double-shifts.
