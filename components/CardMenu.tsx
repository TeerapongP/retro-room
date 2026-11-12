"use client";

import { useEffect, useRef, useState } from "react";
import { IconEye, IconEyeOff, IconLayers, IconMore, IconMove, IconTrash } from "@/components/CardMenuIcons";
import { BOARD_COLUMNS, type ColumnId } from "@/lib/firebase/types";

type CardMenuProps = {
  cardId: string;
  hidden: boolean;
  columnId: ColumnId;
  onMoveToColumn: (columnId: ColumnId) => void;
  isStacked: boolean;
  onStackWith: () => void;
  onUnstack: () => void;
  onToggleHidden: () => void;
  onMove: () => void;
  onDelete: () => void;
};

/** Admin-only action menu of one card (F17). Rules enforce the permissions; this only hosts the buttons. */
export function CardMenu({
  cardId,
  hidden,
  columnId,
  onMoveToColumn,
  isStacked,
  onStackWith,
  onUnstack,
  onToggleHidden,
  onMove,
  onDelete,
}: CardMenuProps) {
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
          {BOARD_COLUMNS.filter((column) => column.id !== columnId).map((column) => (
            <li key={column.id} role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => onMoveToColumn(column.id))}>
                <IconMove />
                ย้ายไป {column.label}
              </button>
            </li>
          ))}
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose(onStackWith)}>
              <IconLayers />
              ซ้อนกับการ์ดอื่น...
            </button>
          </li>
          {isStacked ? (
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(onUnstack)}>
                <IconLayers />
                แยกออกจากกอง
              </button>
            </li>
          ) : null}
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose(onMove)}>
              <IconMove />
              ย้ายไปบอร์ดอื่น
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="card-menu-danger" onClick={() => choose(onDelete)}>
              <IconTrash />
              ลบการ์ด
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
