import type { ElementType } from "react";
import type {
  PrintableLayerKey,
  PrintableLayers,
  PrintableModelSettings,
} from "@/lib/printModel";
import type {
  AdvancedLayerPanel,
  BuildingHeightMetrics,
  LayerSettingsSectionKey,
  PrintSettingsActions,
} from "../../types";

export type LayerSettingsPanelProps = {
  actions: PrintSettingsActions;
  buildingHeightMetrics: BuildingHeightMetrics;
  onAdvancedLayerPanelChange: (panel: AdvancedLayerPanel) => void;
  onLayerSectionToggle: (key: LayerSettingsSectionKey) => void;
  onPrintLayerToggle: (key: PrintableLayerKey) => void;
  openLayerSections: Record<LayerSettingsSectionKey, boolean>;
  printLayers: PrintableLayers;
  printModelSettings: PrintableModelSettings;
};

export type LayerHeaderProps = {
  enabled: boolean;
  icon: ElementType;
  keyName: LayerSettingsSectionKey;
  label: string;
  onLayerSectionToggle: (key: LayerSettingsSectionKey) => void;
  onPrintLayerToggle: (key: PrintableLayerKey) => void;
  openLayerSections: Record<LayerSettingsSectionKey, boolean>;
};

export type RoadWidthSummaryProps = {
  roadSettings: PrintableModelSettings["layers"]["roads"];
};
