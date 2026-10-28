"use client";

import { useState } from "react";
import { PixelCloud, PixelFence, PixelFlower, PixelTree } from "@/components/PixelScenery";
import type { Board, BoardMember } from "@/lib/firebase/types";

type TitleScreenProps = {
  board: Board;
  isOwner: boolean;
  members: BoardMember[];
  onStart: () => Promise<boolean>;
};

export function TitleScreen({ board, isOwner, members, onStart }: TitleScreenProps) {
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    const started = await onStart();
    if (!started) setIsStarting(false);
  }

  return (
    <section
      aria-labelledby="title-screen-heading"
      className="title-stage relative isolate flex flex-1 flex-col items-center gap-6 overflow-hidden px-4 pt-6 pb-40"
    >
      <PixelCloud className="pixel-drift absolute top-2 left-[6%] -z-10 w-24 sm:w-32" />
      <PixelCloud className="pixel-drift absolute top-10 right-[8%] -z-10 w-20 sm:w-28" />

      <div className="pixel-sign px-6 py-5 text-center">
        <h1 id="title-screen-heading" className="font-pixel text-xl sm:text-3xl">
          RETRO ROOM
        </h1>
        <p className="mt-3 text-sm">กระดานรีโทรสเปกทีฟของทีม</p>
      </div>

      <div className="pixel-panel w-full max-w-lg p-5">
        <h2 className="text-xl font-bold">{board.title}</h2>
        <p className="mt-1 text-sm">สมาชิกที่เข้าร่วมแล้ว ({members.length})</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <li key={member.uid} className="pixel-note px-2 py-1 text-sm">
              ♥ {member.displayName}
              {member.role === "owner" ? " (Owner)" : ""}
            </li>
          ))}
        </ul>
      </div>

      {isOwner ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            className="pixel-button pixel-button-gold press-start font-pixel px-6 py-4 text-sm sm:text-base"
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? "STARTING..." : "▶ PRESS START"}
          </button>
          <p className="pixel-panel px-3 py-1 text-sm">กดเพื่อเริ่มเซสชัน ทุกคนจะเข้าสู่บอร์ดพร้อมกัน</p>
        </div>
      ) : (
        <p role="status" className="pixel-panel px-4 py-3 text-center">
          รอเจ้าของบอร์ดกด START เพื่อเริ่มเซสชัน...
        </p>
      )}

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-36">
        <PixelTree className="absolute bottom-6 left-[4%] w-16 sm:w-24" />
        <PixelTree className="absolute right-[5%] bottom-8 w-14 sm:w-20" />
        <PixelFlower className="absolute bottom-10 left-[22%] w-6" />
        <PixelFlower petal="var(--color-gold)" className="absolute bottom-8 left-[30%] w-5" />
        <PixelFlower petal="var(--color-sky)" className="absolute right-[24%] bottom-10 w-6" />
        <PixelFence className="absolute inset-x-0 bottom-0 h-12 w-full" />
      </div>
    </section>
  );
}
