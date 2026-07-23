"use client";

import type { SelectFieldProps } from "./SelectField.types";
import styles from "./SelectField.module.css";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function SelectField<Value extends string = string>({
  disabled = false,
  helpIcon,
  id,
  label,
  onChange,
  options,
  value,
  ...props
}: SelectFieldProps<Value>) {
  return (
    <div className={styles.group}>
      <label
        className={classNames(
          styles.label,
          Boolean(helpIcon) && styles.labelWithHelp,
        )}
        htmlFor={id}
      >
        <span>{label}</span>
        {helpIcon}
      </label>
      <select
        className={styles.select}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value as Value)}
        value={value}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
