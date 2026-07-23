import type {
  PrintableLandCoverCategoryKey,
  PrintableLandCoverSettings,
} from "@/lib/printModel";
import type { PrintSettingsActions } from "../../types";

export type AdvancedLandCoverSettingsProps = {
  actions: PrintSettingsActions;
  landCoverCategoryCounts: Record<PrintableLandCoverCategoryKey, number>;
  landCoverSettings: PrintableLandCoverSettings;
  onClose: () => void;
  onOpenLandCoverCategoryChange: (
    key: PrintableLandCoverCategoryKey | null,
  ) => void;
  openLandCoverCategory: PrintableLandCoverCategoryKey | null;
};
