# Development Guidelines

## Documentation first

`docs/` is the source of truth. Never invent requirements, folders, dependencies, or behavior. When something is missing or ambiguous, ask the owner. Do not silently resolve conflicts. Do not overwrite approved requirements without explicit permission. Every new directory, significant file, package, or permission change must trace to a requirement ID in `01-project-requirements.md` or an owner approval.

## Next.js 16

This is not the Next.js of older releases. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`). `cacheComponents` and `partialPrefetching` are enabled in `next.config.ts`.

## Code

- TypeScript strict. Types mirror the confirmed Firestore model in `04-firestore-data-model.md`.
- Firebase code runs in Client Components. Start listeners in `useEffect`, return the unsubscribe function, avoid duplicate subscriptions.
- Handle loading, not found, permission denied, and listener errors in every screen that reads Firestore.
- Descriptive names (`boardCards`, `boardMembership`, `firebaseAuthState`).
- Keep unrelated code untouched. No speculative abstractions or folders.
- Never put Service Account keys or server secrets in frontend code. `NEXT_PUBLIC_*` holds web config only.
- Client route guards are UX. Security Rules enforce access.

## Commands (from `package.json`)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | Type check |

No test script exists yet. A rules test script is added when test tooling is installed.

## Verification before reporting done

Report each check as PASSED, FAILED, NOT RUN, or BLOCKED. Never mark a check passed unless it ran.

- Type check, lint, build.
- Security Rules allowed and denied tests in the Emulator.
- Google sign-in and sign-out, with authorized domains configured.
- Create board, share URL, join, and two-user real-time sync in two browsers.
- Responsive layout, keyboard use, reduced motion, readable Thai.

## Git

Preserve uncommitted changes. Do not commit or push without owner approval. `.vscode/` is untracked and not ours to change.

## UI library

Use daisyUI classes for new UI once Phase B is approved; for now only `/setup` (D21). Do not use daisyUI's default themes. Tailwind is wired through `@tailwindcss/turbopack` in `next.config.ts`; the daisyUI plugin was verified to work through it.

## Local testing with Firebase Emulators (no Google account needed)

Owner approved. Local only. Production Google Sign-In code is unchanged: the same `signInWithGoogle()` runs, and in emulator mode the SDK talks to the Auth and Firestore emulators instead of Firebase.

| Command | Purpose |
| --- | --- |
| `pnpm test:rules` | Security Rules tests (Firestore emulator) |
| `pnpm test:integration` | Users A, B, C through the Auth emulator against the app's data layer |
| `pnpm test:assets` | Sprite sheet PNG sizes against `public/art/anim/sheets.json` (no emulator needed) |
| `pnpm dev:emulator` | Starts Auth (9099) and Firestore (8080) emulators and `next dev` with emulator mode |

Safety rules for emulator mode:

- Enabled only by `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, which the `dev:emulator` script sets. It is never put in `.env`.
- Uses project `demo-retro-room` and fake keys. `NEXT_PUBLIC_FIREBASE_*` values are not read, so no production Firebase can be reached.
- Throws in a production build (`NODE_ENV=production`) and when the page host is not `localhost` or `127.0.0.1`. Covered by `tests/integration/emulator-guard.test.ts`.
- A banner "EMULATOR MODE" shows on every page while active.
- No mock authentication exists in the code. The emulator provides the fake Google identity provider.

### Manual two-user checklist (UI)

1. Run `pnpm dev:emulator`, open `http://localhost:3000` in a normal window and in a private window (separate storage).
2. In each window click the Google sign-in button, then "Add new account" in the emulator page and create User A and User B.
3. User A: create a board, copy the share link.
4. User B: open the link, confirm the join dialogue, join.
5. Both: add, edit, delete cards. The other window must update without reload.
6. User B cannot edit or delete A's card. A (owner) can delete B's card.
7. Check narrow width, keyboard navigation, Thai text readability.

The emulator data is wiped when the command stops. Results prove app logic and Rules, not real Google sign-in.
