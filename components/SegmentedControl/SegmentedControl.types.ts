import type { ElementType } from "react";

export type SegmentedControlOption<Value extends string = string> = {
  disabled?: boolean;
  icon?: ElementType;
  label: string;
  value: Value;
};

export type SegmentedControlProps<Value extends string = string> = {
  disabled?: boolean;
  onChange: (value: Value) => void;
  options: Array<SegmentedControlOption<Value>>;
  value: Value;
};
