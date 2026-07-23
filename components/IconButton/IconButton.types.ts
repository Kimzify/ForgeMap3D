import type { ReactNode } from "react";
import type { ButtonProps } from "@/components/Button";

export type IconButtonProps = Omit<
  ButtonProps,
  "active" | "children" | "icon" | "iconPosition" | "variant"
> & {
  children: ReactNode;
  label: string;
  variant?: "advancedClose" | "icon";
};
