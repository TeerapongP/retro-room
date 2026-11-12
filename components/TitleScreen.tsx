"use client";

import Image from "next/image";
import { useState } from "react";
import farmerBreathe from "@/public/art/anim/farmer-breathe.png";
import farmerSheets from "@/public/art/anim/sheets-farmer.json";
import chickenPeck from "@/public/art/anim/chicken-peck.png";
import chickenWalk from "@/public/art/anim/chicken-walk.png";
import chickenSheets from "@/public/art/anim/sheets-chicken.json";
import logoSign from "@/public/art/logo-sign.png";
import { SpriteAnimation } from "@/components/SpriteAnimation";
import { PixelCloud, PixelFence, PixelFlower, PixelTree } from "@/components/PixelScenery";
import type { Board, BoardMember } from "@/lib/firebase/types";

type TitleScreenProps = {
  board: Board;
  isAdmin: boolean;
  members: BoardMember[];
  onStart: () => Promise<boolean>;
};

const FARMER_SHEET = farmerSheets["farmer-breathe"];
const CHICKEN_WALK_SHEET = chickenSheets["chicken-walk"];
const CHICKEN_PECK_SHEET = chickenSheets["chicken-peck"];

export function TitleScreen({ board, isAdmin, members, onStart }: TitleScreenProps) {
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    const started = await onStart();
    if (!started) setIsStarting(false);
  }

  return (
    <section
      aria-labelledby="title-screen-heading"
      className="title-stage relative isolate flex min-h-dvh flex-col items-center gap-5 overflow-hidden px-4 pt-6 pb-32"    >
      <PixelCloud className="pixel-drift absolute top-2 left-[6%] -z-10 w-24 sm:w-32" />
      <PixelCloud className="pixel-drift absolute top-10 right-[8%] -z-10 w-20 sm:w-28" />

      {/* Logo sign */}
      <div className="relative mt-2">
        <Image
          src={logoSign}
          alt="RETRO ROOM"
          className="login-pixel w-56 max-w-[85vw] sm:w-72"
          priority
          unoptimized
        />
        <h1 id="title-screen-heading" className="sr-only">
          RETRO ROOM
        </h1>
      </div>

      {/* Board info panel */}
      <div className="dashboard-panel flex w-full max-w-sm gap-3 p-4 sm:max-w-md">
        {/* Animated farmer portrait */}
        <div aria-hidden className="flex-none self-end" style={{ width: "5rem" }}>
          <SpriteAnimation sheet={farmerBreathe} frames={FARMER_SHEET.frames} fps={2} />
        </div>

        <div className="min-w-0 flex-1 py-1">
          <h2 className="font-pixel truncate text-base font-bold leading-snug">{board.title}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--color-wood)" }}>
            สมาชิกที่เข้าร่วมแล้ว ({members.length})
          </p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={member.uid} className="flex items-center gap-1.5 text-sm">
                {member.role === "owner" ? (
                  <span aria-label="เจ้าของ">👑</span>
                ) : (
                  <span aria-hidden style={{ color: "var(--color-berry)" }}>
                    ♥
                  </span>
                )}
                <span className="truncate">{member.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* PRESS START (admin) or waiting notice (non-admin) */}
      {isAdmin ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            className="pixel-button pixel-button-gold press-start font-pixel px-8 py-4 text-[28px] sm:text-[36px]"
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? "STARTING..." : "▶ PRESS START"}
          </button>
          <p className="pixel-panel px-3 py-1 text-sm">กดเพื่อเริ่มเซสชัน ทุกคนจะเข้าสู่บอร์ดพร้อมกัน</p>
        </div>
      ) : (
        <p role="status" className="pixel-panel max-w-xs px-4 py-3 text-center text-sm">
          รอเจ้าของบอร์ดกด START เพื่อเริ่มเซสชัน...
        </p>
      )}

      {/* Bottom scenery: trees, flowers, chicken, fence */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 sm:h-40">
        <PixelTree className="absolute bottom-6 left-[4%] w-16 sm:w-20" />
        <PixelTree className="absolute right-[5%] bottom-8 w-14 sm:w-[4.5rem]" />
        <PixelFlower className="absolute bottom-10 left-[22%] w-6" />
        <PixelFlower petal="var(--color-gold)" className="absolute bottom-8 left-[30%] w-5" />
        <PixelFlower petal="var(--color-sky)" className="absolute right-[24%] bottom-10 w-6" />

        {/* Animated chicken */}
        <div className="chicken-patrol absolute bottom-14 left-[46%]">
          <div className="chicken-facing relative h-10 w-10">
            <div className="chicken-peck-slot">
              <SpriteAnimation
                sheet={chickenPeck}
                frames={CHICKEN_PECK_SHEET.frames}
                fps={5}
                className="w-10"
              />
            </div>
            <div className="chicken-walk-slot absolute inset-0">
              <SpriteAnimation
                sheet={chickenWalk}
                frames={CHICKEN_WALK_SHEET.frames}
                fps={8}
                className="w-10"
              />
            </div>
          </div>
        </div>

        <PixelFence className="absolute inset-x-0 bottom-0 h-10 w-full" />
      </div>
    </section>
  );
}
