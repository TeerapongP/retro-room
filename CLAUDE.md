# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This is NOT the Next.js you know

This project uses Next.js **16.4.3** — a version with breaking changes from older releases. Read `node_modules/next/dist/docs/` before writing any framework code. Key constraints:
- `cacheComponents: true` and `partialPrefetching: true` are enabled in `next.config.ts`.
- Dynamic route params must be read below a `<Suspense>` boundary or via `useParams()` in a Client Component.
- Firebase Auth is client-only — no server session, no `cookies()`.
- Firebase initialization and listeners run only in Client Components, started inside `useEffect` with the unsubscribe returned.

## Commands

```bash
pnpm dev              # Mock mode (no Firebase needed) — NEXT_PUBLIC_MOCK_MODE=true
pnpm dev:firebase     # Real Firebase credentials (requires .env.local)
pnpm dev:emulator     # Auth + Firestore emulators + next dev
pnpm build            # Production build
pnpm lint             # ESLint
pnpm exec tsc --noEmit  # Type check
```

**Tests** (require Firebase emulators):
```bash
pnpm test:assets      # Sprite sheet size checks (no emulator)
pnpm test:rules       # Firestore Security Rules (Firestore emulator only)
pnpm test:integration # Auth + Firestore emulator, Users A/B/C
```

## Architecture

**Frontend-only Next.js app.** There is no custom backend, API routes, Route Handlers, or Server Actions. All data lives in Firebase Auth + Cloud Firestore, accessed from the browser SDK.

### Routes

| Route | Purpose |
|---|---|
| `/` | Redirect: signed in → `/dashboard`, else → `/login` |
| `/login` | Google Sign-In |
| `/setup` | Player name setup (shown once, when no name exists) |
| `/dashboard` | Boards the user belongs to; create board |
| `/boards/[boardId]` | Join confirmation (non-member) or live board (member) |

### Data layer (`lib/firebase/`)

- `client.ts` — Firebase SDK init
- `auth.tsx` — `onAuthStateChanged` state management
- `boards.ts`, `cards.ts`, `votes.ts`, `ratings.ts`, `farm.ts`, `profile.ts` — Firestore queries and writes

**Mock mode** (`lib/mock/`): `pnpm dev` starts with `NEXT_PUBLIC_MOCK_MODE=true`, which substitutes in-memory implementations for all Firebase calls. Safe: mock mode is blocked in production builds and on non-localhost hosts.

### Firestore collections

```
users/{uid}                        player profile (displayName, photoURL)
boards/{boardId}                   board metadata + phase + timer fields
boards/{boardId}/members/{uid}     role (owner | member), displayName snapshot
boards/{boardId}/cards/{cardId}    text, columnId, hidden, groupId
boards/{boardId}/voters/{uid}      cardIds voted for (max 3)
boards/{boardId}/ratings/{uid}     score 1–5
boards/{boardId}/cardMoves/{cardId} ledger of moved-out cards
```

Columns are fixed client-side: `went-well`, `to-improve`, `ideas` (see `lib/firebase/types.ts`).

### Session phases (`lib/phases.ts`)

Six-step retrospective flow (Thai labels). The `phase` field on the board document (1–6, absent = 1) drives `PhaseStepper`. Only the board owner (admin) advances phases.

### Key components

- `BackgroundMusic.tsx` — mounted once in `app/layout.tsx`; owns app-wide music
- `PhaseStepper.tsx` — phase navigation bar
- `BoardColumn.tsx` / `CardStack.tsx` / `StickyNote.tsx` — card display
- `HostWheel.tsx` / `CrowdedFarm.tsx` — step 5 next-host selection game
- `TimerDialog.tsx` / `BoardTimer.tsx` — shared countdown timer
- `RatingPanel.tsx` — step 4 self-rating

## Code conventions

- TypeScript strict. Types must mirror the confirmed Firestore model in `docs/04-firestore-data-model.md`.
- Handle loading, not-found, permission-denied, and listener errors in every screen that reads Firestore.
- Client route guards are UX only. Firestore Security Rules are the authority.
- `NEXT_PUBLIC_*` env vars hold web config only — no secrets in frontend code.
- UI uses Tailwind v4 (via `@tailwindcss/turbopack`) + daisyUI v5. Do not use daisyUI's default themes.

## Documentation

`docs/` is the source of truth for requirements, architecture, data model, and UI design. Before adding features, folders, packages, or behavior, verify it traces to a requirement ID in `docs/01-project-requirements.md`. Do not silently resolve ambiguities — raise them.
