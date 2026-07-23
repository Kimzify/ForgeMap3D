"use client";

import type { SwitchProps } from "./Switch.types";
import styles from "./Switch.module.css";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function Switch({
  checked,
  className,
  disabled = false,
  label,
  onChange,
  ...props
}: SwitchProps) {
  return (
    <label className={classNames(styles.control, className)}>
      <input
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        {...props}
      />
      <span aria-hidden="true" />
    </label>
  );
}
