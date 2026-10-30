# UI Design System

Direction (owner approved): cozy Japanese countryside farming RPG, late-1990s console feel, inspired by Harvest Moon: Back to Nature (PS1). All assets must be original. No copied sprites, characters, logos, music, or artwork.

Avoid cyberpunk neon, sci-fi blue glass, glassmorphism, generic SaaS styling, heavy 3D, distracting animation.

## Color tokens (approved)

| Token | Hex | Name |
| --- | --- | --- |
| `--color-grass` | `#7FA65A` | Grass Green |
| `--color-forest` | `#426B3F` | Forest Green |
| `--color-cream` | `#FFF1CF` | Warm Cream |
| `--color-wood` | `#96643A` | Wood Brown |
| `--color-bark` | `#493521` | Dark Brown |
| `--color-sky` | `#91C8E4` | Sky Blue |
| `--color-gold` | `#E6B65A` | Harvest Gold |
| `--color-berry` | `#D87966` | Soft Red |

Contrast (estimate by hand, NOT measured): white text on Grass Green is likely below 3:1. Use Dark Brown text on green surfaces. Verify every text and background pair with a contrast tool before finishing.

## Typography (approved)

| Role | Font | Notes |
| --- | --- | --- |
| English display | Press Start 2P | Weight 400 only, no Thai glyphs. Short Latin labels and headings only |
| Thai and body | IBM Plex Sans Thai | Weights 100 to 700, `thai` subset available |

Both load through `next/font/google` (verified present in Next 16.4.3 font metadata). Body paragraphs never use the pixel font. Thai headings use IBM Plex Sans Thai.

## Components (only those used by approved screens)

Wooden panel, dialogue box, pixel-outline button, board card (farmhouse), sticky note (wooden notice), loading indicator. Create when the first screen needs them.

## Screens

| Screen | Layout idea |
| --- | --- |
| Login | Wooden signboard, dialogue box, Google button |
| Dashboard | RPG menu panel, board cards, "create board" action (redesigned in F16, see below) |
| Join | Dialogue box asking to confirm joining the board |
| Board | Notice board with 3 column panels, wooden sticky notes, member list |

Business labels stay literal (Board, Card, Member). Theming is decoration only (D10: Thai primary, short English labels).

## daisyUI (D21, D27)

`daisyui` 5.x runs as a Tailwind 4 plugin in `app/globals.css`: `@plugin "daisyui" { themes: false; }` disables every built-in theme and `@plugin "daisyui/theme"` defines `harvest` (default, light only). Mapping: base-100 Warm Cream, base-content Dark Brown, primary Grass Green, secondary Wood Brown, accent and warning Harvest Gold, neutral Dark Brown, info Sky Blue, success Forest Green, error Soft Red; base-200 `#F3E0B0` and base-300 `#E3C88F` are derived cream shades (owner approved). Radius 0, border 3px, depth 0, noise 0. `globals.css` adds a dark brown border and hard shadow to `.btn`, `.input`, `.alert`. Phase A uses daisyUI only on `/setup` (`card`, `fieldset`, `input`, `btn`, `alert`, `loading-dots`); other screens keep `.pixel-*` classes until Phase B is approved. No "default look" daisyUI styling is allowed to show.

## Player Name Setup (F9)

`/setup`: wooden "NEW VILLAGER" sign, cream dialogue card (`card pixel-panel`), question "คุณชื่ออะไร?", input with counter, live preview line with a blinking block cursor, and a Press Start 2P "OK" button. The input uses the native `maxLength` (UTF-16 units, same as Rules). Scenery reuses `PixelScenery`.

## Player Name Setup redesign (F13)

Replaces the F9 layout above. `/setup` is the farm scene from `retro-room-player-name-reference.png` (D46): scene plate `public/art/setup/scene.png` under three cream panels (`pixel-panel`), "Your name?", "Name" with a real `<input id="player-name">` (tan inset, block caret), and the keyboard. Farmer, chicken and dog are separate sprites; flowers and farmer animate (D52). A Thai notice panel shows the D24 message, the `n/20` counter and, in a `RetroAlert`, validation or save errors.

Fullscreen scene (D58, replaces the fixed 3:2 stage of D53): on the stage layout `.setup-scene` defines `--scene-w: min(max(100vw, 150dvh), 104vw, 180dvh)` and `--scene-h`. `.setup-scene-art` is an absolutely centered `scene-w` x `scene-h` layer that draws `scene.png`; `.setup-stage` has the same size (`--stage-w: var(--scene-w)`), is `shrink-0`, has no background of its own, and holds the panels and sprites in percentages and `cqw`, so everything stays registered to the scenery while the main element (`h-dvh`, `overflow-clip`) crops the overflow. Cropping never exceeds about 2% per side horizontally or 9% per side vertically. When the scene does not reach an edge, `--feather-x` and `--feather-y` (8% of the scene, limited to band size times 6) fade the art layer out with a `mask-image` over the main element's background, `public/art/setup/grass-fill.png` (128 color tile of 1024 x 1024 px made from clean grass of `scene.png`, drawn at `scene-w * 1024 / 1536` so its pixel density matches). Provenance: the fill is cut from `scene.png`, which came from the reference generated with OpenAI's image generation tool, by `docs/references/build-setup-grass-fill.py`; nothing else is added. Phones and portrait screens keep the stacked layout. Known limits: at ultrawide widths the tree trunk and doghouse that touch the scene's side edges fade into grass instead of continuing, and the fill repeats every tile (about 1300 px at 2560 x 1080), wider than the 308 px bands there.

`RetroKeyboard` (`components/ui/RetroKeyboard.tsx`) is a CSS grid of `<button>` keys: 19 columns by 6 rows on the wide stage (A-E, a-e, 0-2 and Mark, Space, OK in the right column) and 8 columns on narrow screens. Keys set `--wide-*` and `--narrow-*` grid variables. The active key (hover, else focus) gets a gold box and the extracted hand sprite (`public/art/setup/hand.png`) to its left. Keys use Press Start 2P, which has no Thai glyphs, so Thai typed in the input falls back to the system font. Mouse down on a key is cancelled so the input keeps focus. PS1 keyboard navigation (D51): arrows, Enter, Space, Backspace and Escape work while a key has focus; Tab enters from the input; `lib/remove-last-character.ts` deletes by code point. Punctuation keys have no spoken names yet.

## Title Screen and Waiting Room (F8)

Shown on the board page while `status` is `waiting`. Original SVG scenery (`components/PixelScenery.tsx`): drifting clouds, trees, flowers, wooden fence, wooden title sign "RETRO ROOM", a dialogue panel with the board title and joined members. Owner sees a blinking "PRESS START" button (Press Start 2P, real `<button>`). Members see a waiting message and no button. Blink and drift animations stop under `prefers-reduced-motion`. When `completed` the board is read-only.

## Login / Title Screen (F11)

Scene built from layers, not one image. Provenance: the approved reference `docs/references/retro-room-reference.png` was generated with OpenAI's image generation tool for this project (not hand drawn, not from Harvest Moon). The layers in `public/art/` were cut from it by `docs/references/extract-login-assets.py` (edge flood fill for sprites and the logo sign, local grass statistics for flowers, small isolated specks removed). `grass-plate.png` is a sprite-free grass collage made from clean patches of the reference. Shadows under sprites were not kept, so `.login-shadow` recreates them in CSS. `google-g.png` is Google's official G.

| Layer | File | Notes |
| --- | --- | --- |
| Grass | `grass-plate.png` | CSS `cover`, pixelated, class `.login-grass` |
| Logo, sign, "Team Retro" | `logo-sign.png` | Baked lettering; the accessible name is the `alt` text on the `<h1>` image |
| Sprites | `chicken.png`, `farmer.png`, `dog.png` | One wrapper per sprite so frames can replace them later; single frame today |
| Flowers | `flowers-{white,yellow,pink}-N.png` | Anchored to the viewport edges on desktop; four of them on phones |
| Button | HTML `<button class="btn btn-wood">` via `RetroButton` | Gold frame, corner studs, official G, label in IBM Plex Sans Thai bold |
| Credit | HTML text in Press Start 2P with a dark outline | Exactly `© Bee from Alcyone Team` |

Layout: positions come from the reference pixel boxes as percentages of a stage that keeps the 1448:1086 ratio (`--stage-w: min(100vw, 100dvh * 1448/1086)`); on screens narrower than 48rem the layers stack. Components: `components/LoginScene.tsx`, `components/ui/RetroButton.tsx`, `RetroAlert.tsx`, `RetroLoader.tsx`, `GoogleLogo.tsx`. Animation: `.login-bob` on the chicken and dog (stepped, 2px) and nothing on the farmer; all animation stops under `prefers-reduced-motion`. A visible white focus outline is set on `.btn-wood`.

## Login animation, phase 1 (F12)

Provenance: the sheets in `public/art/anim/` are derived from the single-frame layers (which came from the approved reference, generated with OpenAI's image generation tool) by `docs/references/build-derived-sheets.py`. The script moves existing pixels only: each flower sheet shears rows sideways (up to 2 px at the top, root fixed, 3 px transparent padding per side, tiny floating specks removed first); `farmer-breathe` lifts a smooth chest region by 0, 1, 2, 1 px. No new art was drawn. `sheets.json` is the single source of truth for frame counts and sizes and is checked by `tests/assets/sprite-sheets.test.ts` (`pnpm test:assets`).

`components/SpriteAnimation.tsx` shows a strip with `background-size: frames * 100%` and animates `background-position-x` from 0% to 100% with `steps(frames, jump-none)`; duration is `frames / fps`. The seven flower groups use 2.5 fps with a 0.45 s offset each; the farmer uses 2 fps (its frames now come from the owner's sheet, see below). Under `prefers-reduced-motion` the global rule removes the animation so frame 1 stays. The dog uses `dog-wag` (below). The chicken still uses the single frame with the stepped 2 px bob.

## Login animation, farmer breathing from the owner's sheet (F12, D59)

Provenance: the farmer frames come from a sheet the owner generated with OpenAI's image generation tool (not hand drawn, not from Harvest Moon) using `docs/references/animation/farmer-sprite-sheet-brief.md`; the raw sheet is kept unmodified in `docs/references/animation/raw/farmer-sheet.png`. `docs/references/extract-sprite-sheets.py farmer` removes the magenta (a slightly looser key than the chicken's, for the darker blends along the outline), cuts the 8 cells, scales by 0.637 so the rest frame is 195 px tall, aligns on the baseline and silhouette centre, and writes a 64 color strip. The generated frames are redrawn, so head, cap and boots differed a little from frame to frame (measured). `stabilize` therefore keeps generated pixels only inside the chest box (canvas x 60 to 185, y 85 to 150) where the summed color difference passes 120, grown by 5 px; the rest of every frame is the rest frame. `farmer-breathe.png` (4 frames, 228 x 201 canvas, rest offset 3, 3 in `sheets-farmer.json`) replaces the earlier derived strip; `LoginScene` places the canvas so the rest pose stays where the reference has it. Row 2 of the sheet (eyes crack open, brows) was cut but is not used (D43).

## Login animation, phase 2: dog tail wag (F12, D54)

`dog-wag.png` is derived by `docs/references/build-derived-sheets.py` from `dog.png`: pixels with x >= 143 and y <= 62 are removed from the body, then pixels with x >= 143 and y <= 67 (5 px of overlap with the back, to avoid a seam) are rotated about (146, 66) by 0, +14, 0, -14 degrees with nearest neighbour and drawn over the body. The sheet has 8 px of transparent room on top and 10 px on the right so the tail is not clipped (`padTop` and `padRight` in `sheets.json`; `LoginScene` grows the placed box by the same amounts). Frame 1 equals the original sprite, so it is also the still frame under reduced motion. Known roughness: at -14 degrees the tail edge looks slightly frayed because the original edge is not on a pixel grid.

## Login animation, phase 3: chicken walk and peck (F12, D55 to D57)

Provenance: the chicken frames were generated by the owner with OpenAI's image generation tool (not hand drawn, not from Harvest Moon) from the existing chicken sprite and the approved reference, using `docs/references/animation/chicken-sprite-sheet-brief.md`. The raw sheet (`docs/references/animation/raw/chicken-sheet.png`) is kept unmodified; `docs/references/extract-sprite-sheets.py` only cuts, cleans and aligns it (magenta keyed out, one scale factor, common feet baseline, anchor at the centre of the lower body, 64 color palette with hard alpha). Tool, model and attempt details are in the provenance table of the brief; fill it in if it is still empty.

`chicken-walk.png` (4 frames, 8 fps) and `chicken-peck.png` (5 frames, 5 fps, frame 1 is the idle pose) share one 186 x 186 canvas. In `LoginScene` the chicken is a `.chicken-patrol` wrapper (translateX), a `.chicken-facing` wrapper (scaleX flip) and two stacked slots whose opacity switches between the strips. All four CSS animations run on one 10 s loop with `step-end` where they switch, so a walk or peck segment always starts on a whole sprite cycle. The idle frame sits exactly where the original sprite was (`idleLeft` and `idleTop` in `sheets-chicken.json`). On phones the patrol, flip and slot animations are off and only the peck strip loops in place. Under reduced motion the base state is the walk slot hidden and the peck slot showing frame 1.

## Global background music (F14, supersedes the F10 login sound)

`components/BackgroundMusic.tsx` keeps one `Audio("/sound/menu-sound.mp3")` (hidden `<audio>` appended to `body`, `loop`, volume 0.15) behind `createMusicController`, mounted once in `app/layout.tsx` so it survives route changes. Autoplay is attempted once and otherwise started by the first click, touch or key press. The speaker button (`.music-toggle`, 28 px, fixed top right, `btn btn-square btn-sm` with an inline pixel SVG, white focus ring) mutes by pausing, so unmuting resumes in place, and stores the choice in `localStorage`. Hiding the tab pauses and showing it resumes. On the emulator banner the button covers the right end of the banner text, which only shows in emulator mode.

## Retro loading screen (F15)

`LoadingNotice scene` and `AuthLoadingNotice` render `.loading-scene`: a fixed full-viewport layer holding the WebP plate (`next/image`, `priority`, blur placeholder) on a 1672 x 941 stage sized `max(100vw, 100dvh * 16/9)`, so it is cropped and not stretched. On phones (30rem or narrower, portrait) the crop is shifted so the sleeping farmer stays in view. The HTML panel (cream, wood frame, ♥ and "Loading...", Press Start 2P) sits over the old panel position and is clamped inside the viewport; errors and Retry use the same panel with `RetroAlert` and `RetroButton`. The heart keeps the existing `pixel-bounce`. The sleeping farmer breathes (4-frame sheet, 2 fps) and three Z glyphs float up and fade one after another (`.loading-zzz`, `loading-zzz-float`), both placed by percent of the stage from `docs/references/loading-art-manifest.json` and rendered with smooth scaling (the art is not a pixel grid). The global reduced-motion rule stops every loading animation and leaves the Zs visible.

## Dashboard pixel-art redesign (F16, D66 to D73)

Sizing (D73): the Dashboard uses `--u = min(100vw/1852, 1.6px)` and `max(floor, calc(N * var(--u)))` so rectangles match the 1852x849 reference within 2 px; below about 1280 px the rem floors take over (navbar and Start panel are proportionally larger than the reference).

Layers and styles live in `app/globals.css` under the Dashboard comment and in `components/DashboardHeader.tsx`, `DashboardIcons.tsx`, `DashboardSprout.tsx` and `app/dashboard/page.tsx`.

- **Background:** `.dashboard-backdrop` (fixed, `overflow: hidden`, sky color `#0e94fd`) holds `.dashboard-backdrop-art`, the countryside plate at `--scene-w: max(100vw, 100dvh)`, anchored bottom with `left: (100vw - scene-w) * 0.3`, faded at its top 9% by a `mask-image`. At 1852 x 849 it equals the reference; at 1920 x 1080 the whole scene shows with extra sky above; at 768 x 1024 and 375 x 812 the scene is a strip at the bottom with the tree and noticeboard side visible.
- **Frame:** `.dashboard-header` and `.dashboard-panel` share a 9 px `border-image` (an 8 x 8 unit SVG, 3 unit slice) plus `filter: drop-shadow(4px 5px 0 ...)`; the active nav item and the Retro label use a darker variant of the same frame.
- **Navbar:** slim cream bar (max 1520 px) with brand, nav pills, player name and a gold logout button; it wraps on phones (brand and account first, nav below).
- **Start a New Day:** sprout title, a field with a document icon, and the green `+ สร้างบอร์ด` button; the form stacks below 40rem.
- **Retro:** label with calendar icon, then either the board list (`ul` of linked panels) or the empty state; the section keeps `id="retro"` for the nav link.
- **Rendering:** the artwork is drawn with the browser's default smoothing because it is shown scaled down on most screens; the pixel frames and icons use `crispEdges`.

## Accessibility and behavior

- Full keyboard access and visible focus ring on every control.
- Honor `prefers-reduced-motion`. Ambient animation is optional and subtle.
- Touch targets comfortable on mobile. Columns stack on narrow screens.
- Thai and English text readable at body size.
