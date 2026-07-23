import type { AppConfig } from "@/lib/dataSources";
import type {
  PrintableLandCoverCategoryKey,
  PrintableLandCoverSettings,
  PrintableModelSettings,
  PrintableRoadCategoryKey,
  PrintableRoadSettings,
} from "@/lib/printModel";

export type PrintTab = "model" | "layers";
export type ModelSettingsSectionKey = "dimensions" | "frame";
export type LayerSettingsSectionKey = "buildings" | "roads" | "water" | "landCover";
export type AdvancedLayerPanel = "roads" | "landCover";

export type LocationSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
};

export type LocationSearchOptions = {
  selectFirst?: boolean;
  signal?: AbortSignal;
};

export type MapAttribution = {
  osm: AppConfig["openStreetMap"];
  threeDbag: AppConfig["threeDbag"];
};

export type BuildingHeightMetrics = {
  highestMm: number;
  lowestMm: number;
};

export type PrintSettingsActions = {
  resetLandCoverSettings: () => void;
  resetRoadSettings: () => void;
  updateAllLandCoverCategories: (
    updates: Partial<
      PrintableLandCoverSettings["categories"][PrintableLandCoverCategoryKey]
    >,
  ) => void;
  updateAllRoadCategories: (
    updates: Partial<PrintableRoadSettings["categories"][PrintableRoadCategoryKey]>,
  ) => void;
  updateBaseHeightMm: (value: number) => void;
  updateBuildingSettings: (
    updates: Partial<PrintableModelSettings["layers"]["buildings"]>,
  ) => void;
  updateFrameHeightMm: (value: number) => void;
  updateFrameWidthMm: (value: number) => void;
  updateLandCoverCategory: (
    key: PrintableLandCoverCategoryKey,
    updates: Partial<
      PrintableLandCoverSettings["categories"][PrintableLandCoverCategoryKey]
    >,
  ) => void;
  updateLandCoverSettings: (
    updates: Partial<PrintableLandCoverSettings>,
  ) => void;
  updateLargestSideMm: (value: number) => void;
  updatePrintDimensions: (
    updates: Partial<PrintableModelSettings["dimensions"]>,
  ) => void;
  updatePrintFrame: (
    updates: Partial<PrintableModelSettings["frame"]>,
  ) => void;
  updateRoadCategory: (
    key: PrintableRoadCategoryKey,
    updates: Partial<PrintableRoadSettings["categories"][PrintableRoadCategoryKey]>,
  ) => void;
  updateRoadSettings: (updates: Partial<PrintableRoadSettings>) => void;
  updateWaterSettings: (
    updates: Partial<PrintableModelSettings["layers"]["water"]>,
  ) => void;
};
