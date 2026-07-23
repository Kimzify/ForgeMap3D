"use client";

import {
  Grid3x3,
  Ruler,
  Square,
  SquareRoundCorner,
} from "lucide-react";
import Button from "@/components/Button";
import CheckboxRow from "@/components/CheckboxRow";
import ColorField from "@/components/ColorField";
import DisclosureHeader from "@/components/DisclosureHeader";
import RangeNumberField from "@/components/RangeNumberField";
import SegmentedControl from "@/components/SegmentedControl";
import Switch from "@/components/Switch";
import { APP_TEXT } from "@/lib/text";
import {
  PRINTABLE_DIMENSION_LIMITS,
  PRINTABLE_FRAME_LIMITS,
} from "@/lib/printModel";
import { formatMillimeters } from "../../utils/format";
import styles from "./ModelSettingsPanel.module.css";
import type { ModelSettingsPanelProps } from "./ModelSettingsPanel.types";

const COMMON_TEXT = APP_TEXT.common;
const MODEL_TEXT = APP_TEXT.printSettings.model;

export default function ModelSettingsPanel({
  actions,
  finalSizeText,
  mapSideText,
  onModelSectionToggle,
  onPrintStatusChange,
  openModelSections,
  printableSize,
  printModelSettings,
}: ModelSettingsPanelProps) {
  const dimensions = printModelSettings.dimensions;
  const frame = printModelSettings.frame;

  return (
    <div className={styles.list}>
      <section className={styles.section}>
        <DisclosureHeader
          containerClassName={styles.header}
          icon={Ruler}
          isOpen={openModelSections.dimensions}
          onToggle={() => onModelSectionToggle("dimensions")}
          title={MODEL_TEXT.dimensionsTitle}
        />

        {openModelSections.dimensions ? (
          <div className={styles.stack}>
            <div className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>{MODEL_TEXT.resizeTitle}</h3>
                  <p>{MODEL_TEXT.resizeDescription}</p>
                </div>
                <Switch
                  checked={dimensions.resizeForPrint}
                  label={MODEL_TEXT.resizeTitle}
                  onChange={(resizeForPrint) =>
                    actions.updatePrintDimensions({ resizeForPrint })
                  }
                />
              </div>

              <div>
                <RangeNumberField
                  disabled={!dimensions.resizeForPrint}
                  displayValue={`${formatMillimeters(printableSize.totalSideMm)} ${
                    COMMON_TEXT.units.millimetersShort
                  }`}
                  id="largest-side-size"
                  label={MODEL_TEXT.largestSide}
                  limits={PRINTABLE_DIMENSION_LIMITS.largestSideMm}
                  onChange={actions.updateLargestSideMm}
                  value={dimensions.largestSideMm}
                />
                <p className={styles.help}>{MODEL_TEXT.largestSideHelp}</p>
                <p className={styles.help}>
                  {MODEL_TEXT.largestSideFrameHelp(mapSideText)}
                </p>
              </div>

              <CheckboxRow
                checked={dimensions.lockModelHeight}
                onChange={(lockModelHeight) =>
                  actions.updatePrintDimensions({ lockModelHeight })
                }
              >
                {MODEL_TEXT.lockHeight}
              </CheckboxRow>
              <p className={styles.help}>{MODEL_TEXT.lockHeightHelp}</p>

              <div className={styles.divider} />

              <CheckboxRow
                checked={dimensions.splitIntoTiles}
                onChange={(splitIntoTiles) =>
                  actions.updatePrintDimensions({ splitIntoTiles })
                }
              >
                {MODEL_TEXT.splitTiles}
              </CheckboxRow>
              <p className={styles.help}>{MODEL_TEXT.splitTilesHelp}</p>
            </div>

            <div className={styles.card}>
              <div>
                <RangeNumberField
                  displayValue={`${formatMillimeters(dimensions.baseHeightMm)} ${
                    COMMON_TEXT.units.millimetersShort
                  }`}
                  id="base-height"
                  label={MODEL_TEXT.baseHeight}
                  limits={PRINTABLE_DIMENSION_LIMITS.baseHeightMm}
                  onChange={actions.updateBaseHeightMm}
                  value={dimensions.baseHeightMm}
                />
                <p className={styles.help}>{MODEL_TEXT.baseHeightHelp}</p>
              </div>
              <Button
                variant="settingsApply"
                onClick={() =>
                  onPrintStatusChange(MODEL_TEXT.dimensionsApplied(finalSizeText))
                }
              >
                {COMMON_TEXT.buttons.apply}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <DisclosureHeader
          actions={
            <Switch
              checked={frame.enabled}
              label={MODEL_TEXT.frame.enable}
              onChange={(enabled) => actions.updatePrintFrame({ enabled })}
            />
          }
          containerClassName={styles.header}
          icon={Grid3x3}
          isOpen={openModelSections.frame}
          onToggle={() => onModelSectionToggle("frame")}
          title={MODEL_TEXT.frame.title}
        />

        {openModelSections.frame ? (
          <div className={styles.card}>
            <div className={styles.controlGroup}>
              <p className={styles.label}>{MODEL_TEXT.frame.style}</p>
              <SegmentedControl
                disabled={!frame.enabled}
                onChange={(style) => actions.updatePrintFrame({ style })}
                options={[
                  { icon: Square, label: MODEL_TEXT.frame.square, value: "square" },
                  {
                    icon: SquareRoundCorner,
                    label: MODEL_TEXT.frame.rounded,
                    value: "rounded",
                  },
                ]}
                value={frame.style}
              />
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.label} htmlFor="frame-color">
                {MODEL_TEXT.frame.color}
              </label>
              <ColorField
                color={frame.color}
                disabled={!frame.enabled}
                id="frame-color"
                label={MODEL_TEXT.frame.color}
                onChange={(color) => actions.updatePrintFrame({ color })}
              />
            </div>

            <RangeNumberField
              disabled={!frame.enabled}
              displayValue={`${formatMillimeters(frame.widthMm)} ${
                COMMON_TEXT.units.millimetersShort
              }`}
              id="frame-width"
              label={MODEL_TEXT.frame.width}
              limits={PRINTABLE_FRAME_LIMITS.widthMm}
              onChange={actions.updateFrameWidthMm}
              value={frame.widthMm}
            />

            <div>
              <RangeNumberField
                disabled={!frame.enabled}
                displayValue={`${formatMillimeters(frame.heightMm)} ${
                  COMMON_TEXT.units.millimetersShort
                }`}
                id="frame-height"
                label={MODEL_TEXT.frame.height}
                limits={PRINTABLE_FRAME_LIMITS.heightMm}
                onChange={actions.updateFrameHeightMm}
                value={frame.heightMm}
              />
              <p className={styles.help}>{MODEL_TEXT.frame.heightHelp}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
