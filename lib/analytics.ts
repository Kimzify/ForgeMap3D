import type { MapSelection } from "./mapTypes";
import { selectionShape } from "./mapTypes";
import type { PrintableModelData } from "./printModel";

type AnalyticsPrimitive = boolean | number | string | null;
type AnalyticsEventData = Record<string, AnalyticsPrimitive | undefined>;

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, AnalyticsPrimitive>) => void;
    };
  }
}

export const ANALYTICS_EVENTS = {
  apiFailed: "api_failed",
  areaSelected: "area_selected",
  exportFailed: "export_failed",
  exportModel: "export_model",
  exportReady: "export_ready",
  locationSearch: "location_search",
  locationSearchFailed: "location_search_failed",
  printModelDataMissing: "print_model_data_missing",
  printModelFailed: "print_model_failed",
  printModelGenerate: "print_model_generate",
  printModelReady: "print_model_ready",
} as const;

export function trackApiFailure(
  apiName: "app_config" | "location_search" | "print_model",
  status?: number,
) {
  trackAnalyticsEvent(ANALYTICS_EVENTS.apiFailed, {
    api: apiName,
    status,
  });
}

export function selectionAnalyticsData(
  selection: MapSelection,
  radiusMeters: number,
  source?: "draw" | "search",
) {
  return {
    radius_m: Math.round(radiusMeters),
    shape: selectionShape(selection),
    source,
  };
}

function countBucket(count: number) {
  if (count === 0) {
    return "none";
  }

  if (count <= 10) {
    return "1_10";
  }

  if (count <= 50) {
    return "11_50";
  }

  if (count <= 200) {
    return "51_200";
  }

  return "201_plus";
}

export function printModelDataAnalyticsData(modelData: PrintableModelData) {
  const counts = modelData.sourceCounts;

  return {
    building_source: modelData.sources.buildings,
    buildings_bucket: countBucket(counts.buildings),
    has_building_surfaces: counts.buildingSurfaces > 0,
    has_buildings: counts.buildings > 0,
    has_land_cover: counts.landCover > 0,
    has_roads: counts.roads > 0,
    has_terrain: modelData.sources.terrain,
    has_water: counts.water > 0,
    land_cover_bucket: countBucket(counts.landCover),
    roads_bucket: countBucket(counts.roads),
    warnings_count: modelData.warnings.length,
    water_bucket: countBucket(counts.water),
  };
}

export function missingPrintModelDataTypes(modelData: PrintableModelData) {
  const counts = modelData.sourceCounts;
  const missingTypes: string[] = [];

  if (counts.buildings === 0) {
    missingTypes.push("buildings");
  }

  if (counts.roads === 0) {
    missingTypes.push("roads");
  }

  if (counts.water === 0) {
    missingTypes.push("water");
  }

  if (counts.landCover === 0) {
    missingTypes.push("land_cover");
  }

  if (!modelData.sources.terrain) {
    missingTypes.push("terrain");
  }

  return missingTypes;
}

export function trackAnalyticsEvent(
  eventName: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS],
  data: AnalyticsEventData = {},
) {
  if (typeof window === "undefined" || !window.umami) {
    return;
  }

  const cleanData = Object.fromEntries(
    Object.entries(data).filter((entry): entry is [string, AnalyticsPrimitive] =>
      entry[1] !== undefined,
    ),
  );

  window.umami.track(
    eventName,
    Object.keys(cleanData).length > 0 ? cleanData : undefined,
  );
}
