# Mobile devices (React Native) and push-ready registrations

## Product intent

- Each signed-in user may register **one or many** physical installs (iOS / Android).
- Rows live in `user_devices` (`install_key` identifies an install in secure storage; optional `push_token` reserved for FCM/APNs later).
- **Settings → Devices** lists active installs and lets the user **revoke** one. Revocation deletes refresh-token rows tied to that device and sets `revoked_at`. That install **cannot refresh or obtain new tokens** until the user signs in again (after which registration may clear `revoked_at` on reconnect).

## Design decision (parked implementation detail)

**The React Native client should call registration immediately after a successful login**, once it holds at least an access token (and typically the opaque refresh token from the same response):

1. `POST /account/devices/register` with `Authorization: Bearer …` and body `{ installKey, platform, … }`.
2. Optionally include `refreshToken` in the same request so the API **replaces** the session’s refresh row with one bound to `user_devices.id`. That binds rotation (`POST /auth/refresh`) and revocation to this install.

Full RN wiring (secure storage for `install_key`, FCM token updates, error handling) is **intentionally deferred** until mobile app development starts; the API and web Settings UI are ready first.

## API summary

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/account/devices` | List active (non-revoked) devices for the current user. |
| `DELETE` | `/account/devices/:deviceId` | Revoke device + invalidate its refresh sessions. |
| `POST` | `/account/devices/register` | Upsert device metadata; optional `refreshToken` binds session. |

## Access tokens vs revocation

Revocation removes **refresh** tokens for that user/device pair immediately. Any **access** JWT already issued remains valid until its short expiry (~15 minutes); that tradeoff matches typical bearer-token semantics unless you add a server-side denylist.
