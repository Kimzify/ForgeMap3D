import type { ElementType, ReactNode } from "react";

export type DisclosureHeaderProps = {
  actions?: ReactNode;
  containerClassName: string;
  icon?: ElementType;
  isOpen: boolean;
  onToggle: () => void;
  title: ReactNode;
  titleClassName?: string;
  titleMeta?: ReactNode;
};
