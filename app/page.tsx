"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { APP_TEXT } from "@/lib/text";

const MapSelectionPage = dynamic(
  () => import("./_map-editor/map-selection/MapSelectionPage"),
  {
    ssr: false,
    loading: () => (
      <div className="app-loading">{APP_TEXT.common.loadingMap}</div>
    ),
  },
);

function MapSelectionRoute() {
  const searchParams = useSearchParams();

  return <MapSelectionPage key={searchParams.toString()} />;
}

export default function Home() {
  return (
    <Suspense
      fallback={<div className="app-loading">{APP_TEXT.common.loadingMap}</div>}
    >
      <MapSelectionRoute />
    </Suspense>
  );
}
