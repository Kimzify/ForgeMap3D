"use client";

import { useCallback, useMemo, useState } from "react";
import {
  clampPrintableValue,
  createDefaultPrintableModelSettings,
  DEFAULT_PRINTABLE_LAYERS,
  getPrintableLandCoverCategory,
  getPrintableModelSize,
  getPrintableRoadCategory,
  PRINTABLE_DIMENSION_LIMITS,
  PRINTABLE_FRAME_LIMITS,
  PRINTABLE_LAND_COVER_CATEGORIES,
  PRINTABLE_ROAD_CATEGORIES,
  type PrintableLandCoverCategoryKey,
  type PrintableLandCoverSettings,
  type PrintableLayerKey,
  type PrintableLayers,
  type PrintableModelSettings,
  type PrintableRoadCategoryKey,
  type PrintableRoadSettings,
} from "@/lib/printModel";
import type {
  AdvancedLayerPanel,
  LayerSettingsSectionKey,
  ModelSettingsSectionKey,
  PrintTab,
} from "../types";
import type { UsePrintSettingsParams } from "./usePrintSettings.types";

const EMPTY_CATEGORY_COUNT = 0;
const CATEGORY_COUNT_INCREMENT = 1;
const EMPTY_BUILDING_HEIGHT_MM = 0;
const MIN_BUILDING_HEIGHT_METERS = 0;
const MIN_LOCKED_MODEL_HEIGHT_MM = 1;
const DIAMETER_TO_RADIUS_DIVISOR = 2;

export function usePrintSettings({
  printModelData,
  radiusMeters,
}: UsePrintSettingsParams) {
  const [printLayers, setPrintLayers] = useState<PrintableLayers>(
    DEFAULT_PRINTABLE_LAYERS,
  );
  const [printTab, setPrintTab] = useState<PrintTab>("model");
  const [openModelSections, setOpenModelSections] = useState<
    Record<ModelSettingsSectionKey, boolean>
  >({
    dimensions: false,
    frame: false,
  });
  const [openLayerSections, setOpenLayerSections] = useState<
    Record<LayerSettingsSectionKey, boolean>
  >({
    buildings: false,
    landCover: false,
    roads: false,
    water: false,
  });
  const [advancedLayerPanel, setAdvancedLayerPanel] =
    useState<AdvancedLayerPanel | null>(null);
  const [openRoadCategory, setOpenRoadCategory] =
    useState<PrintableRoadCategoryKey | null>("mainStreets");
  const [openLandCoverCategory, setOpenLandCoverCategory] =
    useState<PrintableLandCoverCategoryKey | null>("grass");
  const [printModelSettings, setPrintModelSettings] =
    useState<PrintableModelSettings>(createDefaultPrintableModelSettings);

  const togglePrintLayer = useCallback((key: PrintableLayerKey) => {
    setPrintLayers((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const toggleModelSection = useCallback((key: ModelSettingsSectionKey) => {
    setOpenModelSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const toggleLayerSection = useCallback((key: LayerSettingsSectionKey) => {
    setOpenLayerSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const updatePrintDimensions = useCallback(
    (updates: Partial<PrintableModelSettings["dimensions"]>) => {
      setPrintModelSettings((current) => ({
        ...current,
        dimensions: {
          ...current.dimensions,
          ...updates,
        },
      }));
    },
    [],
  );

  const updatePrintFrame = useCallback(
    (updates: Partial<PrintableModelSettings["frame"]>) => {
      setPrintModelSettings((current) => ({
        ...current,
        frame: {
          ...current.frame,
          ...updates,
        },
      }));
    },
    [],
  );

  const updateBuildingSettings = useCallback(
    (updates: Partial<PrintableModelSettings["layers"]["buildings"]>) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          buildings: {
            ...current.layers.buildings,
            ...updates,
          },
        },
      }));
    },
    [],
  );

  const updateRoadSettings = useCallback(
    (updates: Partial<PrintableRoadSettings>) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          roads: {
            ...current.layers.roads,
            ...updates,
          },
        },
      }));
    },
    [],
  );

  const updateAllRoadCategories = useCallback(
    (updates: Partial<PrintableRoadSettings["categories"][PrintableRoadCategoryKey]>) => {
      setPrintModelSettings((current) => {
        const categories = Object.fromEntries(
          PRINTABLE_ROAD_CATEGORIES.map(({ key }) => [
            key,
            {
              ...current.layers.roads.categories[key],
              ...updates,
            },
          ]),
        ) as PrintableRoadSettings["categories"];

        return {
          ...current,
          layers: {
            ...current.layers,
            roads: {
              ...current.layers.roads,
              categories,
            },
          },
        };
      });
    },
    [],
  );

  const updateRoadCategory = useCallback(
    (
      key: PrintableRoadCategoryKey,
      updates: Partial<
        PrintableRoadSettings["categories"][PrintableRoadCategoryKey]
      >,
    ) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          roads: {
            ...current.layers.roads,
            categories: {
              ...current.layers.roads.categories,
              [key]: {
                ...current.layers.roads.categories[key],
                ...updates,
              },
            },
          },
        },
      }));
    },
    [],
  );

  const updateWaterSettings = useCallback(
    (updates: Partial<PrintableModelSettings["layers"]["water"]>) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          water: {
            ...current.layers.water,
            ...updates,
          },
        },
      }));
    },
    [],
  );

  const updateLandCoverSettings = useCallback(
    (updates: Partial<PrintableLandCoverSettings>) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          landCover: {
            ...current.layers.landCover,
            ...updates,
          },
        },
      }));
    },
    [],
  );

  const updateAllLandCoverCategories = useCallback(
    (
      updates: Partial<
        PrintableLandCoverSettings["categories"][PrintableLandCoverCategoryKey]
      >,
    ) => {
      setPrintModelSettings((current) => {
        const categories = Object.fromEntries(
          PRINTABLE_LAND_COVER_CATEGORIES.map(({ key }) => [
            key,
            {
              ...current.layers.landCover.categories[key],
              ...updates,
            },
          ]),
        ) as PrintableLandCoverSettings["categories"];

        return {
          ...current,
          layers: {
            ...current.layers,
            landCover: {
              ...current.layers.landCover,
              categories,
            },
          },
        };
      });
    },
    [],
  );

  const updateLandCoverCategory = useCallback(
    (
      key: PrintableLandCoverCategoryKey,
      updates: Partial<
        PrintableLandCoverSettings["categories"][PrintableLandCoverCategoryKey]
      >,
    ) => {
      setPrintModelSettings((current) => ({
        ...current,
        layers: {
          ...current.layers,
          landCover: {
            ...current.layers.landCover,
            categories: {
              ...current.layers.landCover.categories,
              [key]: {
                ...current.layers.landCover.categories[key],
                ...updates,
              },
            },
          },
        },
      }));
    },
    [],
  );

  const resetRoadSettings = useCallback(() => {
    const defaults = createDefaultPrintableModelSettings();
    setPrintModelSettings((current) => ({
      ...current,
      layers: {
        ...current.layers,
        roads: defaults.layers.roads,
      },
    }));
  }, []);

  const resetLandCoverSettings = useCallback(() => {
    const defaults = createDefaultPrintableModelSettings();
    setPrintModelSettings((current) => ({
      ...current,
      layers: {
        ...current.layers,
        landCover: defaults.layers.landCover,
      },
    }));
  }, []);

  const updateLargestSideMm = useCallback(
    (value: number) => {
      updatePrintDimensions({
        largestSideMm: clampPrintableValue(
          value,
          PRINTABLE_DIMENSION_LIMITS.largestSideMm,
        ),
      });
    },
    [updatePrintDimensions],
  );

  const updateBaseHeightMm = useCallback(
    (value: number) => {
      updatePrintDimensions({
        baseHeightMm: clampPrintableValue(
          value,
          PRINTABLE_DIMENSION_LIMITS.baseHeightMm,
        ),
      });
    },
    [updatePrintDimensions],
  );

  const updateFrameWidthMm = useCallback(
    (value: number) => {
      updatePrintFrame({
        widthMm: clampPrintableValue(value, PRINTABLE_FRAME_LIMITS.widthMm),
      });
    },
    [updatePrintFrame],
  );

  const updateFrameHeightMm = useCallback(
    (value: number) => {
      updatePrintFrame({
        heightMm: clampPrintableValue(value, PRINTABLE_FRAME_LIMITS.heightMm),
      });
    },
    [updatePrintFrame],
  );

  const printableSize = useMemo(
    () => getPrintableModelSize(radiusMeters, printModelSettings),
    [printModelSettings, radiusMeters],
  );

  const roadCategoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PRINTABLE_ROAD_CATEGORIES.map(({ key }) => [key, EMPTY_CATEGORY_COUNT]),
    ) as Record<PrintableRoadCategoryKey, number>;

    for (const line of printModelData?.roads ?? []) {
      counts[getPrintableRoadCategory(line)] += CATEGORY_COUNT_INCREMENT;
    }

    return counts;
  }, [printModelData]);

  const landCoverCategoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PRINTABLE_LAND_COVER_CATEGORIES.map(({ key }) => [
        key,
        EMPTY_CATEGORY_COUNT,
      ]),
    ) as Record<PrintableLandCoverCategoryKey, number>;

    for (const polygon of printModelData?.landCover ?? []) {
      counts[getPrintableLandCoverCategory(polygon)] +=
        CATEGORY_COUNT_INCREMENT;
    }

    return counts;
  }, [printModelData]);

  const dimensions = printModelSettings.dimensions;
  const buildingSettings = printModelSettings.layers.buildings;

  const buildingHeightMetrics = useMemo(() => {
    const tops = (printModelData?.buildings ?? [])
      .map((building) =>
        Math.max(
          MIN_BUILDING_HEIGHT_METERS,
          ...building.surfaces.flatMap((surface) =>
            surface.map((point) => point.z),
          ),
        ),
      )
      .filter((height) => height > MIN_BUILDING_HEIGHT_METERS);

    if (tops.length === EMPTY_CATEGORY_COUNT) {
      return {
        highestMm: EMPTY_BUILDING_HEIGHT_MM,
        lowestMm: EMPTY_BUILDING_HEIGHT_MM,
      };
    }

    const maxHeightMeters = Math.max(...tops);
    const scale =
      dimensions.lockModelHeight && maxHeightMeters > MIN_BUILDING_HEIGHT_METERS
        ? Math.max(
            printableSize.heightMm - printableSize.baseHeightMm,
            MIN_LOCKED_MODEL_HEIGHT_MM,
          ) / maxHeightMeters
        : (printableSize.mapSideMm / DIAMETER_TO_RADIUS_DIVISOR / radiusMeters) *
          buildingSettings.heightExaggeration;

    return {
      highestMm: Math.max(...tops) * scale,
      lowestMm: Math.min(...tops) * scale,
    };
  }, [
    buildingSettings.heightExaggeration,
    dimensions.lockModelHeight,
    printableSize.baseHeightMm,
    printableSize.heightMm,
    printableSize.mapSideMm,
    printModelData,
    radiusMeters,
  ]);

  const actions = useMemo(
    () => ({
      resetLandCoverSettings,
      resetRoadSettings,
      updateAllLandCoverCategories,
      updateAllRoadCategories,
      updateBaseHeightMm,
      updateBuildingSettings,
      updateFrameHeightMm,
      updateFrameWidthMm,
      updateLandCoverCategory,
      updateLandCoverSettings,
      updateLargestSideMm,
      updatePrintDimensions,
      updatePrintFrame,
      updateRoadCategory,
      updateRoadSettings,
      updateWaterSettings,
    }),
    [
      resetLandCoverSettings,
      resetRoadSettings,
      updateAllLandCoverCategories,
      updateAllRoadCategories,
      updateBaseHeightMm,
      updateBuildingSettings,
      updateFrameHeightMm,
      updateFrameWidthMm,
      updateLandCoverCategory,
      updateLandCoverSettings,
      updateLargestSideMm,
      updatePrintDimensions,
      updatePrintFrame,
      updateRoadCategory,
      updateRoadSettings,
      updateWaterSettings,
    ],
  );

  return {
    actions,
    advancedLayerPanel,
    buildingHeightMetrics,
    landCoverCategoryCounts,
    openLandCoverCategory,
    openLayerSections,
    openModelSections,
    openRoadCategory,
    printableSize,
    printLayers,
    printModelSettings,
    printTab,
    roadCategoryCounts,
    setAdvancedLayerPanel,
    setOpenLandCoverCategory,
    setOpenRoadCategory,
    setPrintTab,
    toggleLayerSection,
    toggleModelSection,
    togglePrintLayer,
  };
}
