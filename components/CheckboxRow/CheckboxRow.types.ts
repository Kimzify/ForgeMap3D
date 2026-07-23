import type { InputHTMLAttributes, ReactNode } from "react";

export type CheckboxRowProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "children" | "onChange" | "type"
> & {
  checked: boolean;
  children: ReactNode;
  onChange: (checked: boolean) => void;
};
