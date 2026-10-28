"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import handCursor from "@/public/art/setup/hand.png";

type Placement = { column: number; row: number; span: number };

export type KeyboardKey = {
  id: string;
  label: string;
  kind: "character" | "mark" | "ok";
  /** Appended to the name when the key is pressed. Space is the character " ". */
  character?: string;
  /** Position in the wide grid (19 columns) and in the narrow grid (8 columns). */
  wide: Placement;
  narrow: Placement;
};

export type KeyboardPageName = "standard" | "symbols";

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
/** ASCII punctuation only. Player name validation accepts any character (D23), so no rule changes. */
const SYMBOLS = ".,!?'\"-_&@#:;()+*/=%<>[]";

const WIDE_ROWS = 6;
const NARROW_COLUMNS = 8;

function characterKeys(
  characters: string,
  wide: { column: number; columns: number },
  narrowFirstRow: number,
): KeyboardKey[] {
  return Array.from(characters).map((character, index) => ({
    id: `character-${character}`,
    label: character,
    kind: "character",
    character,
    wide: {
      column: wide.column + (index % wide.columns),
      row: 1 + Math.floor(index / wide.columns),
      span: 1,
    },
    narrow: {
      column: 1 + (index % NARROW_COLUMNS),
      row: narrowFirstRow + Math.floor(index / NARROW_COLUMNS),
      span: 1,
    },
  }));
}

function actionKeys(narrowRow: number): KeyboardKey[] {
  return [
    {
      id: "mark",
      label: "Mark",
      kind: "mark",
      wide: { column: 17, row: 1, span: 3 },
      narrow: { column: 1, row: narrowRow, span: 3 },
    },
    {
      id: "space",
      label: "Space",
      kind: "character",
      character: " ",
      wide: { column: 17, row: 2, span: 3 },
      narrow: { column: 4, row: narrowRow, span: 3 },
    },
    {
      id: "ok",
      label: "OK",
      kind: "ok",
      wide: { column: 17, row: WIDE_ROWS, span: 3 },
      narrow: { column: 7, row: narrowRow, span: 2 },
    },
  ];
}

export const KEYBOARD_PAGES: Record<KeyboardPageName, KeyboardKey[]> = {
  standard: [
    ...characterKeys(UPPERCASE, { column: 1, columns: 5 }, 1),
    ...characterKeys(LOWERCASE, { column: 7, columns: 5 }, 5),
    ...characterKeys(DIGITS, { column: 13, columns: 3 }, 9),
    ...actionKeys(11),
  ],
  symbols: [...characterKeys(SYMBOLS, { column: 1, columns: 8 }, 1), ...actionKeys(4)],
};

type ArrowDirection = { x: number; y: number };

const ARROW_DIRECTIONS: Record<string, ArrowDirection> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function keyStyle({ wide, narrow }: KeyboardKey): CSSProperties {
  return {
    "--wide-column": wide.column,
    "--wide-row": wide.row,
    "--wide-span": wide.span,
    "--narrow-column": narrow.column,
    "--narrow-row": narrow.row,
    "--narrow-span": narrow.span,
  } as CSSProperties;
}

type RetroKeyboardProps = {
  onCharacter: (character: string) => void;
  /** Backspace while a key has focus. The Name input handles its own Backspace natively. */
  onBackspace?: () => void;
  /** Escape while a key has focus: hand focus back to the Name input. */
  onExit?: () => void;
  disabled?: boolean;
  isSaving?: boolean;
  className?: string;
};

export function RetroKeyboard({
  onCharacter,
  onBackspace,
  onExit,
  disabled = false,
  isSaving = false,
  className = "",
}: RetroKeyboardProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pageName, setPageName] = useState<KeyboardPageName>("standard");
  const [focusedKeyId, setFocusedKeyId] = useState("character-A");
  const [hoveredKeyId, setHoveredKeyId] = useState<string | null>(null);
  const keys = KEYBOARD_PAGES[pageName];
  const tabStopId = keys.some((key) => key.id === focusedKeyId) ? focusedKeyId : keys[0].id;
  const cursorKeyId = keys.some((key) => key.id === hoveredKeyId) ? hoveredKeyId : tabStopId;

  function focusNeighbour(fromKeyId: string, direction: ArrowDirection) {
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-key-id]") ?? []);
    const from = buttons.find((button) => button.dataset.keyId === fromKeyId);
    if (!from) return;
    const origin = from.getBoundingClientRect();
    const originX = origin.left + origin.width / 2;
    const originY = origin.top + origin.height / 2;
    let best: { button: HTMLButtonElement; score: number } | null = null;
    for (const button of buttons) {
      if (button === from) continue;
      const rect = button.getBoundingClientRect();
      const deltaX = rect.left + rect.width / 2 - originX;
      const deltaY = rect.top + rect.height / 2 - originY;
      const along = deltaX * direction.x + deltaY * direction.y;
      if (along <= 0) continue;
      const across = Math.abs(deltaX * direction.y) + Math.abs(deltaY * direction.x);
      const score = along + across * 2;
      if (!best || score < best.score) best = { button, score };
    }
    best?.button.focus();
    best?.button.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: KeyboardKey) {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      setHoveredKeyId(null);
      focusNeighbour(key.id, direction);
      return;
    }
    if (event.key === "Enter") {
      // Holding Enter must not press the key (or OK) repeatedly.
      if (event.repeat) event.preventDefault();
      return;
    }
    if (event.key === " ") {
      // Space always inserts a space, never "presses" the focused key.
      event.preventDefault();
      if (!event.repeat) onCharacter(" ");
    } else if (event.key === "Backspace") {
      event.preventDefault();
      onBackspace?.();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onExit?.();
    }
  }

  // Space is cancelled on keydown, but browsers still fire a click on keyup for buttons.
  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " ") event.preventDefault();
  }

  function handlePress(key: KeyboardKey) {
    if (key.kind === "mark") {
      setPageName((current) => (current === "standard" ? "symbols" : "standard"));
    } else if (key.kind === "character" && key.character !== undefined) {
      onCharacter(key.character);
    }
  }

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label="แป้นพิมพ์บนหน้าจอ"
      className={`retro-keyboard pixel-panel font-pixel ${className}`}
      onMouseLeave={() => setHoveredKeyId(null)}
    >
      {keys.map((key) => (
        <button
          key={key.id}
          type={key.kind === "ok" ? "submit" : "button"}
          data-key-id={key.id}
          data-kind={key.kind}
          data-active={key.id === cursorKeyId || undefined}
          aria-pressed={key.kind === "mark" ? pageName === "symbols" : undefined}
          tabIndex={key.id === tabStopId ? 0 : -1}
          disabled={disabled}
          style={keyStyle(key)}
          className="retro-key"
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setHoveredKeyId(key.id)}
          onFocus={() => setFocusedKeyId(key.id)}
          onKeyDown={(event) => handleKeyDown(event, key)}
          onKeyUp={handleKeyUp}
          onClick={() => handlePress(key)}
        >
          {key.id === cursorKeyId ? (
            <Image src={handCursor} alt="" aria-hidden unoptimized className="retro-hand" />
          ) : null}
          {key.kind === "ok" && isSaving ? (
            <span className="loading loading-dots" aria-label="กำลังบันทึก" />
          ) : (
            key.label
          )}
        </button>
      ))}
    </div>
  );
}
