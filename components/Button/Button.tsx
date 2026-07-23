"use client";

import type { ButtonProps, ButtonVariant } from "./Button.types";
import styles from "./Button.module.css";

const variantClassNames: Record<ButtonVariant, string> = {
  advanced: styles.advanced,
  advancedClose: styles.advancedClose,
  back: styles.back,
  export: styles.export,
  generate: styles.generate,
  icon: styles.icon,
  inlineDisclosure: styles.inlineDisclosure,
  panelGenerate: styles.panelGenerate,
  plain: "",
  reset: styles.reset,
  settingsApply: styles.settingsApply,
  tool: styles.tool,
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function Button({
  active = false,
  children,
  className,
  icon,
  iconPosition = "start",
  type = "button",
  variant = "plain",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        variantClassNames[variant],
        active && styles.active,
        className,
      )}
      type={type}
      {...props}
    >
      {icon && iconPosition === "start" ? icon : null}
      {children}
      {icon && iconPosition === "end" ? icon : null}
    </button>
  );
}
