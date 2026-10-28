"use client";

import Image, { type StaticImageData } from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { AuthLoadingNotice } from "@/components/LoadingNotice";
import { PlayerNameForm } from "@/components/PlayerNameForm";
import { SpriteAnimation } from "@/components/SpriteAnimation";
import { consumePostLoginPath, useAuth, useRequireSignedIn } from "@/lib/firebase/auth";
import chicken from "@/public/art/setup/chicken.png";
import dog from "@/public/art/setup/dog.png";
import farmerBreathe from "@/public/art/setup/farmer-breathe.png";
import flowersBloomWhiteSway from "@/public/art/setup/flowers-bloom-white-sway.png";
import flowersBloomYellowSway from "@/public/art/setup/flowers-bloom-yellow-sway.png";
import flowersLeftSway from "@/public/art/setup/flowers-left-sway.png";
import flowersPinkSway from "@/public/art/setup/flowers-pink-sway.png";

/** Boxes are [left, top, right, bottom] in pixels of the 1536 x 1024 approved reference. */
type Box = readonly [number, number, number, number];

const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1024;
const SWAY_PAD = 3;

const FARMER_BOX: Box = [406, 736, 548, 921];
const CHICKEN_BOX: Box = [44, 511, 160, 628];
const DOG_BOX: Box = [1347, 690, 1489, 831];

const FLOWERS: ReadonlyArray<{ sheet: StaticImageData; box: Box; offsetSeconds: number }> = [
  { sheet: flowersLeftSway, box: [6, 385, 124, 485], offsetSeconds: 0 },
  { sheet: flowersBloomWhiteSway, box: [609, 799, 705, 889], offsetSeconds: 0.9 },
  { sheet: flowersBloomYellowSway, box: [787, 780, 870, 850], offsetSeconds: 0.5 },
  { sheet: flowersPinkSway, box: [1336, 894, 1439, 985], offsetSeconds: 1.3 },
];

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;

function stagePlacement([left, top, right]: Box, pad = 0): CSSProperties {
  return {
    "--x": percent(left - pad, REFERENCE_WIDTH),
    "--y": percent(top, REFERENCE_HEIGHT),
    "--w": percent(right - left + 2 * pad, REFERENCE_WIDTH),
  } as CSSProperties;
}

const PLACED = "stage:absolute stage:top-(--y) stage:left-(--x) stage:w-(--w)";

export default function SetupPage() {
  const router = useRouter();
  const user = useRequireSignedIn({ allowMissingPlayerName: true });
  const { playerProfile, savePlayerName } = useAuth();

  useEffect(() => {
    if (playerProfile.status === "ready") {
      router.replace(consumePostLoginPath());
    }
  }, [playerProfile.status, router]);

  if (!user || playerProfile.status !== "missing") return <AuthLoadingNotice />;

  return (
    <main className="setup-scene relative flex min-h-dvh items-center justify-center overflow-clip [--stage-w:100vw] stage:h-dvh stage:min-h-0 stage:[--stage-w:var(--scene-w)]">
      <div aria-hidden className="setup-scene-art" />
      <div className="setup-stage relative flex min-h-dvh w-full flex-col gap-4 px-4 py-6 stage:block stage:min-h-0 stage:aspect-[1536/1024] stage:w-(--stage-w) stage:shrink-0 stage:gap-0 stage:p-0">
        {FLOWERS.map(({ sheet, box, offsetSeconds }) => (
          <SpriteAnimation
            key={box[0]}
            sheet={sheet}
            frames={4}
            fps={2.5}
            offsetSeconds={offsetSeconds}
            style={stagePlacement(box, SWAY_PAD)}
            className="pointer-events-none hidden stage:absolute stage:top-(--y) stage:left-(--x) stage:block stage:w-(--w)"
          />
        ))}

        <div className="setup-sprites order-last flex items-end justify-center gap-4 stage:contents">
          <Image
            src={chicken}
            alt=""
            aria-hidden
            unoptimized
            style={stagePlacement(CHICKEN_BOX)}
            className={`login-pixel h-auto w-[22vw] max-w-28 ${PLACED} stage:max-w-none`}
          />
          <SpriteAnimation
            sheet={farmerBreathe}
            frames={4}
            fps={2}
            style={stagePlacement(FARMER_BOX)}
            className={`w-[30vw] max-w-36 ${PLACED} stage:max-w-none`}
          />
          <Image
            src={dog}
            alt=""
            aria-hidden
            unoptimized
            style={stagePlacement(DOG_BOX)}
            className={`login-pixel h-auto w-[24vw] max-w-28 ${PLACED} stage:max-w-none`}
          />
        </div>

        <PlayerNameForm onSubmit={savePlayerName} />
      </div>
    </main>
  );
}
