"use client";

import type { ReactNode } from "react";
import { FIRST_PHASE, PHASES, nextPhase, phaseState } from "@/lib/phases";

type PhaseStepperProps = {
  phase: number;
  /** Only the admin moves the step (D117). Everyone else sees it. */
  isAdmin: boolean;
  /** A completed board shows the step it ended on and cannot change it (D122). */
  isLocked: boolean;
  onChange: (phase: number) => void;
  /** Board title and meta line, shown at the left of the panel (one panel instead of two, owner request). */
  boardInfo: ReactNode;
  /** Timer, share and end buttons, shown at the right of the panel next to the next-step button. */
  actions: ReactNode;
};

/** The six-step bar and the panel under it (F23, D116). The step is only an indicator; it blocks nothing (D119). */
export function PhaseStepper({ phase, isAdmin, isLocked, onChange, boardInfo, actions }: PhaseStepperProps) {
  const current = PHASES.find((item) => item.id === phase) ?? PHASES[FIRST_PHASE - 1];
  const following = nextPhase(current.id);
  const canMove = isAdmin && !isLocked;

  return (
    <section aria-label="ขั้นตอนของเซสชัน" className="phase-stepper">
      <ol className="phase-steps">
        {PHASES.map((item) => {
          const state = phaseState(item.id, current.id);
          const content = (
            <>
              <span className="phase-dot" aria-hidden="true">
                {state === "done" ? "✓" : item.id}
              </span>
              <span className="phase-label">{item.label}</span>
            </>
          );
          return (
            <li key={item.id} className={`phase-step phase-step-${state}`} aria-current={state === "current" ? "step" : undefined}>
              {canMove ? (
                <button type="button" className="phase-step-button" onClick={() => onChange(item.id)}>
                  {content}
                </button>
              ) : (
                <div className="phase-step-button">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="phase-panel">
        <div className="phase-panel-board">{boardInfo}</div>
        <div className="phase-panel-step">
          <h2 className="phase-title">{current.title}</h2>
          <p className="phase-description">{current.description}</p>
          {canMove ? null : (
            <p className="phase-hint">
              {isLocked ? "เซสชันนี้จบแล้ว" : following ? "ผู้ดำเนินรายการจะพาทีมไปขั้นถัดไป" : "ขั้นสุดท้ายของเซสชัน"}
            </p>
          )}
        </div>
        <div className="phase-panel-actions">
          {actions}
          {canMove && following ? (
            <button type="button" className="board-button" onClick={() => onChange(following)}>
              ขั้นถัดไป ›
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
