import type {
  getPrintableModelSize,
  PrintableLandCoverCategoryKey,
  PrintableLayers,
  PrintableModelData,
  PrintableModelSettings,
  PrintableRoadCategoryKey,
} from "@/lib/printModel";
import type {
  AdvancedLayerPanel,
  BuildingHeightMetrics,
  LayerSettingsSectionKey,
  ModelSettingsSectionKey,
  PrintSettingsActions,
  PrintTab,
} from "../../types";

export type PrintableSize = ReturnType<typeof getPrintableModelSize>;

export type PrintSidebarProps = {
  actions: PrintSettingsActions;
  advancedLayerPanel: AdvancedLayerPanel | null;
  buildingHeightMetrics: BuildingHeightMetrics;
  isExporting: boolean;
  isPrintModelLoading: boolean;
  landCoverCategoryCounts: Record<PrintableLandCoverCategoryKey, number>;
  onAdvancedLayerPanelChange: (panel: AdvancedLayerPanel | null) => void;
  onExportPrintableModel: () => void;
  onLayerSectionToggle: (key: LayerSettingsSectionKey) => void;
  onModelSectionToggle: (key: ModelSettingsSectionKey) => void;
  onOpenLandCoverCategoryChange: (
    key: PrintableLandCoverCategoryKey | null,
  ) => void;
  onOpenRoadCategoryChange: (key: PrintableRoadCategoryKey | null) => void;
  onPrintLayerToggle: (key: keyof PrintableLayers) => void;
  onPrintStatusChange: (status: string) => void;
  onPrintTabChange: (tab: PrintTab) => void;
  openLandCoverCategory: PrintableLandCoverCategoryKey | null;
  openLayerSections: Record<LayerSettingsSectionKey, boolean>;
  openModelSections: Record<ModelSettingsSectionKey, boolean>;
  openRoadCategory: PrintableRoadCategoryKey | null;
  printableSize: PrintableSize;
  printLayers: PrintableLayers;
  printModelData: PrintableModelData | null;
  printModelSettings: PrintableModelSettings;
  printTab: PrintTab;
  roadCategoryCounts: Record<PrintableRoadCategoryKey, number>;
};
