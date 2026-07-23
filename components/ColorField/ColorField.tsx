"use client";

import type { ColorFieldProps } from "./ColorField.types";
import styles from "./ColorField.module.css";

const DEFAULT_FALLBACK_COLOR = "#c8a96a";
const HEX_COLOR_LENGTH = 6;

function normalizeHexColor(value: string, fallback = DEFAULT_FALLBACK_COLOR) {
  const raw = value.trim().replace(/^#/, "").slice(0, HEX_COLOR_LENGTH);

  if (/^[\da-f]{6}$/i.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }

  return fallback;
}

function formatHexColor(value: string) {
  return value.replace("#", "").toUpperCase();
}

export default function ColorField({
  color,
  disabled = false,
  fallbackColor = DEFAULT_FALLBACK_COLOR,
  id,
  label,
  onChange,
  ...props
}: ColorFieldProps) {
  const normalizedColor = normalizeHexColor(color, fallbackColor);

  return (
    <div className={styles.row}>
      <label
        aria-label={`${label} picker`}
        className={styles.swatch}
        style={{ backgroundColor: normalizedColor }}
      >
        <input
          disabled={disabled}
          onChange={(event) => {
            onChange(normalizeHexColor(event.target.value, normalizedColor));
          }}
          type="color"
          value={normalizedColor}
        />
      </label>
      <input
        aria-label={`${label} hex`}
        className={styles.input}
        defaultValue={formatHexColor(normalizedColor)}
        disabled={disabled}
        id={id}
        key={normalizedColor}
        maxLength={HEX_COLOR_LENGTH}
        onBlur={(event) => {
          const nextColor = normalizeHexColor(
            event.currentTarget.value,
            normalizedColor,
          );
          event.currentTarget.value = formatHexColor(nextColor);
          onChange(nextColor);
        }}
        {...props}
      />
    </div>
  );
}
