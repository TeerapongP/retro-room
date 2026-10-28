# Firebase Configuration

## Status

Firebase Project ID: `retro-room-alcyone` (resolved, requirement O1). Web config is in the gitignored `.env`; its project id and auth domain were checked against that id (names and equality only, values not printed). No secrets have been requested or stored.

### Real project checks (2026-10-26, nothing deployed)

| Check | Result |
| --- | --- |
| Firebase CLI login on this machine | STILL NOT LOGGED IN on the second attempt: `firebase login:list` reports no accounts, and the CLI config store holds no token entries (only usage and update-check keys; no values were read). The deployed rules text and the database mode and location could not be read |
| Cloud Firestore `(default)` exists | YES: the Firestore REST API answers for `retro-room-alcyone`, which works for a Native mode database. Location NOT VERIFIED |
| Deployed rules deny unauthenticated reads | **NO. Confirmed by behavior, not by text.** Four unauthenticated read-only GETs: listing `users` returned 200 with documents, listing `boards` and `boards/{id}/cards` returned 200 and empty, a missing `users/probe` returned 404. The local rules would answer 403 to all of them, so the deployed rules are not `firestore.rules` and are open (probably the console's test-mode rules). The rules text was not read |
| Data already in the real database | 1 `users` document (fields `createdAt`, `displayName`, `nameSetAt`, `photoURL`, created 2026-10-26, i.e. the current schema, so the app has already been used once against the real project) and no boards. Values were not read or recorded. It is publicly readable until the rules are deployed |
| `.firebaserc` | MISSING. Every CLI command must pass `--project retro-room-alcyone` until it is created |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | present; `firebase.json` points at both files; indexes declare a collection-group override on `members.uid` |
| Local rules tests | 107 PASSED (`pnpm test:rules`), 32 integration tests PASSED (`pnpm test:integration`), against the emulators with project `demo-retro-room` |

Deploy only after the owner approves (see `docs/08-implementation-progress.md`).

## What the owner must provide or do

1. Decide whether to use an existing Firebase project or approve creating a new one. Claude does not create or select one.
2. In the Firebase console, enable Authentication with the Google provider.
3. Add authorized domains: `localhost` and the production domain once known.
4. Create a Cloud Firestore database (mode and location are an owner decision).
5. Register a Web app and share the web config values with the team through the owner's normal channel.

The web config (`apiKey`, `authDomain`, `projectId`, `appId`, and similar) is not a secret, but it is still owner-supplied. Service Account keys and Admin credentials must never enter this repository or frontend code.

## Environment variables (names only)

Stored in `.env.local`, which is gitignored:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Additional keys are added only if the owner's web config requires them.

## Local development

- Firebase Emulator Suite (Auth and Firestore) for development and Security Rules tests. Approved tool, not yet installed.
- Emulator needs a JDK. Java 25 is present on the dev machine. Compatibility with the emulator is NOT VERIFIED.
- `firebase-tools` and `firebase` are approved dependencies, not yet installed (owner asked to defer installation).

## Dependencies (planned)

| Package | Type | Status |
| --- | --- | --- |
| `firebase` | dependency | installed, 13.1.0 |
| `firebase-tools` | devDependency | installed, 15.34.1 |
| `vitest`, `@firebase/rules-unit-testing` | devDependency | installed, 5.0.5 and 6.0.0 |
| `daisyui` | devDependency | installed, 5.7.50 (UI library, D21) |
| Fonts | `next/font/google`, no package | Press Start 2P, IBM Plex Sans Thai verified present |

Notes: pnpm skipped build scripts for `@firebase/util`, `protobufjs`, `re2` (not approved); the emulator and tests run without them. `vitest` 5 wants `@types/node` 22 or newer while the project has 20 (peer warning, types only, not changed). Firestore emulator ran on Java 25 (emulator v1.22.0).

## Emulator project

Local emulators use the demo project `demo-retro-room` (Auth 9099, Firestore 8080, see `firebase.json`). It is separate from `retro-room-alcyone` and needs no `firebase login`.
