import type { SelectionShape } from "@/lib/mapTypes";
import type {
  PrintableLayers,
  PrintableModelSettings,
} from "@/lib/printModel";

const LOCAL_MAP_GENERATION_DEFAULTS_KEY =
  "forgemap3d.mapGenerationDefaults";
const LOCAL_MAP_GENERATION_DEFAULTS_SCHEMA_VERSION = 1;

type LocalMapGenerationDefaultsPayload = {
  printLayers?: unknown;
  printModelSettings?: unknown;
  radiusMeters?: unknown;
  schemaVersion?: unknown;
  selectionShape?: unknown;
};

export type LocalMapGenerationDefaults = {
  printLayers?: PrintableLayers;
  printModelSettings?: PrintableModelSettings;
  radiusMeters?: number;
  schemaVersion: typeof LOCAL_MAP_GENERATION_DEFAULTS_SCHEMA_VERSION;
  selectionShape?: SelectionShape;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSelectionShape(value: unknown): value is SelectionShape {
  return value === "circle" || value === "hexagon" || value === "rectangle";
}

function mergeMatchingDefaultTypes<T>(defaults: T, saved: unknown): T {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(saved)) {
      return defaults;
    }

    const merged = { ...defaults } as Record<string, unknown>;

    for (const [key, defaultValue] of Object.entries(defaults)) {
      merged[key] = mergeMatchingDefaultTypes(defaultValue, saved[key]);
    }

    return merged as T;
  }

  if (typeof defaults === "number") {
    return typeof saved === "number" && Number.isFinite(saved)
      ? (saved as T)
      : defaults;
  }

  return typeof saved === typeof defaults ? (saved as T) : defaults;
}

function normalizedPayload(
  payload: LocalMapGenerationDefaultsPayload,
): LocalMapGenerationDefaults | null {
  if (
    payload.schemaVersion !== LOCAL_MAP_GENERATION_DEFAULTS_SCHEMA_VERSION
  ) {
    return null;
  }

  return {
    ...(typeof payload.radiusMeters === "number" &&
    Number.isFinite(payload.radiusMeters)
      ? { radiusMeters: payload.radiusMeters }
      : {}),
    ...(isSelectionShape(payload.selectionShape)
      ? { selectionShape: payload.selectionShape }
      : {}),
    ...(isPlainObject(payload.printLayers)
      ? { printLayers: payload.printLayers as PrintableLayers }
      : {}),
    ...(isPlainObject(payload.printModelSettings)
      ? {
          printModelSettings:
            payload.printModelSettings as PrintableModelSettings,
        }
      : {}),
    schemaVersion: LOCAL_MAP_GENERATION_DEFAULTS_SCHEMA_VERSION,
  };
}

export function readLocalMapGenerationDefaults() {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(
      LOCAL_MAP_GENERATION_DEFAULTS_KEY,
    );

    if (!storedValue) {
      return null;
    }

    const payload = JSON.parse(storedValue) as unknown;

    return isPlainObject(payload) ? normalizedPayload(payload) : null;
  } catch {
    return null;
  }
}

export function updateLocalMapGenerationDefaults(
  updates: Partial<Omit<LocalMapGenerationDefaults, "schemaVersion">>,
) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    const currentDefaults = readLocalMapGenerationDefaults();
    const nextDefaults: LocalMapGenerationDefaults = {
      ...currentDefaults,
      ...updates,
      schemaVersion: LOCAL_MAP_GENERATION_DEFAULTS_SCHEMA_VERSION,
    };

    window.localStorage.setItem(
      LOCAL_MAP_GENERATION_DEFAULTS_KEY,
      JSON.stringify(nextDefaults),
    );
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
  }
}

export function mergePrintableLayersWithLocalDefaults(
  defaults: PrintableLayers,
  saved: unknown,
) {
  return mergeMatchingDefaultTypes(defaults, saved);
}

export function mergePrintableModelSettingsWithLocalDefaults(
  defaults: PrintableModelSettings,
  saved: unknown,
) {
  return mergeMatchingDefaultTypes(defaults, saved);
}
