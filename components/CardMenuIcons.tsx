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
      className={`card-menu-icon ${className}`}
    >
      {children}
    </svg>
  );
}

export function IconMore({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M1 7h3v2H1zM6 7h3v2H6zM11 7h3v2h-3z" />
    </PixelIcon>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path
        fillRule="evenodd"
        d="M4 4h8v1h2v1h2v4h-2v1h-2v1H4v-1H2v-1H0V6h2V5h2zM6 6v4h4V6zM7 7h2v2H7z"
      />
    </PixelIcon>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M0 6h2v2h2v1h8V8h2V6h2v3h-2v1h-2v1H4v-1H2V9H0zM3 11h2v2H3zM7 12h2v2H7zM11 11h2v2h-2z" />
    </PixelIcon>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path fillRule="evenodd" d="M4 1h11v11h-3V4H4zM1 4h11v11H1zM3 6v7h7V6z" />
    </PixelIcon>
  );
}

export function IconThumb({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M9 1h2v4h4v2h1v6h-1v2H6V7h2V3h1zM1 7h3v8H1z" />
    </PixelIcon>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path fillRule="evenodd" d="M6 1h4v2h4v2H2V3h4zM3 6h10v9H3zM5 8v5h2V8zm4 0v5h2V8z" />
    </PixelIcon>
  );
}

export function IconMove({ className }: IconProps) {
  return (
    <PixelIcon className={className}>
      <path d="M1 7h8V4h2v1h2v1h2v1h1v2h-1v1h-2v1h-2v1H9V9H1z" />
    </PixelIcon>
  );
}
