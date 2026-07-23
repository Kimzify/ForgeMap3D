import polygonClipping, {
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";
import type {
  ModelPoint,
  PrintablePolygon,
} from "./printModel";

const POINT_EPSILON = 0.001;
const MIN_RING_AREA = 0.000001;

export type OsmGeometryPoint = {
  lat: number;
  lon: number;
} | null;

export type OsmWaterElement = {
  geometry?: OsmGeometryPoint[];
  id: number;
  members?: Array<{
    geometry?: OsmGeometryPoint[];
    ref: number;
    role: string;
    type: string;
  }>;
  tags?: Record<string, string>;
  type: string;
};

export type OsmPointProjector = (
  longitude: number,
  latitude: number,
) => ModelPoint;

type SourcePolygon = {
  holes: ModelPoint[][];
  outer: ModelPoint[];
};

function samePoint(left: ModelPoint, right: ModelPoint) {
  return (
    Math.abs(left.x - right.x) <= POINT_EPSILON &&
    Math.abs(left.y - right.y) <= POINT_EPSILON
  );
}

function deduplicateConsecutive(points: ModelPoint[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || !samePoint(previous, point);
  });
}

function ringArea(points: ModelPoint[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

function normalizedClosedRing(points: ModelPoint[]) {
  const ring = deduplicateConsecutive(points);
  if (
    ring.length < 4 ||
    !samePoint(ring[0], ring[ring.length - 1])
  ) {
    return null;
  }

  ring[ring.length - 1] = ring[0];
  const openRing = ring.slice(0, -1);
  return ringArea(openRing) >= MIN_RING_AREA ? ring : null;
}

function projectGeometry(
  geometry: OsmGeometryPoint[] | undefined,
  projectPoint: OsmPointProjector,
) {
  if (
    !geometry?.length ||
    geometry.some(
      (point) =>
        !point ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon),
    )
  ) {
    return null;
  }

  return deduplicateConsecutive(
    geometry.map((point) => projectPoint(point!.lon, point!.lat)),
  );
}

function assembleRings(paths: ModelPoint[][]) {
  const remaining = paths
    .map((path) => deduplicateConsecutive(path))
    .filter((path) => path.length >= 2);
  const rings: ModelPoint[][] = [];

  while (remaining.length > 0) {
    let current = remaining.shift()!;
    let joined = true;

    while (!samePoint(current[0], current[current.length - 1]) && joined) {
      joined = false;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const first = current[0];
        const last = current[current.length - 1];
        const candidateFirst = candidate[0];
        const candidateLast = candidate[candidate.length - 1];

        if (samePoint(last, candidateFirst)) {
          current = [...current, ...candidate.slice(1)];
        } else if (samePoint(last, candidateLast)) {
          current = [...current, ...[...candidate].reverse().slice(1)];
        } else if (samePoint(first, candidateLast)) {
          current = [...candidate.slice(0, -1), ...current];
        } else if (samePoint(first, candidateFirst)) {
          current = [
            ...[...candidate].reverse().slice(0, -1),
            ...current,
          ];
        } else {
          continue;
        }

        remaining.splice(index, 1);
        joined = true;
        break;
      }
    }

    const ring = normalizedClosedRing(current);
    if (ring) {
      rings.push(ring);
    }
  }

  return rings;
}

function pointInRing(point: ModelPoint, ring: ModelPoint[]) {
  let inside = false;

  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (
      (current.y > point.y) !== (previous.y > point.y) &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function assignHoles(outers: ModelPoint[][], holes: ModelPoint[][]) {
  const polygons: SourcePolygon[] = outers.map((outer) => ({
    holes: [],
    outer,
  }));

  for (const hole of holes) {
    const owner = polygons.find((polygon) =>
      pointInRing(hole[0], polygon.outer),
    );
    owner?.holes.push(hole);
  }

  return polygons;
}

function toClippingRing(points: ModelPoint[]): Ring {
  return points.map((point): Pair => [point.x, point.y]);
}

function fromClippingRing(ring: Ring) {
  const points = ring.map(([x, y]) => ({ x, y }));
  if (
    points.length > 1 &&
    samePoint(points[0], points[points.length - 1])
  ) {
    points.pop();
  }

  return deduplicateConsecutive(points);
}

function clipSourcePolygon(
  source: SourcePolygon,
  boundary: ModelPoint[],
  kind: string,
) {
  const subject: Polygon = [
    toClippingRing(source.outer),
    ...source.holes.map(toClippingRing),
  ];
  const clip: Polygon = [toClippingRing([...boundary, boundary[0]])];

  try {
    return polygonClipping.intersection(subject, clip).flatMap(
      ([outer, ...holes]): PrintablePolygon[] => {
        if (!outer) {
          return [];
        }

        const points = fromClippingRing(outer);
        if (points.length < 3 || ringArea(points) < MIN_RING_AREA) {
          return [];
        }

        return [
          {
            holes: holes
              .map(fromClippingRing)
              .filter(
                (hole) =>
                  hole.length >= 3 && ringArea(hole) >= MIN_RING_AREA,
              ),
            kind,
            points,
          },
        ];
      },
    );
  } catch {
    return [];
  }
}

function isWaterArea(tags: Record<string, string>) {
  return (
    tags.natural === "water" ||
    Boolean(tags.water) ||
    Boolean(tags.waterway)
  );
}

function elementSourcePolygons(
  element: OsmWaterElement,
  projectPoint: OsmPointProjector,
) {
  const tags = element.tags ?? {};
  if (!isWaterArea(tags)) {
    return [];
  }

  if (element.type === "way") {
    const path = projectGeometry(element.geometry, projectPoint);
    const ring = path ? normalizedClosedRing(path) : null;
    return ring ? [{ holes: [], outer: ring }] : [];
  }

  if (
    element.type !== "relation" ||
    tags.type !== "multipolygon"
  ) {
    return [];
  }

  const outerPaths: ModelPoint[][] = [];
  const innerPaths: ModelPoint[][] = [];
  for (const member of element.members ?? []) {
    if (member.type !== "way") {
      continue;
    }

    const path = projectGeometry(member.geometry, projectPoint);
    if (!path) {
      continue;
    }

    if (member.role === "inner") {
      innerPaths.push(path);
    } else if (member.role === "outer" || member.role === "") {
      outerPaths.push(path);
    }
  }

  return assignHoles(
    assembleRings(outerPaths),
    assembleRings(innerPaths),
  );
}

export function extractOsmWaterPolygons(
  elements: OsmWaterElement[],
  projectPoint: OsmPointProjector,
  boundary: ModelPoint[],
) {
  if (boundary.length < 3) {
    return [];
  }

  return elements.flatMap((element) => {
    const tags = element.tags ?? {};
    const kind = tags.water ?? tags.waterway ?? "water";

    return elementSourcePolygons(element, projectPoint).flatMap((source) =>
      clipSourcePolygon(source, boundary, kind),
    );
  });
}
