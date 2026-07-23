import type { InputHTMLAttributes } from "react";

export type NumericLimits = {
  max: number;
  min: number;
  step: number;
};

export type RangeNumberFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "max" | "min" | "onChange" | "step" | "type" | "value"
> & {
  displayValue?: string;
  fractionDigits?: number;
  id: string;
  label: string;
  limits: NumericLimits;
  onChange: (value: number) => void;
  value: number;
};
