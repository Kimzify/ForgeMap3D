"use client";

import dynamic from "next/dynamic";
import { APP_TEXT } from "@/lib/text";

const PrintPage = dynamic(() => import("../_map-editor/print/PrintPage"), {
  ssr: false,
  loading: () => (
    <div className="app-loading">
      {APP_TEXT.mapEditor.status.loadingPrintModel}
    </div>
  ),
});

export default function PrintRoute() {
  return <PrintPage />;
}
