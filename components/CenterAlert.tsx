"use client";

import { useEffect, useRef } from "react";
import { ModalDialog } from "@/components/ModalDialog";

type CenterAlertProps = {
  message: string;
  tone: "success" | "error";
  onClose: () => void;
};

/** A message shown in the middle of the screen. Success closes itself after a moment; an error waits for OK. */
export function CenterAlert({ message, tone, onClose }: CenterAlertProps) {
  // The timer must not restart every time the parent re-renders with a new onClose.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (tone !== "success") return;
    const timer = setTimeout(() => onCloseRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [tone, message]);

  return (
    <ModalDialog
      title={tone === "success" ? "Done" : "Error"}
      onClose={onClose}
      actions={
        <button type="button" className="pixel-button" onClick={onClose}>
          ตกลง
        </button>
      }
    >
      <p role={tone === "error" ? "alert" : "status"} className="center-alert-message">
        {message}
      </p>
    </ModalDialog>
  );
}
