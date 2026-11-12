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
| F16 | Dashboard pixel-art redesign (owner-approved scope extension): countryside backdrop, cream pixel-framed navbar and panels, pixel icons, Retro section spacing and empty state, matching `docs/references/retro-room-dashboard-reference.png`. Visual only: board creation, the realtime board list, loading, error and logout behavior are unchanged |
| F17 | Admin card controls (owner-approved scope extension): one fixed admin (`thirapong.pin@ascendcorp.com`, verified Google email) can hide and unhide cards, move cards to another `in-progress` board, and list boards to pick a destination. Enforced by Firestore Security Rules; see D74 to D82 |
| F18 | Board screen redesign (owner-approved scope extension): restyle `/boards/[boardId]` to match `docs/references/retro-room-board-reference.png` (countryside backdrop, `RETRO ROOM` navbar, board sign, framed column headers with count and add button, colored cards with author and relative time). Visual only; see D83 to D88 |
| F19 | Local mock mode (owner-approved scope extension): `pnpm dev:mock` runs the app without Firebase Auth or Firestore, with a fake signed-in admin and in-memory demo data, so UI work is not blocked by login or deployment. Development only; see D89 to D92 |
| F20 | Skip the Dashboard (owner request): after sign-in the app opens a board directly; there is no board list page. A board switcher with a new-board form lives on the Board screen. See D94 to D99 |
| F21 | Stack cards (owner request): the admin can stack cards about the same topic by dragging one onto another, or from the card menu. A stack shows as a pile with a count and opens to show all its cards. See D102 to D108 |
| F22 | Board timer (owner request, first item of the earlier "Retrospective Timer" non-goal): the admin starts a countdown on an in-progress board and everyone sees the same time. See D109 to D115 |
| F23 | Session stepper (owner request): the top navbar of the Board is replaced by a six-step bar (เขียน, ทบทวน, โหวต, ให้คะแนนตัวเอง, โฮสต์คนถัดไป, สรุป) that the admin moves and everyone sees. See D116 to D123 |
| F24 | Private writing step (owner request): while the board is in step 1 (เขียน), a member sees only their own cards; other members' cards appear from step 2 on. Amends D76 and D119. See D126 to D130 |
| F25 | Writing only in step 1 (owner request): new cards can be written only while the board is in step 1 (เขียน); from step 2 on nobody can add a card. Amends D119. See D131 to D134 |
| F26 | Voting (owner request; the first real use of step 3, โหวต): each member has up to 3 votes on a board and puts them on cards. This approves the earlier non-goal "Voting" for this form only. See D135 to D142 |
| F27 | No editing or deleting after step 1 (owner request): from step 2 on, members can no longer edit or delete cards; the `แก้ไข` and `ลบ` buttons are removed. Settles the open point of D132. See D143 and D144 |
| F28 | Self rating (owner request): in step 4 (ให้คะแนนตัวเอง) the cards are hidden and each member gives one score from 1 to 5 in steps of 0.5. Everyone sees every member's score and the average | Planned scope: D145 to D148 |
| F29 | Next-host wheel (owner request): in step 5 (โฮสต์คนถัดไป) the admin spins a wheel of the board's members and everyone sees the same winner as the next host | Planned scope: D149 to D152 |
| F30 | Crowded Farm (owner request): in step 5 the admin starts a 15 second round; every member picks carrot (6), corn (7) or strawberry (8); fewer people on a field means more points each; the best group wins the next-host spot, ties and cancelled or empty rounds use the wheel. The current Host and every previous Host of the board play and score but cannot become the next Host | D153 to D166 |
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
| D37 | D21 is extended: daisyUI also covers the Login page and the reusable components `RetroButton`, `RetroAlert`, `RetroLoader`. Dashboard and Board are not migrated (the Dashboard is amended by D66). Theme stays `harvest` |
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

## Dashboard pixel-art redesign (F16), owner approved the recommended defaults

| ID | Decision |
| --- | --- |
| D66 | F16 changes the look of `/dashboard` only. daisyUI is extended to the Dashboard (`btn`, `input`), which amends D37 ("Dashboard and Board are not migrated"; the Board screen still is not). No change to Firebase, Rules, authentication, player-name validation, the music architecture, Login or Setup |
| D67 | Reference: `docs/references/retro-room-dashboard-reference.png` (1852 x 849, supplied by the owner; the tool that made it is not recorded here, owner to fill in). `public/art/dashboard/countryside.png` is the same artwork without the interface and is used as the background |
| D68 | Background is a `position: fixed` layer (`.dashboard-backdrop`), not `background-attachment: fixed`, which iOS Safari ignores. The artwork is bottom anchored, `--scene-w: max(100vw, 100dvh)` wide, shifted left by 30% of any overflow (so phones keep the tree, noticeboard and pond), and fades into the sky color `#0e94fd` at its top 9%, so screens taller than the artwork get more sky instead of stretching. Nothing is stretched |
| D69 | Panels and the navbar use a notched pixel frame made from an inline SVG `border-image` (dark edge, wood, light line, corner pixel left out) with a hard drop shadow. Icons (home, calendar, door, document, plus, sprout) are inline pixel SVGs in `components/DashboardIcons.tsx` and `DashboardSprout.tsx`. No new dependency or image file |
| D70 | Navbar: brand `RETRO ROOM` (the reference says `RETRO`; the owner chose `RETRO ROOM`), `Home` (active, dark wood, `aria-current="page"`) and `Retro` (a link to `#retro` on the same page, no new route), then the player name and `ออกจากระบบ`. The fixed music toggle is unchanged; the layout leaves it room (44 px side padding above 40rem, 44 px top padding on phones) |
| D71 | Retro section: the label sits above the panel with a gap of `clamp(1rem, 1.1vw, 1.25rem)` (measured 20 px at 1852 wide, 16 px at 1280 and below); about 38 px separate the Start panel and the label; from 64rem up the label is shifted 3.75rem left of the panel as in the reference. Panels are 572 px (Start) and 548 px (Retro) wide at most |
| D72 | Empty state: a small sleeping cat (pixel data in `DashboardIcons.tsx`, drawn for this project from the reference's silhouette, not copied pixels) with `Zzz`, heading `ยังไม่มีบอร์ด` and text `สร้างบอร์ดแรกของคุณเพื่อเริ่ม Retro กันเลย!`. The earlier sleeping farmer image is no longer used here |
| D73 | Visual fidelity correction (not yet visually approved by owner): the Dashboard is scaled by a proportional unit `--u = min(100vw/1852, 1.6px)` (1 px of the 1852 px wide reference, with rem floors) so navbar, Start panel and Retro section keep the reference proportions on wide screens; the countryside art keeps its crop and only changes position and scale (bottom anchored, `--scene-w = max(100vw, 100dvh)`). Retro label to panel gap stays 16 to 24 px. No change to Firebase, Rules, board creation or the shared Board header. No commit, push or PR until the owner approves the visuals |

## Open items

| ID | Item | Status |
| --- | --- | --- |
| O1 | Firebase Project ID and web config | RESOLVED: project `retro-room-alcyone`, web config in `.env` (gitignored). Google provider, Firestore database and authorized domain `localhost` confirmed by owner |
| O2 | Overwriting the template `README.md` | UNCONFIRMED, awaiting owner permission |
| O3 | Behavior on offline, reconnect, and concurrent edit conflicts | UNCONFIRMED. Proposed: last write wins, show connection error state |
| O4 | Whether a user who left or lost access can rejoin | N/A in Phase 1 (no remove or leave) |
| O5 | Board list ordering on Dashboard | UNCONFIRMED. Proposed: newest joined first |

## Admin card controls (F17), owner approved

The owner approved the three policies below and the ledger approach after an emulator spike (55 of 55 tests passed on emulator 1.22.0). Production behavior is NOT VERIFIED until the Rules are deployed.

| ID | Decision |
| --- | --- |
| D74 | Admin is one fixed identity: `request.auth.token.email == 'thirapong.pin@ascendcorp.com'` and `request.auth.token.email_verified == true`. The client check (`lib/firebase/admin.ts`) only controls UI visibility. Rules enforce everything. Admin does not need to be a board member for the approved operations. Admin is not a new board role and D12 (Owner is the board admin) is unchanged. Changing the admin email needs a Rules change and a deploy |
| D75 | Hide and unhide: a card has a `hidden` boolean. Only admin can change it, only on an `in-progress` board, and the update may change nothing but `hidden` and `updatedAt`. New cards are created with `hidden: false` |
| D76 | A hidden card is completely invisible to other members, with no placeholder. Its author can still read it. Admin reads all cards. Rules are not filters, so a member subscribes with two queries (`hidden == false`, and `authorId == uid`) and merges and sorts them on the client, without `orderBy` to avoid a composite index. Admin uses one unfiltered query. New cards must carry `hidden: false`. A card without a `hidden` field is readable only by its author and the admin: the emulator spike showed that the `get('hidden', false)` Rules form lets an unfiltered member query return hidden cards, so Rules use the plain `resource.data.hidden == false` form. No such cards exist in the real project (no boards yet). Offline persistence stays off |
| D77 | Move to another board: only admin, only when the source and the destination boards are both `in-progress` (completed and waiting boards stay untouched). Firestore cannot move a document, so one atomic batch writes three documents: the ledger `boards/{src}/cardMoves/{cardId}`, the destination card and the source card delete. Rules bind them in both directions with `getAfter()`/`existsAfter()`: the destination must equal the source in `text`, `authorId`, `columnId` and `hidden`, carries `movedFromBoardId` and `movedFromCardId`, and the source delete is only allowed with the matching ledger and destination. A ledger is created once and can never be changed or deleted, so a source cannot be copied twice. Admin has no other way to delete a card it is not allowed to delete already |
| D78 | The moved card gets a new `createdAt` (`request.time`), so it appears at the end of the destination board. Content, author and hidden state are kept |
| D79 | A card id that already has a ledger cannot be reused for a new card in that board (normal create or move). This prevents a stale ledger from blocking a later move |
| D80 | Admin may `list` boards (to choose a destination). All other users keep `list: false` |
| D81 | One move per batch is the design. The 20 document access call limit allows at most 4 cards per batch (measured on the emulator), so the UI moves one card at a time |
| D82 | UI: a compact action menu on each card, visible only to admin, in the existing wooden pixel style, with icons for hide/unhide and move. Moving asks for confirmation and shows success and error messages. No permanent buttons are added to every card for other users. Deploying Rules and testing against the real project are separate steps that need owner approval; nothing is deployed by this work |

## Board screen redesign (F18), owner approved the plan with the recommended defaults

| ID | Decision |
| --- | --- |
| D83 | F18 changes the look of the Board screen only. Firestore Rules, data, auth, Login, Setup, Dashboard behavior and the F17 admin controls are unchanged. The board keeps its 3 columns (D1: Went Well, To Improve, Ideas); the reference's 5 columns are not adopted |
| D84 | No likes or votes (voting stays unapproved). The reference's avatars and Anonymous author are not adopted: a card shows the stored author name and a relative time computed from `createdAt` (`just now`, `5m ago`, `2h ago`, `3d ago`) |
| D85 | The Board uses the Dashboard scene: the fixed countryside backdrop, the `RETRO ROOM` navbar (`DashboardHeader current="board"`: Home is highlighted like in the reference, Retro links to `/dashboard#retro`) and the proportional `--u` unit. The global music control is kept. The shared header of other screens is not modified |
| D86 | Each column has a framed header with a pixel icon, its English label, a card count and a `+` button. The `+` button opens the existing add-card form inline for that column; the form closes after a successful add. Card colors: Went Well green, To Improve red, Ideas purple |
| D87 | Layout: the three columns sit in the same 82% wide column as the navbar from 64rem up, and stack in one column below it. Completed boards stay read-only (no `+` button), and the join, loading, error and not-found states use the same scene. The waiting (Title) screen keeps its own existing layout in this step |
| D88 | Verification targets: 375x812, 768x1024, 1280x720, 1852x849 (the reference size) and 1920x1080, no horizontal scroll, no overlap, readable contrast. Nothing is committed or deployed without owner approval |

## Local mock mode (F19), owner approved

| ID | Decision |
| --- | --- |
| D89 | Mock mode is chosen at start-up with `NEXT_PUBLIC_MOCK_MODE=true` (`pnpm dev:mock`). It replaces Firebase Auth and Firestore with an in-memory backend (`lib/mock/backend.ts`); no network call to Firebase is made. No production code path is commented out or removed |
| D90 | Mock mode is development only: `isMockMode()` is false in production builds and off `localhost`/`127.0.0.1`, and a banner states that data is fake. It wins over emulator mode when both are set |
| D91 | The mock user is the admin identity (`thirapong.pin@ascendcorp.com`, verified) with a player name, so every admin control can be tried. Demo data: two in-progress boards and two other players. State is kept in `localStorage` (`retro-room:mock-state`); clear that key to reset |
| D92 | The mock backend does NOT run Firestore Security Rules. It is for looking at and clicking through the UI only. Rules and real access are still verified with `pnpm test:rules`, `pnpm test:integration` and the emulator. Real Google sign-in is not part of mock mode |
| D93 | While login and Firebase deployment are blocked, `pnpm dev` starts in mock mode by default (owner request). `pnpm dev:firebase` is the old behavior against the real project, `pnpm dev:emulator` is unchanged. Switch `dev` back when Firebase is ready |

## Skip the Dashboard (F20), owner confirmed removing the page; the details below are the recommended defaults

| ID | Decision |
| --- | --- |
| D94 | The Dashboard page is removed. `/boards` (new) is an invisible launcher: it picks a board and replaces the URL with `/boards/{id}`. `/dashboard` only redirects to `/boards` so old links keep working. F16 (D66 to D73) page content for the Dashboard is superseded; the scene, navbar and icons are still used by the Board |
| D95 | Which board opens: the board the user opened last on this device (`localStorage` key `retro-room:last-board`) if they are still a member of it, otherwise the board they joined most recently. If the user has no board yet, one named `My Retro` is created and opened |
| D96 | Creating and switching boards moves to the Board screen: a board switcher (select of the user's boards) and a `+ บอร์ดใหม่` form with the existing title rules (1 to 80 characters). Board creation logic itself (`createBoard`) is unchanged |
| D97 | Joining another person's board still works through the shared link and the existing join prompt |
| D98 | Navbar: Home and Retro both open the launcher (so they return to the user's current board). Post-login, the home route and Setup also go through `/boards` |
| D99 | The launcher reads the user's memberships with the same collection-group query as the old Dashboard, so it still needs the `members.uid` index on the real project. Mock mode (F19) and the emulator are not affected. Page-specific Dashboard CSS is left in place for now (dead rules, to clean up later) |

## Admin delete (F17 amendment), owner request

| ID | Decision |
| --- | --- |
| D100 | The admin card menu gets a third item, delete (`ลบการ์ด`), with a confirmation dialog. Rules: the admin may delete any card of an in-progress board without being a member; completed and waiting boards stay untouched. This amends D77, which said the admin had no other way to delete a card: a ledger is still the only way to create a moved copy, and creating a copy still needs the source delete in the same batch. The existing delete rights of authors and board owners are unchanged. Deleting is permanent |

## Admin column move (F17 amendment), owner request

| ID | Decision |
| --- | --- |
| D101 | The admin card menu lists `ย้ายไป <column>` for each of the other two columns, so a card can move between Went Well, To Improve and Ideas on the same board. Rules: the admin may change only `columnId` (to one of the three valid columns) and `updatedAt` of a card on an in-progress board, without being a member; text, author and hidden state cannot change in the same update. Authors, owners and members still cannot change a card's column (D-column immutability stands for them). No drag and drop |

## Stack cards (F21), owner confirmed the three display and interaction choices

| ID | Decision |
| --- | --- |
| D102 | Only the admin stacks and unstacks cards, on an `in-progress` board, without being a member. A card has an optional `groupId` (string of 1 to 64 characters, or `null`). Cards with the same `groupId` in the same column form a stack. A `groupId` that only one card has is shown as a normal card. By convention the `groupId` is the id of the first card put in the stack |
| D103 | Display: a collapsed stack shows its first card on top with a count badge and layered edges behind it. Clicking the stack opens it to show every card of the group (each with its own menu); clicking again folds it |
| D104 | Stacking by dragging: the admin drags a card onto another card or stack. If the target is in another column, the dragged card moves to that column and joins the stack there. The drop updates the dragged card and, when the target had no group yet, the target too, in one batch |
| D105 | Fallback for touch and keyboard: the admin card menu has `ซ้อนกับการ์ดอื่น...` (a dialog with a list of the other cards) and, for a card in a stack, `แยกออกจากกอง`. Drag and drop is not available on touch screens |
| D106 | Rules: the admin may change only `groupId`, `columnId` (valid column) and `updatedAt` of a card on an in-progress board, without being a member. Nobody else can change them. The Rules do not check that a group exists or that the group is in one column; the admin is trusted for that (D74) |
| D107 | A card hidden from others (D76) stays hidden inside a stack; other members see the stack without it. A card moved to another board (D77) arrives without a group. Deleting a card (D100) leaves the rest of its stack as is |
| D108 | No change for authors, owners and members: they cannot stack, unstack or change columns. No new package; HTML5 drag and drop is used |

## Board timer (F22), owner confirmed the three choices; the board switcher is removed (F20 amendment)

| ID | Decision |
| --- | --- |
| D109 | The board switcher and the `+ บอร์ดใหม่` form are removed from the Board screen (owner request); this supersedes D96. The heading row keeps only the chip `Member · N คน · IN PROGRESS`, the timer and the share and end buttons. Consequence: the app no longer has a place to create or switch boards. The launcher (D94, D95) still opens the last board or creates `My Retro` when the user has none |
| D110 | Timer: a countdown. The admin picks a length (3, 5, 10 or 15 minutes, or 1 to 120 custom minutes) and starts it; the admin can stop it. Only one timer per board |
| D111 | Shared: the board document has `timerEndsAt` (timestamp) and `timerDurationSec` (integer), both `null` or absent when no timer runs. Every browser shows the remaining time from `timerEndsAt`, so all members see the same countdown. The end time is computed from the admin's clock (Rules only check it is in the future and at most 2 hours ahead), so browsers with a wrong clock show a time that is off by the clock difference |
| D112 | Rules: the admin may change only `timerEndsAt`, `timerDurationSec` and `updatedAt` of an in-progress board, without being a member: `timerEndsAt` null, or a timestamp later than the request time and at most 2 hours later; `timerDurationSec` null, or an integer from 1 to 7200. The owner's own rights on the board (rename, start, complete) are unchanged. Nobody else can change the timer |
| D113 | When time runs out, a small alert appears in the middle of the screen (not a blocking modal) and a short soft beep plays if the browser allows sound. Writing cards is never blocked by the timer |
| D114 | The timer is shown while the board is in progress. A completed board shows no timer. Nothing stops a card being written after time is up |
| D115 | Not in this step: pause and resume, extending a running timer (stop and start again instead), per-phase timers, timer history |

## Session stepper (F23), owner confirmed the four choices

| ID | Decision |
| --- | --- |
| D116 | The `RETRO ROOM` navbar (brand, Home, Retro, player name, logout) is removed from the Board screen and replaced by a step bar of six steps: 1 เขียน, 2 ทบทวน, 3 โหวต, 4 ให้คะแนนตัวเอง, 5 โฮสต์คนถัดไป, 6 สรุป. Done steps show a check, the current step is highlighted, later steps show their number. Below it a panel names the current step, explains it and, for the admin, has a next-step button. This supersedes D85 (Dashboard navbar on the Board) |
| D117 | The step is shared: the board document has `phase`, an integer from 1 to 6 (absent means 1). Only the admin changes it, on an in-progress board, without being a member; the admin can click any step to jump to it or use the next-step button. Everyone else sees the same step and cannot change it |
| D118 | Only steps 1 and 2 have real content (writing cards; reviewing together, where the admin can already stack, hide and move cards). Steps 3 to 6 are placeholders that show `เร็ว ๆ นี้`: voting, self-score, next host and summary are NOT built, and voting is still not approved in the requirements |
| D119 | The step is only an indicator. It never blocks writing, editing, deleting, stacking or the timer. The description texts must not claim restrictions that do not exist |
| D120 | The player name and a logout button move to a small chip in the top right of the Board screen, shown in every Board state (loading, join, error, live). The brand logo, Home and Retro are gone from the Board; the launcher at `/boards` is still the route after sign-in |
| D121 | Rules: the admin may change only `phase` (integer 1 to 6) and `updatedAt` of an in-progress board. The owner's rename, start and complete rights and the admin's timer rights (D112) are unchanged. A board without `phase` counts as step 1 |
| D122 | A completed board shows the step bar read-only at the step it ended on. A waiting board (Title screen) shows no step bar |
| D123 | Not in this step: a step timer per phase, automatic moves between steps, step history. The Dashboard-style navbar code and CSS are left in the repository, unused by the Board, for later clean-up |

## Google profile photo in the account chip (F23 amendment), owner request

| ID | Decision |
| --- | --- |
| D124 | The account chip shows the signed-in user's Google profile photo (`user.photoURL`) as a 30 px round avatar before the player name; if there is no photo or it fails to load, the first letter of the player name is shown. The player name is still the name the player chose (D24 is unchanged: the Google name is not used). The Google email and full name are not shown. The photo is shown only to its own user in this chip; showing other players' photos (for example on cards) needs the `photoURL` stored on the profile to be readable by other members and is not part of this step |

## Pixel font TA GBA monothai MAX (owner request), amends D35

| ID | Decision |
| --- | --- |
| D125 | The pixel font (`--font-pixel`, class `font-pixel`) changes from Press Start 2P to TA GBA monothai MAX (TA Font, Taweechai Assawarangsitsang, SIL Open Font License 1.1, free for commercial use and embedding). Scope: headings and labels only (dialog titles, timer clock, time-up box, Title screen, loading, emulator and mock banners, Login and Setup pixel text). IBM Plex Sans Thai stays the font for body text, cards and descriptions. This supersedes the "no new font" part of D35. The owner downloaded the font; the TTF of the MAX variant is stored in `app/fonts/` with `OFL.txt` and `FONTLOG.txt` (the license must travel with the font). The Mini variant is not used. The font is a single regular weight with Thai and Latin; it is drawn on 16 pixels per em, so pixel text uses multiples of 16 px (16, 32, 48) |

## Private writing step (F24), owner request; the details marked "default" are my recommended choices

| ID | Decision |
| --- | --- |
| D126 | In step 1 (เขียน) a member can read only the cards they wrote. Other members' cards are not readable, so they are not shown and not counted. From step 2 (ทบทวน) on, every member reads all cards that are not hidden by the admin (D76). This amends D119: the step now controls who can read cards. It still blocks nothing else: writing, editing, deleting and the timer work in every step |
| D127 | Default: the admin still reads every card in every step (D76), because the admin runs the session. The board owner has no extra rights: an owner who is not the admin sees only their own cards in step 1 |
| D128 | Default: moving the step back to step 1 hides other members' cards again; moving forward shows them. Cards written by a member in step 2 or later are visible to others at once |
| D129 | A completed board shows every non-hidden card to its members whatever step it ended on, so a session ended in step 1 does not lose its cards. A board without a step counts as step 1 (D117) |
| D130 | Enforced by Rules, not by the interface: the card read rule checks the board's `phase` and `status`. A member's subscription uses two queries (D76); in step 1 only the query for their own cards is allowed, so the client subscribes by step and renews the subscription when the step changes. The Rules cannot hide a card's existence from the count the member's own query returns, which is only their own cards |

## Writing only in step 1 (F25), owner request; the details marked "default" are my recommended choices

| ID | Decision |
| --- | --- |
| D131 | A member can add a new card only while the board is in step 1 (เขียน; a board without a step counts as step 1, D117). From step 2 (ทบทวน) through step 6 nobody can add a card: the `+` buttons and the add form are hidden and the Rules reject the write. Amends D119 and D126 |
| D132 | Default: this blocks only creating cards. Editing the text of one's own card, deleting a card (author or board owner, D100 for the admin), stacking, hiding, moving and the timer keep working in every step. Superseded by D143 and D144: from step 2 on members cannot edit or delete either |
| D133 | Default: an admin move of a card into another board (D77) still creates the copy there whatever that board's step is, because it moves an existing card and is not new writing. Moving the step back to step 1 lets members write again |
| D134 | The step 2 text says that adding cards is closed. A member who had the add form open when the admin moved the step sees the write rejected with the normal permission error message |

## Voting (F26), owner request: a vote button with at most 3 votes; details marked "default" are my recommended choices

| ID | Decision |
| --- | --- |
| D135 | Each member has at most 3 votes per board. Votes can be placed only while the board is in step 3 (โหวต) and in progress. Default: one vote per card per member (pressing the button again takes the vote back), so 3 votes means up to 3 different cards. A member can vote for any card they can see, including their own. Votes can be changed freely during step 3 and are frozen after it |
| D136 | Default: the vote count of a card is shown to every member from step 3 on, also while voting is open. Who voted is not shown in the interface. Limit: the vote records are readable by board members (see D137), so a member who reads the database directly can see who voted for what; the Rules do not give a secret ballot |
| D137 | Data: one document per voter, `boards/{boardId}/voters/{uid}`, with `cardIds` (a list of at most 3 distinct card ids, each a string of 1 to 64 characters) and `updatedAt`. Rules: a member writes only their own document, only while the board is in progress and in step 3; board members and the admin can read all voter documents. The Rules enforce the limit of 3 and distinct ids; they do not check that an id is a real card of the board |
| D138 | Only board members vote. The admin votes only if they are also a member of the board |
| D139 | In step 3 the step panel shows `โหวตเหลือ N/3` and each card has a vote button with its count; when a member has no votes left, the button on cards they have not voted for is disabled. From step 4 on, and on completed boards, counts are shown without a working button. Steps 1 and 2 show no vote UI |
| D140 | Deleting a card leaves its id in voter documents; counts ignore ids of cards that no longer exist. A card moved to another board arrives without votes (it is a new card there). A stack (D102) shows the votes of each card separately |
| D141 | Not in this step: a results list or summary (step 6), a secret ballot, a reset of votes by the admin, votes on more than one column rule, vote history |
| D142 | Step 3 stops being a placeholder: its description reads "เลือกการ์ดที่สำคัญที่สุด โหวตได้สูงสุด 3 อัน". Steps 4 to 6 stay placeholders. Writing stays closed in step 3 (D131) |

## No editing or deleting after step 1 (F27), owner request

| ID | Decision |
| --- | --- |
| D143 | From step 2 (ทบทวน) through step 6, and on a board that is not in step 1, a member cannot edit the text of a card or delete a card: the `แก้ไข` and `ลบ` buttons are not shown, an edit form that was open closes, and the Rules reject the write. This covers authors and the board owner (the owner's delete right on others' cards, D15 era, also stops after step 1). In step 1 both work as before. Replaces the default of D132 |
| D144 | The admin tools are not affected: the admin can still delete any card of an in-progress board (D100), hide, stack and move cards and change columns in every step. Moving the step back to step 1 gives members edit and delete again. The step 2 text reads "ขั้นนี้เขียน แก้ไข หรือลบการ์ดไม่ได้" |
| D145 | Step 4 shows no columns and no cards (cards stay hidden for everyone, the admin included, in the UI). The page shows a row of score buttons, the average and each member's score. Each member has one score per board; pressing another button changes it. The score can be written only by that member, on an in-progress board in step 4 | Owner request, options approved in chat: one score per member, whole board hidden |
| D146 | Scale: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. The Rules reject any other number, type or extra field. No delete: a score can be changed in step 4 but not removed | Owner example `1 1.5 2, 2.5 to 5` |
| D147 | Visibility: every board member and the admin read all scores (like votes, D136); the page shows the average (rounded to 2 decimals) and how many members chose each score. Scores are shown only in step 4; later steps do not show them yet | Approved option |
| D148 | Moving the step away from 4 freezes the scores (no writes); moving back to 4 lets members change them again. The admin does not rate unless a board member. Cards are only hidden by the page, not by Rules: the Rules for reading cards are unchanged (D126) | Default |
| D149 | Step 5 shows a wheel with one segment per board member (sorted by uid so every device draws the same wheel) instead of the columns. Only the admin sees the spin button. The admin's client picks the winner at random and stores `nextHostUid` and `nextHostSpunAt` on the board document; every client animates the same spin from that result | Owner request; options approved in chat: random-name wheel, the winner is the next host. The wheel lives inside step 5, not in a new step (default) |
| D150 | Rules: the admin may update only `nextHostUid`, `nextHostSpunAt` and `updatedAt` of an in-progress board that is in step 5; `nextHostSpunAt` and `updatedAt` equal the request time; `nextHostUid` must be the uid of a member of the board. Nobody else can spin | |
| D151 | Replay: a result younger than 10 seconds is spun on screen (5 seconds); an older result is shown as it ended, so a member who opens the board later sees the winner without a spin. The admin can spin again; the last result wins | Default |
| D152 | The winner is only displayed; the app does not change owner or permissions. The result stays stored when the step moves away and shows again when the step returns to 5. The admin picks the random winner on their own device, so the draw is not verifiable by others | Default; known limit |
| D153 | A round is `farmGames/{gameId}`, created with `startedAt` = server time; the deadline is exactly `startedAt` + 15 seconds (no `endsAt`). A choice is a member's own `choices/{uid}` document, changeable until the deadline |
| D154 | Players are the members who joined at or before `startedAt` (memberships are append-only, so the list cannot change during a round) |
| D155 | Choices are private: before the deadline a member can only `get` their own choice and cannot `list`; after it every member and the admin can list all choices. Clients read after the local deadline and retry on `permission-denied` |
| D156 | A new round may start when there is none, the last finished, or the last was cancelled and its fallback result is stored. A start is one batch/transaction (game plus `farmActiveGameId`), so only one of two concurrent starts wins |
| D157 | The admin may cancel a selecting round (no winner); a cancelled round gets one fallback wheel result on the board, only while it is the active round |
| D158 | A result is stored once per round (`nextHostGameId` != gameId before, == after); stale or repeated game ids cannot overwrite it. The legacy wheel (D149) is refused on a board that has had a round |
| D159 | A player who did not choose gets the field `fnv1a32("gameId:uid") mod 3`; automatic assignments count in the populations. If nobody chose, no field is shown and the all-wheel is used |
| D160 | Score = base yield / players on the field; fields are compared by exact cross-multiplication, the two-decimal score is display only |
| D161 | Scoring, tie groups and the random wheel pick run on the clients and are trusted to the admin; Rules check only who may win, when and once |
| D162 | Start, finish, cancel and fallback are transactions that re-check the documents on every retry; Rules re-check the same invariants (`getAfter` for the game and board pair) |
| D163 | Host model (owner-approved, per board): the Host of a board is `hostUid`, or the board's `ownerId` while `hostUid` is absent. `pastHostUids` lists everyone who handed the role over. Only the admin changes them, only in a hand-over (below). A person who was merely selected as next Host is not a past Host |
| D164 | Everyone plays: the current Host and past Hosts see the game, choose a field, are counted in the field populations, change every score and are auto-assigned like anyone else. They are excluded only from becoming the next Host |
| D165 | Winner: rank the occupied fields by score, take the best group that holds at least one eligible player (not the Host, not a past Host), and use only its eligible players: one is a direct winner, several go to the wheel. If nobody chose, the all-wheel holds only eligible players; a cancelled round's fallback wheel too. Rules refuse a stored winner who is the Host or a past Host, in every resolution |
| D166 | Hand-over: the admin may hand the role to the stored next Host once the active round's result is stored: `hostUid` = that person, the old Host is appended to `pastHostUids` in the same write. It is the only way a person becomes a past Host. Open decision: when every player is the Host or a past Host the app selects nobody and shows a notice; the admin must decide what to do (no new rule invented) |

