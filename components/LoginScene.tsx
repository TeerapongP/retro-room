"use client";

import Image, { type StaticImageData } from "next/image";
import type { CSSProperties } from "react";
import chickenPeck from "@/public/art/anim/chicken-peck.png";
import chickenWalk from "@/public/art/anim/chicken-walk.png";
import chickenSheets from "@/public/art/anim/sheets-chicken.json";
import dogWag from "@/public/art/anim/dog-wag.png";
import farmerBreathe from "@/public/art/anim/farmer-breathe.png";
import farmerSheets from "@/public/art/anim/sheets-farmer.json";
import flowersPink1Sway from "@/public/art/anim/flowers-pink-1-sway.png";
import flowersPink2Sway from "@/public/art/anim/flowers-pink-2-sway.png";
import flowersWhite1Sway from "@/public/art/anim/flowers-white-1-sway.png";
import flowersWhite2Sway from "@/public/art/anim/flowers-white-2-sway.png";
import flowersWhite3Sway from "@/public/art/anim/flowers-white-3-sway.png";
import flowersYellow1Sway from "@/public/art/anim/flowers-yellow-1-sway.png";
import flowersYellow2Sway from "@/public/art/anim/flowers-yellow-2-sway.png";
import sheets from "@/public/art/anim/sheets.json";
import logoSign from "@/public/art/logo-sign.png";
import { GoogleLogo } from "@/components/ui/GoogleLogo";
import { RetroAlert } from "@/components/ui/RetroAlert";
import { SpriteAnimation } from "@/components/SpriteAnimation";
import { RetroButton } from "@/components/ui/RetroButton";

/** Boxes are [left, top, right, bottom] in pixels of the 1448 x 1086 approved reference. */
type Box = readonly [number, number, number, number];

const REFERENCE_WIDTH = 1448;
const REFERENCE_HEIGHT = 1086;

const LOGO_BOX: Box = [225, 120, 1227, 642];
const BUTTON_BOX: Box = [388, 680, 1060, 825];
const CHICKEN_SHEET = chickenSheets["chicken-peck"];
/** The chicken canvas is larger than the idle pose: this puts the idle pose where the original sprite was. */
const CHICKEN_BOX: Box = [
  66 - CHICKEN_SHEET.idleLeft,
  503 - CHICKEN_SHEET.idleTop,
  66 - CHICKEN_SHEET.idleLeft + CHICKEN_SHEET.frameWidth,
  503 - CHICKEN_SHEET.idleTop + CHICKEN_SHEET.frameHeight,
];
const FARMER_SHEET = farmerSheets["farmer-breathe"];
/** The breathing canvas is a little larger than the old sprite: this keeps the rest pose where the reference has it. */
const FARMER_BOX: Box = [
  149 - FARMER_SHEET.idleLeft,
  734 - FARMER_SHEET.idleTop,
  149 - FARMER_SHEET.idleLeft + FARMER_SHEET.frameWidth,
  734 - FARMER_SHEET.idleTop + FARMER_SHEET.frameHeight,
];
const DOG_SHEET = sheets["dog-wag"];
/** The wag sheet adds transparent room above and to the right so the rotating tail is not clipped. */
const DOG_BOX: Box = [1186 - DOG_SHEET.pad, 647 - DOG_SHEET.padTop, 1353 + DOG_SHEET.padRight, 791];

/** `onPhone` flowers are the ones that stay clear of the stacked mobile content. */
const FLOWERS: ReadonlyArray<{ sheet: StaticImageData; box: Box; onPhone: boolean }> = [
  { sheet: flowersWhite1Sway, box: [40, 7, 210, 150], onPhone: true },
  { sheet: flowersWhite2Sway, box: [0, 320, 143, 445], onPhone: false },
  { sheet: flowersWhite3Sway, box: [55, 915, 219, 1040], onPhone: true },
  { sheet: flowersYellow1Sway, box: [1268, 30, 1397, 270], onPhone: true },
  { sheet: flowersYellow2Sway, box: [0, 724, 102, 947], onPhone: false },
  { sheet: flowersPink1Sway, box: [1249, 445, 1386, 574], onPhone: false },
  { sheet: flowersPink2Sway, box: [1265, 850, 1418, 985], onPhone: true },
];

const FLOWER_SWAY_FPS = 2.5;
const FARMER_BREATHE_FPS = 2;
const DOG_WAG_FPS = 8;
const CHICKEN_WALK_FPS = 8;
const CHICKEN_PECK_FPS = 5;
const SWAY_PAD = sheets["flowers-white-1-sway"].pad;
const SWAY_FRAMES = sheets["flowers-white-1-sway"].frames;
const BREATHE_FRAMES = FARMER_SHEET.frames;

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;

function stagePlacement([left, top, right]: Box): CSSProperties {
  return {
    "--x": percent(left, REFERENCE_WIDTH),
    "--y": percent(top, REFERENCE_HEIGHT),
    "--w": percent(right - left, REFERENCE_WIDTH),
  } as CSSProperties;
}

/** Sway frames carry SWAY_PAD transparent pixels on each side, so the placed box grows by that much. */
function flowerPlacement([boxLeft, top, boxRight]: Box): CSSProperties {
  const isRightSide = boxLeft > REFERENCE_WIDTH / 2;
  const left = boxLeft - SWAY_PAD;
  const right = boxRight + SWAY_PAD;
  return {
    "--edge": isRightSide
      ? `calc(var(--stage-w) * ${((REFERENCE_WIDTH - right) / REFERENCE_WIDTH).toFixed(4)})`
      : `calc(var(--stage-w) * ${(left / REFERENCE_WIDTH).toFixed(4)})`,
    "--y": percent(top, REFERENCE_HEIGHT),
    "--fw": ((right - left) / REFERENCE_WIDTH).toFixed(4),
  } as CSSProperties;
}

type LoginSceneProps = {
  onSignIn: () => void;
  isSigningIn: boolean;
  errorMessage: string | null;
};

export function LoginScene({ onSignIn, isSigningIn, errorMessage }: LoginSceneProps) {
  return (
    <main className="login-grass relative flex min-h-dvh items-center justify-center overflow-hidden [--stage-w:100vw] md:[--stage-w:min(100vw,calc(100dvh*1448/1086))]">
      {FLOWERS.map(({ sheet, box, onPhone }, index) => {
        const isRightSide = box[0] > REFERENCE_WIDTH / 2;
        return (
          <SpriteAnimation
            key={`${box[0]}-${box[1]}`}
            sheet={sheet}
            frames={SWAY_FRAMES}
            fps={FLOWER_SWAY_FPS}
            offsetSeconds={index * 0.45}
            style={flowerPlacement(box)}
            className={`pointer-events-none absolute top-(--y) w-[calc(var(--stage-w)*var(--fw))] ${
              onPhone ? "" : "hidden md:block"
            } ${isRightSide ? "right-(--edge)" : "left-(--edge)"}`}
          />
        );
      })}

      <div className="login-stage relative flex w-full flex-col items-center gap-6 px-4 py-8 md:block md:aspect-[1448/1086] md:w-(--stage-w) md:gap-0 md:p-0">
        <h1
          style={stagePlacement(LOGO_BOX)}
          className="w-[min(92vw,32rem)] md:absolute md:top-(--y) md:left-(--x) md:w-(--w)"
        >
          <Image
            src={logoSign}
            alt="RETRO ROOM Team Retro"
            priority
            unoptimized
            className="login-pixel h-auto w-full"
          />
        </h1>

        <div
          style={stagePlacement(BUTTON_BOX)}
          className="flex w-[min(86vw,24rem)] flex-col items-stretch gap-3 md:absolute md:top-(--y) md:left-(--x) md:w-(--w)"
        >
          <RetroButton
            variant="wood"
            className="login-google-button"
            onClick={onSignIn}
            isLoading={isSigningIn}
            leadingIcon={<GoogleLogo className="login-google-logo" />}
          >
            Login with Google
          </RetroButton>
          {errorMessage ? <RetroAlert>{errorMessage}</RetroAlert> : null}
        </div>

        <div className="flex w-full items-end justify-center gap-3 md:contents">
          <div
            style={stagePlacement(CHICKEN_BOX)}
            className="chicken-patrol relative w-[28vw] max-w-36 md:absolute md:top-(--y) md:left-(--x) md:w-(--w) md:max-w-none"
          >
            <span aria-hidden className="login-shadow" />
            <div className="chicken-facing relative">
              <div className="chicken-peck-slot">
                <SpriteAnimation
                  sheet={chickenPeck}
                  frames={CHICKEN_SHEET.frames}
                  fps={CHICKEN_PECK_FPS}
                  className="w-full"
                />
              </div>
              <div className="chicken-walk-slot absolute inset-0">
                <SpriteAnimation
                  sheet={chickenWalk}
                  frames={chickenSheets["chicken-walk"].frames}
                  fps={CHICKEN_WALK_FPS}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <div
            style={stagePlacement(FARMER_BOX)}
            className="relative w-[30vw] max-w-36 md:absolute md:top-(--y) md:left-(--x) md:w-(--w) md:max-w-none"
          >
            <span aria-hidden className="login-shadow" />
            <SpriteAnimation
              sheet={farmerBreathe}
              frames={BREATHE_FRAMES}
              fps={FARMER_BREATHE_FPS}
              className="relative w-full"
            />
          </div>
          <div
            style={stagePlacement(DOG_BOX)}
            className="relative w-[24vw] max-w-28 md:absolute md:top-(--y) md:left-(--x) md:w-(--w) md:max-w-none"
          >
            <span aria-hidden className="login-shadow" />
            <SpriteAnimation
              sheet={dogWag}
              frames={DOG_SHEET.frames}
              fps={DOG_WAG_FPS}
              className="relative w-full"
            />
          </div>
        </div>

        <p className="login-credit font-pixel md:absolute md:top-[84.5%] md:left-0 md:w-full md:text-center">
          © Made by Bee from Alcyone team
        </p>
      </div>
    </main>
  );
}
