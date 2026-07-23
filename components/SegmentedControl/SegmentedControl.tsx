"use client";

import { ICON_SIZES } from "@/lib/constants";
import type { SegmentedControlProps } from "./SegmentedControl.types";
import styles from "./SegmentedControl.module.css";

export default function SegmentedControl<Value extends string = string>({
  disabled = false,
  onChange,
  options,
  value,
}: SegmentedControlProps<Value>) {
  return (
    <div className={styles.control}>
      {options.map((option) => {
        const Icon = option.icon;

        return (
          <button
            aria-pressed={value === option.value}
            disabled={disabled || option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {Icon ? <Icon aria-hidden="true" size={ICON_SIZES.STANDARD} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
