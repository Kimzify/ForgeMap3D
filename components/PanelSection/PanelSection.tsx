"use client";

import { ICON_SIZES } from "@/lib/constants";
import type { PanelSectionProps } from "./PanelSection.types";
import styles from "./PanelSection.module.css";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function PanelSection({
  children,
  className,
  icon: Icon,
  title,
  ...props
}: PanelSectionProps) {
  return (
    <section
      className={classNames(styles.section, className)}
      {...props}
    >
      {title ? (
        <div className={styles.heading}>
          {Icon ? <Icon aria-hidden="true" size={ICON_SIZES.STANDARD} /> : null}
          <h2>{title}</h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
