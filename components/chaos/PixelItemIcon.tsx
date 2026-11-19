import type { ChaosItemId } from "@/lib/chaos/catalog";

const COLORS = ["#4f783d", "#91c7d8", "#d77a65", "#e8b44d", "#94643f", "#6d8c50"];

export function PixelItemIcon({ itemId, label }: { itemId: ChaosItemId; label: string }) {
  let seed = 0;
  for (const character of itemId) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const color = COLORS[seed % COLORS.length];
  const pixels = Array.from({ length: 25 }, (_, index) => {
    const x = index % 5;
    const y = Math.floor(index / 5);
    const mirror = Math.min(x, 4 - x);
    const value = ((seed >>> ((mirror + y * 3) % 24)) + mirror * 7 + y * 11) % 5;
    return { x: x + 1, y: y + 1, fill: value < 2 ? color : value === 2 ? "#fff0c8" : "#543b2a", visible: value < 4 };
  });
  return <svg className="chaos-pixel-icon" viewBox="0 0 7 7" role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width="7" height="7" fill="#e8d4a6" />
    <rect x="1" y="1" width="5" height="5" fill="#94643f" />
    {pixels.filter(pixel => pixel.visible).map((pixel, index) => <rect key={index} x={pixel.x} y={pixel.y} width="1" height="1" fill={pixel.fill} />)}
  </svg>;
}
