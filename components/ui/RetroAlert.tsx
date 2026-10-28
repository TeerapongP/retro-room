import type { ReactNode } from "react";

const TONE_CLASSES = {
  error: "alert alert-error",
  success: "alert alert-success",
} as const;

type RetroAlertProps = {
  tone?: keyof typeof TONE_CLASSES;
  children: ReactNode;
  className?: string;
};

export function RetroAlert({ tone = "error", children, className = "" }: RetroAlertProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`${TONE_CLASSES[tone]} ${className}`}>
      <span>{children}</span>
    </div>
  );
}
