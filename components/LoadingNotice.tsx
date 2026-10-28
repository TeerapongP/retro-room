"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { SpriteAnimation } from "@/components/SpriteAnimation";
import farmerBreathe from "@/public/art/loading/farmer-breathe.png";
import loadingScene from "@/public/art/loading/scene.webp";
import zzzBig from "@/public/art/loading/zzz-1.png";
import zzzMiddle from "@/public/art/loading/zzz-2.png";
import zzzSmall from "@/public/art/loading/zzz-3.png";
import { RetroAlert } from "@/components/ui/RetroAlert";
import { RetroButton } from "@/components/ui/RetroButton";
import { useAuth } from "@/lib/firebase/auth";
import { describeFirebaseError } from "@/lib/firebase/client";

const SCENE_WIDTH = 1672;
const SCENE_HEIGHT = 941;
const FARMER_BREATH_FPS = 2;

/** Pixel positions in the 1672 x 941 reference (docs/references/loading-art-manifest.json). Delays make the Zs rise one after another. */
export const LOADING_ART_BOXES = {
  farmer: [456, 605, 730, 818],
  zzz: [
    { art: zzzBig, box: [601, 584, 636, 621], delaySeconds: 0.9 },
    { art: zzzMiddle, box: [639, 557, 669, 594], delaySeconds: 1.8 },
    { art: zzzSmall, box: [607, 629, 623, 652], delaySeconds: 0 },
  ],
} as const;

function artPlacement([left, top, right]: readonly number[]): CSSProperties {
  return {
    left: `${((left / SCENE_WIDTH) * 100).toFixed(3)}%`,
    top: `${((top / SCENE_HEIGHT) * 100).toFixed(3)}%`,
    width: `${(((right - left) / SCENE_WIDTH) * 100).toFixed(3)}%`,
  };
}

/** Full-viewport farm scene with a slot for the HTML panel. The artwork is only cropped, never stretched. */
function LoadingScene({ children }: { children: ReactNode }) {
  return (
    <div className="loading-scene">
      <div aria-hidden className="loading-stage">
        <Image src={loadingScene} alt="" fill priority unoptimized placeholder="blur" sizes="100vw" />
        <SpriteAnimation
          sheet={farmerBreathe}
          frames={4}
          fps={FARMER_BREATH_FPS}
          style={{ position: "absolute", ...artPlacement(LOADING_ART_BOXES.farmer) }}
        />
        {LOADING_ART_BOXES.zzz.map(({ art, box, delaySeconds }) => (
          <Image
            key={box[0]}
            src={art}
            alt=""
            unoptimized
            className="loading-zzz"
            style={{ ...artPlacement(box), animationDelay: `${delaySeconds}s` }}
          />
        ))}
      </div>
      <div className="loading-panel">{children}</div>
    </div>
  );
}

type LoadingNoticeProps = {
  message?: string;
  /** Full-page gate on the farm scene. Inline loaders leave this off. */
  scene?: boolean;
};

export function LoadingNotice({ message = "กำลังโหลด...", scene = false }: LoadingNoticeProps) {
  if (scene) {
    return (
      <LoadingScene>
        <div role="status" className="loading-panel-row">
          <span className="sr-only">{message}</span>
          <span aria-hidden className="pixel-bounce font-pixel">
            ♥
          </span>
          <span aria-hidden className="font-pixel">
            Loading...
          </span>
        </div>
      </LoadingScene>
    );
  }
  return (
    <div role="status" className="flex flex-1 items-center justify-center p-8">
      <div className="pixel-panel flex items-center gap-4 px-6 py-4">
        <span aria-hidden className="pixel-bounce font-pixel text-xl">
          ♥
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
}

/** Loading gate for pages that wait on Firebase Auth and the player profile. Offers a retry when the load fails or runs long. */
export function AuthLoadingNotice() {
  const { playerProfile, isLoadingSlow, retryLoading } = useAuth();

  if (playerProfile.status !== "error" && !isLoadingSlow) return <LoadingNotice scene />;

  const message =
    playerProfile.status === "error"
      ? `โหลดข้อมูลผู้เล่นไม่สำเร็จ ${describeFirebaseError(playerProfile.error)}`
      : "การเชื่อมต่อใช้เวลานานกว่าปกติ ระบบยังพยายามเชื่อมต่ออยู่";

  return (
    <LoadingScene>
      <div className="flex flex-col items-center gap-3 text-center">
        <RetroAlert>{message}</RetroAlert>
        <RetroButton onClick={retryLoading}>ลองใหม่</RetroButton>
      </div>
    </LoadingScene>
  );
}
