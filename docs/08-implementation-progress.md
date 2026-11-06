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
| F16 Dashboard pixel-art redesign | 01 (D66 to D72), 06 | `app/dashboard/page.tsx`, `components/DashboardHeader.tsx`, `DashboardIcons.tsx`, `DashboardSprout.tsx`, `app/globals.css` (Dashboard block), `public/art/dashboard/countryside.png`, `docs/references/retro-room-dashboard-reference.png` | IMPLEMENTED, AWAITING OWNER VISUAL APPROVAL (D73 fidelity pass); checks and browser measurements in Done; error and loading states NOT RUN visually |
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

- F16 verified in the in-app Chromium against `pnpm dev:emulator` with a forged emulator session (not a real Google sign-in). Geometry measured with the emulator banner removed: 1852x849, 1920x1080, 1280x720, 768x1024 and 375x812 had no horizontal scroll, no clipped navbar controls, no panel overlaps, and the music button never overlaps the navbar (12 px gap at 1280, above the navbar on phones). Retro label to panel gap: 20 px at 1852 and 1920, 16 px at 1280, 768 and 375; Start panel to label about 38 to 39 px on desktop. At 1852x849 the Start panel is 572 px and the Retro panel 548 px wide like the reference. Creating "Sprint 12" wrote `boards/{id}` with status `waiting`, opened `/boards/{id}`, and the list on `/dashboard` then showed it as Owner with a link; the mute toggle flipped its label twice with one `<audio>` element; Logout returned to `/login`. `tsc`, `lint`, `build`, `vitest run tests/components tests/assets` (59), `test:rules` (107) and `test:integration` (32) PASSED.

## Not done
- F16: the Retro list error state and the inline loading state were not forced and not viewed (NOT RUN); two-user realtime on the list not re-run; no pixel diff against the reference (compared by eye and by measured rectangles); Safari, real Chrome and a real phone NOT RUN; `docs/references/__pycache__/` is untracked noise from earlier scripts.

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

- F16 fidelity pass (D73), measured at 1852x849 against the reference: header, Home pill, logout, Start panel, input, create button, Retro label and empty panel are within 2 px; gaps header to Start 106, Start to label 38, label to panel 19; no horizontal scroll or overlaps; populated list ("Sprint 12", Owner) re-checked with the same gaps. Re-ran `tsc`, `lint`, `build`, vitest components+assets (59), `test:rules` (107), `test:integration` (32): all PASSED.
- `failed-precondition` on the Retro list: cause is the missing COLLECTION_GROUP index on `members.uid` for `collectionGroup("members").where("uid", "==", uid)`. It is declared in `firestore.indexes.json` but NOT deployed to `retro-room-alcyone`. Nothing was deployed or changed; needs owner approval for `firebase deploy --only firestore:indexes --project retro-room-alcyone` (deploying rules is a separate decision, deployed rules are currently open).

## F17 Admin card controls (branch `feature/admin-card-controls`, not committed)

- IMPLEMENTED on the emulator: admin identity, hide and unhide, member card queries (two queries merged), move to another board through the ledger, admin board listing, admin card menu and move dialog. Files: `firestore.rules`, `lib/firebase/admin.ts`, `lib/firebase/cards.ts`, `lib/firebase/types.ts`, `app/boards/[boardId]/page.tsx`, `components/CardMenu.tsx`, `CardMenuIcons.tsx`, `MoveCardDialog.tsx`, `app/globals.css`, tests under `tests/rules` and `tests/integration`.
- Checks PASSED: `tsc`, `lint`, `build`, vitest components and assets (59), `test:rules` (174), `test:integration` (41).
- Browser check (emulator, forged Auth emulator sessions, not a real Google sign-in): the admin saw all cards including a hidden one, opened the menu, moved a card to another board and got the success message; a board owner without admin rights saw no menu and no hidden card. NOT RUN: hide and unhide clicks in the browser (covered by integration tests), phone width, keyboard use of the menu, real Google sign-in with the admin account.
- A spike on the emulator found that the `get('hidden', false)` Rules form leaks hidden cards to unfiltered member queries; Rules use `resource.data.hidden == false` (D76).
- Not deployed. Deploying `firestore.rules` and `firestore.indexes.json` needs owner approval and a working `firebase login`; production behavior of `getAfter()` and the call limits is NOT VERIFIED.
- Untracked `docs/references/retro-room-board-reference.png` (owner's Board screen reference) is not used yet; see the open question about a Board redesign.

## F18 Board screen redesign (branch `feature/board-redesign`, stacked on the uncommitted F17 work, not committed)

- IMPLEMENTED: scene and navbar, board sign and meta chip, framed column headers with count and `+`, inline composer, colored cards with author and relative time, read-only completed board, restyled dialogues. Files: `app/boards/[boardId]/page.tsx`, `components/BoardColumn.tsx`, `StickyNote.tsx`, `BoardIcons.tsx`, `DashboardHeader.tsx` (new `current` prop), `lib/relative-time.ts`, `app/globals.css` (Board block), `tests/components/relative-time.test.ts`.
- Checks PASSED: `tsc`, `lint`, `build`, vitest components and assets (65), `test:rules` (174), `test:integration` (41).
- Browser check (emulator, forged Auth emulator sessions, in-app browser, dev server from an isolated copy of the project): 1852x849, 1280x720, 768x1024 and 375x812 had no horizontal scroll and no overlaps. At 1852x849 the navbar and the content column are both 1522 px wide, three columns are 491 px each with 24 px gaps, and the sign sits 28 px below the navbar (reference: about 27 px). Checked: populated board, admin menu and move dialog, composer open and submit (a card was added and the composer closed), completed board (no `+`, no menu, no end button), waiting screen. NOT RUN: 1920x1080, empty-column look, loading and error states, board join and not-found screens in the new scene, keyboard use of the composer and menu, a real device, Safari, real Google sign-in.
- Remaining differences from the reference: 3 columns instead of 5 (D83), no likes, avatars or Anonymous (D84); the title screen keeps small leftover scenery blocks at the bottom; the phone navbar wraps to three rows like the Dashboard; card times look like `just now` for seeded future dates; no pixel diff against the reference (compared by eye and measured rectangles).
- Not committed, pushed or deployed.

### F18 fidelity pass (Chrome DevTools MCP, exact reference viewport 1672x941)

- A Chrome DevTools MCP check of the first F18 build found the navbar, sign, column heads and card offsets off by 8 to 130 px against `retro-room-board-reference.png`. Fixed by sizing the Board from the reference (`--u` = 1672 px basis, navbar 1307x64, content 1548 wide, heads 70, card gap 5) and highlighting Home like the reference.
- Measured again in Chrome (banner hidden in the page only): navbar 183 to 1490 x 14 to 78 (reference about 185 to 1492 x 14 to 78), logout 1309 to 1471 x 23 to 69 (1310 to 1473 x 22 to 68), sign 62 to 385 x 107 to 162 (65 to 388 x 107 to 160), column heads y 177 to 247 (175 to 245), first card y 251 to 327 (248 to 325). All within 3 px except Home pill x (451 to 571 vs about 458 to 585). Reference values are read by eye from a gridded copy.
- 1672x941, 1852x849, 1280x720, 768x1024 and 375x812: no horizontal scroll, no overlaps. The Dashboard at 1852x849 is unchanged (navbar 1522x80 at x 170, Start panel 572x154, Home current). Console: no errors, one expected warning that autoplay music is blocked.
- NOT fixed, needs the owner: the reference background is a different picture from `countryside.png` (a normalized correlation of 0.27 at the best scale and offset). At 1672x941 our plate leaves about 175 px of flat sky at the top where the reference shows foliage and clouds, and its landmarks differ (reference chicken x 357 vs ours 330; fence line y 700 vs 655). A taller plate made for this aspect ratio is needed.
- Also different by decision or limitation: Thai plus English column labels, avatars, likes, 5 columns, pencil icons on the sign, the brand font (reference uses a bold sans, ours Press Start 2P), rounded plank corners.

## F19 Local mock mode (branch `feature/mock-dev-mode`, not committed)

- IMPLEMENTED: `pnpm dev:mock` (`NEXT_PUBLIC_MOCK_MODE=true next dev`) runs the app with an in-memory backend instead of Firebase Auth and Firestore (`lib/mock/backend.ts`, `lib/mock/index.ts`). The Firebase libs (`auth.tsx`, `boards.ts`, `cards.ts`, `profile.ts`, `client.ts`) branch to it when `isMockMode()` is true; nothing was commented out or removed, so real behavior is unchanged when the flag is off. `components/EmulatorBanner.tsx` shows a MOCK MODE banner.
- Mock user: the verified admin with the player name "Aomsin"; demo data: boards Sprint 23 and Sprint 13 and two other players (renamed from Sprint 12 on owner request). State persists in `localStorage` key `retro-room:mock-state` (clear it to reset). It does NOT run Security Rules (D92).
- Checks PASSED: `tsc`, `lint`, `build`, vitest components, assets and mock (78 tests, 13 new in `tests/mock/backend.test.ts`), `test:rules` (174), `test:integration` (41).
- Browser check (in-app browser, mock mode, dev server from an isolated copy): login page showed the MOCK MODE banner; "Login with Google" went to the Dashboard with both demo boards and no `failed-precondition`; creating "Mock Retro 1" opened the waiting screen; PRESS START, adding a card and opening the admin menu all worked; the browser's resource list had 4 entries whose names match "firebase"; I could not list them afterwards (the server was already stopped), so they are most likely the Firebase JavaScript chunks but that is NOT confirmed, and no emulator was running so a real Firebase call would have failed visibly. NOT RUN: hide and move clicks in mock mode, Setup (player name) screen, sign-out, two-user realtime, phone width.
- A production build ignores the flag (`isMockMode()` is false when `NODE_ENV` is production), but the mock backend code is still bundled, unused. Mock mode also throws off localhost.

## F20 Skip the Dashboard (branch `feature/skip-dashboard`, not committed)

- IMPLEMENTED: `/boards` launcher (`app/boards/page.tsx`, `lib/pick-board.ts`, `lib/last-board.ts`), `/dashboard` redirect, `components/BoardSwitcher.tsx`, navbar and post-login routes now go to `/boards`, opaque hidden cards. The Board now remembers the last opened board on the device.
- Checks: see the run recorded below.
- Chrome DevTools MCP check (mock mode, dev server from an isolated copy, 1672x941 and 375x812): login went straight to `/boards/sprint12` with no Dashboard text; the switcher listed both boards, switching opened `/boards/sprint13` and stored it as the last board; `+ บอร์ดใหม่` created and opened a new board; `/dashboard` redirected to the last board; with no boards at all the launcher created exactly one `My Retro` and opened it; no console errors or warnings; no horizontal scroll at 375 px. NOT RUN: the same flow against the emulator or real Firebase, two-user realtime, keyboard use of the switcher, tablet width. Against the real project the launcher still needs the `members.uid` index (D99).

## Admin delete (D100, branch `feature/skip-dashboard`, not committed)

- IMPLEMENTED: admin delete rule in `firestore.rules`, `ลบการ์ด` item and "Delete card?" dialog (`CardMenu.tsx`, `CardMenuIcons.tsx`, `page.tsx`), rules and integration tests. Not deployed; the Rules change must be deployed with the earlier F17 Rules.
- Rules tests PASSED (176) after updating the tests that assumed the admin could not delete; integration 43 PASSED.
- Chrome DevTools MCP check (mock mode, 1672x941): the menu shows hide, move and a dark red delete item; the dialog shows the card text; cancel kept all 4 cards; confirm removed the card and showed `ลบการ์ดแล้ว`; no console errors. NOT RUN: delete against the emulator through the UI, phone width, keyboard use, a completed board in the browser (covered by rules and integration tests).

## Admin column move (D101, branch `feature/skip-dashboard`, not committed)

- IMPLEMENTED: admin column change in `firestore.rules`, `setCardColumn` in `lib/firebase/cards.ts` and the mock backend, two column items in the admin menu (`CardMenu.tsx`, `StickyNote.tsx`, `BoardColumn.tsx`, `page.tsx`), wider menu (15rem) so items stay on one line. Not deployed; deploy it with the other F17 Rules changes.
- Checks: see the final run below. Chrome DevTools MCP check (mock mode, 1672x941): the menu listed hide, the two other columns, move to another board and delete; Went Well to To Improve, then back to Went Well, worked with the notice shown; no console errors; menu items 44 px high on one line, no horizontal scroll. NOT RUN: phone width (the menu is 240 px wide inside a 351 px card), keyboard use, the UI against the emulator.

## F21 Stack cards (D102 to D108, branch `feature/skip-dashboard`, not committed)

- IMPLEMENTED: `groupId` on cards, admin stack rule in `firestore.rules`, `stackCards` and `unstackCard` (real and mock), `lib/card-groups.ts`, `CardStack`, `StackCardDialog`, drag and drop on cards, menu items, styles. Not deployed; it must be deployed with the other F17 Rules.
- Chrome DevTools MCP check (mock mode, 1672x941 and 375x812): a synthetic drag (dragstart, dragover, drop events with a DataTransfer) of "Deploy was smooth" onto a card in another column moved it there and made a stack with the `กองการ์ด ×2` button and layered edges; opening, folding, `แยกออกจากกอง` and the `ซ้อนกับการ์ดอื่น...` dialog (confirm stacked across columns) all worked; no console errors; no horizontal scroll at 375 px. NOT RUN: a real mouse drag in a browser (only synthetic events were used), the drag against the emulator, touch, keyboard use, stacks with hidden cards in the browser (rules only).

## Pop-up dialogs (branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: `components/ModalDialog.tsx` and the end-session, delete, move and stack dialogs use it; centered with `margin: auto; inset: 0` because the Tailwind reset removes the browser's default dialog centering.
- Chrome DevTools MCP check (mock mode, 1672x941): the delete dialog opens as a modal (`:modal`) centered on screen with a dimmed backdrop and focus inside; a real Escape key closed it; a click on the backdrop closed it; confirm deleted the card and showed the notice; the move and stack dialogs also open as modals and close with `ยกเลิก`; no console errors. NOT RUN: the end-session dialog in the browser (same component), phone width, screen reader behavior, the real project.

## Center alerts and Sprint 23 (branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: `components/CenterAlert.tsx` used for the Board's notices and errors and the switcher's errors; the mock demo board and the new-board placeholder renamed from Sprint 12 to Sprint 23 (`lib/mock/backend.ts`, `BoardSwitcher.tsx`, `tests/mock/backend.test.ts`). Old mock data in `localStorage` (`retro-room:mock-state`) keeps the old `sprint12` board until that key is cleared.
- Chrome DevTools MCP check (mock mode, 1672x941): hiding a card showed a centered modal "Done" alert that closed itself; the board opened as Sprint 23, the switcher listed Sprint 23 and Sprint 13, the placeholder read Sprint 23. NOT RUN: the error tone in the browser (no error can be forced in mock mode), phone width.

## F22 Board timer and switcher removal (branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: board switcher and `+ บอร์ดใหม่` removed (D109); shared admin-controlled countdown: `timerEndsAt` and `timerDurationSec` on the board, `validTimerUpdate` in `firestore.rules`, `startTimer` and `stopTimer` (real and mock), `lib/timer.ts`, `lib/beep.ts`, `BoardTimer.tsx`, `TimerDialog.tsx`. Not deployed; deploy it with the other Rules.
- Chrome DevTools MCP check (mock mode, 1672x941 and 375x812): the heading row had no switcher; the admin button opened the `Set timer` modal with four presets; 3 minutes counted down (02:59, 02:57), `หยุด` removed the timer and brought the button back; a 3-second timer showed `00:00 หมดเวลา`, a centered `⏱ หมดเวลาแล้ว!` box with `pointer-events: none` and no dialog open, the add-card form still opened, and the box vanished after 6 seconds; `ล้าง` offered; no console errors; no horizontal scroll at 375 px. NOT RUN: the beep (sound cannot be heard here), what a non-admin sees (mock mode is always the admin; covered by `BoardTimer` logic and rules tests), two browsers watching one timer, a clock that is wrong, the emulator through the UI.
- Known limit (D111): the end time comes from the admin's clock, so a browser with a wrong clock shows a time off by the difference.

## F23 Session stepper (branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: the navbar is replaced by `PhaseStepper` and `AccountChip`; board `phase` (1 to 6) with `validPhaseUpdate` in `firestore.rules`, `setPhase` (real and mock), `lib/phases.ts`; `DashboardHeader.tsx` deleted. Steps 3 to 6 are placeholders (D118). Not deployed; deploy with the other F17 Rules.
- Chrome DevTools MCP check (mock mode): at 1672x941 the bar showed six steps with step 1 current, the panel and the chip top right, no old navbar; `ขั้นถัดไป` moved to step 2 with a check on step 1, a click on step 4 marked 1 to 3 done, a click on step 6 removed the next button, and step 1 again still opened the add-card form (nothing is blocked); 375x812 uses two columns with no broken Thai words and no horizontal scroll (after fixing three columns that split words); 1280x720 six columns; a missing board still showed the chip; no console errors. NOT RUN: what a non-admin sees in the browser (mock mode is always the admin; rules and `PhaseStepper` logic cover it), a completed board in the browser, two browsers following one step, 768 px, the UI against the emulator.
- The Board reference comparison (F18 fidelity) is outdated for the top area.

## Google photo in the account chip (D124, branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: `AccountChip.tsx` shows `user.photoURL` as a 30 px round avatar, falling back to the first letter of the player name; the mock admin has a drawn avatar so the image path runs in mock mode.
- Chrome DevTools MCP check (mock mode): the chip showed a 30x30 image that loaded (`naturalWidth > 0`); a forced `error` event switched it to the letter `A`; no console errors. NOT RUN: a real Google photo (no real sign-in is possible here; Google serves it from `googleusercontent.com`, which is loaded with `referrerPolicy="no-referrer"`), a photo that is slow, the phone width of the chip.

## One board bar (branch `feature/modal-dialogs`, not committed)

- IMPLEMENTED: the heading row is a single `.board-bar` plank (`app/boards/[boardId]/page.tsx`, `app/globals.css`).
- Chrome DevTools MCP check (mock mode): at 1280x720 the bar showed title, meta line, `⏱ ตั้งเวลา` and `คัดลอกลิงก์แชร์` in one plank; with a running timer the clock `06:59` and `หยุด` sat inside the bar behind a divider; at 375x812 the bar wrapped with no horizontal scroll (see the measurements run). NOT RUN: the expired state and the owner's `จบเซสชัน` button in the new bar in the browser, a completed board, a very long board title.

## Pixel font TA GBA monothai MAX (D125, branch `feature/ta-gba-font`, not committed)

- IMPLEMENTED: `app/layout.tsx` loads the MAX TTF with `next/font/local` in place of Press Start 2P; sizes of `.font-pixel` text set to multiples of 16 px (see doc 06). The owner downloaded the zip; I copied only the MAX TTF, `OFL.txt` and `FONTLOG.txt` into `app/fonts/` (the TTF is 21 KB).
- Chrome DevTools MCP check (mock mode, 1280x720): the font loaded (`pixelFont: loaded`); a dialog title rendered at 32 px in the new font, the timer clock at 32 px, the time-up box at 48 px with Thai text in pixel form, the Title screen name at 64 px, the Login page banner and credit line in the new font; no horizontal scroll was introduced. NOT RUN: the Setup page (name input and keyboard use pixel text), the phone width of the Title screen at 64 px, a page-by-page comparison of Login credit sizes, the real project, Safari and Firefox, and the `♥` and `⏱` glyphs (whether the font has them was not checked; the browser falls back to another font when it does not).
- Open items: the Mini variant is not used. The Login credit line size follows the stage width and is not a multiple of 16 px, so it is not perfectly sharp.

## One panel for board info and step (branch `feature/ta-gba-font`, not committed)

- IMPLEMENTED: `PhaseStepper` takes `boardInfo` and `actions`; the page passes the title, meta, timer, share and end buttons into it; the separate `.board-bar` is gone.
- Chrome DevTools MCP check (mock mode): at 1280x720 there was one `.phase-panel` with title and meta, step text and the actions (`⏱ 06:59 หยุด`, share, `ขั้นถัดไป ›`) in one row and no `.board-bar`; at 375x812 the three parts stacked with no horizontal scroll and the next-step button moved the step to 2 with one panel still showing. NOT RUN: a non-admin view, a completed board, the expired timer state, a very long board title, 768 px.

## F24 Private writing step (branch `feature/private-writing-step`, not committed)

- IMPLEMENTED: `cardsRevealed` and the new card read rule in `firestore.rules`; `CardViewer.seesOthers` and step-based subscriptions in `lib/firebase/cards.ts` and the page; the same rule in the mock backend; step 1 description changed in `lib/phases.ts`. Existing rules, integration and mock tests were updated: their boards are now in step 2 (or an admin moves them to step 2), because a board without a step counts as step 1.
- Checks: see the run recorded in the report. Tests added: 7 rules, 2 integration, 1 mock.
- NOT RUN in the browser: what a non-admin sees (mock mode is always the admin, so the privacy cannot be seen there; the rules and integration tests are the evidence), the brief permission error a member's open subscription may get at the moment the admin moves the board back to step 1 (the page renews the subscription, but a short error box could flash; not observed because it needs two real users), two browsers.
- Behavior to know: moving the step back to 1 hides others' cards again (D128); the admin sees everything (D127); ending a session in step 1 shows all non-hidden cards (D129).

## F25 Writing only in step 1 (branch `feature/no-new-cards-after-writing`, not committed)

- IMPLEMENTED: `writingOpen` and the stricter card create rule in `firestore.rules`; `canAdd` in `BoardColumn` and the page; the same rule in the mock `addCard` (error code `permission-denied`); step 2 text. Tests: 6 rules, 2 integration and 1 mock added; existing tests that created cards now use a step-1 board (rules) or add cards before the admin starts the review (integration, mock).
- Chrome DevTools MCP check (mock mode, 1280x720): in step 1 each column had a `+` button (3); step 2 showed the new description and 0 buttons; step 6 had 0; going back to step 1 showed 3 again; an open add form closed when the step moved to 2; no console errors. NOT RUN: a member's view (mock mode is always the admin; the rules and integration tests cover it), the permission error message when a form is open at the moment the step moves, two browsers.
- Edit and delete of own cards are NOT locked in review (D132, default). Say if members should lose them in the review step too.

