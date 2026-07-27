import type { MapSelection } from "./mapTypes";
import { selectionShape } from "./mapTypes";

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
  areaSelected: "area_selected",
  exportFailed: "export_failed",
  exportModel: "export_model",
  exportReady: "export_ready",
  locationSearch: "location_search",
  locationSearchFailed: "location_search_failed",
  printModelFailed: "print_model_failed",
  printModelGenerate: "print_model_generate",
  printModelReady: "print_model_ready",
} as const;

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
