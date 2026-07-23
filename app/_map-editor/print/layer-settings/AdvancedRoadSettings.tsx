"use client";

import { X } from "lucide-react";
import Button from "@/components/Button";
import ColorField from "@/components/ColorField";
import DisclosureHeader from "@/components/DisclosureHeader";
import IconButton from "@/components/IconButton";
import RangeNumberField from "@/components/RangeNumberField";
import Switch from "@/components/Switch";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import {
  clampPrintableValue,
  getRoadCategoryWidthMm,
  PRINTABLE_LAYER_LIMITS,
  PRINTABLE_ROAD_CATEGORIES,
} from "@/lib/printModel";
import { formatMillimeters } from "../../utils/format";
import RenderModeField from "./RenderModeField";
import styles from "./AdvancedSettings.module.css";
import type { AdvancedRoadSettingsProps } from "./AdvancedRoadSettings.types";

const EMPTY_CATEGORY_COUNT = 0;
const COMMON_TEXT = APP_TEXT.common;
const PRINT_TEXT = APP_TEXT.printSettings;
const ADVANCED_TEXT = APP_TEXT.printSettings.advanced;
const LAYER_TEXT = APP_TEXT.printSettings.layers;

export default function AdvancedRoadSettings({
  actions,
  onClose,
  onOpenRoadCategoryChange,
  openRoadCategory,
  roadCategoryCounts,
  roadSettings,
}: AdvancedRoadSettingsProps) {
  return (
    <section
      className={styles.panel}
      aria-label={ADVANCED_TEXT.roadTitle}
    >
      <div className={styles.panelTitle}>
        <h2>{ADVANCED_TEXT.roadTitle}</h2>
        <IconButton
          label={ADVANCED_TEXT.roadClose}
          onClick={onClose}
          variant="advancedClose"
        >
          <X aria-hidden="true" size={ICON_SIZES.CLOSE} />
        </IconButton>
      </div>
      <Button variant="reset" onClick={actions.resetRoadSettings}>
        {COMMON_TEXT.buttons.resetAll}
      </Button>
      <div className={styles.categoryList}>
        {PRINTABLE_ROAD_CATEGORIES.map(({ description, key, label }) => {
          const category = roadSettings.categories[key];
          const count = roadCategoryCounts[key];
          const isOpen = openRoadCategory === key;
          const computedWidth = getRoadCategoryWidthMm(roadSettings, key);

          return (
            <section className={styles.categorySection} key={key}>
              <DisclosureHeader
                actions={
                  <Switch
                    checked={category.enabled && count > EMPTY_CATEGORY_COUNT}
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    label={PRINT_TEXT.categories.roadSwitch(label)}
                    onChange={(checked) =>
                      actions.updateRoadCategory(key, { enabled: checked })
                    }
                  />
                }
                containerClassName={styles.categoryHeader}
                isOpen={isOpen}
                onToggle={() => onOpenRoadCategoryChange(isOpen ? null : key)}
                title={label}
                titleClassName={styles.categoryTitle}
                titleMeta={ADVANCED_TEXT.roadCount(count.toLocaleString())}
              />
              {isOpen ? (
                <div className={styles.categoryContent}>
                  <p className={styles.categoryDescription}>{description}</p>
                  <RenderModeField
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    id={`${key}-render-mode`}
                    onChange={(renderMode) =>
                      actions.updateRoadCategory(key, { renderMode })
                    }
                    value={category.renderMode}
                  />
                  <RangeNumberField
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    displayValue={`${formatMillimeters(
                      category.extrudedHeightMm,
                    )} ${COMMON_TEXT.units.millimetersShort}`}
                    id={`${key}-extruded-height`}
                    label={LAYER_TEXT.shared.extrudedHeightTitleCase}
                    limits={PRINTABLE_LAYER_LIMITS.roadExtrudedHeightMm}
                    onChange={(value) =>
                      actions.updateRoadCategory(key, {
                        extrudedHeightMm: clampPrintableValue(
                          value,
                          PRINTABLE_LAYER_LIMITS.roadExtrudedHeightMm,
                        ),
                      })
                    }
                    value={category.extrudedHeightMm}
                  />
                  <RangeNumberField
                    disabled={count === EMPTY_CATEGORY_COUNT}
                    displayValue={`${formatMillimeters(computedWidth)} ${
                      COMMON_TEXT.units.millimetersShort
                    }`}
                    id={`${key}-width`}
                    label={LAYER_TEXT.shared.width}
                    limits={PRINTABLE_LAYER_LIMITS.roadWidthMm}
                    onChange={(value) =>
                      actions.updateRoadCategory(key, {
                        widthMm:
                          clampPrintableValue(
                            value,
                            PRINTABLE_LAYER_LIMITS.roadWidthMm,
                          ) / roadSettings.widthScale,
                      })
                    }
                    value={computedWidth}
                  />
                  <div className={styles.controlGroup}>
                    <label className={styles.label} htmlFor={`${key}-color`}>
                      {LAYER_TEXT.shared.color}
                    </label>
                    <ColorField
                      color={category.color}
                      disabled={count === EMPTY_CATEGORY_COUNT}
                      id={`${key}-color`}
                      label={PRINT_TEXT.categories.scopedColor(label)}
                      onChange={(color) =>
                        actions.updateRoadCategory(key, { color })
                      }
                    />
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
