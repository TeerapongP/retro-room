import type { CSSProperties } from "react";
import type { StaticImageData } from "next/image";

type SpriteAnimationProps = {
  /** Horizontal strip of equally sized frames. */
  sheet: StaticImageData;
  frames: number;
  fps: number;
  /** Starts the loop this many seconds in, so neighbouring sprites do not move in lockstep. */
  offsetSeconds?: number;
  className?: string;
  style?: CSSProperties;
};

/** Decorative frame-by-frame animation in pure CSS. Reduced motion leaves the first frame showing. */
export function SpriteAnimation({
  sheet,
  frames,
  fps,
  offsetSeconds = 0,
  className = "",
  style,
}: SpriteAnimationProps) {
  const frameWidth = sheet.width / frames;
  return (
    <div
      aria-hidden
      className={`sprite-animation login-pixel ${className}`}
      style={
        {
          aspectRatio: `${frameWidth} / ${sheet.height}`,
          backgroundImage: `url(${sheet.src})`,
          animationDelay: `-${offsetSeconds}s`,
          ...style,
          "--frames": frames,
          "--duration": `${frames / fps}s`,
        } as CSSProperties
      }
    />
  );
}
