"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { ICON_SIZES } from "@/lib/constants";
import type { DisclosureHeaderProps } from "./DisclosureHeader.types";
import styles from "./DisclosureHeader.module.css";

export default function DisclosureHeader({
  actions,
  containerClassName,
  icon: Icon,
  isOpen,
  onToggle,
  title,
  titleClassName = styles.title,
  titleMeta,
}: DisclosureHeaderProps) {
  return (
    <div className={containerClassName}>
      <button
        aria-expanded={isOpen}
        className={styles.toggle}
        onClick={onToggle}
        type="button"
      >
        {isOpen ? (
          <ChevronDown aria-hidden="true" size={ICON_SIZES.STANDARD} />
        ) : (
          <ChevronUp aria-hidden="true" size={ICON_SIZES.STANDARD} />
        )}
        <span className={titleClassName}>
          {Icon ? <Icon aria-hidden="true" size={ICON_SIZES.STANDARD} /> : null}
          <span>{title}</span>
          {titleMeta ? <span>{titleMeta}</span> : null}
        </span>
      </button>
      {actions}
    </div>
  );
}
