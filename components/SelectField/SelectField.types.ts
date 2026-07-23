import type { ReactNode, SelectHTMLAttributes } from "react";

export type SelectFieldOption<Value extends string = string> = {
  label: string;
  value: Value;
};

export type SelectFieldProps<Value extends string = string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value"
> & {
  helpIcon?: ReactNode;
  label: string;
  onChange: (value: Value) => void;
  options: Array<SelectFieldOption<Value>>;
  value: Value;
};
