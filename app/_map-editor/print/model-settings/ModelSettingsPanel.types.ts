import type {
  getPrintableModelSize,
  PrintableModelSettings,
} from "@/lib/printModel";
import type {
  ModelSettingsSectionKey,
  PrintSettingsActions,
} from "../../types";

export type PrintableSize = ReturnType<typeof getPrintableModelSize>;

export type ModelSettingsPanelProps = {
  actions: PrintSettingsActions;
  onModelSectionToggle: (key: ModelSettingsSectionKey) => void;
  onPrintStatusChange: (status: string) => void;
  openModelSections: Record<ModelSettingsSectionKey, boolean>;
  finalSizeText: string;
  mapSideText: string;
  printableSize: PrintableSize;
  printModelSettings: PrintableModelSettings;
};
