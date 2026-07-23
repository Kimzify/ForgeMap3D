"use client";

import Image from "next/image";
import { Box } from "lucide-react";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import styles from "./TopBar.module.css";

function GitHubLogo({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.68 7.68 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function TopBar({ status }: { status: string }) {
  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <Image
          aria-hidden="true"
          alt=""
          className={styles.brandIcon}
          height={36}
          priority
          src="/forge-map-3d-mark.svg"
          width={36}
        />
        <span>{APP_TEXT.mapEditor.title}</span>
      </div>
      <div className={styles.actions}>
        <a
          className={styles.githubLink}
          href="https://github.com/Kimzify/ForgeMap3D"
          rel="noreferrer"
          target="_blank"
          title="Open Forge Map 3D on GitHub"
        >
          <GitHubLogo size={ICON_SIZES.INLINE} />
          <span>GitHub</span>
        </a>
        <div className={styles.sourcePill}>
          <Box aria-hidden="true" size={ICON_SIZES.INLINE} />
          <span>{status}</span>
        </div>
      </div>
    </header>
  );
}
