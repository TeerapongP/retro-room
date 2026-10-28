import type { ButtonHTMLAttributes, ReactNode } from "react";
import { RetroLoader } from "./RetroLoader";

const VARIANT_CLASSES = {
  primary: "btn btn-primary",
  wood: "btn btn-wood",
} as const;

type RetroButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT_CLASSES;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
};

export function RetroButton({
  variant = "primary",
  isLoading = false,
  leadingIcon,
  className = "",
  type = "button",
  disabled,
  children,
  ...buttonProps
}: RetroButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...buttonProps}
    >
      {isLoading ? <RetroLoader label="กำลังเข้าสู่ระบบ" /> : leadingIcon}
      {children}
    </button>
  );
}
