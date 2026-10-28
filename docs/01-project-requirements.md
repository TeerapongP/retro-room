# Project Requirements

Source of truth for Retro Room. Owner has final authority. Anything not listed here is UNCONFIRMED and must be raised with the owner before implementation. Do not overwrite approved entries without explicit owner permission.

## Product

EasyRetro-inspired Sprint Retrospective web app. Visual direction is a cozy late-1990s farming RPG (Harvest Moon: Back to Nature mood, original assets only).

## Confirmed technical constraints

| ID | Constraint |
| --- | --- |
| T1 | Next.js 16.4.3, existing project, App Router, TypeScript |
| T2 | No custom backend. Firebase managed services only |
| T3 | Firebase Authentication, Google Sign-In only |
| T4 | Cloud Firestore for shared data, real-time via listeners (`onSnapshot`) |
| T5 | Approved tools: Firebase JavaScript SDK, Firebase Emulator Suite |
| T6 | No guest access, no anonymous authentication |
| T7 | `localStorage` is never the source of truth for shared boards |

## Phase 1 (MVP) scope: approved

| ID | Feature |
| --- | --- |
| F1 | Google Authentication (sign in, sign out, auth state) |
| F2 | Dashboard listing boards the user belongs to |
| F3 | Create Board |
| F4 | Shared Board URL |
| F5 | Join Board (authenticated user with the URL) |
| F6 | Real-time sticky notes (cards) |
| F7 | Harvest Moon-inspired UI |
| F8 | Session start flow (owner-approved scope extension): Title/Waiting Room, Owner presses START, members wait, state syncs in real time |
| F9 | Player name setup (owner-approved scope extension): after first login the player chooses a name shown on every board |
| F10 | Login startup sound (owner-approved scope extension): `/login` plays `public/sound/menu-sound.mp3` once. Login / Title Screen only |
| F11 | Login / Title Screen redesign (owner-approved scope extension): layered pixel art scene matching the approved reference, English text, reusable daisyUI components in `components/ui/` |
| F12 | Login frame-by-frame animation (owner-approved plan, delivered in three phases): flowers sway and farmer breathing (derived frames), dog tail wag (derived frames), chicken walk and peck (frames from the owner's OpenAI sheet) |
| F14 | Global background music (owner-approved scope extension, supersedes F10): `public/sound/menu-sound.mp3` loops at 15% across the whole app with a mute button |
| F15 | Retro loading screen (owner-approved scope extension): full-page loading, error and retry states use the farm scene from `docs/references/retro-room-loading.png` |
| F13 | Player Name Setup redesign (owner-approved scope extension): `/setup` becomes a pixel-art farm scene with "Your name?" dialogue, a Name field and an on-screen character keyboard (A-Z, a-z, 0-9, Mark, Space, OK). Requested as "F11", numbered F13 because F11 and F12 already exist |

## Phase 2: NOT approved

Voting, Comments, Action Items, Retrospective Timer, other retrospective features. Do not start without explicit owner approval.

## Access model (approved)

- Sign in with Google is required.
- An authenticated user with the Board URL can join the Board.
- Two roles: Owner and Member.
- Owners manage the Board and members. Members create and edit feedback cards.
- Multiple participants collaborate in real time.

## Phase 1 decisions (owner approved the recommended defaults)

| ID | Decision |
| --- | --- |
| D1 | Board has 3 fixed columns: Went Well, To Improve, Ideas. Column names are provisional labels |
| D2 | Any signed-in user who knows the Board URL may read the Board document (title) before joining |
| D3 | Card is plain text only, maximum 500 characters. No color, image, or attachment |
| D4 | Members edit and delete their own cards. Owner may delete any card. Owner may not edit others' cards |
| D5 | Delete Board and remove Member are out of Phase 1. Owner may rename the Board |
| D6 | Opening a Board URL shows a confirmation dialogue. The user joins only after confirming |
| D7 | Exactly one Owner per Board (the creator). No ownership transfer. Roles cannot change |
| D8 | User profile stores `displayName` and `photoURL`. Email is not stored in Firestore |
| D9 | Routes: `/login`, `/dashboard`, `/boards/[boardId]` |
| D10 | UI language: Thai primary, short English labels as decoration |
| D11 | Rules tests use `vitest` + `@firebase/rules-unit-testing` (approved in principle, not yet installed) |

## Session start flow (F8), owner approved the recommended defaults

| ID | Decision |
| --- | --- |
| D12 | "Admin" is the existing Board Owner. No new role |
| D13 | Board has `status`: `waiting` (on creation), `in-progress`, `completed`. Stored on the board document |
| D14 | Members may enter the Waiting Room after joining and see the list of joined members (not online presence) |
| D15 | Only the Owner starts (`waiting` to `in-progress`) and ends (`in-progress` to `completed`). Enforced by Security Rules |
| D16 | No restart. `completed` is final and read-only. No automatic end, no timer |
| D17 | Cards cannot be created, edited, or deleted unless `status` is `in-progress` |
| D18 | A board document without `status` (created before F8) is treated as `in-progress` |
| D19 | Members may join in any status. A late joiner of an in-progress board enters the board directly |
| D20 | Title screen art is original (SVG and CSS). No reference image was attached. Described direction only |

## Login / Title Screen redesign (F11), owner approved

| ID | Decision |
| --- | --- |
| D31 | Reference image `docs/references/retro-room-reference.png` (1448 x 1086) is the visual source of truth for `/login`. It was generated with OpenAI's image generation tool for this project, not extracted from Harvest Moon. No other Harvest Moon assets may be added |
| D32 | Art layers (logo sign, chicken, farmer, dog, 7 flower groups, grass plate) are extracted from that reference into `public/art/` by `docs/references/extract-login-assets.py`. Layout numbers are in `docs/references/login-art-manifest.json` |
| D33 | New folders `public/art/`, `components/ui/`, `docs/references/` approved. The reference is not under `public/` so Next.js does not serve it |
| D34 | The Google "G" is the official standalone logo from Google's branding resources (`https://developers.google.com/static/identity/images/g-logo.png`), used unmodified as `public/art/google-g.png` |
| D35 | Fonts stay Press Start 2P and IBM Plex Sans Thai. No new font |
| D36 | Login text is English as in the reference: "RETRO ROOM", "Team Retro", "Login with Google", "© Bee from Alcyone Team" (no year, no other credit). The old Thai subtitle is removed. Error messages stay Thai |
| D37 | D21 is extended: daisyUI also covers the Login page and the reusable components `RetroButton`, `RetroAlert`, `RetroLoader`. Dashboard and Board are not migrated. Theme stays `harvest` |
| D38 | Initial animation is basic CSS only (chicken and dog step up 2px, stepped, off under `prefers-reduced-motion`). Real frame-by-frame animation (chicken walking and pecking, dog tail, farmer breathing and blinking, flower sway, original sprite sheets) is a separate proposal and is NOT approved. No animation abstraction is built before sprite sheets exist |
| D39 | Mobile layout is a stacked composition (logo, button, sprite row, credit) that keeps the visual identity and avoids overlap |

## Login frame-by-frame animation (F12), owner approved

| ID | Decision |
| --- | --- |
| D40 | Frames come from a mix: phase 1 (flowers, farmer) are derived from the existing single frames by moving pixels (script `docs/references/build-derived-sheets.py`), never newly drawn. The chicken (walk and peck) needs new poses and will use sheets the owner generates with OpenAI's image tool; the dog tail starts as derived frames with that fallback. All frames are derived from or made with AI generated art and must be documented that way. Harvest Moon sprites must not be used as a prompt or source |
| D41 | Sheets are horizontal PNG strips in `public/art/anim/` with `sheets.json` (frames, frameWidth, frameHeight, pad). Played with CSS `steps()` only, no library and no per-frame JavaScript. `components/SpriteAnimation.tsx` exists because real sheets exist |
| D42 | Rates: flowers 4 frames at 2.5 fps, each group offset so they do not move together; farmer 4 frames at 2 fps. Chicken 6 to 8 fps, dog 8 fps in later phases. Animation budget about 600 KB in total |
| D43 | The farmer is asleep (eyes closed in the reference): breathing only, no blinking and no new effects |
| D44 | Chicken (later) walks a patrol on screens at or above 48rem and stays in place on phones. Reduced motion shows the first frame still. Hidden tabs stop painting animation by browser behavior |
| D45 | Folders `public/art/anim/` and `docs/references/animation/` approved. Phase 2 (dog) and phase 3 (chicken) need the owner to review the previous phase first. Phase 1 was reviewed and approved; phase 2 (dog tail wag, derived frames first) was approved on that basis |
| D54 | Dog tail wag, derived: the tail rotates 0, +14, 0, -14 degrees around its base at 8 fps (4 frames); the dog no longer uses the 2 px bob. If the owner finds the frames too rough the fallback is a sheet generated with OpenAI's image tool |
| D55 | Chicken (phase 3) uses frames the owner generates with OpenAI's image tool from `docs/references/animation/chicken-sprite-sheet-brief.md` (8 frames facing right: 4 walk, 4 peck; left-facing frames are mirrored). Raw outputs go to `docs/references/animation/raw/` and the provenance table in the brief is filled in. Implementation waits for the delivered sheet. D54 dog result was accepted by the owner |
| D56 | Chicken delivered and implemented. The owner generated a 12 frame, 4 x 3 sheet with OpenAI's image tool (`docs/references/animation/raw/chicken-sheet.png`, magenta background). `docs/references/extract-sprite-sheets.py` removes the background, cuts the cells, scales every frame by one factor (0.7213) so the idle frame is 176 px tall like the old sprite, aligns frames on a common baseline and anchor, and writes `chicken-walk.png` (frames 3, 4, 5, 6) and `chicken-peck.png` (frames 1, 7, 8, 9, 10) as 64 color PNGs with `sheets-chicken.json`. Frames 2, 11 and 12 (idle breathing, turn) are not used and not shipped. Left-facing frames are made in CSS by mirroring |
| D57 | Chicken loop is 10 s: 0 to 2 s walk left 56 reference px, 2 to 5 s peck facing left, 5 to 7 s walk right, 7 to 10 s peck facing right. Phones only peck in place. Reduced motion shows the idle frame facing right, still |
| D59 | Farmer breathing now uses frames the owner generated with OpenAI's image tool (`docs/references/animation/raw/farmer-sheet.png`, 4 x 2 grid on magenta, brief `docs/references/animation/farmer-sprite-sheet-brief.md`). `docs/references/extract-sprite-sheets.py farmer` cuts, scales (0.637, rest frame 195 px tall like the old sprite) and aligns the cells and writes `farmer-breathe.png` from row 1 (4 frames, 2 fps). Because the generated frames are redrawn, only the chest area that really moves is taken from the generated frames; every other pixel is the rest frame (no shimmer of head, cap or boots). Row 2 (light stir) is cut for review but not shipped: D43 still allows breathing only, and using it needs the owner's approval. This replaces the derived farmer frames of D40 and D41 for the farmer only |

## Login startup sound (F10), owner approved. SUPERSEDED by F14 (D60 to D64); kept for traceability

D28 to D30 describe the original `/login`-only sound. Since F14 the sound plays app-wide, loops and is controlled by `components/BackgroundMusic.tsx`; the `useStartupSound` code of F10 was removed.

| ID | Decision |
| --- | --- |
| D28 | Native `HTMLAudioElement`, no audio library. File `public/sound/menu-sound.mp3` (URL `/sound/menu-sound.mp3`) is unchanged and never looped. Volume fixed at 25% (`audio.volume = 0.25`), file not re-encoded |
| D29 | Played on `/login` only. Autoplay is attempted on load. If the browser blocks it, the first click, touch or key press (not Escape) plays it. At most one playback per `/login` visit |
| D30 | Audio is paused and released when `LoginScene` unmounts. No mute control, volume setting or other audio features |

## Player name setup (F9), owner approved the recommended defaults

| ID | Decision |
| --- | --- |
| D21 | daisyUI 5 (`daisyui` devDependency) is the preferred UI component library. Phase A: used only on the Player Name Setup screen (extended to the Login page and its components by D37). Existing screens keep their `.pixel-*` components until a separate approval (Phase B) |
| D22 | One player name per account, used on every board. Chosen once after the first login, before the dashboard or a board link. Shown on `/setup` (route added to D9) |
| D23 | Name rules: 1 to 20 characters counted in UTF-16 units (an emoji counts as 2, so at most 10 emoji), not blank, no uniqueness check, no profanity filter. Enforced by Security Rules |
| D24 | The name cannot be changed after it is set. No skip button. The input starts empty (Google name is not pre-filled) |
| D25 | Users who already have a profile without a chosen name must choose one |
| D26 | A member document's `displayName` must equal the player name (checked by Rules) |
| D27 | Theme `harvest` (daisyUI custom theme from the approved palette, plus derived cream shades `#F3E0B0` and `#E3C88F` approved by the owner). Loader is `loading-dots`, confirm button reads "OK" |

## Player Name Setup redesign (F13), owner approved

| ID | Decision |
| --- | --- |
| D46 | Reference `docs/references/retro-room-player-name-reference.png` (1536 x 1024, generated with OpenAI's image generation tool, not taken from Harvest Moon) is the visual source of truth for `/setup`. Layers are extracted by `docs/references/extract-setup-assets.py` and `build-setup-sheets.py` into `public/art/setup/` (folder approved). Positions are in `docs/references/setup-art-manifest.json`. The scene plate has the three panels, the hand and the animated sprites removed; the app renders panels, keys and cursor as real components |
| D47 | Exact English labels: "Your name?", "Name", "Mark", "Space", "OK". Instructions, validation errors and the D24 notice stay Thai |
| D48 | `components/ui/RetroKeyboard.tsx` is an on-screen keyboard. A key appends its character to the end of the name. The name input is the single source of truth. At 20 UTF-16 units (D23) further keys append nothing and a Thai message shows. Physical typing, Backspace and Enter work natively in the input and are never intercepted |
| D49 | Mark switches between the standard grid and a symbols grid of 24 ASCII punctuation characters. No validation change: D23 and the Security Rules only check length 1 to 20 and not blank, so symbols are already accepted. Mark is a toggle, not a character |
| D50 | OK and Enter submit through the same handler as before. A blank or whitespace-only name shows a Thai error and saves nothing. Saving reuses `savePlayerName`, `isValidPlayerName`, `normalizePlayerName` and `describeFirebaseError`. Auth, Firestore and Rules are unchanged |
| D51 | Keyboard access (owner approved PS1 navigation): the keys are one Tab stop. While a key has focus, arrow keys move to the nearest key (no wrap, never outside the grid) and `preventDefault` stops page scroll; Enter or click presses the key (OK submits once, Enter repeat ignored); Space inserts a space and never presses the focused key; Backspace removes the last code point; Escape returns focus to the Name input. While the Name input has focus, arrows, Backspace and Space keep native caret and typing behavior. Tab is the only way in, so the input's caret keys are never hijacked. The hand cursor follows keyboard focus (keyboard use clears hover), moves in 3 pixel steps, and replaces the browser focus outline (a forced-colors outline remains). Decorative, separate from the mouse pointer |
| D52 | Animation: blinking block caret in the input, hand cursor nudge, flower sway (4 groups, 4 frames at 2.5 fps, offset per group) and farmer breathing (4 frames at 2 fps). Reuses `SpriteAnimation` and CSS `steps()`. Chicken and dog are static here. Reduced motion stops all of it through the global rule. Login animations are untouched |
| D53 | Layout: at 48rem and wider with a landscape viewport the scene is a fixed 3:2 stage with percent-positioned panels. Portrait and phone widths stack the panels (dialogue, Name, keyboard, notice, sprites), the Name panel stays sticky at the top, and the keyboard uses 8 columns. Superseded in part by D58: the scene is no longer a letterboxed 3:2 box; the stacked layout and the percent-positioned panels from this decision still apply |
| D58 | Fullscreen `/setup` (owner approved). On the stage layout (48rem and wider, aspect ratio 1:1 or wider) the farm scene covers the viewport: the scene width is `min(max(100vw, 150dvh), 104vw, 180dvh)`, centered on both axes, never stretched, with the panels and sprites in the same box so they stay registered to the scenery. The caps stop the Your name? panel, farmer, chicken and dog from being cropped. Where the capped scene does not reach an edge (ultrawide, or close to square) the scene fades out over 8% of its size, up to the band width times 6, into `public/art/setup/grass-fill.png`, a tileable 1024 x 1024 grass built from clean areas of `scene.png` by `docs/references/build-setup-grass-fill.py` and shown at the scene's own pixel density. The login page grass is no longer used on `/setup`. Supersedes the fixed 3:2 stage sizing in D53 only |

## Auth and profile loading states (owner approved)

| ID | Decision |
| --- | --- |
| D54 | The player profile has a distinct `error` state. `missing` means only that Firestore confirmed the profile has no player name. Offline, `unavailable`, `permission-denied` and any other failed read are `error` and never show the name form |
| D55 | After 15 seconds (`LOADING_TIMEOUT_MS`) of auth or profile loading the UI shows a Thai "taking longer than usual" notice with a retry button. The timeout is UI only: the Firebase request is not cancelled, the user is not signed out, and a late answer still updates the page. One timer spans the whole load and restarts only on retry |
| D56 | Retry restarts the profile read (a new attempt; answers from older attempts are ignored). When Firebase Auth itself has not answered, retry reloads the page, because the Auth SDK cannot restart its own initialization. No listener is added by a retry |
| D57 | `AuthLoadingNotice` (in `components/LoadingNotice.tsx`) is the loading gate of `/setup`, `/dashboard` and `/boards/[boardId]`. `/` and `/login` keep the plain `LoadingNotice` and are not covered by D55 |

## Global background music (F14) and retro loading screen (F15), owner approved

| ID | Decision |
| --- | --- |
| D60 | One native `HTMLAudioElement` plays `public/sound/menu-sound.mp3` with `loop = true` and `volume = 0.15`. `components/BackgroundMusic.tsx` is mounted once in the root layout, so the element survives client-side navigation and position is never reset. No audio library, no volume slider. Supersedes D28 to D30 |
| D61 | Autoplay is tried once. If the browser blocks it the first click, touch or key press (not Escape) starts it, then the listeners are removed. A rejected `play()` is swallowed, never retried in a loop |
| D62 | A small pixel speaker button fixed at the top right mutes and unmutes (`aria-label` "ปิดเสียงเพลง" / "เปิดเสียงเพลง", `aria-pressed`). Muting pauses the same element, so unmuting resumes from the same position. The preference is kept in `localStorage` key `retro-room:music-muted` and a muted user is never unmuted automatically |
| D63 | The music does not stop on sign-out, on login, on route changes or during loading. It pauses when the tab is hidden and resumes from the same position when visible again, only if it was playing, is not muted and the browser allows it |
| D64 | The scene plate is `public/art/loading/scene.webp`, built by `docs/references/extract-loading-assets.py` from the reference with the "Loading..." panel painted out (positions in `docs/references/loading-art-manifest.json`). The panel is a real HTML component showing the English text "Loading..." as in the reference, with a Thai screen reader label. `LoadingNotice` has a `scene` prop for full-page gates (`/`, `/login`, and through `AuthLoadingNotice` `/setup`, `/dashboard`, `/boards/[boardId]` with the board Suspense fallback). Inline loaders keep the plain panel. Error and retry (D54 to D57) show on the same scene. The scene is only cropped, never stretched. The sleeping farmer and three "Z" glyphs are lifted out of the plate by the same script (grass patches fill the holes): the farmer is a 4-frame breathing sheet (`public/art/loading/farmer-breathe.png`, chest pixels moved 0 to 2 px, 2 fps, `SpriteAnimation`) and each Z is its own PNG that floats up about 3% of the scene height while fading, staggered (3.6 s loop). Dog and chicken stay still; no other environmental movement. Reduced motion shows the first farmer frame and the Zs still |
| D65 | A session that Firebase ended (signed in, then signed out without the app's own sign-out) redirects protected pages to `/login` and shows "เซสชันของคุณหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง". The app's sign-out sets a `localStorage` marker (`retro-room:user-signed-out`) so a user-initiated sign-out, also from another tab, shows nothing. Network and Firestore failures never sign the user out. The `onAuthStateChanged` error callback no longer signs out; it only logs. Limitation: the message is shown only for an end that happens while a page is open. If Firebase clears invalid credentials while the app starts, the first auth answer is already "signed out", and the user is sent to `/login` without the message |

## Open items

| ID | Item | Status |
| --- | --- | --- |
| O1 | Firebase Project ID and web config | RESOLVED: project `retro-room-alcyone`, web config in `.env` (gitignored). Google provider, Firestore database and authorized domain `localhost` confirmed by owner |
| O2 | Overwriting the template `README.md` | UNCONFIRMED, awaiting owner permission |
| O3 | Behavior on offline, reconnect, and concurrent edit conflicts | UNCONFIRMED. Proposed: last write wins, show connection error state |
| O4 | Whether a user who left or lost access can rejoin | N/A in Phase 1 (no remove or leave) |
| O5 | Board list ordering on Dashboard | UNCONFIRMED. Proposed: newest joined first |
