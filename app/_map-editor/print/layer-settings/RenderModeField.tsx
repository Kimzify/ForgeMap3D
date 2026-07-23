"use client";

import { CircleHelp } from "lucide-react";
import SelectField, { type SelectFieldOption } from "@/components/SelectField";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import type { PrintableRenderMode } from "@/lib/printModel";
import type { RenderModeFieldProps } from "./RenderModeField.types";

const RENDER_MODE_OPTIONS: Array<SelectFieldOption<PrintableRenderMode>> = [
  { label: APP_TEXT.common.renderMode.options.surface, value: "surface" },
  { label: APP_TEXT.common.renderMode.options.extruded, value: "extruded" },
];

export default function RenderModeField({
  disabled = false,
  id,
  onChange,
  value,
}: RenderModeFieldProps) {
  return (
    <SelectField
      disabled={disabled}
      helpIcon={<CircleHelp aria-hidden="true" size={ICON_SIZES.INLINE} />}
      id={id}
      label={APP_TEXT.common.renderMode.label}
      onChange={onChange}
      options={RENDER_MODE_OPTIONS}
      value={value}
    />
  );
}
