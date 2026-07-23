"use client";

import Button from "@/components/Button";
import type { IconButtonProps } from "./IconButton.types";

export default function IconButton({
  children,
  label,
  variant = "icon",
  ...props
}: IconButtonProps) {
  return (
    <Button aria-label={label} variant={variant} {...props}>
      {children}
    </Button>
  );
}
