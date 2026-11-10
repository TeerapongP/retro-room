import type { FarmFieldId } from "@/lib/crowded-farm";

/** Pixel art for the three crops, drawn on a 12 by 14 grid. Each letter is a colour, a dot is empty. */
const PALETTE: Record<string, string> = {
  g: "#58a83f",
  G: "#2f6e2c",
  o: "#f28b25",
  O: "#c25f18",
  y: "#f8d94a",
  Y: "#d6a223",
  r: "#e23d4f",
  s: "#ffe9a0",
};

const CROP_ROWS: Record<FarmFieldId, readonly string[]> = {
  carrot: [
    "...g..g.g...",
    "..gGg.gGg...",
    "...gGgGg....",
    ".....gG.....",
    "....ooOO....",
    "...ooooOO...",
    "...oooooO...",
    "...ooOoooO..",
    "....ooooOO..",
    "....oooOO...",
    ".....ooOO...",
    ".....oOO....",
    "......OO....",
    "......O.....",
  ],
  corn: [
    ".....yy.....",
    "....yYyy....",
    "...yyYyyy...",
    "...yYyyyY...",
    "...yyyYyy...",
    "...yYyyyy...",
    "..gyyyYyyg..",
    "..ggyyyygg..",
    "...gggggg...",
    "....gGGg....",
    ".....gg.....",
    ".....G......",
  ],
  strawberry: [
    "....gGgG....",
    "...gggggg...",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    ".rrsrrrsrrr.",
    ".rrrrrrrrrr.",
    ".rsrrsrrrsr.",
    "..rrrrrrrr..",
    "..rrsrrsrr..",
    "...rrrrrr...",
    "....rrrr....",
    ".....rr.....",
  ],
};

type FarmCropProps = { field: FarmFieldId; className?: string };

export function FarmCrop({ field, className }: FarmCropProps) {
  const rows = CROP_ROWS[field];
  return (
    <svg
      className={className}
      viewBox={`0 0 12 ${rows.length}`}
      shapeRendering="crispEdges"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {rows.flatMap((row, rowIndex) =>
        Array.from(row).flatMap((letter, columnIndex) =>
          letter === "." ? [] : [
            <rect key={`${rowIndex}-${columnIndex}`} x={columnIndex} y={rowIndex} width="1" height="1" fill={PALETTE[letter]} />,
          ],
        ),
      )}
    </svg>
  );
}
