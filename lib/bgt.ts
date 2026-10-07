import jpeg from "jpeg-js";
import polygonClipping, {
  type Pair,
  type Polygon,
} from "polygon-clipping";
import { fetchAhnSurface } from "./ahn";
import { bridgeSpanFromPiers, deckHeightProfile } from "./bridges";
import { DATA_SOURCES } from "./dataSources";
import {
  inferPrintableLandCoverCategory,
  type PrintableBridgeDeck,
  type PrintableRoadCategoryKey,
  type PrintableRoadSurface,
  type ModelPoint,
  type PrintablePolygon,
} from "./printModel";

export type RdBbox = [minX: number, minY: number, maxX: number, maxY: number];

export type BgtFeature = {
  geometry: { coordinates: unknown; type: string } | null;
  id?: string | number;
  properties?: Record<string, unknown> | null;
};

// Each pixel is 1 when the color-infrared aerial photo shows vegetation.
export type VegetationRaster = {
  bbox: RdBbox;
  height: number;
  vegetated: Uint8Array;
  width: number;
};

export type CirImage = {
  data: Uint8Array;
  height: number;
  width: number;
};

const BGT_OGC_API_URL = DATA_SOURCES.bgt.apiBaseUrl;
const PDOK_CIR_WMS_URL = "https://service.pdok.nl/hwh/luchtfotocir/wms/v1_0";
const PDOK_CIR_LAYER = "Actueel_orthoHRIR";
const RD_CRS = "http://www.opengis.net/def/crs/EPSG/0/28992";

const BGT_PAGE_LIMIT = 1000;
// 0.2 m is 0.02 mm at the default print scale, far below a nozzle's width.
const SIMPLIFY_TOLERANCE_METERS = 0.2;
const MIN_POLYGON_AREA_M2 = 0.5;
const BGT_MAX_PAGES_PER_TILE = 15;
const BGT_TILE_SIDE_METERS = 700;
const BGT_FETCH_CONCURRENCY = 4;
const BGT_LAND_COVER_LIMIT = 1500;
const CIR_MAX_TILE_PIXELS = 2500;
const CIR_METERS_PER_PIXEL = 0.5;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;

// The PDOK color-infrared composite stores near-infrared in red and red in
// green, so NDVI = (R - G) / (R + G). Measured over BGT parcels in central
// Amsterdam, a yard is green when at least half its pixels exceed NDVI 0:
// that keeps 73% of BGT vegetation parcels and 1% of roofs.
const VEGETATION_NDVI_THRESHOLD = 0;
const GREEN_YARD_MIN_FRACTION = 0.5;
const MIN_YARD_SAMPLE_PIXELS = 8;

// BGT wegdeel functions; anything unlisted is treated as a local street.
const BGT_ROAD_CATEGORIES: Record<string, PrintableRoadCategoryKey> = {
  fietspad: "pedestrianCycle",
  inrit: "parkingDriveways",
  "OV-baan": "railways",
  overweg: "railways",
  parkeervlak: "parkingDriveways",
  "rijbaan autosnelweg": "highways",
  "rijbaan autoweg": "highways",
  "rijbaan lokale weg": "localStreets",
  "rijbaan regionale weg": "mainStreets",
  spoorbaan: "railways",
  voetgangersgebied: "pedestrianCycle",
  voetpad: "sidewalks",
  "voetpad op trap": "sidewalks",
  woonerf: "localStreets",
};

const BGT_VEGETATION_KINDS: Record<string, string> = {
  boomteelt: "orchard",
  bouwland: "farmland",
  duin: "dune",
  fruitteelt: "orchard",
  "gemengd bos": "forest",
  "grasland agrarisch": "meadow",
  "grasland overig": "grass",
  groenvoorziening: "grass",
  heide: "heath",
  houtwal: "forest",
  kwelder: "wetland",
  loofbos: "forest",
  moeras: "wetland",
  naaldbos: "forest",
  rietland: "wetland",
  struiken: "scrub",
};

type CacheEntry = {
  expiresAt: number;
  value: Promise<BgtData>;
};

export type BgtData = {
  bridgeDecks: PrintableBridgeDeck[];
  bridgePiers: PrintablePolygon[];
  landCover: PrintablePolygon[];
  roadSurfaces: PrintableRoadSurface[];
  warnings: string[];
};

const cache = new Map<string, CacheEntry>();

export function bgtVegetationKind(fysiekVoorkomen: unknown) {
  return typeof fysiekVoorkomen === "string"
    ? (BGT_VEGETATION_KINDS[fysiekVoorkomen] ?? "grass")
    : null;
}

// The BGT keeps retired object versions and planned objects.
function isCurrentFeature(feature: BgtFeature) {
  const properties = feature.properties ?? {};
  return properties.eind_registratie == null && properties.status !== "plan";
}

// Excludes objects on roofs, bridges or underground as well.
export function isCurrentGroundLevelFeature(feature: BgtFeature) {
  return (
    isCurrentFeature(feature) &&
    (feature.properties?.relatieve_hoogteligging ?? 0) === 0
  );
}

function isPair(value: unknown): value is Pair {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isRingList(value: unknown): value is Pair[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPair),
    )
  );
}

export function bgtFeaturePolygons(feature: BgtFeature): Polygon[] {
  const geometry = feature.geometry;
  if (!geometry) {
    return [];
  }

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : [];

  return polygons.flatMap((polygon): Polygon[] =>
    isRingList(polygon) && polygon.length > 0
      ? [polygon.map((ring) => ring.map(([x, y]): Pair => [x, y]))]
      : [],
  );
}

export function createVegetationRaster(
  bbox: RdBbox,
  width: number,
  height: number,
): VegetationRaster {
  return {
    bbox,
    height,
    vegetated: new Uint8Array(width * height),
    width,
  };
}

// Copies one RGBA color-infrared WMS image covering tileBbox into the raster.
export function paintCirImage(
  raster: VegetationRaster,
  tileBbox: RdBbox,
  image: CirImage,
) {
  const [minX, minY, maxX, maxY] = raster.bbox;
  const metersPerColumn = (maxX - minX) / raster.width;
  const metersPerRow = (maxY - minY) / raster.height;
  const firstColumn = Math.max(
    0,
    Math.round((tileBbox[0] - minX) / metersPerColumn),
  );
  const lastColumn = Math.min(
    raster.width,
    Math.round((tileBbox[2] - minX) / metersPerColumn),
  );
  const firstRow = Math.max(0, Math.round((maxY - tileBbox[3]) / metersPerRow));
  const lastRow = Math.min(
    raster.height,
    Math.round((maxY - tileBbox[1]) / metersPerRow),
  );
  const columns = lastColumn - firstColumn;
  const rows = lastRow - firstRow;

  for (let row = 0; row < rows; row += 1) {
    const imageRow = Math.min(
      image.height - 1,
      Math.floor(((row + 0.5) / rows) * image.height),
    );
    for (let column = 0; column < columns; column += 1) {
      const imageColumn = Math.min(
        image.width - 1,
        Math.floor(((column + 0.5) / columns) * image.width),
      );
      const offset = (imageRow * image.width + imageColumn) * 4;
      const nearInfrared = image.data[offset];
      const red = image.data[offset + 1];
      const total = nearInfrared + red;
      const ndvi = total === 0 ? 0 : (nearInfrared - red) / total;
      raster.vegetated[(firstRow + row) * raster.width + firstColumn + column] =
        ndvi > VEGETATION_NDVI_THRESHOLD ? 1 : 0;
    }
  }
}

function ringContains(ring: Pair[], x: number, y: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) / (previousY - currentY) +
          currentX
    ) {
      inside = !inside;
    }
  }

  return inside;
}

// Share of raster pixels inside the polygon that show vegetation, or null
// when the polygon covers too few pixels to judge.
export function vegetatedFraction(raster: VegetationRaster, polygon: Polygon) {
  const [outer, ...holes] = polygon;
  const [minX, minY, maxX, maxY] = raster.bbox;
  const metersPerColumn = (maxX - minX) / raster.width;
  const metersPerRow = (maxY - minY) / raster.height;
  const xs = outer.map((point) => point[0]);
  const ys = outer.map((point) => point[1]);
  const firstColumn = Math.max(0, Math.floor((Math.min(...xs) - minX) / metersPerColumn));
  const lastColumn = Math.min(raster.width - 1, Math.floor((Math.max(...xs) - minX) / metersPerColumn));
  const firstRow = Math.max(0, Math.floor((maxY - Math.max(...ys)) / metersPerRow));
  const lastRow = Math.min(raster.height - 1, Math.floor((maxY - Math.min(...ys)) / metersPerRow));
  let samples = 0;
  let vegetated = 0;

  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = maxY - (row + 0.5) * metersPerRow;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = minX + (column + 0.5) * metersPerColumn;
      if (
        !ringContains(outer, x, y) ||
        holes.some((hole) => ringContains(hole, x, y))
      ) {
        continue;
      }

      samples += 1;
      vegetated += raster.vegetated[row * raster.width + column];
    }
  }

  return samples < MIN_YARD_SAMPLE_PIXELS ? null : vegetated / samples;
}

function ringArea(ring: ModelPoint[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

function printablePolygonArea(polygon: PrintablePolygon) {
  return (
    ringArea(polygon.points) -
    (polygon.holes ?? []).reduce((total, hole) => total + ringArea(hole), 0)
  );
}

function mergeAndClip(polygons: Polygon[], boundary: Polygon) {
  try {
    return polygonClipping.intersection(
      polygonClipping.union(...(polygons as [Polygon, ...Polygon[]])),
      boundary,
    );
  } catch {
    // Malformed source rings must not drop the rest of the land cover.
    return polygons.flatMap((polygon) => {
      try {
        return polygonClipping.intersection(polygon, boundary);
      } catch {
        return [];
      }
    });
  }
}

// Distance of point p from the segment a-b.
function segmentDistance(p: ModelPoint, a: ModelPoint, b: ModelPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0), 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// Douglas-Peucker on a closed ring (without its repeated last point).
function simplifyRing(ring: ModelPoint[], tolerance: number): ModelPoint[] {
  if (ring.length <= 4) {
    return ring;
  }

  const keep = new Uint8Array(ring.length);
  const far = ring.reduce(
    (best, point, index) =>
      Math.hypot(point.x - ring[0].x, point.y - ring[0].y) > best.distance
        ? { distance: Math.hypot(point.x - ring[0].x, point.y - ring[0].y), index }
        : best,
    { distance: 0, index: 0 },
  ).index;
  keep[0] = 1;
  keep[far] = 1;
  const stack: Array<[number, number]> = [
    [0, far],
    [far, ring.length],
  ];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    const end = ring[to % ring.length];
    let worst = -1;
    let worstDistance = tolerance;
    for (let index = from + 1; index < to; index += 1) {
      const distance = segmentDistance(ring[index], ring[from], end);
      if (distance > worstDistance) {
        worst = index;
        worstDistance = distance;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([from, worst], [worst, to]);
    }
  }

  return ring.filter((_, index) => keep[index] === 1);
}

function ringAreaOf(ring: ModelPoint[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

// Merges, clips to the selection and converts to local metres, simplified
// well below print resolution: BGT outlines are surveyed to the centimetre.
function localPolygons(
  polygons: Polygon[],
  kind: string,
  center: ModelPoint,
  boundary: ModelPoint[],
): PrintablePolygon[] {
  if (polygons.length === 0) {
    return [];
  }

  const toLocal = (ring: Pair[]) =>
    simplifyRing(
      ring
        .slice(0, -1)
        .map(([x, y]) => ({
          x: Math.round((x - center.x) * 100) / 100,
          y: Math.round((y - center.y) * 100) / 100,
        })),
      SIMPLIFY_TOLERANCE_METERS,
    );
  const rdBoundary: Polygon = [
    boundary.map((point): Pair => [point.x + center.x, point.y + center.y]),
  ];

  return mergeAndClip(polygons, rdBoundary).flatMap(([outer, ...holes]) => {
    const points = toLocal(outer);
    if (points.length < 3 || ringAreaOf(points) < MIN_POLYGON_AREA_M2) {
      return [];
    }

    return [
      {
        holes: holes
          .map(toLocal)
          .filter((hole) => hole.length >= 3 && ringAreaOf(hole) >= MIN_POLYGON_AREA_M2),
        kind,
        points,
      },
    ];
  });
}

// Ground-level road surfaces by printable road category, merged per
// category. Surfaces on bridges are left to the decks, and tunnels to the
// ground above them.
export function classifyBgtRoads({
  boundary,
  center,
  roads,
}: {
  boundary: ModelPoint[];
  center: ModelPoint;
  roads: BgtFeature[];
}): PrintableRoadSurface[] {
  const polygonsByCategory = new Map<PrintableRoadCategoryKey, Polygon[]>();
  for (const feature of roads) {
    if (!isCurrentGroundLevelFeature(feature)) {
      continue;
    }

    const functie = feature.properties?.functie;
    const category =
      (typeof functie === "string" ? BGT_ROAD_CATEGORIES[functie] : undefined) ??
      "localStreets";
    polygonsByCategory.set(category, [
      ...(polygonsByCategory.get(category) ?? []),
      ...bgtFeaturePolygons(feature),
    ]);
  }

  return [...polygonsByCategory].flatMap(([category, polygons]) =>
    localPolygons(polygons, `road:${category}`, center, boundary).map(
      (polygon) => ({ ...polygon, category }),
    ),
  );
}

// Bridge decks (at any height) and the piers under them, in local metric
// coordinates. Adjacent deck parts merge into one deck.
export function classifyBgtBridges({
  boundary,
  center,
  parts,
}: {
  boundary: ModelPoint[];
  center: ModelPoint;
  parts: BgtFeature[];
}) {
  const polygonsOfType = (type: string) =>
    parts
      .filter(
        (feature) =>
          feature.properties?.type_overbruggingsdeel === type &&
          isCurrentFeature(feature),
      )
      .flatMap(bgtFeaturePolygons);

  return {
    bridgeDecks: localPolygons(polygonsOfType("dek"), "bridge-deck", center, boundary),
    bridgePiers: localPolygons(polygonsOfType("pijler"), "bridge-pier", center, boundary),
  };
}

// Turns BGT vegetation and yards into printable land cover in local metric
// coordinates: yards count as gardens only where the aerial photo is green.
export function classifyBgtLandCover({
  boundary,
  center,
  raster,
  vegetation,
  yards,
}: {
  boundary: ModelPoint[];
  center: ModelPoint;
  raster: VegetationRaster | null;
  vegetation: BgtFeature[];
  yards: BgtFeature[];
}): PrintablePolygon[] {
  const polygonsByKind = new Map<string, Polygon[]>();
  const addPolygons = (kind: string, polygons: Polygon[]) => {
    polygonsByKind.set(kind, [...(polygonsByKind.get(kind) ?? []), ...polygons]);
  };

  for (const feature of vegetation) {
    const kind = bgtVegetationKind(feature.properties?.fysiek_voorkomen);
    if (kind && isCurrentGroundLevelFeature(feature)) {
      addPolygons(kind, bgtFeaturePolygons(feature));
    }
  }

  if (raster) {
    for (const feature of yards) {
      if (
        feature.properties?.fysiek_voorkomen !== "erf" ||
        !isCurrentGroundLevelFeature(feature)
      ) {
        continue;
      }

      addPolygons(
        "garden",
        bgtFeaturePolygons(feature).filter(
          (polygon) =>
            (vegetatedFraction(raster, polygon) ?? 0) >= GREEN_YARD_MIN_FRACTION,
        ),
      );
    }
  }

  return [...polygonsByKind]
    .flatMap(([kind, polygons]) =>
      localPolygons(polygons, kind, center, boundary),
    )
    .map((polygon) => ({ area: printablePolygonArea(polygon), polygon }))
    .sort((left, right) => right.area - left.area)
    .slice(0, BGT_LAND_COVER_LIMIT)
    .map(({ polygon }) => ({
      ...polygon,
      category: inferPrintableLandCoverCategory(polygon.kind),
    }));
}

function splitBbox(bbox: RdBbox, maximumSide: number): RdBbox[] {
  const [minX, minY, maxX, maxY] = bbox;
  const columns = Math.max(1, Math.ceil((maxX - minX) / maximumSide));
  const rows = Math.max(1, Math.ceil((maxY - minY) / maximumSide));
  const width = (maxX - minX) / columns;
  const height = (maxY - minY) / rows;

  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return [
      minX + column * width,
      minY + row * height,
      minX + (column + 1) * width,
      minY + (row + 1) * height,
    ];
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index]);
      }
    }),
  );

  return results;
}

async function fetchBgtTile(
  collection: string,
  bbox: RdBbox,
  signal: AbortSignal,
) {
  const features: BgtFeature[] = [];
  const params = new URLSearchParams({
    bbox: bbox.map((value) => value.toFixed(2)).join(","),
    "bbox-crs": RD_CRS,
    crs: RD_CRS,
    f: "json",
    limit: String(BGT_PAGE_LIMIT),
  });
  let url: string | null =
    `${BGT_OGC_API_URL}/collections/${collection}/items?${params}`;

  for (let page = 0; url && page < BGT_MAX_PAGES_PER_TILE; page += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/geo+json" },
      signal,
    });
    if (!response.ok) {
      throw new Error(`BGT ${collection} returned HTTP ${response.status}.`);
    }

    const body = (await response.json()) as {
      features?: BgtFeature[];
      links?: Array<{ href?: string; rel?: string }>;
    };
    features.push(...(body.features ?? []));
    url = body.links?.find((link) => link.rel === "next")?.href ?? null;
  }

  if (url) {
    throw new Error(`BGT ${collection} returned too many objects for this area.`);
  }

  return features;
}

async function fetchBgtFeatures(
  collection: string,
  bbox: RdBbox,
  signal: AbortSignal,
) {
  const tiles = await mapWithConcurrency(
    splitBbox(bbox, BGT_TILE_SIDE_METERS),
    BGT_FETCH_CONCURRENCY,
    (tile) => fetchBgtTile(collection, tile, signal),
  );
  const unique = new Map<string, BgtFeature>();
  for (const feature of tiles.flat()) {
    const id = feature.properties?.lokaal_id ?? feature.id;
    unique.set(id == null ? `${unique.size}` : String(id), feature);
  }

  return [...unique.values()];
}

async function fetchVegetationRaster(bbox: RdBbox, signal: AbortSignal) {
  const [minX, minY, maxX, maxY] = bbox;
  const width = Math.ceil((maxX - minX) / CIR_METERS_PER_PIXEL);
  const height = Math.ceil((maxY - minY) / CIR_METERS_PER_PIXEL);
  const raster = createVegetationRaster(bbox, width, height);
  const tiles = splitBbox(bbox, CIR_MAX_TILE_PIXELS * CIR_METERS_PER_PIXEL);

  await mapWithConcurrency(tiles, BGT_FETCH_CONCURRENCY, async (tile) => {
    const params = new URLSearchParams({
      bbox: tile.map((value) => value.toFixed(2)).join(","),
      crs: "EPSG:28992",
      format: "image/jpeg",
      height: String(Math.ceil((tile[3] - tile[1]) / CIR_METERS_PER_PIXEL)),
      layers: PDOK_CIR_LAYER,
      request: "GetMap",
      service: "WMS",
      styles: "",
      version: "1.3.0",
      width: String(Math.ceil((tile[2] - tile[0]) / CIR_METERS_PER_PIXEL)),
    });
    const response = await fetch(`${PDOK_CIR_WMS_URL}?${params}`, { signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/jpeg")) {
      throw new Error(
        `PDOK aerial imagery returned HTTP ${response.status} (${contentType || "no content type"}).`,
      );
    }

    const image = jpeg.decode(Buffer.from(await response.arrayBuffer()), {
      formatAsRGBA: true,
      useTArray: true,
    });
    paintCirImage(raster, tile, image);
  });

  return raster;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadBgtData(
  bbox: RdBbox,
  center: ModelPoint,
  boundary: ModelPoint[],
  signal: AbortSignal,
): Promise<BgtData> {
  const [vegetation, yards, raster, bridgeParts, roads] = await Promise.allSettled([
    fetchBgtFeatures("begroeidterreindeel", bbox, signal),
    fetchBgtFeatures("onbegroeidterreindeel", bbox, signal),
    fetchVegetationRaster(bbox, signal),
    fetchBgtFeatures("overbruggingsdeel", bbox, signal),
    fetchBgtFeatures("wegdeel", bbox, signal),
  ]);
  const warnings: string[] = [];
  if (roads.status === "rejected") {
    warnings.push(
      `BGT roads failed; roads come from OpenStreetMap: ${errorText(roads.reason)}`,
    );
  }

  if (vegetation.status === "rejected") {
    warnings.push(`BGT vegetation failed: ${errorText(vegetation.reason)}`);
  }
  if (bridgeParts.status === "rejected") {
    warnings.push(`BGT bridges failed: ${errorText(bridgeParts.reason)}`);
  }
  if (yards.status === "rejected" || raster.status === "rejected") {
    const reason =
      yards.status === "rejected"
        ? errorText(yards.reason)
        : raster.status === "rejected"
          ? errorText(raster.reason)
          : "";
    warnings.push(`BGT gardens unavailable: ${reason}`);
  }

  const bridges = await withBridgeSpans(
    classifyBgtBridges({
      boundary,
      center,
      parts: bridgeParts.status === "fulfilled" ? bridgeParts.value : [],
    }),
    center,
    signal,
    warnings,
  );

  return {
    ...bridges,
    roadSurfaces: classifyBgtRoads({
      boundary,
      center,
      roads: roads.status === "fulfilled" ? roads.value : [],
    }),
    landCover: classifyBgtLandCover({
      boundary,
      center,
      raster: raster.status === "fulfilled" ? raster.value : null,
      vegetation: vegetation.status === "fulfilled" ? vegetation.value : [],
      yards: yards.status === "fulfilled" ? yards.value : [],
    }),
    warnings,
  };
}

// Gives decks with piers their span and AHN height profile. Piers that
// belong to a spanned deck become its arch supports and leave bridgePiers.
async function withBridgeSpans(
  { bridgeDecks, bridgePiers }: Pick<BgtData, "bridgeDecks" | "bridgePiers">,
  center: ModelPoint,
  signal: AbortSignal,
  warnings: string[],
) {
  const usedPiers = new Set<number>();
  const decks: PrintableBridgeDeck[] = bridgeDecks.map((deck) => {
    const found = bridgeSpanFromPiers(deck, bridgePiers);
    found?.pierIndexes.forEach((index) => usedPiers.add(index));
    return found ? { ...deck, span: found.span } : deck;
  });

  let failure: string | null = null;
  await mapWithConcurrency(decks, BGT_FETCH_CONCURRENCY, async (deck) => {
    if (!deck.span || failure) {
      return;
    }

    const xs = deck.points.map((point) => point.x + center.x);
    const ys = deck.points.map((point) => point.y + center.y);
    try {
      const surface = await fetchAhnSurface(
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        signal,
      );
      deck.span.profile = deckHeightProfile(deck, deck.span, surface, center);
    } catch (error) {
      failure = errorText(error);
    }
  });
  if (failure) {
    warnings.push(`AHN bridge heights failed; bridges are drawn without their rise: ${failure}`);
  }

  return {
    bridgeDecks: decks,
    bridgePiers: bridgePiers.filter((_, index) => !usedPiers.has(index)),
  };
}

export function fetchBgtData(
  bbox: RdBbox,
  center: ModelPoint,
  boundary: ModelPoint[],
  signal: AbortSignal,
) {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  const key = [
    ...bbox.map((value) => value.toFixed(1)),
    ...boundary.map((point) => `${point.x.toFixed(1)}:${point.y.toFixed(1)}`),
  ].join(",");
  const cached = cache.get(key);
  if (cached) {
    return cached.value;
  }

  const value = loadBgtData(bbox, center, boundary, signal);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  // Results with warnings are partial; let the next request try again.
  value.then(
    (result) => {
      if (result.warnings.length > 0) {
        cache.delete(key);
      }
    },
    () => cache.delete(key),
  );
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }

  return value;
}
