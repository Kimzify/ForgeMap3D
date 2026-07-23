"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Button from "@/components/Button";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import type { PrintableModelData } from "@/lib/printModel";
import TopBar from "@/components/TopBar";
import {
  createMapSelectionUrl,
  getMapEditorRouteState,
  selectionQueryParams,
} from "../../utils/urlState";
import PrintableModelPreview, {
  type PrintableModelPreviewHandle,
} from "../PrintableModelPreview";
import PrintSidebar from "../PrintSidebar";
import { readCachedPrintModel } from "../printModelCache";
import { usePrintSettings } from "../usePrintSettings";
import styles from "./PrintPage.module.css";

const MAP_TEXT = APP_TEXT.mapEditor;
const MAP_STATUS = APP_TEXT.mapEditor.status;

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export default function PrintPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeState = useMemo(
    () => getMapEditorRouteState(searchParams),
    [searchParams],
  );
  const selection = routeState.selection;
  const radiusMeters = routeState.radiusMeters;
  const selectionQuery = useMemo(
    () => (selection ? selectionQueryParams(selection, radiusMeters) : null),
    [radiusMeters, selection],
  );
  const printPreviewRef = useRef<PrintableModelPreviewHandle | null>(null);
  const initialPrintModelData = selectionQuery
    ? readCachedPrintModel(selectionQuery)
    : null;
  const [printStatus, setPrintStatus] = useState<string>(
    initialPrintModelData
      ? initialPrintModelData.warnings.length > 0
        ? MAP_STATUS.printModelReadyWithWarnings
        : MAP_STATUS.printModelReady
      : selection
        ? MAP_STATUS.printPreviewReady
        : MAP_STATUS.noAreaSelected,
  );
  const [printModelData] =
    useState<PrintableModelData | null>(initialPrintModelData);
  const [isExporting, setIsExporting] = useState(false);
  const activePrintModelData = selection ? printModelData : null;
  const topStatus = selection ? printStatus : MAP_STATUS.noAreaSelected;
  const printSettings = usePrintSettings({
    printModelData: activePrintModelData,
    radiusMeters,
  });

  const backToMap = useCallback(() => {
    router.push(createMapSelectionUrl(selection, radiusMeters));
  }, [radiusMeters, router, selection]);

  const exportPrintableModel = useCallback(async () => {
    try {
      if (!activePrintModelData) {
        throw new Error(MAP_STATUS.exportUnavailable);
      }

      setIsExporting(true);
      setPrintStatus(MAP_STATUS.preparingExport);
      await waitForNextPaint();
      await printPreviewRef.current?.exportArchive();
      setPrintStatus(MAP_STATUS.exportReady);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : MAP_STATUS.exportFailure;
      setPrintStatus(message);
    } finally {
      setIsExporting(false);
    }
  }, [activePrintModelData]);

  useEffect(() => {
    if (!selection || selectionQuery === null) {
      return;
    }

    const cachedPrintModelData = readCachedPrintModel(selectionQuery);
    if (cachedPrintModelData) {
      return;
    }

    router.replace(
      createMapSelectionUrl(selection, radiusMeters, { generate: true }),
    );
  }, [radiusMeters, router, selection, selectionQuery]);

  return (
    <main className="editor-shell">
      <TopBar status={topStatus} />

      <section className="workspace" aria-label={MAP_TEXT.aria.mapEditor}>
        <div className={styles.previewPane}>
          <Button
            className={styles.backOverlay}
            icon={<ArrowLeft aria-hidden="true" size={ICON_SIZES.STANDARD} />}
            onClick={backToMap}
            title={APP_TEXT.common.buttons.backToSelection}
          >
            <span>{APP_TEXT.common.buttons.backToSelection}</span>
          </Button>

          {selection ? (
            <PrintableModelPreview
              ref={printPreviewRef}
              errorMessage={null}
              isLoading={false}
              layers={printSettings.printLayers}
              modelData={activePrintModelData}
              modelSettings={printSettings.printModelSettings}
              radiusMeters={radiusMeters}
              selection={selection}
            />
          ) : (
            <div className={styles.emptyState} role="status">
              <strong>{MAP_STATUS.noAreaSelected}</strong>
            </div>
          )}
        </div>

        <aside className="side-panel" aria-label={MAP_TEXT.aria.sidePanel}>
          <PrintSidebar
            actions={printSettings.actions}
            advancedLayerPanel={printSettings.advancedLayerPanel}
            buildingHeightMetrics={printSettings.buildingHeightMetrics}
            isExporting={isExporting}
            isPrintModelLoading={false}
            landCoverCategoryCounts={printSettings.landCoverCategoryCounts}
            onAdvancedLayerPanelChange={printSettings.setAdvancedLayerPanel}
            onExportPrintableModel={exportPrintableModel}
            onLayerSectionToggle={printSettings.toggleLayerSection}
            onModelSectionToggle={printSettings.toggleModelSection}
            onOpenLandCoverCategoryChange={
              printSettings.setOpenLandCoverCategory
            }
            onOpenRoadCategoryChange={printSettings.setOpenRoadCategory}
            onPrintLayerToggle={printSettings.togglePrintLayer}
            onPrintStatusChange={setPrintStatus}
            onPrintTabChange={printSettings.setPrintTab}
            openLandCoverCategory={printSettings.openLandCoverCategory}
            openLayerSections={printSettings.openLayerSections}
            openModelSections={printSettings.openModelSections}
            openRoadCategory={printSettings.openRoadCategory}
            printableSize={printSettings.printableSize}
            printLayers={printSettings.printLayers}
            printModelData={activePrintModelData}
            printModelSettings={printSettings.printModelSettings}
            printTab={printSettings.printTab}
            roadCategoryCounts={printSettings.roadCategoryCounts}
          />
        </aside>
      </section>
    </main>
  );
}
