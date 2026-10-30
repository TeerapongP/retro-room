import type { ReactNode } from "react";

type IconProps = { className?: string };

function PixelIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      fill="currentColor"
      className={`dashboard-icon ${className}`}
    >
      {children}
    </svg>
  );
}

export function IconHome({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path
        fillRule="evenodd"
        d="M7 1h2v1h1v1h1v1h1v1h1v1h1v1h1v1h-2v7H3V8H1V7h1V6h1V5h1V4h1V3h1V2h1zM7 10v4h2v-4z"
      />
    </PixelIcon>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path
        fillRule="evenodd"
        d="M3 3h2V1h2v2h2V1h2v2h2v11H3zM4 6v7h8V6zm1 1h2v2H5zm4 0h2v2H9zm-4 3h2v2H5zm4 0h2v2H9z"
      />
    </PixelIcon>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M2 2h7v2H4v8h5v2H2zM10 5h1v1h1v1h2v2h-2v1h-1v1h-1v-2H7V7h2z" />
    </PixelIcon>
  );
}

export function IconDocument({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path
        fillRule="evenodd"
        d="M3 1h7v1h1v1h1v1h1v10H3zm2 4v1h6V5zm0 2v1h6V7zm0 2v1h6V9zm0 2v1h4v-1z"
      />
    </PixelIcon>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z" />
    </PixelIcon>
  );
}

const SLEEPING_CAT = [
  "..oo............oo..",
  ".owwo..........owwo.",
  ".owwwoooooooooowwwo.",
  ".owwwwwwwwwwwwwwwwo.",
  ".owwwwwwwwwwwwwwwwo.",
  "owwwwewwwwwwwwewwwwo",
  "owwweeewwwwwweeewwwo",
  "owwwwwwwwwppwwwwwwwo",
  "owwwwwwwwwwwwwwwwwwo",
  ".owwwwwwwwwwwwwwwwo.",
  ".osswwwwwwwwwwwwwso.",
  "..ooosswwwwwwsssoo..",
  ".....oooooooooo.....",
] as const;

const CAT_COLORS: Record<string, string> = {
  o: "#5b4636",
  w: "#ffffff",
  s: "#dcd5ca",
  e: "#3a2c22",
  p: "#e9a0a0",
};

/** Small sleeping cat for the empty state: pixel art as data, one rect per run of the same color. */
export function SleepingCat({ className = "" }: IconProps) {
  const rects = SLEEPING_CAT.flatMap((row, y) => {
    const runs: ReactNode[] = [];
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      let end = x;
      while (end + 1 < row.length && row[end + 1] === color) end += 1;
      if (color !== ".") {
        runs.push(
          <rect key={`${x}-${y}`} x={x} y={y} width={end - x + 1} height={1} fill={CAT_COLORS[color]} />,
        );
      }
      x = end + 1;
    }
    return runs;
  });
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 13"
      shapeRendering="crispEdges"
      className={`dashboard-cat ${className}`}
    >
      {rects}
    </svg>
  );
}
