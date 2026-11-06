"use client";

import { useEffect, useRef, useState } from "react";
import { IconEye, IconEyeOff, IconMore, IconMove } from "@/components/CardMenuIcons";

type CardMenuProps = {
  cardId: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onMove: () => void;
};

/** Admin-only action menu of one card (F17). Rules enforce the permissions; this only hosts the buttons. */
export function CardMenu({ cardId, hidden, onToggleHidden, onMove }: CardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = `card-menu-${cardId}`;

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function choose(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="card-menu">
      <button
        type="button"
        className="card-menu-trigger"
        aria-label="เมนูแอดมินของการ์ด"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <IconMore />
      </button>
      {isOpen ? (
        <ul id={menuId} role="menu" aria-label="แอดมิน" className="card-menu-list">
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose(onToggleHidden)}>
              {hidden ? <IconEye /> : <IconEyeOff />}
              {hidden ? "แสดงการ์ด" : "ซ่อนการ์ด"}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose(onMove)}>
              <IconMove />
              ย้ายไปบอร์ดอื่น
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
