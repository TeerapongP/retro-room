const SVG_PROPS = {
  "aria-hidden": true,
  focusable: false,
  shapeRendering: "crispEdges",
} as const;

export function PixelCloud({ className = "" }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} viewBox="0 0 16 6" className={className}>
      <g fill="#ffffff">
        <rect x="3" y="3" width="11" height="3" />
        <rect x="1" y="4" width="3" height="2" />
        <rect x="5" y="1" width="5" height="3" />
        <rect x="9" y="2" width="4" height="2" />
      </g>
    </svg>
  );
}

export function PixelTree({ className = "" }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} viewBox="0 0 12 16" className={className}>
      <rect x="5" y="10" width="2" height="6" fill="var(--color-wood)" />
      <g fill="var(--color-forest)">
        <rect x="3" y="1" width="6" height="2" />
        <rect x="1" y="3" width="10" height="4" />
        <rect x="2" y="7" width="8" height="3" />
      </g>
      <rect x="3" y="3" width="2" height="2" fill="var(--color-grass)" />
    </svg>
  );
}

export function PixelFlower({
  petal = "var(--color-berry)",
  className = "",
}: {
  petal?: string;
  className?: string;
}) {
  return (
    <svg {...SVG_PROPS} viewBox="0 0 7 9" className={className}>
      <rect x="3" y="4" width="1" height="5" fill="var(--color-forest)" />
      <g fill={petal}>
        <rect x="3" y="0" width="1" height="1" />
        <rect x="1" y="2" width="1" height="1" />
        <rect x="5" y="2" width="1" height="1" />
        <rect x="2" y="1" width="3" height="3" />
      </g>
      <rect x="3" y="2" width="1" height="1" fill="var(--color-gold)" />
    </svg>
  );
}

export function PixelFence({ className = "" }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} viewBox="0 0 48 10" preserveAspectRatio="xMidYMid slice" className={className}>
      <g fill="var(--color-wood)" stroke="var(--color-bark)" strokeWidth="1">
        <rect x="2" y="1" width="4" height="9" />
        <rect x="14" y="1" width="4" height="9" />
        <rect x="26" y="1" width="4" height="9" />
        <rect x="38" y="1" width="4" height="9" />
        <rect x="0" y="3" width="48" height="2" />
        <rect x="0" y="7" width="48" height="2" />
      </g>
    </svg>
  );
}
