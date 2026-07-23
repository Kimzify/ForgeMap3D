"use client";

import { X } from "lucide-react";
import Button from "@/components/Button";
import ColorField from "@/components/ColorField";
import DisclosureHeader from "@/components/DisclosureHeader";
import IconButton from "@/components/IconButton";
import RangeNumberField from "@/components/RangeNumberField";
import SegmentedControl from "@/components/SegmentedControl";
import Switch from "@/components/Switch";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import {
  clampPrintableValue,
  PRINTABLE_LAND_COVER_CATEGORIES,
  PRINTABLE_LAYER_LIMITS,
} from "@/lib/printModel";
import { formatMillimeters } from "../../utils/format";
import styles from "./AdvancedSettings.module.css";
import type { AdvancedLandCoverSettingsProps } from "./AdvancedLandCoverSettings.types";

const EMPTY_CATEGORY_COUNT = 0;
const COMMON_TEXT = APP_TEXT.common;
const PRINT_TEXT = APP_TEXT.printSettings;
const ADVANCED_TEXT = APP_TEXT.printSettings.advanced;
const LAYER_TEXT = APP_TEXT.printSettings.layers;

export default function AdvancedLandCoverSettings({
  actions,
  landCoverCategoryCounts,
  landCoverSettings,
  onClose,
  onOpenLandCoverCategoryChange,
  openLandCoverCategory,
}: AdvancedLandCoverSettingsProps) {
  return (
    <section
      className={styles.panel}
      aria-label={ADVANCED_TEXT.landCoverTitle}
    >
      <div className={styles.panelTitle}>
        <h2>{ADVANCED_TEXT.landCoverTitle}</h2>
        <IconButton
          label={ADVANCED_TEXT.landCoverClose}
          onClick={onClose}
          variant="advancedClose"
        >
          <X aria-hidden="true" size={ICON_SIZES.CLOSE} />
        </IconButton>
      </div>
      <Button variant="reset" onClick={actions.resetLandCoverSettings}>
        {COMMON_TEXT.buttons.resetAll}
      </Button>
      <div className={styles.categoryList}>
        {PRINTABLE_LAND_COVER_CATEGORIES.map(({ description, key, label }) => {
          const category = landCoverSettings.categories[key];
          const count = landCoverCategoryCounts[key];
          const isOpen = openLandCoverCategory === key;

          return (
            <section className={styles.categorySection} key={key}>
              <DisclosureHeader
                actions={
                  <Switch
                    checked={category.enabled && count > EMPTY_CATEGORY_COUNT}
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    label={PRINT_TEXT.categories.landCoverSwitch(label)}
                    onChange={(checked) =>
                      actions.updateLandCoverCategory(key, { enabled: checked })
                    }
                  />
                }
                containerClassName={styles.categoryHeader}
                isOpen={isOpen}
                onToggle={() =>
                  onOpenLandCoverCategoryChange(isOpen ? null : key)
                }
                title={label}
                titleClassName={styles.categoryTitle}
                titleMeta={ADVANCED_TEXT.areaCount(count.toLocaleString())}
              />
              {isOpen ? (
                <div className={styles.categoryContent}>
                  <p className={styles.categoryDescription}>{description}</p>
                  <div className={styles.controlGroup}>
                    <label
                      className={styles.label}
                      htmlFor={`${key}-land-color`}
                    >
                      {LAYER_TEXT.landCover.color}
                    </label>
                    <ColorField
                      color={category.color}
                      disabled={count === EMPTY_CATEGORY_COUNT}
                      id={`${key}-land-color`}
                      label={PRINT_TEXT.categories.scopedLandCoverColor(label)}
                      onChange={(color) =>
                        actions.updateLandCoverCategory(key, { color })
                      }
                    />
                  </div>
                  <div className={styles.controlGroup}>
                    <p className={styles.label}>
                      {COMMON_TEXT.renderMode.label}
                    </p>
                    <SegmentedControl
                      disabled={count === EMPTY_CATEGORY_COUNT}
                      onChange={(renderMode) =>
                        actions.updateLandCoverCategory(key, { renderMode })
                      }
                      options={[
                        {
                          label: COMMON_TEXT.renderMode.options.surface,
                          value: "surface",
                        },
                        {
                          label: COMMON_TEXT.renderMode.options.extruded,
                          value: "extruded",
                        },
                      ]}
                      value={category.renderMode}
                    />
                  </div>
                  <RangeNumberField
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    displayValue={`${formatMillimeters(
                      category.extrudedHeightMm,
                    )} ${COMMON_TEXT.units.millimetersShort}`}
                    id={`${key}-land-extruded-height`}
                    label={LAYER_TEXT.shared.extrudedHeight}
                    limits={PRINTABLE_LAYER_LIMITS.landCoverExtrudedHeightMm}
                    onChange={(value) =>
                      actions.updateLandCoverCategory(key, {
                        extrudedHeightMm: clampPrintableValue(
                          value,
                          PRINTABLE_LAYER_LIMITS.landCoverExtrudedHeightMm,
                        ),
                      })
                    }
                    value={category.extrudedHeightMm}
                  />
                  <label className={styles.toggleRow}>
                    <span>{LAYER_TEXT.landCover.carveIntoTerrain}</span>
                    <Switch
                      checked={category.carveIntoTerrain}
                      disabled={count === EMPTY_CATEGORY_COUNT}
                      label={PRINT_TEXT.categories.scopedLandCoverCarve(label)}
                      onChange={(checked) =>
                        actions.updateLandCoverCategory(key, {
                          carveIntoTerrain: checked,
                        })
                      }
                    />
                  </label>
                  <p className={styles.help}>
                    {LAYER_TEXT.landCover.carveSingleHelp}
                  </p>
                  <RangeNumberField
                    disabled={
                      count === EMPTY_CATEGORY_COUNT ||
                      !category.carveIntoTerrain
                    }
                    displayValue={`${formatMillimeters(category.carveDepthMm)} ${
                      COMMON_TEXT.units.millimetersShort
                    }`}
                    id={`${key}-land-carve-depth`}
                    label={LAYER_TEXT.landCover.carveDepth}
                    limits={PRINTABLE_LAYER_LIMITS.landCoverCarveDepthMm}
                    onChange={(value) =>
                      actions.updateLandCoverCategory(key, {
                        carveDepthMm: clampPrintableValue(
                          value,
                          PRINTABLE_LAYER_LIMITS.landCoverCarveDepthMm,
                        ),
                      })
                    }
                    value={category.carveDepthMm}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
