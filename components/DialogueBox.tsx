import type { ReactNode } from "react";

type DialogueBoxProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "normal" | "error";
};

export function DialogueBox({ title, children, actions, tone = "normal" }: DialogueBoxProps) {
  return (
    <section
      role={tone === "error" ? "alert" : undefined}
      className="pixel-panel mx-auto w-full max-w-lg p-6"
    >
      <h2 className="font-pixel mb-4 text-sm">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
      {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
