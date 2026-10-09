# AO Vendor Manager

Offline-first mobile app for AbosseyOkai spare-parts vendors in Ghana. Vendors receive part requests, send prices, track paid orders through pickup, and manage their stock (tyres, lights, generic parts).

Expo SDK 57 · React Native 0.86 · TypeScript · Zustand · React Navigation 6 · expo-sqlite.

## Run it

```bash
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npm start                   # Expo dev server
npm run android             # or: npm run ios
npm run check               # typecheck + unit tests
```

Production builds go through EAS (`eas.json`). Push notifications need a real device build; Expo Go has no push token.

## How it's put together

```
App.tsx                 splash → auth hydrate → sync loop → navigation
src/navigation/         declarative auth gate (RootNavigator) + tabs
src/screens/            one file per screen, no data fetching timers
components/             shared UI (forms, pickers, photo grid, cards)
hooks/                  useSyncedQuery, usePhotoUpload, vehicle taxonomy
store/                  auth-store (session), sync-store (scheduler + status)
lib/db.ts               SQLite schema, versioned migrations, queries
lib/sync.ts             push queues → pull server → prune
lib/api.ts              fetch client; every failure is an ApiError
lib/*.ts (pure)         assignment-status, mappers, api-error, part-tiles, phone
__tests__/              Jest (jest-expo) unit tests for the pure modules
```

### Data flow

1. **Reads come from SQLite.** Every list screen calls `useSyncedQuery(load)`, which re-runs `load` on focus and whenever a sync pass finishes. Screens never poll.
2. **Writes are queued.** Quotes, declines, order stages, tyre and light listings write a local row first (instant UI) and enqueue the server op. Photos taken offline are stored as `file://` URIs and uploaded by the queue flusher.
3. **One scheduler.** `startSyncLoop()` in `store/sync-store.ts` runs a pass on launch, every 30 s while foregrounded, on return to foreground, and when connectivity returns. A pass pushes every queue first, then pulls assignments, orders, listings and the tyre catalog in parallel, then prunes rows the server no longer returns.
4. **Conflict rules.** While a quote or decline is still queued, the local optimistic status wins over the server's stale `PENDING`. A `404`/`409`/`400` on push marks the item failed and re-fetches the server truth; a network error leaves it for the next pass.

### Auth

Phone + SMS OTP → 30-day vendor JWT in `expo-secure-store`. `RootNavigator` renders Login / profile-gate / onboarding / main purely from `auth-store` state, so sign-in, onboarding completion, logout and a `401` from any request all land on the right screen without `navigation.reset`. Logout waits for any in-flight sync, then wipes the database.

### Status model

The server keeps assignment status (`PENDING | QUOTED | DECLINED | EXPIRED`) and quote status (`PENDING | SELECTED | REJECTED`) separately. `lib/assignment-status.ts` folds them into one vendor-facing status (`New / Quoted / Won / Not picked / Declined / Expired`) used by every badge and inbox segment.

### Generic parts

`/vendor/products` has no offline queue on the API, so the "My Parts" screen is online-first with a SQLite read cache. Tyres and lights are fully offline-first.

## Contract with the API

The app is a client of `AbosseyOkai/apps/api`. Endpoints used: `/vendor-auth/*`, `/vendor/requests*`, `/vendor/orders*`, `/vendor/products*`, `/vendor/tyre-listings*`, `/vendor/light-listings*`, `/vendor/upload`, `/vendor/specialty-requests`, `/vehicles/*`, `/tyres/catalog`. Changing payloads there means updating `lib/api.ts` and `lib/mappers.ts` here.

## Adding a SQLite column

Append a new entry to `MIGRATIONS` in `lib/db.ts`. Never edit a shipped step; `PRAGMA user_version` tracks what each install has applied.

## Licences

Fonts: Sora, SIL Open Font License 1.1 (see `assets/fonts/OFL.txt`).
