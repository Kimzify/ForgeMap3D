import { gunzipSync } from "node:zlib";
import { isInsideNetherlands, NETHERLANDS_VIEW } from "@/lib/dataSources";
import type { MapSelection, SelectionShape } from "@/lib/mapTypes";
import {
  extractOsmWaterPolygons,
  type OsmPointProjector,
  type OsmWaterElement,
} from "@/lib/osmWaterGeometry";
import {
  isSurfaceInsideSelectionBoundary,
  pointDistance,
  surfaceCentroid,
} from "@/lib/printBoundary";
import {
  inferPrintableLandCoverCategory,
  inferPrintableRoadCategory,
  type ModelPoint,
  type ModelPoint3,
  type PrintableBuilding,
  type PrintableLine,
  type PrintableModelData,
  type PrintablePolygon,
} from "@/lib/printModel";
import { clamp, lngLatToRd, rdToLngLat } from "@/lib/rd";
import {
  selectionLocalBounds,
  selectionLocalFootprint,
} from "@/lib/selectionGeometry";

export const runtime = "nodejs";
export const maxDuration = 120;

const THREE_DBAG_WFS_URL = "https://data.3dbag.nl/api/BAG3D/wfs";
const THREE_DBAG_TILE_TYPENAME = "BAG3D:Tiles";
const OVERPASS_URLS = [
  {
    name: "maps.mail.ru",
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  },
  {
    name: "overpass-api.de",
    url: "https://overpass-api.de/api/interpreter",
  },
  {
    name: "overpass.private.coffee",
    url: "https://overpass.private.coffee/api/interpreter",
  },
];
const OVERPASS_QUERY_TIMEOUT_SECONDS = 20;
const OVERPASS_ENDPOINT_TIMEOUT_MS = 22000;
const OVERPASS_TOTAL_TIMEOUT_MS = 80000;
const OSM_CACHE_TTL_MS = 30 * 60 * 1000;
const OSM_STALE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OSM_CACHE_MAX_ENTRIES = 40;
const OSM_BUILDING_DEFAULT_HEIGHT_METERS = 9;
const OSM_BUILDING_LEVEL_HEIGHT_METERS = 3.2;
const OSM_BUILDING_MAX_HEIGHT_METERS = 80;
const OSM_BUILDING_MIN_HEIGHT_METERS = 2.5;
const OSM_WATERWAY_MAX_WIDTH_METERS = 100;
const OSM_WATERWAY_MIN_WIDTH_METERS = 0.5;

type OsmCacheEntry = {
  expiresAt: number;
  response: OsmResponse;
  staleUntil: number;
};

type WgsBbox = {
  east: number;
  north: number;
  south: number;
  west: number;
};

type PointProjector = OsmPointProjector;

const osmCache = new Map<string, OsmCacheEntry>();

type WfsGeometry = {
  coordinates?: unknown;
  type?: string;
};

type WfsFeature = {
  geometry?: WfsGeometry | null;
  id?: string;
  properties?: Record<string, unknown>;
};

type ThreeDbagResponse = {
  features?: WfsFeature[];
  numberMatched?: number | string;
  numberReturned?: number;
  totalFeatures?: number | string;
};

type CityJsonTransform = {
  scale: [number, number, number];
  translate: [number, number, number];
};

type CityJsonGeometry = {
  boundaries?: unknown;
  lod?: string;
  type?: string;
};

type CityJsonObject = {
  attributes?: Record<string, unknown>;
  geometry?: CityJsonGeometry[];
  parents?: string[];
  type?: string;
};

type CityJsonTile = {
  CityObjects?: Record<string, CityJsonObject>;
  transform?: CityJsonTransform;
  vertices?: Array<[number, number, number]>;
};

type OsmElement = OsmWaterElement;

type OsmResponse = {
  elements?: OsmElement[];
};

function parseNumber(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseLongitude(searchParams: URLSearchParams) {
  return parseNumber(searchParams, "lng");
}

function parseShape(searchParams: URLSearchParams): SelectionShape {
  const shape = searchParams.get("shape");

  return shape === "hexagon" || shape === "rectangle" ? shape : "circle";
}

function clampRadius(value: number | null) {
  return clamp(value ?? 1250, 100, 5000);
}

function clampRectangleSide(value: number | null, fallbackRadius: number) {
  return clamp((value ?? fallbackRadius * 2) / 2, 100, 5000) * 2;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return null;
}

function compactResponseText(text: string) {
  const compact = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (
    /server is probably too busy/i.test(compact) ||
    /Dispatcher_Client::request_read_and_idx::timeout/i.test(compact)
  ) {
    return "server busy/timeout";
  }

  return compact.slice(0, 160);
}

function overpassErrorMessage(error: unknown) {
  const message = errorMessage(error);

  if (!message) {
    return "request failed";
  }

  if (message.includes("timeout") || message.includes("aborted")) {
    return "timed out";
  }

  return message;
}

const CLIP_EPSILON = 0.000001;

function interpolate(a: ModelPoint, b: ModelPoint, t: number): ModelPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function deduplicatePoints(points: ModelPoint[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.1;
  });
}

function simplifyPath(points: ModelPoint[], minDistanceMeters: number) {
  if (points.length <= 2) {
    return points;
  }

  const simplified = [points[0]];
  for (const point of points.slice(1, -1)) {
    const previous = simplified[simplified.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= minDistanceMeters) {
      simplified.push(point);
    }
  }
  simplified.push(points[points.length - 1]);

  return simplified;
}

function crossProduct(a: ModelPoint, b: ModelPoint, c: ModelPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isInsideBoundaryEdge(
  point: ModelPoint,
  edgeStart: ModelPoint,
  edgeEnd: ModelPoint,
) {
  return crossProduct(edgeStart, edgeEnd, point) >= -CLIP_EPSILON;
}

function lineIntersection(
  start: ModelPoint,
  end: ModelPoint,
  edgeStart: ModelPoint,
  edgeEnd: ModelPoint,
) {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const edge = {
    x: edgeEnd.x - edgeStart.x,
    y: edgeEnd.y - edgeStart.y,
  };
  const denominator = segment.x * edge.y - segment.y * edge.x;

  if (Math.abs(denominator) <= CLIP_EPSILON) {
    return end;
  }

  const t =
    ((edgeStart.x - start.x) * edge.y -
      (edgeStart.y - start.y) * edge.x) /
    denominator;

  return interpolate(start, end, t);
}

function clipSegmentToSelection(
  start: ModelPoint,
  end: ModelPoint,
  boundary: ModelPoint[],
) {
  const direction = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  let entry = 0;
  let exit = 1;

  for (let index = 0; index < boundary.length; index += 1) {
    const current = boundary[index];
    const next = boundary[(index + 1) % boundary.length];
    const edge = {
      x: next.x - current.x,
      y: next.y - current.y,
    };
    const currentValue = crossProduct(current, next, start);
    const directionValue = edge.x * direction.y - edge.y * direction.x;

    if (Math.abs(directionValue) <= CLIP_EPSILON) {
      if (currentValue < -CLIP_EPSILON) {
        return null;
      }

      continue;
    }

    const t = -currentValue / directionValue;
    if (directionValue > 0) {
      entry = Math.max(entry, t);
    } else {
      exit = Math.min(exit, t);
    }

    if (entry - exit > CLIP_EPSILON) {
      return null;
    }
  }

  return {
    end: interpolate(start, end, exit),
    start: interpolate(start, end, entry),
  };
}

function appendLinePoint(path: ModelPoint[], point: ModelPoint) {
  const previous = path[path.length - 1];
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.1) {
    path.push(point);
  }
}

function clipLineToSelection(points: ModelPoint[], boundary: ModelPoint[]) {
  const paths: ModelPoint[][] = [];
  let current: ModelPoint[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const clipped = clipSegmentToSelection(
      points[index],
      points[index + 1],
      boundary,
    );

    if (!clipped) {
      if (current.length > 1) {
        paths.push(current);
      }
      current = [];
      continue;
    }

    const previous = current[current.length - 1];
    if (
      previous &&
      Math.hypot(previous.x - clipped.start.x, previous.y - clipped.start.y) > 0.1
    ) {
      if (current.length > 1) {
        paths.push(current);
      }
      current = [];
    }

    appendLinePoint(current, clipped.start);
    appendLinePoint(current, clipped.end);
  }

  if (current.length > 1) {
    paths.push(current);
  }

  return paths.map((path) => simplifyPath(path, 4)).filter((path) => path.length > 1);
}

function clipPolygonToSelection(points: ModelPoint[], boundary: ModelPoint[]) {
  let output = deduplicatePoints(points);

  for (let index = 0; index < boundary.length; index += 1) {
    const edgeStart = boundary[index];
    const edgeEnd = boundary[(index + 1) % boundary.length];
    const input = output;
    output = [];

    if (input.length === 0) {
      break;
    }

    for (
      let currentIndex = 0, previousIndex = input.length - 1;
      currentIndex < input.length;
      previousIndex = currentIndex, currentIndex += 1
    ) {
      const current = input[currentIndex];
      const previous = input[previousIndex];
      const currentInside = isInsideBoundaryEdge(current, edgeStart, edgeEnd);
      const previousInside = isInsideBoundaryEdge(previous, edgeStart, edgeEnd);

      if (currentInside) {
        if (!previousInside) {
          output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      }
    }
  }

  return simplifyPath(deduplicatePoints(output), 1);
}

function wgsBboxFromRd(bbox: number[]) {
  const corners = [
    rdToLngLat(bbox[0], bbox[1]),
    rdToLngLat(bbox[0], bbox[3]),
    rdToLngLat(bbox[2], bbox[1]),
    rdToLngLat(bbox[2], bbox[3]),
  ];

  return {
    east: Math.max(...corners.map((corner) => corner.longitude)),
    north: Math.max(...corners.map((corner) => corner.latitude)),
    south: Math.min(...corners.map((corner) => corner.latitude)),
    west: Math.min(...corners.map((corner) => corner.longitude)),
  };
}

async function fetchThreeDbagTileIndex(bbox: number[], signal: AbortSignal) {
  const url = new URL(THREE_DBAG_WFS_URL);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", THREE_DBAG_TILE_TYPENAME);
  url.searchParams.set(
    "bbox",
    `${bbox.map((value) => value.toFixed(2)).join(",")},EPSG:28992`,
  );
  url.searchParams.set("srsName", "EPSG:28992");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "200");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`3DBAG tile index returned ${response.status}`);
  }

  return (await response.json()) as ThreeDbagResponse;
}

function attributeNumber(attributes: Record<string, unknown> | undefined, key: string) {
  const value = attributes?.[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function attributeText(attributes: Record<string, unknown> | undefined, key: string) {
  const value = attributes?.[key];

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return null;
}

async function fetchCityJsonTile(downloadUrl: string, signal: AbortSignal) {
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: "application/city+json, application/json, application/gzip",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`3DBAG CityJSON tile returned ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function parseCityJsonTile(compressed: Buffer) {
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as CityJsonTile;
}

function tileDownloadUrls(tileIndex: ThreeDbagResponse) {
  const urls = new Set<string>();

  for (const feature of tileIndex.features ?? []) {
    const downloadUrl = attributeText(feature.properties, "cj_download");
    const tileOk = feature.properties?.cj_zip_ok;

    if (downloadUrl && tileOk !== false) {
      urls.add(downloadUrl);
    }
  }

  return [...urls];
}

function transformedVertex(
  vertices: Array<[number, number, number]>,
  index: number,
  transform: CityJsonTransform,
) {
  const vertex = vertices[index];
  if (!vertex) {
    return null;
  }

  return {
    x: vertex[0] * transform.scale[0] + transform.translate[0],
    y: vertex[1] * transform.scale[1] + transform.translate[1],
    z: vertex[2] * transform.scale[2] + transform.translate[2],
  };
}

function cityJsonRing(surface: unknown) {
  if (!Array.isArray(surface)) {
    return null;
  }

  if (surface.every(Number.isInteger)) {
    return surface as number[];
  }

  const firstRing = surface[0];
  return Array.isArray(firstRing) && firstRing.every(Number.isInteger)
    ? (firstRing as number[])
    : null;
}

function cityJsonSurfaceRings(geometry: CityJsonGeometry) {
  if (!Array.isArray(geometry.boundaries)) {
    return [];
  }

  if (geometry.type === "MultiSurface" || geometry.type === "CompositeSurface") {
    return geometry.boundaries
      .map((surface) => cityJsonRing(surface))
      .filter((ring): ring is number[] => Boolean(ring));
  }

  if (geometry.type === "Solid") {
    return geometry.boundaries.flatMap((shell) =>
      Array.isArray(shell)
        ? shell
            .map((surface) => cityJsonRing(surface))
            .filter((ring): ring is number[] => Boolean(ring))
        : [],
    );
  }

  if (geometry.type === "MultiSolid" || geometry.type === "CompositeSolid") {
    return geometry.boundaries.flatMap((solid) =>
      Array.isArray(solid)
        ? solid.flatMap((shell) =>
            Array.isArray(shell)
              ? shell
                  .map((surface) => cityJsonRing(surface))
                  .filter((ring): ring is number[] => Boolean(ring))
              : [],
          )
        : [],
    );
  }

  return [];
}

function localSurfaceFromCityJsonRing(
  ring: number[],
  vertices: Array<[number, number, number]>,
  transform: CityJsonTransform,
  groundMeters: number,
  centerRd: ModelPoint,
  boundary: ModelPoint[],
) {
  const surface = ring
    .map((vertexIndex) => transformedVertex(vertices, vertexIndex, transform))
    .filter((point): point is { x: number; y: number; z: number } => Boolean(point))
    .map((point) => ({
      x: point.x - centerRd.x,
      y: point.y - centerRd.y,
      z: clamp(point.z - groundMeters, 0.02, 160),
    }));

  if (surface.length < 3) {
    return null;
  }

  const first = surface[0];
  const last = surface[surface.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) < 0.001) {
    surface.pop();
  }

  if (surface.length < 3) {
    return null;
  }

  if (!isSurfaceInsideSelectionBoundary(surface, boundary)) {
    return null;
  }

  return surface;
}

function extractBuildingsFromCityJsonTiles(
  tiles: CityJsonTile[],
  centerRd: ModelPoint,
  boundary: ModelPoint[],
) {
  const buildings = new Map<string, PrintableBuilding>();

  for (const tile of tiles) {
    const transform = tile.transform;
    const vertices = tile.vertices ?? [];

    if (!transform) {
      continue;
    }

    for (const [objectId, object] of Object.entries(tile.CityObjects ?? {})) {
      if (object.type !== "BuildingPart") {
        continue;
      }

      const lod22 = object.geometry?.find(
        (geometry) =>
          geometry.lod === "2.2" &&
          ["CompositeSolid", "MultiSolid", "Solid"].includes(geometry.type ?? ""),
      );
      if (!lod22) {
        continue;
      }

      const buildingId = object.parents?.[0] ?? objectId;
      const parent = tile.CityObjects?.[buildingId];
      const groundMeters =
        attributeNumber(parent?.attributes, "b3_h_maaiveld") ??
        attributeNumber(object.attributes, "b3_h_maaiveld") ??
        0;
      const mesh = buildings.get(buildingId) ?? {
        buildingId,
        id: buildingId,
        surfaces: [],
      };

      for (const ring of cityJsonSurfaceRings(lod22)) {
        const surface = localSurfaceFromCityJsonRing(
          ring,
          vertices,
          transform,
          groundMeters,
          centerRd,
          boundary,
        );
        if (!surface) {
          continue;
        }

        mesh.surfaces.push(surface);
      }

      if (mesh.surfaces.length > 0) {
        buildings.set(buildingId, mesh);
      }
    }
  }

  return [...buildings.values()].sort(
    (left, right) =>
      pointDistance(surfaceCentroid(left.surfaces[0])) -
      pointDistance(surfaceCentroid(right.surfaces[0])),
  );
}

type OsmLayerKey = "buildings" | "land" | "roads" | "water";

function osmCacheKey(bbox: WgsBbox) {
  return [
    "v3",
    ...[bbox.south, bbox.west, bbox.north, bbox.east].map((value) =>
      value.toFixed(6),
    ),
  ].join(",");
}

function trimOsmCache(now = Date.now()) {
  for (const [key, entry] of osmCache) {
    if (entry.staleUntil <= now) {
      osmCache.delete(key);
    }
  }

  while (osmCache.size > OSM_CACHE_MAX_ENTRIES) {
    const oldestKey = osmCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    osmCache.delete(oldestKey);
  }
}

function osmQuery(bbox: WgsBbox, layer: OsmLayerKey) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  if (layer === "buildings") {
    return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  way["building"](${box});
);
out geom(${box}) 650;`;
  }

  if (layer === "water") {
    return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  way["natural"="water"](${box});
  way["water"](${box});
  way["waterway"](${box});
  relation["type"="multipolygon"]["natural"="water"](${box});
  relation["type"="multipolygon"]["water"](${box});
  relation["type"="multipolygon"]["waterway"](${box});
);
out geom 650;`;
  }

  if (layer === "land") {
    return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  way["landuse"~"grass|forest|meadow|recreation_ground|park|cemetery|allotments|farmland|farmyard|orchard|vineyard|residential|commercial|industrial|retail|construction|brownfield|greenfield|quarry"](${box});
  way["natural"~"wood|grassland|scrub|heath|wetland|sand|beach|dune|bare_rock|rock|scree|glacier"](${box});
);
out geom(${box}) 350;`;
  }

  return `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|pedestrian|cycleway|footway|path"](${box});
  way["railway"~"rail|light_rail|tram|subway"](${box});
  way["route"="ferry"](${box});
);
out geom(${box}) 950;`;
}

async function fetchOsmFromUrl(
  endpoint: (typeof OVERPASS_URLS)[number],
  bbox: WgsBbox,
  layer: OsmLayerKey,
  signal: AbortSignal,
) {
  const response = await fetch(endpoint.url, {
    body: new URLSearchParams({
      data: osmQuery(bbox, layer),
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "forgemap3d/1.0",
    },
    method: "POST",
    signal,
  });
  const body = await response.text();

  if (!response.ok) {
    const detail = compactResponseText(body);
    throw new Error(
      detail
        ? `${endpoint.name} returned ${response.status}: ${detail}`
        : `${endpoint.name} returned ${response.status}`,
    );
  }

  return JSON.parse(body) as OsmResponse;
}

async function fetchOsmLayer(
  bbox: WgsBbox,
  layer: OsmLayerKey,
  signal: AbortSignal,
  timeoutMs: number,
) {
  let lastError: unknown = null;
  const attemptErrors: string[] = [];

  for (const endpoint of OVERPASS_URLS) {
    try {
      return await fetchOsmFromUrl(
        endpoint,
        bbox,
        layer,
        AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.min(timeoutMs, OVERPASS_ENDPOINT_TIMEOUT_MS)),
        ]),
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      lastError = error;
      attemptErrors.push(`${endpoint.name}: ${overpassErrorMessage(error)}`);
    }
  }

  throw new Error(
    attemptErrors.length > 0
      ? attemptErrors.join("; ")
      : errorMessage(lastError) ?? "OpenStreetMap data failed to load.",
  );
}

async function fetchOsm(bbox: WgsBbox, signal: AbortSignal) {
  const layers: OsmLayerKey[] = ["water", "roads", "land", "buildings"];
  const cacheKey = osmCacheKey(bbox);
  const now = Date.now();
  trimOsmCache(now);
  const cached = osmCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return {
      elements: cached.response.elements ?? [],
      warnings: [],
    };
  }

  const elements: OsmElement[] = [];
  const warnings: string[] = [];
  let waterError: string | null = null;

  for (const layer of layers) {
    try {
      const response = await fetchOsmLayer(
        bbox,
        layer,
        signal,
        OVERPASS_ENDPOINT_TIMEOUT_MS,
      );
      elements.push(...(response.elements ?? []));
    } catch (error) {
      const detail = errorMessage(error) ?? "data failed to load.";
      warnings.push(`OpenStreetMap ${layer} failed: ${detail}`);

      if (layer === "water") {
        waterError = detail;
      }

      if (signal.aborted) {
        break;
      }
    }
  }

  if (warnings.length === 0) {
    const response = { elements };
    osmCache.set(cacheKey, {
      expiresAt: now + OSM_CACHE_TTL_MS,
      staleUntil: now + OSM_STALE_CACHE_TTL_MS,
      response,
    });
    trimOsmCache(now);

    return {
      elements,
      warnings: [],
    };
  }

  if (cached && cached.staleUntil > now) {
    return {
      elements: cached.response.elements ?? [],
      warnings: [
        `OpenStreetMap reused cached data because live refresh failed: ${warnings.join("; ")}`,
      ],
    };
  }

  if (waterError) {
    throw new Error(`OpenStreetMap water failed: ${waterError}`);
  }

  return {
    elements,
    warnings,
  };
}

function localOsmPoints(element: OsmElement, projectPoint: PointProjector) {
  return (element.geometry ?? []).flatMap((point) => {
    if (
      !point ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lon)
    ) {
      return [];
    }

    return [projectPoint(point.lon, point.lat)];
  });
}

function isClosed(points: ModelPoint[]) {
  if (points.length < 4) {
    return false;
  }

  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 2;
}

function roadWidthMeters(highway: string | undefined) {
  switch (highway) {
    case "motorway":
    case "trunk":
      return 20;
    case "primary":
    case "secondary":
      return 14;
    case "tertiary":
      return 10;
    case "residential":
    case "living_street":
    case "unclassified":
      return 7;
    case "service":
      return 5;
    case "cycleway":
    case "footway":
    case "path":
      return 3;
    default:
      return 6;
  }
}

function roadKindFromTags(tags: Record<string, string>) {
  if (tags.route === "ferry") {
    return "ferry";
  }

  if (tags.railway) {
    return `railway:${tags.railway}`;
  }

  if (tags.highway === "service" && tags.service) {
    return tags.service;
  }

  if (tags.highway === "footway" && tags.footway) {
    return tags.footway;
  }

  return tags.highway ?? "road";
}

function waterwayWidthMeters(tags: Record<string, string>) {
  const taggedWidth = parseOsmDistanceMeters(tags.width);
  if (taggedWidth !== null && taggedWidth > 0) {
    return clamp(
      taggedWidth,
      OSM_WATERWAY_MIN_WIDTH_METERS,
      OSM_WATERWAY_MAX_WIDTH_METERS,
    );
  }

  switch (tags.waterway) {
    case "river":
      return 12;
    case "canal":
      return 10;
    case "stream":
      return 5;
    case "ditch":
    case "drain":
      return 3;
    default:
      return 5;
  }
}

function roadCategoryFromTags(tags: Record<string, string>) {
  if (tags.tunnel && tags.tunnel !== "no") {
    return "tunnels";
  }

  if (tags.bridge && tags.bridge !== "no") {
    return "bridges";
  }

  return inferPrintableRoadCategory(roadKindFromTags(tags));
}

function parseOsmDistanceMeters(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(",", ".")
    .replace(/\s*(m|meter|meters)$/u, "");
  const meters = Number(normalized);

  return Number.isFinite(meters) ? meters : null;
}

function parseOsmLevels(value: string | undefined) {
  if (!value) {
    return null;
  }

  const levels = Number(value.trim().replace(",", "."));

  return Number.isFinite(levels) ? levels : null;
}

function osmBuildingHeightMeters(tags: Record<string, string>) {
  const taggedHeight = parseOsmDistanceMeters(tags.height);
  if (taggedHeight !== null) {
    return clamp(
      taggedHeight,
      OSM_BUILDING_MIN_HEIGHT_METERS,
      OSM_BUILDING_MAX_HEIGHT_METERS,
    );
  }

  const taggedLevels = parseOsmLevels(tags["building:levels"]);
  if (taggedLevels !== null) {
    return clamp(
      taggedLevels * OSM_BUILDING_LEVEL_HEIGHT_METERS,
      OSM_BUILDING_MIN_HEIGHT_METERS,
      OSM_BUILDING_MAX_HEIGHT_METERS,
    );
  }

  return OSM_BUILDING_DEFAULT_HEIGHT_METERS;
}

function osmFootprintToPrintableBuilding(
  footprint: ModelPoint[],
  heightMeters: number,
  id: number,
): PrintableBuilding | null {
  const points = deduplicatePoints(footprint);
  if (points.length < 3) {
    return null;
  }

  const surfaces: ModelPoint3[][] = [];
  surfaces.push(points.map((point) => ({ ...point, z: heightMeters })));
  surfaces.push([...points].reverse().map((point) => ({ ...point, z: 0 })));

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    surfaces.push([
      { ...current, z: 0 },
      { ...next, z: 0 },
      { ...next, z: heightMeters },
      { ...current, z: heightMeters },
    ]);
  }

  return {
    buildingId: `osm-way-${id}`,
    id: `osm-way-${id}`,
    surfaces,
  };
}

function classifyOsm(
  osm: OsmResponse,
  projectPoint: PointProjector,
  boundary: ModelPoint[],
) {
  const buildings: PrintableBuilding[] = [];
  const roads: PrintableLine[] = [];
  const water = extractOsmWaterPolygons(
    osm.elements ?? [],
    projectPoint,
    boundary,
  );
  const waterLines: PrintableLine[] = [];
  const landCover: PrintablePolygon[] = [];

  for (const element of osm.elements ?? []) {
    if (element.type !== "way" || !element.geometry?.length) {
      continue;
    }

    const tags = element.tags ?? {};
    const points = localOsmPoints(element, projectPoint);
    const closed = isClosed(points);

    if (tags.building && tags.building !== "no" && closed) {
      const polygon = clipPolygonToSelection(points, boundary);
      const building = osmFootprintToPrintableBuilding(
        polygon,
        osmBuildingHeightMeters(tags),
        element.id,
      );

      if (building) {
        buildings.push(building);
      }

      continue;
    }

    if (tags.highway || tags.railway || tags.route === "ferry") {
      const kind = roadKindFromTags(tags);
      for (const path of clipLineToSelection(points, boundary)) {
        roads.push({
          category: roadCategoryFromTags(tags),
          kind,
          points: path,
          widthMeters: tags.railway || tags.route === "ferry"
            ? 5
            : roadWidthMeters(tags.highway),
        });
      }
      continue;
    }

    if (tags.waterway && !closed) {
      for (const path of clipLineToSelection(points, boundary)) {
        waterLines.push({
          kind: tags.waterway,
          points: path,
          widthMeters: waterwayWidthMeters(tags),
        });
      }
      continue;
    }

    if (tags.natural === "water" || tags.water || tags.waterway) {
      continue;
    }

    const polygon = clipPolygonToSelection(points, boundary);
    if (polygon.length < 3) {
      continue;
    }

    if (tags.landuse || tags.natural) {
      const kind = tags.landuse ?? tags.natural ?? "land";
      landCover.push({
        category: inferPrintableLandCoverCategory(kind),
        kind,
        points: polygon,
      });
    }
  }

  return {
    buildings: buildings.slice(0, 500),
    landCover: landCover.slice(0, 120),
    roads: roads.slice(0, 800),
    water: water.slice(0, 120),
    waterLines: waterLines.slice(0, 100),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = parseNumber(searchParams, "lat");
  const longitude = parseLongitude(searchParams);
  const shape = parseShape(searchParams);
  const radius = clampRadius(parseNumber(searchParams, "radius"));

  if (latitude === null || longitude === null) {
    return Response.json(
      { error: "lat and lng query parameters are required." },
      { status: 400 },
    );
  }

  if (!isInsideNetherlands(longitude, latitude)) {
    return Response.json(
      {
        error: "Forge Map 3D currently supports locations in the Netherlands only.",
      },
      { status: 400 },
    );
  }

  const widthMeters = clampRectangleSide(parseNumber(searchParams, "width"), radius);
  const heightMeters = clampRectangleSide(
    parseNumber(searchParams, "height"),
    radius,
  );
  const sideMeters = Math.max(widthMeters, heightMeters);
  const selection: MapSelection =
    shape === "rectangle"
      ? {
          heightMeters: sideMeters,
          latitude,
          longitude,
          shape,
          widthMeters: sideMeters,
        }
      : {
          latitude,
          longitude,
          shape,
        };
  const radiusMeters =
    shape === "rectangle"
      ? clamp(sideMeters / 2, 100, 5000)
      : radius;
  const boundary = selectionLocalFootprint(selection, radiusMeters);
  const bounds = selectionLocalBounds(selection, radiusMeters);
  const centerRd = lngLatToRd(longitude, latitude);
  const rdExtent = NETHERLANDS_VIEW.rdExtent;
  const threeDbagBbox = [
    clamp(centerRd.x + bounds.minX, rdExtent.minX, rdExtent.maxX),
    clamp(centerRd.y + bounds.minY, rdExtent.minY, rdExtent.maxY),
    clamp(centerRd.x + bounds.maxX, rdExtent.minX, rdExtent.maxX),
    clamp(centerRd.y + bounds.maxY, rdExtent.minY, rdExtent.maxY),
  ];
  const osmBbox = wgsBboxFromRd(threeDbagBbox);
  const projectOsmPoint: PointProjector = (pointLongitude, pointLatitude) => {
    const rd = lngLatToRd(pointLongitude, pointLatitude);
    return {
      x: rd.x - centerRd.x,
      y: rd.y - centerRd.y,
    };
  };
  const warnings: string[] = [];
  const threeDbagSignal = AbortSignal.timeout(43000);
  const osmSignal = AbortSignal.timeout(OVERPASS_TOTAL_TIMEOUT_MS);
  const [threeDbagResult, osmResult] = await Promise.all([
    fetchThreeDbagTileIndex(threeDbagBbox, threeDbagSignal).then(
      async (tileIndex) => {
        const urls = tileDownloadUrls(tileIndex);
        const tileResults = await Promise.allSettled(
          urls.map((url) => fetchCityJsonTile(url, threeDbagSignal)),
        );

        return {
          tileCount: urls.length,
          tileResults,
        };
      },
      (error: unknown) => ({ error }),
    ),
    fetchOsm(osmBbox, osmSignal).then(
      (osm) => ({ status: "fulfilled" as const, value: osm }),
      (error: unknown) => ({ status: "rejected" as const, reason: error }),
    ),
  ]);

  const cityJsonTiles: CityJsonTile[] = [];
  let cityJsonTileCount = 0;
  if ("error" in threeDbagResult) {
    warnings.push(
      errorMessage(threeDbagResult.error) ?? "3DBAG tile index failed to load.",
    );
  } else {
    cityJsonTileCount = threeDbagResult.tileCount;
    for (const result of threeDbagResult.tileResults) {
      if (result.status === "fulfilled") {
        try {
          cityJsonTiles.push(parseCityJsonTile(result.value));
        } catch (error) {
          warnings.push(
            errorMessage(error) ?? "A 3DBAG CityJSON tile failed to parse.",
          );
        }
      } else {
        warnings.push(
          errorMessage(result.reason) ?? "A 3DBAG CityJSON tile failed to load.",
        );
      }
    }

    if (cityJsonTiles.length < cityJsonTileCount) {
      warnings.push(
        `3DBAG loaded ${cityJsonTiles.length.toLocaleString()} of ${cityJsonTileCount.toLocaleString()} exact LoD2.2 tiles.`,
      );
    }
  }

  if (cityJsonTileCount === 0) {
    warnings.push("3DBAG did not return any exact LoD2.2 tiles for this area.");
  }

  if (cityJsonTiles.length === 0 && cityJsonTileCount > 0) {
    warnings.push("No exact 3DBAG LoD2.2 tile data was available for rendering.");
  }

  const osmPayload =
    osmResult.status === "fulfilled"
      ? osmResult.value
      : { elements: [], warnings: [] };
  if (osmResult.status === "rejected") {
    return Response.json(
      {
        error:
          errorMessage(osmResult.reason) ??
          "OpenStreetMap water data failed to load.",
      },
      { status: 503 },
    );
  } else {
    warnings.push(...osmPayload.warnings);
  }

  const osm: OsmResponse = { elements: osmPayload.elements };
  const osmLayers = classifyOsm(osm, projectOsmPoint, boundary);
  const threeDbagBuildings = extractBuildingsFromCityJsonTiles(
    cityJsonTiles,
    centerRd,
    boundary,
  );
  const shouldUseOsmBuildings =
    threeDbagBuildings.length === 0 && osmLayers.buildings.length > 0;
  const buildings = shouldUseOsmBuildings
    ? osmLayers.buildings
    : threeDbagBuildings;

  if (shouldUseOsmBuildings) {
    warnings.push(
      "3DBAG returned no building meshes; using OpenStreetMap building footprints with estimated heights.",
    );
  }

  const distinctBuildingCount = new Set(
    buildings.map((building) => building.buildingId),
  ).size;
  const buildingSurfaces = buildings.reduce(
    (sum, building) => sum + building.surfaces.length,
    0,
  );
  const payload: PrintableModelData = {
    buildings,
    generatedAt: new Date().toISOString(),
    landCover: osmLayers.landCover,
    radiusMeters,
    roads: osmLayers.roads,
    sourceCounts: {
      buildings: distinctBuildingCount,
      buildingSurfaces,
      landCover: osmLayers.landCover.length,
      osmElements: osm.elements?.length ?? 0,
      roads: osmLayers.roads.length,
      water: osmLayers.water.length + osmLayers.waterLines.length,
    },
    warnings,
    water: osmLayers.water,
    waterLines: osmLayers.waterLines,
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
