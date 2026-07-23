import { APP_TEXT } from "./text";

export type PrintableLayerKey =
  | "buildings"
  | "roads"
  | "water"
  | "landCover";

export type PrintableLayers = Record<PrintableLayerKey, boolean>;

export type PrintableFrameStyle = "square" | "rounded";
export type PrintableRenderMode = "surface" | "extruded";
export type PrintableBuildingData = "highDetail";
export type PrintableRoadCategoryKey =
  | "highways"
  | "mainStreets"
  | "localStreets"
  | "alleysService"
  | "pedestrianCycle"
  | "railways"
  | "ferries"
  | "tunnels"
  | "bridges"
  | "sidewalks"
  | "crosswalks"
  | "parkingDriveways";
export type PrintableLandCoverCategoryKey =
  | "forest"
  | "grass"
  | "farmland"
  | "wetland"
  | "sand"
  | "ice"
  | "rock"
  | "urban";

export type PrintableModelDimensions = {
  baseHeightMm: number;
  largestSideMm: number;
  lockModelHeight: boolean;
  resizeForPrint: boolean;
  splitIntoTiles: boolean;
};

export type PrintableFrameSettings = {
  color: string;
  enabled: boolean;
  heightMm: number;
  style: PrintableFrameStyle;
  widthMm: number;
};

export type PrintableBuildingSettings = {
  color: string;
  data: PrintableBuildingData;
  heightExaggeration: number;
  showEdges: boolean;
  verticalOffsetMm: number;
};

export type PrintableRoadCategorySettings = {
  color: string;
  enabled: boolean;
  extrudedHeightMm: number;
  renderMode: PrintableRenderMode;
  widthMm: number;
};

export type PrintableRoadSettings = {
  categories: Record<PrintableRoadCategoryKey, PrintableRoadCategorySettings>;
  color: string;
  extrudedHeightMm: number;
  renderMode: PrintableRenderMode;
  showComputedWidths: boolean;
  verticalOffsetMm: number;
  widthScale: number;
};

export type PrintableWaterSettings = {
  color: string;
  extrudedHeightMm: number;
  hideSmallWaterBodies: boolean;
  minimumAreaMm2: number;
  minimumWidthMm: number;
  opacity: number;
  renderMode: PrintableRenderMode;
  sinkDepthMm: number;
  sinkIntoTerrain: boolean;
  verticalOffsetMm: number;
};

export type PrintableLandCoverCategorySettings = {
  carveDepthMm: number;
  carveIntoTerrain: boolean;
  color: string;
  enabled: boolean;
  extrudedHeightMm: number;
  renderMode: PrintableRenderMode;
};

export type PrintableLandCoverSettings = {
  carveDepthMm: number;
  carveIntoTerrain: boolean;
  categories: Record<
    PrintableLandCoverCategoryKey,
    PrintableLandCoverCategorySettings
  >;
  extrudedHeightMm: number;
  opacity: number;
  renderMode: PrintableRenderMode;
  verticalOffsetMm: number;
};

export type PrintableLayerSettings = {
  buildings: PrintableBuildingSettings;
  landCover: PrintableLandCoverSettings;
  roads: PrintableRoadSettings;
  water: PrintableWaterSettings;
};

export type PrintableModelSettings = {
  dimensions: PrintableModelDimensions;
  frame: PrintableFrameSettings;
  layers: PrintableLayerSettings;
};

export type ModelPoint = {
  x: number;
  y: number;
};

export type ModelPoint3 = ModelPoint & {
  z: number;
};

export type PrintableBuilding = {
  buildingId: string;
  id: string;
  surfaces: ModelPoint3[][];
};

export type PrintableLine = {
  category?: PrintableRoadCategoryKey;
  kind: string;
  points: ModelPoint[];
  widthMeters: number;
};

export type PrintablePolygon = {
  category?: PrintableLandCoverCategoryKey;
  holes?: ModelPoint[][];
  kind: string;
  points: ModelPoint[];
};

export type PrintableModelData = {
  buildings: PrintableBuilding[];
  generatedAt: string;
  landCover: PrintablePolygon[];
  radiusMeters: number;
  roads: PrintableLine[];
  sourceCounts: {
    buildings: number;
    buildingSurfaces: number;
    landCover: number;
    osmElements: number;
    roads: number;
    water: number;
  };
  warnings: string[];
  water: PrintablePolygon[];
  waterLines: PrintableLine[];
};

export const DEFAULT_PRINTABLE_LAYERS: PrintableLayers = {
  buildings: true,
  roads: true,
  water: true,
  landCover: true,
};

export const PRINTABLE_DIMENSION_LIMITS = {
  baseHeightMm: { max: 20, min: 0, step: 0.25 },
  largestSideMm: { max: 220, min: 70, step: 1 },
};

export const PRINTABLE_FRAME_LIMITS = {
  heightMm: { max: 20, min: 0, step: 0.25 },
  widthMm: { max: 12, min: 0, step: 0.25 },
};

export const PRINTABLE_LAYER_LIMITS = {
  buildingHeightExaggeration: { max: 5, min: 0.1, step: 0.1 },
  buildingVerticalOffsetMm: { max: 10, min: -10, step: 0.05 },
  landCoverCarveDepthMm: { max: 5, min: 0, step: 0.01 },
  landCoverExtrudedHeightMm: { max: 10, min: 0, step: 0.05 },
  layerOpacity: { max: 1, min: 0, step: 0.05 },
  layerVerticalOffsetMm: { max: 10, min: -10, step: 0.01 },
  roadExtrudedHeightMm: { max: 10, min: 0, step: 0.05 },
  roadWidthMm: { max: 5, min: 0.05, step: 0.01 },
  roadWidthScale: { max: 2, min: 0.1, step: 0.05 },
  waterExtrudedHeightMm: { max: 10, min: 0, step: 0.05 },
  waterMinimumAreaMm2: { max: 10, min: 0, step: 0.01 },
  waterMinimumWidthMm: { max: 5, min: 0, step: 0.05 },
  waterSinkDepthMm: { max: 5, min: 0, step: 0.01 },
};

export const PRINTABLE_ROAD_CATEGORIES: Array<{
  description: string;
  key: PrintableRoadCategoryKey;
  label: string;
}> = [
  {
    description: APP_TEXT.printableCategories.roads.highways.description,
    key: "highways",
    label: APP_TEXT.printableCategories.roads.highways.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.mainStreets.description,
    key: "mainStreets",
    label: APP_TEXT.printableCategories.roads.mainStreets.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.localStreets.description,
    key: "localStreets",
    label: APP_TEXT.printableCategories.roads.localStreets.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.alleysService.description,
    key: "alleysService",
    label: APP_TEXT.printableCategories.roads.alleysService.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.pedestrianCycle.description,
    key: "pedestrianCycle",
    label: APP_TEXT.printableCategories.roads.pedestrianCycle.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.railways.description,
    key: "railways",
    label: APP_TEXT.printableCategories.roads.railways.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.ferries.description,
    key: "ferries",
    label: APP_TEXT.printableCategories.roads.ferries.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.tunnels.description,
    key: "tunnels",
    label: APP_TEXT.printableCategories.roads.tunnels.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.bridges.description,
    key: "bridges",
    label: APP_TEXT.printableCategories.roads.bridges.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.sidewalks.description,
    key: "sidewalks",
    label: APP_TEXT.printableCategories.roads.sidewalks.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.crosswalks.description,
    key: "crosswalks",
    label: APP_TEXT.printableCategories.roads.crosswalks.label,
  },
  {
    description: APP_TEXT.printableCategories.roads.parkingDriveways.description,
    key: "parkingDriveways",
    label: APP_TEXT.printableCategories.roads.parkingDriveways.label,
  },
];

export const PRINTABLE_LAND_COVER_CATEGORIES: Array<{
  description: string;
  key: PrintableLandCoverCategoryKey;
  label: string;
}> = [
  {
    description: APP_TEXT.printableCategories.landCover.forest.description,
    key: "forest",
    label: APP_TEXT.printableCategories.landCover.forest.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.grass.description,
    key: "grass",
    label: APP_TEXT.printableCategories.landCover.grass.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.farmland.description,
    key: "farmland",
    label: APP_TEXT.printableCategories.landCover.farmland.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.wetland.description,
    key: "wetland",
    label: APP_TEXT.printableCategories.landCover.wetland.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.sand.description,
    key: "sand",
    label: APP_TEXT.printableCategories.landCover.sand.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.ice.description,
    key: "ice",
    label: APP_TEXT.printableCategories.landCover.ice.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.rock.description,
    key: "rock",
    label: APP_TEXT.printableCategories.landCover.rock.label,
  },
  {
    description: APP_TEXT.printableCategories.landCover.urban.description,
    key: "urban",
    label: APP_TEXT.printableCategories.landCover.urban.label,
  },
];

export function clampPrintableValue(
  value: number,
  limits: { max: number; min: number },
) {
  if (!Number.isFinite(value)) {
    return limits.min;
  }

  return Math.min(Math.max(value, limits.min), limits.max);
}

function roundMillimeters(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizePrintableColor(
  value: string,
  fallback = "#c8a96a",
) {
  const raw = value.trim().replace(/^#/, "").slice(0, 6);

  if (/^[\da-f]{6}$/i.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }

  return fallback;
}

const PRINTABLE_DEFAULT_COLORS = {
  buildings: "#c28f63",
  frame: "#d8bd82",
  landCover: {
    farmland: "#b8bd77",
    forest: "#4f7d57",
    grass: "#82b67a",
    ice: "#bfdce8",
    rock: "#9c9690",
    sand: "#d2c184",
    urban: "#c6ccd1",
    wetland: "#5da58f",
  },
  roads: {
    alleysService: "#717b84",
    bridges: "#4d5963",
    crosswalks: "#8b949c",
    ferries: "#4e9db9",
    highways: "#35424c",
    localStreets: "#5c6872",
    mainStreets: "#46545e",
    parkingDriveways: "#7d868e",
    pedestrianCycle: "#5d8270",
    railways: "#2f3942",
    sidewalks: "#8b949c",
    tunnels: "#6d747c",
  },
  water: "#58a8c7",
} as const;

function createDefaultRoadCategorySettings() {
  const entries: Array<[PrintableRoadCategoryKey, PrintableRoadCategorySettings]> = [
    [
      "highways",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.highways,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 1.12,
      },
    ],
    [
      "mainStreets",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.mainStreets,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.7,
      },
    ],
    [
      "localStreets",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.localStreets,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.45,
      },
    ],
    [
      "alleysService",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.alleysService,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.25,
      },
    ],
    [
      "pedestrianCycle",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.pedestrianCycle,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.15,
      },
    ],
    [
      "railways",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.railways,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.4,
      },
    ],
    [
      "ferries",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.ferries,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.4,
      },
    ],
    [
      "tunnels",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.tunnels,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.5,
      },
    ],
    [
      "bridges",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.bridges,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.7,
      },
    ],
    [
      "sidewalks",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.sidewalks,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.15,
      },
    ],
    [
      "crosswalks",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.crosswalks,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.15,
      },
    ],
    [
      "parkingDriveways",
      {
        color: PRINTABLE_DEFAULT_COLORS.roads.parkingDriveways,
        enabled: true,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        widthMm: 0.25,
      },
    ],
  ];

  return Object.fromEntries(entries) as Record<
    PrintableRoadCategoryKey,
    PrintableRoadCategorySettings
  >;
}

function createDefaultLandCoverCategorySettings() {
  const entries: Array<
    [PrintableLandCoverCategoryKey, PrintableLandCoverCategorySettings]
  > = [
    [
      "forest",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.forest,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "grass",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.grass,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "farmland",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.farmland,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "wetland",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.wetland,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "sand",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.sand,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "ice",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.ice,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "rock",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.rock,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
    [
      "urban",
      {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        color: PRINTABLE_DEFAULT_COLORS.landCover.urban,
        enabled: true,
        extrudedHeightMm: 1.6,
        renderMode: "extruded",
      },
    ],
  ];

  return Object.fromEntries(entries) as Record<
    PrintableLandCoverCategoryKey,
    PrintableLandCoverCategorySettings
  >;
}

export function createDefaultPrintableModelSettings(): PrintableModelSettings {
  return {
    dimensions: {
      baseHeightMm: 2,
      largestSideMm: 155,
      lockModelHeight: false,
      resizeForPrint: true,
      splitIntoTiles: false,
    },
    frame: {
      color: PRINTABLE_DEFAULT_COLORS.frame,
      enabled: true,
      heightMm: 1,
      style: "rounded",
      widthMm: 2,
    },
    layers: {
      buildings: {
        color: PRINTABLE_DEFAULT_COLORS.buildings,
        data: "highDetail",
        heightExaggeration: 2.5,
        showEdges: false,
        verticalOffsetMm: 0,
      },
      landCover: {
        carveDepthMm: 0.01,
        carveIntoTerrain: true,
        categories: createDefaultLandCoverCategorySettings(),
        extrudedHeightMm: 1.6,
        opacity: 1,
        renderMode: "extruded",
        verticalOffsetMm: 0.01,
      },
      roads: {
        categories: createDefaultRoadCategorySettings(),
        color: PRINTABLE_DEFAULT_COLORS.roads.mainStreets,
        extrudedHeightMm: 2,
        renderMode: "extruded",
        showComputedWidths: true,
        verticalOffsetMm: 0.1,
        widthScale: 0.8,
      },
      water: {
        color: PRINTABLE_DEFAULT_COLORS.water,
        extrudedHeightMm: 1,
        hideSmallWaterBodies: true,
        minimumAreaMm2: 0.13,
        minimumWidthMm: 0.5,
        opacity: 1,
        renderMode: "extruded",
        sinkDepthMm: 0.01,
        sinkIntoTerrain: true,
        verticalOffsetMm: 0.01,
      },
    },
  };
}

export const DEFAULT_PRINTABLE_MODEL_SETTINGS =
  createDefaultPrintableModelSettings();

export function getRoadCategoryWidthMm(
  settings: PrintableRoadSettings,
  key: PrintableRoadCategoryKey,
) {
  return roundMillimeters(settings.categories[key].widthMm * settings.widthScale);
}

export function inferPrintableRoadCategory(kind: string): PrintableRoadCategoryKey {
  if (kind.startsWith("railway:")) {
    return "railways";
  }

  if (kind === "ferry" || kind.startsWith("ferry:")) {
    return "ferries";
  }

  if (kind.startsWith("tunnel:")) {
    return "tunnels";
  }

  if (kind.startsWith("bridge:")) {
    return "bridges";
  }

  if (kind === "motorway" || kind === "trunk" || kind === "primary") {
    return "highways";
  }

  if (kind === "secondary" || kind === "tertiary") {
    return "mainStreets";
  }

  if (
    kind === "residential" ||
    kind === "living_street" ||
    kind === "unclassified"
  ) {
    return "localStreets";
  }

  if (kind === "parking_aisle" || kind === "driveway") {
    return "parkingDriveways";
  }

  if (kind === "sidewalk") {
    return "sidewalks";
  }

  if (kind === "crossing") {
    return "crosswalks";
  }

  if (
    kind === "cycleway" ||
    kind === "footway" ||
    kind === "path" ||
    kind === "pedestrian"
  ) {
    return "pedestrianCycle";
  }

  if (kind === "service") {
    return "alleysService";
  }

  return "localStreets";
}

export function getPrintableRoadCategory(line: PrintableLine) {
  return line.category ?? inferPrintableRoadCategory(line.kind);
}

export function inferPrintableLandCoverCategory(
  kind: string,
): PrintableLandCoverCategoryKey {
  if (["forest", "wood", "scrub", "heath"].includes(kind)) {
    return "forest";
  }

  if (["farmland", "farmyard", "orchard", "vineyard"].includes(kind)) {
    return "farmland";
  }

  if (kind === "wetland") {
    return "wetland";
  }

  if (["sand", "beach", "dune"].includes(kind)) {
    return "sand";
  }

  if (kind === "glacier" || kind === "ice") {
    return "ice";
  }

  if (["bare_rock", "rock", "scree", "quarry"].includes(kind)) {
    return "rock";
  }

  if (
    [
      "residential",
      "commercial",
      "industrial",
      "retail",
      "construction",
      "brownfield",
      "greenfield",
    ].includes(kind)
  ) {
    return "urban";
  }

  return "grass";
}

export function getPrintableLandCoverCategory(polygon: PrintablePolygon) {
  return polygon.category ?? inferPrintableLandCoverCategory(polygon.kind);
}

export function getDefaultPrintableMapSideMm(radiusMeters: number) {
  return Math.round(
    Math.min(
      Math.max(
        (radiusMeters * 2) / 57,
        PRINTABLE_DIMENSION_LIMITS.largestSideMm.min,
      ),
      180,
    ),
  );
}

export function getPrintableModelSize(
  radiusMeters: number,
  settings = DEFAULT_PRINTABLE_MODEL_SETTINGS,
) {
  const totalSideMm = settings.dimensions.resizeForPrint
    ? clampPrintableValue(
        settings.dimensions.largestSideMm,
        PRINTABLE_DIMENSION_LIMITS.largestSideMm,
      )
    : getDefaultPrintableMapSideMm(radiusMeters);
  const baseHeightMm = clampPrintableValue(
    settings.dimensions.baseHeightMm,
    PRINTABLE_DIMENSION_LIMITS.baseHeightMm,
  );
  const frameWidthMm = settings.frame.enabled
    ? clampPrintableValue(settings.frame.widthMm, PRINTABLE_FRAME_LIMITS.widthMm)
    : 0;
  const frameHeightMm = settings.frame.enabled
    ? clampPrintableValue(settings.frame.heightMm, PRINTABLE_FRAME_LIMITS.heightMm)
    : 0;
  const mapSideMm = Math.max(totalSideMm - frameWidthMm * 2, 1);
  const terrainHeightMm = Math.round(Math.min(Math.max(mapSideMm / 14, 8), 18));
  const mapStackHeightMm = baseHeightMm + terrainHeightMm;
  const heightMm = Math.max(frameHeightMm, mapStackHeightMm);

  return {
    baseHeightMm: roundMillimeters(baseHeightMm),
    diameterMm: roundMillimeters(totalSideMm),
    frameHeightMm: roundMillimeters(frameHeightMm),
    frameWidthMm: roundMillimeters(frameWidthMm),
    heightMm: roundMillimeters(heightMm),
    mapSideMm: roundMillimeters(mapSideMm),
    terrainHeightMm: roundMillimeters(terrainHeightMm),
    totalSideMm: roundMillimeters(totalSideMm),
  };
}

export function getPrintableFileName(latitude: number, longitude: number) {
  const lat = latitude.toFixed(4).replace(".", "-");
  const lng = longitude.toFixed(4).replace(".", "-");

  return `forge-map-3d-${lat}-${lng}.stl`;
}
