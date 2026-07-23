import type { PrintableModelData } from "@/lib/printModel";

export type UsePrintSettingsParams = {
  printModelData: PrintableModelData | null;
  radiusMeters: number;
};
