"use client";

import {
  Building2,
  ChevronDown,
  ChevronUp,
  Route,
  Sprout,
  Waves,
} from "lucide-react";
import Button from "@/components/Button";
import ColorField from "@/components/ColorField";
import DisclosureHeader from "@/components/DisclosureHeader";
import RangeNumberField from "@/components/RangeNumberField";
import SelectField from "@/components/SelectField";
import Switch from "@/components/Switch";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import {
  clampPrintableValue,
  getRoadCategoryWidthMm,
  PRINTABLE_LAYER_LIMITS,
  PRINTABLE_ROAD_CATEGORIES,
} from "@/lib/printModel";
import { formatDecimal, formatMillimeters } from "../../utils/format";
import RenderModeField from "./RenderModeField";
import type {
  LayerHeaderProps,
  LayerSettingsPanelProps,
  RoadWidthSummaryProps,
} from "./LayerSettingsPanel.types";
import styles from "./LayerSettingsPanel.module.css";

const BUILDING_METRIC_DECIMAL_PLACES = 1;
const COMMON_TEXT = APP_TEXT.common;
const LAYER_TEXT = APP_TEXT.printSettings.layers;

function LayerHeader({
  enabled,
  icon: Icon,
  keyName,
  label,
  onLayerSectionToggle,
  onPrintLayerToggle,
  openLayerSections,
}: LayerHeaderProps) {
  return (
    <DisclosureHeader
      actions={
        <Switch
          checked={enabled}
          label={label}
          onChange={() => onPrintLayerToggle(keyName)}
          className={styles.layerSwitch}
        />
      }
      containerClassName={styles.header}
      icon={Icon}
      isOpen={openLayerSections[keyName]}
      onToggle={() => onLayerSectionToggle(keyName)}
      title={label}
    />
  );
}

function RoadWidthSummary({
  roadSettings,
}: RoadWidthSummaryProps) {
  return (
    <dl className={`${styles.metricCard} ${styles.roadWidthSummary}`}>
      {PRINTABLE_ROAD_CATEGORIES.map(({ key, label }) => (
        <div key={key}>
          <dt>{label}:</dt>
          <dd>
            {getRoadCategoryWidthMm(roadSettings, key).toFixed(
              BUILDING_METRIC_DECIMAL_PLACES,
            )}
            {COMMON_TEXT.units.millimetersShort}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function LayerSettingsPanel({
  actions,
  buildingHeightMetrics,
  onAdvancedLayerPanelChange,
  onLayerSectionToggle,
  onPrintLayerToggle,
  openLayerSections,
  printLayers,
  printModelSettings,
}: LayerSettingsPanelProps) {
  const buildingSettings = printModelSettings.layers.buildings;
  const roadSettings = printModelSettings.layers.roads;
  const waterSettings = printModelSettings.layers.water;
  const landCoverSettings = printModelSettings.layers.landCover;

  return (
    <div className={styles.list}>
      <section className={styles.section}>
        <LayerHeader
          enabled={printLayers.buildings}
          icon={Building2}
          keyName="buildings"
          label={LAYER_TEXT.buildings.title}
          onLayerSectionToggle={onLayerSectionToggle}
          onPrintLayerToggle={onPrintLayerToggle}
          openLayerSections={openLayerSections}
        />
        {openLayerSections.buildings ? (
          <div className={styles.content}>
            <div className={styles.controlGroup}>
              <label className={styles.label} htmlFor="building-data">
                {LAYER_TEXT.buildings.data}
              </label>
              <SelectField
                disabled={!printLayers.buildings}
                id="building-data"
                label={LAYER_TEXT.buildings.data}
                onChange={(data) => actions.updateBuildingSettings({ data })}
                options={[
                  {
                    label: LAYER_TEXT.buildings.dataHighDetail,
                    value: "highDetail",
                  },
                ]}
                value={buildingSettings.data}
              />
              <p className={styles.help}>
                {LAYER_TEXT.buildings.dataHelp}
              </p>
              <p className={styles.warning}>{LAYER_TEXT.buildings.dataWarning}</p>
            </div>

            <RangeNumberField
              disabled={!printLayers.buildings}
              displayValue={formatDecimal(buildingSettings.heightExaggeration)}
              id="building-height-exaggeration"
              label={LAYER_TEXT.buildings.heightExaggeration}
              limits={PRINTABLE_LAYER_LIMITS.buildingHeightExaggeration}
              onChange={(value) =>
                actions.updateBuildingSettings({
                  heightExaggeration: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.buildingHeightExaggeration,
                  ),
                })
              }
              value={buildingSettings.heightExaggeration}
            />

            <dl className={styles.metricCard}>
              <div>
                <dt>{LAYER_TEXT.buildings.lowest}</dt>
                <dd>
                  {buildingHeightMetrics.lowestMm.toFixed(
                    BUILDING_METRIC_DECIMAL_PLACES,
                  )}
                  {COMMON_TEXT.units.millimetersShort}
                </dd>
              </div>
              <div>
                <dt>{LAYER_TEXT.buildings.highest}</dt>
                <dd>
                  {buildingHeightMetrics.highestMm.toFixed(
                    BUILDING_METRIC_DECIMAL_PLACES,
                  )}
                  {COMMON_TEXT.units.millimetersShort}
                </dd>
              </div>
            </dl>

            <div className={styles.controlGroup}>
              <label className={styles.label} htmlFor="buildings-color">
                {LAYER_TEXT.buildings.color}
              </label>
              <ColorField
                color={buildingSettings.color}
                disabled={!printLayers.buildings}
                id="buildings-color"
                label={LAYER_TEXT.buildings.colorLabel}
                onChange={(color) => actions.updateBuildingSettings({ color })}
              />
            </div>

            <label className={styles.toggleRow}>
              <span>{LAYER_TEXT.buildings.showEdges}</span>
              <Switch
                checked={buildingSettings.showEdges}
                disabled={!printLayers.buildings}
                label={LAYER_TEXT.buildings.showEdgesLabel}
                onChange={(checked) =>
                  actions.updateBuildingSettings({ showEdges: checked })
                }
              />
            </label>

            <RangeNumberField
              disabled={!printLayers.buildings}
              displayValue={`${formatMillimeters(
                buildingSettings.verticalOffsetMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="building-vertical-offset"
              label={LAYER_TEXT.shared.verticalOffset}
              limits={PRINTABLE_LAYER_LIMITS.buildingVerticalOffsetMm}
              onChange={(value) =>
                actions.updateBuildingSettings({
                  verticalOffsetMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.buildingVerticalOffsetMm,
                  ),
                })
              }
              value={buildingSettings.verticalOffsetMm}
            />
            <p className={styles.help}>
              {LAYER_TEXT.shared.verticalOffsetHelp}
            </p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <LayerHeader
          enabled={printLayers.roads}
          icon={Route}
          keyName="roads"
          label={LAYER_TEXT.roads.title}
          onLayerSectionToggle={onLayerSectionToggle}
          onPrintLayerToggle={onPrintLayerToggle}
          openLayerSections={openLayerSections}
        />
        {openLayerSections.roads ? (
          <div className={styles.content}>
            <RenderModeField
              disabled={!printLayers.roads}
              id="roads-render-mode"
              onChange={(renderMode) => {
                actions.updateRoadSettings({ renderMode });
                actions.updateAllRoadCategories({ renderMode });
              }}
              value={roadSettings.renderMode}
            />
            <RangeNumberField
              disabled={!printLayers.roads}
              displayValue={`${formatMillimeters(
                roadSettings.extrudedHeightMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="roads-extruded-height"
              label={LAYER_TEXT.shared.extrudedHeight}
              limits={PRINTABLE_LAYER_LIMITS.roadExtrudedHeightMm}
              onChange={(value) => {
                const extrudedHeightMm = clampPrintableValue(
                  value,
                  PRINTABLE_LAYER_LIMITS.roadExtrudedHeightMm,
                );
                actions.updateRoadSettings({ extrudedHeightMm });
                actions.updateAllRoadCategories({ extrudedHeightMm });
              }}
              value={roadSettings.extrudedHeightMm}
            />
            <RangeNumberField
              disabled={!printLayers.roads}
              displayValue={formatDecimal(roadSettings.widthScale)}
              id="roads-width-scale"
              label={LAYER_TEXT.roads.widthScale}
              limits={PRINTABLE_LAYER_LIMITS.roadWidthScale}
              onChange={(value) =>
                actions.updateRoadSettings({
                  widthScale: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.roadWidthScale,
                  ),
                })
              }
              value={roadSettings.widthScale}
            />
            <Button
              variant="advanced"
              onClick={() => onAdvancedLayerPanelChange("roads")}
            >
              {LAYER_TEXT.advancedRoads}
            </Button>
            <Button
              icon={
                roadSettings.showComputedWidths ? (
                  <ChevronUp aria-hidden="true" size={ICON_SIZES.INLINE} />
                ) : (
                  <ChevronDown aria-hidden="true" size={ICON_SIZES.INLINE} />
                )
              }
              iconPosition="end"
              variant="inlineDisclosure"
              onClick={() =>
                actions.updateRoadSettings({
                  showComputedWidths: !roadSettings.showComputedWidths,
                })
              }
            >
              <span>{LAYER_TEXT.roads.computedWidthsToggle}</span>
            </Button>
            {roadSettings.showComputedWidths ? (
              <RoadWidthSummary roadSettings={roadSettings} />
            ) : null}

            <div className={styles.controlGroup}>
              <label className={styles.label} htmlFor="roads-color">
                {LAYER_TEXT.roads.color}
              </label>
              <ColorField
                color={roadSettings.color}
                disabled={!printLayers.roads}
                id="roads-color"
                label={LAYER_TEXT.roads.colorLabel}
                onChange={(color) => {
                  actions.updateRoadSettings({ color });
                  actions.updateAllRoadCategories({ color });
                }}
              />
            </div>

            <RangeNumberField
              disabled={!printLayers.roads}
              displayValue={`${formatMillimeters(
                roadSettings.verticalOffsetMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="roads-vertical-offset"
              label={LAYER_TEXT.shared.verticalOffset}
              limits={PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm}
              onChange={(value) =>
                actions.updateRoadSettings({
                  verticalOffsetMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm,
                  ),
                })
              }
              value={roadSettings.verticalOffsetMm}
            />
            <p className={styles.help}>
              {LAYER_TEXT.shared.verticalOffsetLayerHelp(LAYER_TEXT.roads.title.toLowerCase())}
            </p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <LayerHeader
          enabled={printLayers.water}
          icon={Waves}
          keyName="water"
          label={LAYER_TEXT.water.title}
          onLayerSectionToggle={onLayerSectionToggle}
          onPrintLayerToggle={onPrintLayerToggle}
          openLayerSections={openLayerSections}
        />
        {openLayerSections.water ? (
          <div className={styles.content}>
            <RenderModeField
              disabled={!printLayers.water}
              id="water-render-mode"
              onChange={(renderMode) => actions.updateWaterSettings({ renderMode })}
              value={waterSettings.renderMode}
            />
            <RangeNumberField
              disabled={!printLayers.water}
              displayValue={`${formatMillimeters(
                waterSettings.extrudedHeightMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="water-extruded-height"
              label={LAYER_TEXT.shared.extrudedHeight}
              limits={PRINTABLE_LAYER_LIMITS.waterExtrudedHeightMm}
              onChange={(value) =>
                actions.updateWaterSettings({
                  extrudedHeightMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.waterExtrudedHeightMm,
                  ),
                })
              }
              value={waterSettings.extrudedHeightMm}
            />
            <label className={styles.toggleRow}>
              <span>{LAYER_TEXT.water.sinkIntoTerrain}</span>
              <Switch
                checked={waterSettings.sinkIntoTerrain}
                disabled={!printLayers.water}
                label={LAYER_TEXT.water.sinkIntoTerrain}
                onChange={(checked) =>
                  actions.updateWaterSettings({ sinkIntoTerrain: checked })
                }
              />
            </label>
            <p className={styles.help}>
              {LAYER_TEXT.water.sinkHelp}
            </p>
            <RangeNumberField
              disabled={!printLayers.water || !waterSettings.sinkIntoTerrain}
              displayValue={`${formatMillimeters(waterSettings.sinkDepthMm)} ${
                COMMON_TEXT.units.millimetersShort
              }`}
              id="water-sink-depth"
              label={LAYER_TEXT.water.sinkDepth}
              limits={PRINTABLE_LAYER_LIMITS.waterSinkDepthMm}
              onChange={(value) =>
                actions.updateWaterSettings({
                  sinkDepthMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.waterSinkDepthMm,
                  ),
                })
              }
              value={waterSettings.sinkDepthMm}
            />
            <RangeNumberField
              disabled={!printLayers.water}
              displayValue={formatDecimal(waterSettings.opacity)}
              id="water-opacity"
              label={LAYER_TEXT.shared.opacity}
              limits={PRINTABLE_LAYER_LIMITS.layerOpacity}
              onChange={(value) =>
                actions.updateWaterSettings({
                  opacity: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.layerOpacity,
                  ),
                })
              }
              value={waterSettings.opacity}
            />
            <div className={styles.controlGroup}>
              <label className={styles.label} htmlFor="water-color">
                {LAYER_TEXT.water.color}
              </label>
              <ColorField
                color={waterSettings.color}
                disabled={!printLayers.water}
                id="water-color"
                label={LAYER_TEXT.water.colorLabel}
                onChange={(color) => actions.updateWaterSettings({ color })}
              />
            </div>
            <RangeNumberField
              disabled={!printLayers.water}
              displayValue={`${formatMillimeters(
                waterSettings.verticalOffsetMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="water-vertical-offset"
              label={LAYER_TEXT.shared.verticalOffset}
              limits={PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm}
              onChange={(value) =>
                actions.updateWaterSettings({
                  verticalOffsetMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm,
                  ),
                })
              }
              value={waterSettings.verticalOffsetMm}
            />
            <p className={styles.help}>
              {LAYER_TEXT.shared.verticalOffsetLayerHelp(LAYER_TEXT.water.title.toLowerCase())}
            </p>
            <div className={styles.divider} />
            <label className={styles.toggleRow}>
              <span>{LAYER_TEXT.water.hideSmall}</span>
              <Switch
                checked={waterSettings.hideSmallWaterBodies}
                disabled={!printLayers.water}
                label={LAYER_TEXT.water.hideSmall}
                onChange={(checked) =>
                  actions.updateWaterSettings({ hideSmallWaterBodies: checked })
                }
              />
            </label>
            <p className={styles.help}>
              {LAYER_TEXT.water.hideSmallHelp}
            </p>
            <div className={styles.nestedSettings}>
              <RangeNumberField
                disabled={!printLayers.water || !waterSettings.hideSmallWaterBodies}
                displayValue={`${formatMillimeters(
                  waterSettings.minimumWidthMm,
                )} ${COMMON_TEXT.units.millimetersShort}`}
                id="water-minimum-width"
                label={LAYER_TEXT.water.minimumWidth}
                limits={PRINTABLE_LAYER_LIMITS.waterMinimumWidthMm}
                onChange={(value) =>
                  actions.updateWaterSettings({
                    minimumWidthMm: clampPrintableValue(
                      value,
                      PRINTABLE_LAYER_LIMITS.waterMinimumWidthMm,
                    ),
                  })
                }
                value={waterSettings.minimumWidthMm}
              />
              <p className={styles.help}>
                {LAYER_TEXT.water.minimumWidthHelp}
              </p>
              <RangeNumberField
                disabled={!printLayers.water || !waterSettings.hideSmallWaterBodies}
                displayValue={`${formatMillimeters(
                  waterSettings.minimumAreaMm2,
                )} ${COMMON_TEXT.units.squareMillimetersShort}`}
                id="water-minimum-area"
                label={LAYER_TEXT.water.minimumArea}
                limits={PRINTABLE_LAYER_LIMITS.waterMinimumAreaMm2}
                onChange={(value) =>
                  actions.updateWaterSettings({
                    minimumAreaMm2: clampPrintableValue(
                      value,
                      PRINTABLE_LAYER_LIMITS.waterMinimumAreaMm2,
                    ),
                  })
                }
                value={waterSettings.minimumAreaMm2}
              />
              <p className={styles.help}>
                {LAYER_TEXT.water.minimumAreaHelp}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <LayerHeader
          enabled={printLayers.landCover}
          icon={Sprout}
          keyName="landCover"
          label={LAYER_TEXT.landCover.title}
          onLayerSectionToggle={onLayerSectionToggle}
          onPrintLayerToggle={onPrintLayerToggle}
          openLayerSections={openLayerSections}
        />
        {openLayerSections.landCover ? (
          <div className={styles.content}>
            <RenderModeField
              disabled={!printLayers.landCover}
              id="land-cover-render-mode"
              onChange={(renderMode) => {
                actions.updateLandCoverSettings({ renderMode });
                actions.updateAllLandCoverCategories({ renderMode });
              }}
              value={landCoverSettings.renderMode}
            />
            <RangeNumberField
              disabled={!printLayers.landCover}
              displayValue={`${formatMillimeters(
                landCoverSettings.extrudedHeightMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="land-cover-extruded-height"
              label={LAYER_TEXT.shared.extrudedHeight}
              limits={PRINTABLE_LAYER_LIMITS.landCoverExtrudedHeightMm}
              onChange={(value) => {
                const extrudedHeightMm = clampPrintableValue(
                  value,
                  PRINTABLE_LAYER_LIMITS.landCoverExtrudedHeightMm,
                );
                actions.updateLandCoverSettings({ extrudedHeightMm });
                actions.updateAllLandCoverCategories({ extrudedHeightMm });
              }}
              value={landCoverSettings.extrudedHeightMm}
            />
            <p className={styles.help}>
              {LAYER_TEXT.landCover.categoryHeightHelp}
            </p>
            <label className={styles.toggleRow}>
              <span>{LAYER_TEXT.landCover.carveIntoTerrain}</span>
              <Switch
                checked={landCoverSettings.carveIntoTerrain}
                disabled={!printLayers.landCover}
                label={LAYER_TEXT.landCover.carveIntoTerrainLabel}
                onChange={(checked) => {
                  actions.updateLandCoverSettings({ carveIntoTerrain: checked });
                  actions.updateAllLandCoverCategories({
                    carveIntoTerrain: checked,
                  });
                }}
              />
            </label>
            <p className={styles.help}>
              {LAYER_TEXT.landCover.carveAllHelp}
            </p>
            <RangeNumberField
              disabled={
                !printLayers.landCover || !landCoverSettings.carveIntoTerrain
              }
              displayValue={`${formatMillimeters(
                landCoverSettings.carveDepthMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="land-cover-carve-depth"
              label={LAYER_TEXT.landCover.carveDepth}
              limits={PRINTABLE_LAYER_LIMITS.landCoverCarveDepthMm}
              onChange={(value) => {
                const carveDepthMm = clampPrintableValue(
                  value,
                  PRINTABLE_LAYER_LIMITS.landCoverCarveDepthMm,
                );
                actions.updateLandCoverSettings({ carveDepthMm });
                actions.updateAllLandCoverCategories({ carveDepthMm });
              }}
              value={landCoverSettings.carveDepthMm}
            />
            <Button
              variant="advanced"
              onClick={() => onAdvancedLayerPanelChange("landCover")}
            >
              {LAYER_TEXT.advancedLandCover}
            </Button>
            <RangeNumberField
              disabled={!printLayers.landCover}
              displayValue={formatDecimal(landCoverSettings.opacity)}
              id="land-cover-opacity"
              label={LAYER_TEXT.landCover.opacity}
              limits={PRINTABLE_LAYER_LIMITS.layerOpacity}
              onChange={(value) =>
                actions.updateLandCoverSettings({
                  opacity: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.layerOpacity,
                  ),
                })
              }
              value={landCoverSettings.opacity}
            />
            <RangeNumberField
              disabled={!printLayers.landCover}
              displayValue={`${formatMillimeters(
                landCoverSettings.verticalOffsetMm,
              )} ${COMMON_TEXT.units.millimetersShort}`}
              id="land-cover-vertical-offset"
              label={LAYER_TEXT.shared.verticalOffset}
              limits={PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm}
              onChange={(value) =>
                actions.updateLandCoverSettings({
                  verticalOffsetMm: clampPrintableValue(
                    value,
                    PRINTABLE_LAYER_LIMITS.layerVerticalOffsetMm,
                  ),
                })
              }
              value={landCoverSettings.verticalOffsetMm}
            />
            <p className={styles.help}>
              {LAYER_TEXT.shared.verticalOffsetLayerHelp(
                LAYER_TEXT.landCover.title.toLowerCase(),
              )}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
