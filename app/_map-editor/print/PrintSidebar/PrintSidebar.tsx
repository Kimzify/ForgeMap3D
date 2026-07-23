"use client";

import { Download, LoaderCircle } from "lucide-react";
import Button from "@/components/Button";
import PanelSection from "@/components/PanelSection";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import { INLINE_PRINT_WARNING_LIMIT } from "../../constants";
import { formatMillimeters } from "../../utils/format";
import LayerSettingsPanel from "../layer-settings/LayerSettingsPanel";
import AdvancedLandCoverSettings from "../layer-settings/AdvancedLandCoverSettings";
import AdvancedRoadSettings from "../layer-settings/AdvancedRoadSettings";
import ModelSettingsPanel from "../model-settings/ModelSettingsPanel";
import styles from "./PrintSidebar.module.css";
import type { PrintSidebarProps } from "./PrintSidebar.types";

const COMMON_TEXT = APP_TEXT.common;
const PRINT_TEXT = APP_TEXT.printSettings;

export default function PrintSidebar({
  actions,
  advancedLayerPanel,
  buildingHeightMetrics,
  isExporting,
  isPrintModelLoading,
  landCoverCategoryCounts,
  onAdvancedLayerPanelChange,
  onExportPrintableModel,
  onLayerSectionToggle,
  onModelSectionToggle,
  onOpenLandCoverCategoryChange,
  onOpenRoadCategoryChange,
  onPrintLayerToggle,
  onPrintStatusChange,
  onPrintTabChange,
  openLandCoverCategory,
  openLayerSections,
  openModelSections,
  openRoadCategory,
  printableSize,
  printLayers,
  printModelData,
  printModelSettings,
  printTab,
  roadCategoryCounts,
}: PrintSidebarProps) {
  if (advancedLayerPanel === "roads") {
    return (
      <AdvancedRoadSettings
        actions={actions}
        onClose={() => onAdvancedLayerPanelChange(null)}
        onOpenRoadCategoryChange={onOpenRoadCategoryChange}
        openRoadCategory={openRoadCategory}
        roadCategoryCounts={roadCategoryCounts}
        roadSettings={printModelSettings.layers.roads}
      />
    );
  }

  if (advancedLayerPanel === "landCover") {
    return (
      <AdvancedLandCoverSettings
        actions={actions}
        landCoverCategoryCounts={landCoverCategoryCounts}
        landCoverSettings={printModelSettings.layers.landCover}
        onClose={() => onAdvancedLayerPanelChange(null)}
        onOpenLandCoverCategoryChange={onOpenLandCoverCategoryChange}
        openLandCoverCategory={openLandCoverCategory}
      />
    );
  }

  const finalSizeText = formatMillimeters(printableSize.totalSideMm);
  const mapSideText = formatMillimeters(printableSize.mapSideMm);

  return (
    <>
      <Button
        aria-busy={isExporting}
        disabled={!printModelData || isPrintModelLoading || isExporting}
        icon={
          isExporting ? (
            <LoaderCircle
              aria-hidden="true"
              className={styles.exportSpinner}
              size={ICON_SIZES.SEARCH}
            />
          ) : (
            <Download aria-hidden="true" size={ICON_SIZES.SEARCH} />
          )
        }
        onClick={onExportPrintableModel}
        variant="export"
      >
        <span>
          {isExporting
            ? COMMON_TEXT.buttons.exporting
            : COMMON_TEXT.buttons.export}
        </span>
      </Button>

      <PanelSection>
        <div className={styles.tabs} role="tablist">
          <Button
            aria-selected={printTab === "model"}
            onClick={() => onPrintTabChange("model")}
            role="tab"
          >
            {PRINT_TEXT.tabs.model}
          </Button>
          <Button
            aria-selected={printTab === "layers"}
            onClick={() => onPrintTabChange("layers")}
            role="tab"
          >
            {PRINT_TEXT.tabs.layers}
          </Button>
        </div>
        {printModelData?.warnings.length ? (
          <div className={styles.warnings}>
            {printModelData.warnings
              .slice(0, INLINE_PRINT_WARNING_LIMIT)
              .map((warning) => (
                <p className={styles.warning} key={warning}>
                  {warning}
                </p>
              ))}
          </div>
        ) : null}
        {printTab === "model" ? (
          <ModelSettingsPanel
            actions={actions}
            onModelSectionToggle={onModelSectionToggle}
            onPrintStatusChange={onPrintStatusChange}
            openModelSections={openModelSections}
            finalSizeText={finalSizeText}
            mapSideText={mapSideText}
            printableSize={printableSize}
            printModelSettings={printModelSettings}
          />
        ) : (
          <LayerSettingsPanel
            actions={actions}
            buildingHeightMetrics={buildingHeightMetrics}
            onAdvancedLayerPanelChange={onAdvancedLayerPanelChange}
            onLayerSectionToggle={onLayerSectionToggle}
            onPrintLayerToggle={onPrintLayerToggle}
            openLayerSections={openLayerSections}
            printLayers={printLayers}
            printModelSettings={printModelSettings}
          />
        )}
      </PanelSection>

    </>
  );
}
