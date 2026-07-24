import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";

export type Wgs84Bbox = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type OvertureBuildingFootprint = {
  heightMeters: number;
  id: string;
  polygons: Array<Array<{ latitude: number; longitude: number }>>;
};

const OVERTURE_TILE_ZOOM = 14;
const OVERTURE_BUCKET_URL =
  "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com";
const OVERTURE_RELEASES_URL =
  `${OVERTURE_BUCKET_URL}/?list-type=2&prefix=tiles/&delimiter=/`;
const BUILDING_DEFAULT_HEIGHT_METERS = 9;
const BUILDING_LEVEL_HEIGHT_METERS = 3.2;
const BUILDING_MAX_HEIGHT_METERS = 80;
const BUILDING_MIN_HEIGHT_METERS = 2.5;

let archivePromise: Promise<PMTiles> | null = null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function numericProperty(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildingHeightMeters(properties: Record<string, unknown>) {
  const height = numericProperty(properties.height);
  if (height !== null) {
    return clamp(
      height,
      BUILDING_MIN_HEIGHT_METERS,
      BUILDING_MAX_HEIGHT_METERS,
    );
  }

  const floors = numericProperty(properties.num_floors);
  if (floors !== null) {
    return clamp(
      floors * BUILDING_LEVEL_HEIGHT_METERS,
      BUILDING_MIN_HEIGHT_METERS,
      BUILDING_MAX_HEIGHT_METERS,
    );
  }

  return BUILDING_DEFAULT_HEIGHT_METERS;
}

function tileX(longitude: number, zoom: number) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function tileY(latitude: number, zoom: number) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * 2 ** zoom,
  );
}

function polygonOuterRings(geometry: {
  coordinates?: unknown;
  type?: string;
}) {
  if (!Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "Polygon") {
    const outerRing = geometry.coordinates[0];
    return Array.isArray(outerRing) ? [outerRing] : [];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => {
      if (!Array.isArray(polygon)) {
        return [];
      }

      const outerRing = polygon[0];
      return Array.isArray(outerRing) ? [outerRing] : [];
    });
  }

  return [];
}

function ringToCoordinates(ring: unknown[]) {
  return ring.flatMap((coordinate) => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
    ) {
      return [];
    }

    return [{
      latitude: Number(coordinate[1]),
      longitude: Number(coordinate[0]),
    }];
  });
}

function ringIntersectsBbox(
  ring: Array<{ latitude: number; longitude: number }>,
  bbox: Wgs84Bbox,
) {
  if (ring.length < 3) {
    return false;
  }

  let east = -Infinity;
  let north = -Infinity;
  let south = Infinity;
  let west = Infinity;

  for (const point of ring) {
    east = Math.max(east, point.longitude);
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    west = Math.min(west, point.longitude);
  }

  return !(
    east < bbox.west ||
    west > bbox.east ||
    north < bbox.south ||
    south > bbox.north
  );
}

function releasesFromBucketListing(xml: string) {
  return [...xml.matchAll(/<Prefix>tiles\/([^/]+)\/<\/Prefix>/g)]
    .map((match) => match[1])
    .filter((release) => /^\d{4}-\d{2}-\d{2}\.\d+$/.test(release))
    .sort()
    .reverse();
}

async function latestArchiveUrl() {
  const configuredUrl = process.env.OVERTURE_BUILDINGS_PM_TILES_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const response = await fetch(OVERTURE_RELEASES_URL, {
    headers: {
      Accept: "application/xml",
      "User-Agent": "forgemap3d/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`release discovery returned ${response.status}`);
  }

  const releases = releasesFromBucketListing(await response.text());
  if (releases.length === 0) {
    throw new Error("release discovery returned no building archives");
  }

  return `${OVERTURE_BUCKET_URL}/tiles/${releases[0]}/buildings.pmtiles`;
}

async function overtureArchive() {
  archivePromise ??= latestArchiveUrl().then((url) => new PMTiles(url));
  return archivePromise;
}

export async function fetchOvertureBuildingFootprints(
  bbox: Wgs84Bbox,
  signal: AbortSignal,
) {
  const archive = await overtureArchive();
  const minimumTileX = tileX(bbox.west, OVERTURE_TILE_ZOOM);
  const maximumTileX = tileX(bbox.east, OVERTURE_TILE_ZOOM);
  const minimumTileY = tileY(bbox.north, OVERTURE_TILE_ZOOM);
  const maximumTileY = tileY(bbox.south, OVERTURE_TILE_ZOOM);
  const tileRequests: Array<Promise<{
    data: ArrayBuffer;
    tileX: number;
    tileY: number;
  } | null>> = [];

  for (let x = minimumTileX; x <= maximumTileX; x += 1) {
    for (let y = minimumTileY; y <= maximumTileY; y += 1) {
      tileRequests.push(
        archive.getZxy(OVERTURE_TILE_ZOOM, x, y, signal).then((tile) =>
          tile
            ? {
                data: tile.data,
                tileX: x,
                tileY: y,
              }
            : null,
        ),
      );
    }
  }

  const footprints: OvertureBuildingFootprint[] = [];
  for (const tile of await Promise.all(tileRequests)) {
    if (!tile) {
      continue;
    }

    const vectorTile = new VectorTile(
      new PbfReader(new Uint8Array(tile.data)),
    );
    const buildingLayer = vectorTile.layers.building;
    if (!buildingLayer) {
      continue;
    }

    for (let index = 0; index < buildingLayer.length; index += 1) {
      const feature = buildingLayer.feature(index).toGeoJSON(
        tile.tileX,
        tile.tileY,
        OVERTURE_TILE_ZOOM,
      );
      const properties = feature.properties ?? {};
      const polygons = polygonOuterRings(feature.geometry)
        .map((ring) => ringToCoordinates(ring))
        .filter((ring) => ringIntersectsBbox(ring, bbox));

      if (polygons.length === 0) {
        continue;
      }

      footprints.push({
        heightMeters: buildingHeightMeters(properties),
        id:
          typeof properties.id === "string"
            ? properties.id
            : `${tile.tileX}-${tile.tileY}-${index}`,
        polygons,
      });
    }
  }

  return footprints;
}
