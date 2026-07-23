import type { InputHTMLAttributes } from "react";

export type ColorFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  color: string;
  fallbackColor?: string;
  label: string;
  onChange: (color: string) => void;
};
