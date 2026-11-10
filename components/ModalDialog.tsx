"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DialogueBox } from "@/components/DialogueBox";

type ModalDialogProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Called on Escape and on a click outside the box. Skip closing while an action is running. */
  onClose: () => void;
};

/** The pixel DialogueBox as a real pop-up: native <dialog> with a dimmed backdrop, focus kept inside, Escape to close. */
export function ModalDialog({ title, children, actions, onClose }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="modal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <DialogueBox title={title} actions={actions}>
        {children}
      </DialogueBox>
    </dialog>
  );
}
