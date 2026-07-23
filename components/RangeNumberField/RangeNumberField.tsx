"use client";

import { useState } from "react";
import {
  DEFAULT_DECIMAL_FRACTION_DIGITS,
  NUMBER_FORMAT_LOCALE,
} from "@/lib/constants";
import type { RangeNumberFieldProps } from "./RangeNumberField.types";
import styles from "./RangeNumberField.module.css";

const NUMBER_FORMATTER = new Intl.NumberFormat(NUMBER_FORMAT_LOCALE, {
  maximumFractionDigits: DEFAULT_DECIMAL_FRACTION_DIGITS,
  minimumFractionDigits: DEFAULT_DECIMAL_FRACTION_DIGITS,
});

function formatDecimal(
  value: number,
  fractionDigits = DEFAULT_DECIMAL_FRACTION_DIGITS,
) {
  return NUMBER_FORMATTER.format(Number(value.toFixed(fractionDigits)));
}

function parseNumberInput(value: string) {
  const normalizedValue = value.trim().replace(",", ".");

  if (
    normalizedValue === "" ||
    normalizedValue === "." ||
    normalizedValue === "-" ||
    normalizedValue === "+"
  ) {
    return null;
  }

  return Number(normalizedValue);
}

export default function RangeNumberField({
  disabled = false,
  displayValue,
  fractionDigits = DEFAULT_DECIMAL_FRACTION_DIGITS,
  id,
  label,
  limits,
  onChange,
  value,
  ...inputProps
}: RangeNumberFieldProps) {
  const formattedValue = formatDecimal(value, fractionDigits);
  const [inputValue, setInputValue] = useState(formattedValue);
  const [isEditing, setIsEditing] = useState(false);

  function commitInputValue(rawValue: string) {
    const nextValue = parseNumberInput(rawValue);

    if (nextValue === null || !Number.isFinite(nextValue)) {
      setInputValue(formattedValue);
      return;
    }

    const clampedValue = Math.min(Math.max(nextValue, limits.min), limits.max);
    setInputValue(formatDecimal(clampedValue, fractionDigits));
    onChange(clampedValue);
  }

  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={id}>
        {label} ({displayValue ?? formattedValue})
      </label>
      <div className={styles.row}>
        <input
          aria-label={label}
          className={styles.range}
          disabled={disabled}
          id={id}
          max={limits.max}
          min={limits.min}
          onChange={(event) =>
            onChange(
              Math.min(
                Math.max(Number(event.target.value), limits.min),
                limits.max,
              ),
            )
          }
          step={limits.step}
          type="range"
          value={value}
          {...inputProps}
        />
        <input
          aria-label={`${label} value`}
          className={styles.input}
          disabled={disabled}
          max={limits.max}
          min={limits.min}
          onChange={(event) => {
            const nextInputValue = event.target.value;
            setInputValue(nextInputValue);

            const nextValue = parseNumberInput(nextInputValue);
            if (nextValue !== null && Number.isFinite(nextValue)) {
              onChange(Math.min(Math.max(nextValue, limits.min), limits.max));
            }
          }}
          onBlur={(event) => {
            setIsEditing(false);
            commitInputValue(event.currentTarget.value);
          }}
          onFocus={() => {
            setInputValue(formattedValue);
            setIsEditing(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          inputMode="decimal"
          step={limits.step}
          type="text"
          value={isEditing ? inputValue : formattedValue}
        />
      </div>
    </div>
  );
}
