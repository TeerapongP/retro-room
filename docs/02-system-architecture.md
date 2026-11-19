# System Architecture

Derived from `01-project-requirements.md` and the Next.js 16.4.3 docs in `node_modules/next/dist/docs`. Status of each item is PROPOSED until the owner marks it approved; the Phase 1 plan was approved with default answers.

## Shape

Next.js app. Firebase Authentication and Cloud Firestore client SDK handle board collaboration. Wheel of Chaos actions go through `/api/chaos-action`; the Route Handler verifies a Firebase ID token and uses Firebase Admin for trusted mutations. No Firebase Cloud Functions service is deployed.

## Next.js 16 constraints (verified in installed docs)

- `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`.
- Dynamic route params not supplied by `generateStaticParams` are runtime data. Read them below a `<Suspense>` boundary or in a Client Component through `useParams()`.
- Firebase Auth is client-side with no server session. The Wheel of Chaos Route Handler verifies the client's Firebase ID token before using Firebase Admin.
- Firebase initialization and listeners run only in Client Components, started inside `useEffect`, and cleaned up on unmount.
- Route guards in the client are UX only. Security Rules are the authority.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirect to `/dashboard` when signed in, otherwise `/login` |
| `/login` | Google Sign-In |
| `/setup` | Player name setup, shown once when the signed-in user has no player name (F9) |
| `/dashboard` | Boards the user belongs to, create board |
| `/boards/[boardId]` | Join confirmation (non-member) or live board (member) |

## Data flow

1. Auth state: `onAuthStateChanged` drives loading, signed-in, and signed-out states.
2. Dashboard: collection-group query on `members` where `uid == auth.uid`, then read each Board document.
3. Create Board: one atomic batch writes `boards/{id}` and `boards/{id}/members/{uid}` with role `owner`.
4. Join: user confirms, client writes `members/{uid}` with role `member`.
5. Board: `onSnapshot` on `boards/{id}`, `members`, and `cards`. Unsubscribe on unmount. Handle loading, not found, permission denied, and listener errors.

## Proposed file layout (approved in principle, created only when needed)

```
docs/                       source-of-truth documents
app/                        routes listed above, layout, globals.css
components/                 only components used by approved screens (BackgroundMusic.tsx is mounted once in app/layout.tsx and owns the app-wide music, F14)
lib/firebase/               SDK init, auth state, queries actually used
firestore.rules             Security Rules
firestore.indexes.json      indexes
firebase.json               emulator config
app/api/chaos-action/       trusted Wheel of Chaos mutations
lib/firebase/server-admin.ts server-only Firebase Admin setup
lib/chaos/server-action.ts  validated Wheel of Chaos actions
tests/rules/                Security Rules tests
```

`.firebaserc` and `.env.local` are blocked until the Project ID exists (O1). No other directories are introduced without approval.

## Out of scope

Firebase Cloud Functions deployment, additional custom backend endpoints, and Phase 2 features.
