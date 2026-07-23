import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "advanced"
  | "advancedClose"
  | "back"
  | "export"
  | "generate"
  | "icon"
  | "inlineDisclosure"
  | "panelGenerate"
  | "plain"
  | "reset"
  | "settingsApply"
  | "tool";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: ReactNode;
  iconPosition?: "end" | "start";
  variant?: ButtonVariant;
};
