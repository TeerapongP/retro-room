# Implementation Progress

Last updated: 2026-10-26.

## Phase status

| Phase | Status |
| --- | --- |
| Phase 1 discovery | done |
| Phase 1 proposal | approved by owner with default answers |
| Phase 1 implementation | code written, not yet exercised with real Google sign-in |
| Phase 2 features | not approved |

## Work items

| ID | Name | Status |
| --- | --- | --- |
| F1 | Google Authentication | implemented, real sign-in not run |
| F2 | Dashboard | implemented |
| F3 | Create Board | implemented |
| F4 | Shared Board URL | implemented |
| F5 | Join Board | implemented |
| F6 | Real-time sticky notes | implemented |
| F7 | Harvest Moon-inspired UI | implemented |
| F8 | Session start flow (Title / Waiting Room, Owner presses START) | implemented |
| F9 | Player name setup | implemented, later redesigned by F13 |
| F10 | Login startup sound | implemented |
| F11 | Login / Title Screen redesign | implemented |
| F12 | Login frame-by-frame animation (flowers, farmer, dog, chicken) | implemented, all three phases |
| F13 | Player Name Setup redesign (farm scene and on-screen keyboard) | implemented |
| Rules | Firestore Security Rules and emulator tests | implemented, not deployed |
| Local tests | Firebase Emulator testing (`pnpm test:rules`, `pnpm test:integration`, `pnpm dev:emulator`) | implemented |
| UI library | daisyUI (D21, D37) with the `harvest` theme and `components/ui/` | implemented for Login and Setup; Dashboard and Board not migrated |
| Assets | Art pipeline: layers and sprite sheets extracted or derived from AI generated sources, documented in `docs/references/` | implemented |

## Summary of F11 (Login / Title Screen redesign)

- **Goal:** replace the flat login page with the approved reference scene (`docs/references/retro-room-reference.png`, generated with OpenAI's image generation tool for this project) while keeping the existing Google sign-in flow.
- **What shipped:** a layered scene (grass plate, logo sign with "Team Retro", chicken, farmer, dog, seven flower groups, official Google G, credit `© Bee from Alcyone Team`) in `components/LoginScene.tsx`; a real `<button>` (`RetroButton`, daisyUI `btn btn-wood`) wired to `signInWithGoogle`; Thai error alert (`RetroAlert`) and `RetroLoader`; layout that matches the reference at desktop and stacks on phones (stage keeps the 1448:1086 ratio). Reusable components live in `components/ui/`.
- **Art:** layers cut from the reference by `docs/references/extract-login-assets.py` into `public/art/`; the reference moved out of `public/` into `docs/references/`.
- **Decisions:** D31 to D39 in doc 01 (provenance, folders, official G, fonts unchanged, English text, daisyUI extension to Login, mobile layout).
- **Verified:** `tsc`, `lint`, `build`, `test:rules` (107), `test:integration` (31); screenshots at 375, 768 and 1280 compared with the reference by eye; keyboard focus ring checked.
- **Known differences and limits:** button and credit fonts differ from the reference (approved fonts only); shadows are CSS ellipses; the grass is a collage made from reference patches; no pixel-diff tool; Google sign-in from the new button not run.

## Summary of F12 (Login frame-by-frame animation)

- **Goal:** move beyond the 2 px bob with real frame-by-frame animation, in phases, with every frame documented as AI generated or derived from AI generated art.
- **Phase 1, flowers and farmer:** flowers (derived) via `docs/references/build-derived-sheets.py`: rows shear sideways (2.5 fps, 4 frames, offset per group). The farmer first used derived frames (chest lifted 0, 1, 2, 1 px) and now uses the owner's OpenAI sheet (D59, below). The farmer sleeps, so there is no blinking (D43).
- **Phase 2, dog (derived):** the tail rotates 0, +14, 0, -14 degrees around its base at 8 fps; accepted by the owner (D54). Known roughness: slightly frayed tail edge at -14 degrees.
- **Phase 3, chicken (owner generated):** the owner generated a 12 frame sheet with OpenAI's image tool from the brief in `docs/references/animation/chicken-sprite-sheet-brief.md`. `docs/references/extract-sprite-sheets.py` keys out the magenta, cuts the cells, scales by one factor, aligns, and writes `chicken-walk.png` (frames 3, 4, 5, 6) and `chicken-peck.png` (frames 1, 7, 8, 9, 10) as 64 color PNGs. A 10 s CSS loop walks left 56 reference px, pecks, walks back and pecks; phones only peck in place; reduced motion shows the idle pose (D55 to D57). Frames 2, 11 and 12 are unused.
- **Farmer from the owner's sheet (D59):** `extract-sprite-sheets.py farmer` cuts, scales and aligns the generated cells and keeps only the changed chest area from the generated frames (the rest of each frame is the rest frame, because the redrawn frames shimmered). 4 frames at 2 fps, 15 KB. The light-stir row is cut but not shipped (D43).
- **Shared parts:** `components/SpriteAnimation.tsx` (CSS `steps()` strips, no library), `public/art/anim/` with `sheets.json` and `sheets-chicken.json`, `tests/assets/sprite-sheets.test.ts` (`pnpm test:assets`, 29 tests). Animation files total about 500 KB of the 600 KB budget. Decisions D40 to D45 and D54 to D57 in doc 01.
- **Verified:** `tsc`, `lint`, `build`, `test:assets`, `test:rules`, `test:integration`; in the in-app browser every sprite cycled through its frames, the chicken timeline was sampled at 9 times and matched the design, and the phone layout turned the patrol off.
- **Not verified:** reduced motion in a real browser (only the CSS was read), frame rate and smoothness, how natural the motion looks over time, similarity review against Harvest Moon (owner's), and the provenance table in the chicken brief is still blank until the owner fills it in.
- **Not built:** the idle breathing and turn frames of the chicken, farmer blinking, any sound, and any other animation.

## Traceability

| Requirement | Docs | Code | Status |
| --- | --- | --- | --- |
| F1 Google Auth | 02, 03 | `lib/firebase/auth.tsx`, `app/login` | IMPLEMENTED, sign-in NOT RUN (owner must log in) |
| F2 Dashboard | 02, 04 | `app/dashboard` | IMPLEMENTED, NOT RUN against Firestore |
| F3 Create Board | 02, 04, 05 | `lib/firebase/boards.ts` | IMPLEMENTED, NOT RUN against Firestore |
| F4 Shared URL | 02 | `app/boards/[boardId]` | IMPLEMENTED, NOT RUN |
| F5 Join Board | 02, 05 | `app/boards/[boardId]` | IMPLEMENTED, NOT RUN |
| F6 Real-time cards | 02, 04, 05 | `lib/firebase/cards.ts`, board page | IMPLEMENTED, two-user sync NOT RUN |
| F7 Harvest Moon UI | 06 | `app/globals.css`, `components/`, layout | IMPLEMENTED, login page viewed only |
| F8 Session start flow | 01, 04, 05, 06 | `components/TitleScreen.tsx`, `PixelScenery.tsx`, `lib/firebase/boards.ts`, board page | IMPLEMENTED, rules and integration tests PASSED, UI NOT viewed with signed-in users |
| F9 Player name setup | 01, 04, 05, 06 | `app/setup`, `components/PlayerNameForm.tsx`, `lib/firebase/profile.ts`, `lib/firebase/auth.tsx`, daisyUI theme in `globals.css` | IMPLEMENTED, rules and integration tests PASSED, `/setup` NOT viewed signed in |
| F11 Login / Title Screen redesign | 01 (D31 to D39), 06 | `components/LoginScene.tsx`, `components/ui/*`, `public/art/*`, `app/login/page.tsx`, `app/globals.css`, `docs/references/*` | IMPLEMENTED, screenshots at 375, 768 and 1280 compared with the reference; Google sign-in NOT RUN |
| F12 Login animation | 01 (D40 to D45, D54 to D57, D59), 06 | `components/SpriteAnimation.tsx`, `public/art/anim/*`, `tests/assets/*`, `docs/references/build-derived-sheets.py` | Phase 1 (flowers, farmer), phase 2 (dog tail wag, derived) and phase 3 (chicken walk and peck from the owner's OpenAI sheet) IMPLEMENTED |
| F14 Global background music, F15 Retro loading screen | 01 (D60 to D65), 02, 06 | `components/BackgroundMusic.tsx`, `components/LoadingNotice.tsx`, `lib/firebase/auth.tsx`, `app/layout.tsx`, `app/globals.css`, `public/art/loading/`, `docs/references/extract-loading-assets.py`; tests `tests/components/background-music.test.ts`, `tests/assets/loading-sheets.test.ts` | IMPLEMENTED incl. Zzz and farmer breathing, tsc, lint, build, unit, integration, rules PASSED, browser checks in Done |
| F10 Login startup sound (superseded by F14) | 01 (D28 to D30), 06 | `components/LoginScene.tsx` | IMPLEMENTED, tsc and lint PASSED, browser checks in Done; Safari NOT RUN |
| F13 Player Name Setup redesign | 01 (D46 to D53), 06 | `app/setup/page.tsx`, `components/PlayerNameForm.tsx`, `components/ui/RetroKeyboard.tsx`, `app/globals.css`, `public/art/setup/`, `docs/references/extract-setup-assets.py`, `build-setup-sheets.py`; tests `tests/components/retro-keyboard-layout.test.ts`, `tests/assets/setup-sprite-sheets.test.ts` | IMPLEMENTED, tsc, lint, build, unit and emulator tests PASSED, browser checks in Done |
| Security Rules | 05 | `firestore.rules`, `tests/rules/` | IMPLEMENTED, 107 tests PASSED, not production ready |

## Done

- Docs 01 to 08 created in `docs/`.
- Dependencies installed: `firebase`, `firebase-tools`, `vitest`, `@firebase/rules-unit-testing`.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `tests/rules/firestore.rules.test.ts`, script `pnpm test:rules`.
- Rules tests: 66 PASSED against the Firestore emulator. `tsc --noEmit`, `pnpm lint` and `pnpm build` PASSED.
- App code: `lib/firebase/`, `components/`, `app/` pages, theme and fonts.
- Login page rendered in a browser with no console errors.
- Local emulator testing: `lib/firebase/*` take an optional Firestore parameter, `client.ts` has guarded emulator mode, `EmulatorBanner`, `vitest.config.mts`, `tests/integration/` (31 tests PASSED), `pnpm test:rules` (66 PASSED), `pnpm dev:emulator`.
- Emulator mode in the browser: banner shows and the sign-in button opens the Auth emulator's fake Google page. Completing sign-in and the two-user UI checklist (docs 07) are NOT RUN.
- F10 startup sound verified in the in-app Chromium browser against `next dev`: asset served 200 and byte-identical to `public/sound/menu-sound.mp3`; autoplay allowed gave one `play()` that resolved (Strict Mode's first attempt was aborted by cleanup, so no overlap); with `play()` forced to reject, Escape did nothing, the first click played once, later clicks and keys did not replay. Unmount cleanup observed only through Strict Mode's simulated unmount.

- F11: art layers extracted from the approved reference (AI generated with OpenAI's image generation tool). Checks run: `tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test:rules` (107 PASSED), `pnpm test:integration` (31 PASSED). Browser screenshots taken at 375, 768 and 1280; keyboard focus ring checked.

- F12 phase 1: flowers sway and farmer breathing. Checks run: `tsc`, `lint`, `build`, `test:assets` (17), `test:rules` (107), `test:integration` (31). In the in-app browser at 1280px every one of the 8 sprites cycled through its 4 distinct frames with desynced offsets; layout unchanged at 375, 768 and 1280.
- F13 verified in the in-app Chromium against `pnpm dev:emulator` with a seeded Auth emulator user (not a real Google sign-in): 1280x853, 1024x768 and 768x1024 and 375x812 screenshots taken; virtual keys append (Hi Z!), Mark toggles the symbols grid, Space works, 20 characters stops with the Thai message, physical typing of "สมชาย Tom" works, a blank Enter shows the Thai error and saves nothing, Tab plus arrow keys move focus (A to C to H), Enter on a key presses it, hover moves the hand, and clicking OK saved `users/{uid}.displayName` in the Firestore emulator and redirected to `/dashboard`. `tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test:integration` (31), `pnpm test:rules` (107) and `vitest run tests/components tests/assets` (36) PASSED. A keyboard layout test caught a Mark and `]` overlap on the symbols page, now fixed.

- F13 fullscreen layout (D58): `/setup` now covers the viewport. Verified in the in-app browser against `pnpm dev:emulator` with a forged emulator session (an Auth emulator user written into the page's IndexedDB, not a real Google sign-in), emulator banner removed for the measurements because it only exists in emulator mode and adds 40 px: 1280x720, 1920x1080 and 2560x1080 and 1024x768 (stage layout) had no horizontal or vertical scroll, no clipped panels, no panel overlaps and no panel and sprite overlaps; 768x1024 and 375x812 use the stacked layout and had no horizontal scroll and no overlaps. 2560x1080 has 308 px bands filled by the matching grass fill with soft edges and 1024x768 has 29 px bands top and bottom. Only the pink flowers at the bottom edge are partly cropped on the stage layout (decorative). Virtual keys typed "Hi", OK saved `users/{uid}` (`displayName` Hi, `nameSetAt` set) in the Firestore emulator and redirected to `/dashboard`; a blank OK showed the Thai error. `tsc`, `lint`, `build`, `vitest run tests/components tests/assets` (41), `test:rules` (107) and `test:integration` (32) PASSED.

- F13 PS1 keyboard navigation: `RetroKeyboard` gained `onBackspace`/`onExit`, Space and Backspace and Escape handling, Enter repeat guard, scroll-into-view, stepped hand and no generic outline when the hand shows; `PlayerNameForm` wires them; `lib/remove-last-character.ts` and its test added. Checks: `tsc --noEmit` PASSED, `pnpm lint` PASSED, `vitest run tests/components tests/assets` (41) PASSED. Verified in the in-app Chromium on a temporary route (since deleted) with a fake submit handler, NOT the Auth/Firestore emulator (port 8080 was taken): arrows (A to B to C, down to H), Enter, Space, Backspace x2, Escape to input, Thai and English typing and ArrowLeft caret in the input, Mark toggled to 27 keys and back, Enter on OK submitted once, mouse click appended, 375px Tab plus ArrowDown moved A to Y with no scroll.
- Loading and error states (D54 to D57): `lib/firebase/auth.tsx`, `components/LoadingNotice.tsx`, callers `app/setup`, `app/dashboard`, `app/boards/[boardId]`; integration test added (`getPlayerName` rejects with `permission-denied`). Verified in an isolated copy of the app on other emulator ports (9199 and 8180) so the live emulators were not touched: signed-in user with the emulator running showed the name form; signed-out `/setup` went to `/login`; emulator stopped showed the Thai error with Retry (not the form); Retry while still down restarted the read and failed again; after the emulator came back Retry showed the form; a backend that accepts connections and never answers showed the slow notice at about 15 seconds, and the notice later became the error when the requests ended; a Rules change that denied reads showed the permission-denied message and Retry recovered after the Rules were restored; saving a name still went to the dashboard and creating a board still opened it. `tsc`, `lint`, `build`, `test:integration` (32), `test:rules` (107) and `vitest run tests/components tests/assets` (41) PASSED.

- F12 farmer (D59): sheet delivered and implemented. `tsc`, `lint`, `build`, `vitest run tests/components tests/assets` (50), `test:rules` (107) and `test:integration` (32) PASSED. In the in-app browser at 1280 px the farmer cycled through its 4 frames and kept its place; the rest of the login page was unchanged. A pixel comparison showed the raw generated frames differed from the rest frame outside the chest too (head, cap, boots), so the shipped strip only takes the chest area from them.
- F14 and F15 verified in the in-app Chromium against an isolated copy of the app and Firebase emulators on ports 9199 and 8180: one `<audio>` element with volume 0.15 and `loop` true; blocked autoplay started by the first click; the same element and a continuous `currentTime` across `/setup`, `/dashboard` and a board; the music kept playing through sign-out and sign-in; mute paused in place, unmute resumed from the same time, and the muted choice survived a reload and a click on the page; the track wrapped from the end to the start and kept playing; tab hide and show were simulated with a faked `document.hidden` (pause, resume without restart, no resume after a mute); the Thai session-ended message and the redirect to `/login` appeared after the persisted user was removed, and did not appear after the app's own sign-out; the loading scene matched the reference at 375, 768, 1280 and 1920 px with no horizontal scroll, showed the slow notice on the scene against a backend that never answers, and disappeared within about 0.3 s once the backend answered. `tsc`, `lint`, `build`, `vitest run tests/components tests/assets` (50), `test:integration` (32) and `test:rules` (107) PASSED.
- F15 animation: the farmer and Zs were extracted with `docs/references/extract-loading-assets.py` (plate, `farmer-breathe.png`, `zzz-1..3.png`, `sheets.json`). Checked in the in-app browser on the loading scene: the plate has no chicken clipping or seams around the farmer, the breathing sprite sits exactly on the old position, `document.getAnimations()` showed `sprite-play` stepping 0, 33, 67, 100 percent and the three Zs fading and rising 0 to 23 px with the 0 s, 0.9 s and 1.8 s stagger. `tsc`, `lint`, `build`, `vitest run tests/components tests/assets` (53), `test:integration` (32) and `test:rules` (107) PASSED.

## Not done

- F14 and F15 NOT RUN: real Safari and Chrome autoplay policy, hearing the loop, a real hidden tab, a real Firebase-side revocation or expiry (the session-ended path was triggered by removing the persisted user, because Firebase's own revocation cannot be forced on demand), reduced-motion rendering, production Firebase. Reduced-motion rendering of the loading animation was not tried (the rule is the existing global one) and the animation was not checked at 375 and 1920 px after it was added.

- Loading states: the production Firebase project and your original stuck page were NOT tested (real Google sign-in and production access need your go-ahead), so the original report is not confirmed fixed. `/` and `/login` are not covered. A UI test of duplicate Auth listeners was not written (the Auth listener code is unchanged; Firestore requests per retry were counted by hand).

- PS1 navigation: touch on a real phone, Safari, screen reader output, desktop 1280 screenshot, real save to Firestore and hand step animation smoothness NOT RUN. Letters typed while a key has focus are ignored (Escape first).

- F13 fullscreen layout: not checked in Safari or real Chrome, on a real phone, with reduced motion, or by pixel comparison. On 375 px the stacked layout scrolls vertically (sprites are below the fold), as before. The fill and the faded scene edges were judged by eye only. The 40 px emulator banner makes the page scroll vertically in emulator mode; production has no banner.
- F13: Safari and real Chrome, touch input on a real phone, reduced-motion rendering, screen reader output (punctuation keys have no spoken names), Thai typed through an on-screen IME, and fidelity measured against the reference by tool are NOT RUN. The reference is AI generated, so the scene is close to it but not pixel identical (Press Start 2P replaces the reference's monospace font). On 375px the keys are about 36px wide.

- F12 farmer: the motion is subtle (chest and neckerchief) and was judged from frame sheets and a frame-position check, not by watching it over time; the eyes-open stir row is unused; the farmer brief's provenance table is empty until the owner fills it in.
- F12 phase 3: chicken sheet received and implemented. Checks run: tsc, lint, build, test:assets (29), test:rules (107), test:integration (31). In the in-app browser at 1280px the 10 s timeline was sampled at 9 times (position, flip, which strip is visible) and matched the design; at 375px the patrol, flip and walk slot are off and the chicken pecks in place. Frames 2, 11, 12 are unused. Total animation files about 500 KB. Dog wag viewed only in the in-app browser: 4 distinct frames at 0.5 s per loop; the -14 degree frame has a slightly frayed tail edge. Reduced motion for the sprite sheets was checked by reading the CSS and the global rule, not by browser emulation (not available). Smoothness and frame rate were not measured.

- F11: real Google sign-in from the new button NOT RUN; no pixel-diff tool was used, comparison was by eye.

- F10: real Chrome and Safari, iOS touch, and a spoken-sound check by ear are NOT RUN. Leaving `/login` to play-stop on a real sign-in is not observed.

- Rules not deployed, not owner-reviewed, not production ready.
- Google sign-in, create board, join, and two-user real-time sync: NOT RUN (needs the owner's Google accounts and deployed rules).
- Deployed rules not checked (CLI not logged in); rules not deployed.
- README still the create-next-app template (O2 awaiting permission).

## Blocked or open

- O1 resolved: Project ID `retro-room-alcyone`, web config in `.env` (names verified, values not read).
- O2 README overwrite permission.
- O3 offline and conflict behavior.
- O5 dashboard ordering.
- Firebase Emulator ran on Java 25 (verified by test runs).

## Next step (needs owner go-ahead)

Owner runs `firebase login` (or pastes the deployed rules from the console); compare deployed rules with `firestore.rules`; owner approves the deploy commands listed in the Firestore deployment preparation message; then the manual real-project test with two Google accounts. The real project's rules are probably still open (see docs/03, Real project checks), so the rules deploy is the first step.
