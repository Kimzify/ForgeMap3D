import type { PrintableRenderMode } from "@/lib/printModel";

export type RenderModeFieldProps = {
  disabled?: boolean;
  id: string;
  onChange: (value: PrintableRenderMode) => void;
  value: PrintableRenderMode;
};
