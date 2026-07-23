import type {
  PrintableRoadCategoryKey,
  PrintableRoadSettings,
} from "@/lib/printModel";
import type { PrintSettingsActions } from "../../types";

export type AdvancedRoadSettingsProps = {
  actions: PrintSettingsActions;
  onClose: () => void;
  onOpenRoadCategoryChange: (key: PrintableRoadCategoryKey | null) => void;
  openRoadCategory: PrintableRoadCategoryKey | null;
  roadCategoryCounts: Record<PrintableRoadCategoryKey, number>;
  roadSettings: PrintableRoadSettings;
};
