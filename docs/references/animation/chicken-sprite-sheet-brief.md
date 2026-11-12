# Chicken walk and peck: sprite sheet brief (animation phase 3)

For the project owner to generate with OpenAI's image generation tool. The prompts are written in English because the tool follows English best. Nothing here has been generated yet.

## What to attach to the tool

1. `docs/references/animation/chicken-reference-on-magenta.png` (the exact character, facing right, on flat magenta)
2. `docs/references/retro-room-reference.png` (the approved scene, for style only)

## What is needed

8 frames of the same chicken, all facing RIGHT (the left-facing frames are mirrored by the build script, so do not ask for them):

| Cell | Frame | Pose |
| --- | --- | --- |
| Row 1, col 1 | W1 walk contact | Right leg forward, left leg back, body level, head neutral |
| Row 1, col 2 | W2 walk passing | Legs together under the body, body 2 px higher, head slightly forward |
| Row 1, col 3 | W3 walk contact | Left leg forward, right leg back, head slightly forward |
| Row 1, col 4 | W4 walk passing | Legs together, body lowest, head back to neutral (loops to W1) |
| Row 2, col 1 | P1 peck stand | Standing still, same pose as the attached reference |
| Row 2, col 2 | P2 peck lean | Body tilts forward, head half lowered, tail lifts a little |
| Row 2, col 3 | P3 peck hit | Head down, beak touching the ground, tail up, one foot slightly back |
| Row 2, col 4 | P4 peck rise | Head rising, body returning (loops to P1) |

## Option A: one sheet (try this first)

Paste this prompt together with the two attached images:

```
Use the first attached image as the exact character reference: the same chicken, the same
proportions and colors (cream-white body with warm beige shading, big red comb, red wattle,
red eye patch with a black eye, small yellow-orange beak, yellow-orange legs and feet), the
same pixel-art look with chunky visible pixels, soft dithered shading, thin dark-brown edge
shading and a slight top-down three-quarter camera. Use the second image only as a style
reference. This is an original character: do not copy or imitate any existing video game
character, sprite or logo.

Create ONE sprite sheet image, 1536 x 1024 pixels, with 8 equally sized cells in 4 columns
and 2 rows (each cell 384 x 512 pixels). The background of the whole image is one flat solid
color, exactly #FF00FF (pure magenta): no gradient, no noise, no ground, no grass, no cast
shadow, no text, no numbers, no labels, no grid lines, no borders.

The chicken faces RIGHT in every cell. Draw the same chicken in all 8 cells, centered
horizontally in its cell, with its feet resting on the same horizontal baseline in every cell
(about 78% down the cell), and about the same body size in every cell (within 3%). Keep at
least 40 pixels of empty magenta between the chicken and every cell edge.

Row 1, a walking cycle, left to right:
1. Right leg forward, left leg back, body level, head in a neutral upright position.
2. Legs together under the body, body slightly higher, head slightly forward.
3. Left leg forward, right leg back, head slightly forward.
4. Legs together under the body, body at its lowest, head back to neutral.

Row 2, a pecking cycle, left to right:
1. Standing still, the same pose as the reference image.
2. Body tilts forward, head half lowered, tail lifts a little.
3. Head down and the beak touching the ground line, tail up, one foot slightly back.
4. Head rising, body returning toward the standing pose.

Style rules: hard pixel edges with no anti-aliased blur or glow, a limited palette close to
the reference, light coming from the top left, no pink or magenta tones on the chicken, no
motion lines, no eggs, no other animals, no people.
```

## Option B: two images (if Option A drifts between frames)

Generate the walking row and the pecking row as separate images. Send the same two attached
images each time, and for the second image also attach the accepted first one so the look
stays consistent. Use the Option A text with these changes:

- Replace the layout paragraph with: "Create ONE image, 1536 x 1024 pixels, with 4 equally sized
  cells side by side (each 384 pixels wide and 1024 pixels tall). Draw the chicken centered
  horizontally in each cell and with its feet on one baseline about 75% down the image."
- Keep only the walking list (first image) or only the pecking list (second image).

## If the result is poor

- Ask for "the same character as the attached image, pose changes only" and regenerate. Do not
  edit the prompt toward other breeds or styles.
- Generate several variants and keep the one whose frames match best. Drift in comb size,
  leg color or body proportions between frames is the usual failure.
- A frame that is wrong can be regenerated alone: attach the best sheet and ask for that cell
  only, in the same pose list entry.

## Acceptance checklist (the build script and a visual check will repeat this)

- 8 frames, one chicken each, in the layout above, all facing right
- Same character in every frame (comb, wattle, colors, proportions) and same size within about 3%
- Feet on one baseline; nothing touches a cell edge
- Background is clean flat magenta; the chicken contains no magenta or pink
- Walk reads as a cycle (W4 leads back into W1); peck frame P3 shows the beak at the ground
- No text, numbers, shadows, grid lines or other objects
- The owner has checked that the chicken does not look like a Harvest Moon sprite

## Delivery

Save the file or files to `docs/references/animation/raw/` (not served by Next.js), for example
`chicken-sheet.png` (Option A) or `chicken-walk.png` and `chicken-peck.png` (Option B), and tell
Claude. Do not edit them by hand first.

## Provenance record (fill in when generated)

| Field | Value |
| --- | --- |
| Tool and model | |
| Date | |
| Generated by | |
| Option used (A or B) | |
| Number of attempts | |
| Chosen file names | |
| Notes on similarity review | |

## What happens next (not started)

When the real image arrives, `docs/references/extract-sprite-sheets.py` will remove the magenta
with edge cleanup, cut the cells, trim and align each frame on the feet baseline and body
centre, scale to the current chicken height (176 px), mirror the frames for walking left, and
write `public/art/anim/chicken-loop.png` plus its `sheets.json` entry. Then `LoginScene` will
play one loop (walk right, peck, walk left, peck, about 12 s) with the chicken moving across a
patrol area on screens at or above 48rem and standing in place on phones. The current animation
files total 444 KB of the 600 KB budget, so the chicken sheet has to stay near 150 KB.
