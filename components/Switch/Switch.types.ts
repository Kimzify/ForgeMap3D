import type { InputHTMLAttributes } from "react";

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "onChange" | "type"
> & {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};
