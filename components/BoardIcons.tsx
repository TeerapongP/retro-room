import type { ReactNode } from "react";
import type { ColumnId } from "@/lib/firebase/types";

type IconProps = { className?: string };

function PixelIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      fill="currentColor"
      className={`board-icon ${className}`}
    >
      {children}
    </svg>
  );
}

function IconFlower({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path fillRule="evenodd" d="M7 1h2v3H7zM7 12h2v3H7zM1 7h3v2H1zM12 7h3v2h-3zM5 5h6v6H5zM7 7h2v2H7z" />
    </PixelIcon>
  );
}

function IconArrowUp({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M7 2h2v1h1v1h1v1h1v1h1v1h1v2h-3v6H6V8H3V6h1V5h1V4h1V3h1z" />
    </PixelIcon>
  );
}

function IconBulb({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M5 2h6v1h1v5h-1v1h-1v2H6V9H5V8H4V3h1zM6 12h4v1H6zM7 14h2v1H7z" />
    </PixelIcon>
  );
}

const COLUMN_ICONS: Record<ColumnId, (props: IconProps) => ReactNode> = {
  "went-well": IconFlower,
  "to-improve": IconArrowUp,
  ideas: IconBulb,
};

export function ColumnIcon({ columnId, className }: { columnId: ColumnId; className?: string }) {
  const Icon = COLUMN_ICONS[columnId];
  return <Icon className={className} />;
}
