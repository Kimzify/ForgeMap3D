"use client";

import type { CheckboxRowProps } from "./CheckboxRow.types";
import styles from "./CheckboxRow.module.css";

export default function CheckboxRow({
  checked,
  children,
  disabled = false,
  onChange,
  ...props
}: CheckboxRowProps) {
  return (
    <label className={styles.row}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        {...props}
      />
      <span>{children}</span>
    </label>
  );
}
