# StudentTrackerSystem Professional — Stabilization

This package is based on the uploaded project and preserves the existing application structure.

## Main fixes

- Added complete localized messages for disabled/unavailable institutions and cross-tenant student access.
- Enforced active-tenant checks in the attendance service, so REST, QR, Socket.IO and bulk status changes share the same tenant protection.
- Fixed bulk Socket.IO status updates to use the acting tenant room instead of an undefined `result.student`.
- Student status changes now update the current UI state immediately without requiring a page reload.
- Socket status events update the local student state in real time; bulk events refresh the list once.
- Removed the legacy `/api/subscribe` Push endpoint usage and kept only `/api/subscriptions/subscribe`.
- Prevented duplicate Push registration requests in the same browser session and updated the notification UI immediately.
- Removed the automatic notification permission request on initial page load.
- Removed the duplicate translation implementation inside `app.js`.
- Added generic institution fallbacks so one institution's display data cannot appear as another institution's fallback.
- Prevented repeated Login/Register clicks while a request is in progress.
- Added `backend/.env.example` so the existing smoke test passes.

## Validation

- Node syntax checks passed for the modified backend/frontend JavaScript files.
- JSON parsing checks passed for AR/FR/EN locale files.
- Existing backend smoke test passed.
