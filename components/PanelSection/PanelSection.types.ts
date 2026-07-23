import type { ElementType, HTMLAttributes, ReactNode } from "react";

export type PanelSectionProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  icon?: ElementType;
  title?: string;
};
