import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";
import type { ModelPoint } from "./printModel";

const MIN_RING_AREA_MM2 = 0.00001;
const POINT_EPSILON_MM = 0.000001;
const ROUND_JOIN_SEGMENTS = 16;

export type PlanarRegion = {
  holes: Pair[][];
  outer: Pair[];
};

export type WaterLineMaskInput = {
  points: ModelPoint[];
  widthMm: number;
};

export type WaterPolygonMaskInput = {
  holes?: ModelPoint[][];
  points: ModelPoint[];
};

function samePoint(left: Pair, right: Pair) {
  return (
    Math.abs(left[0] - right[0]) <= POINT_EPSILON_MM &&
    Math.abs(left[1] - right[1]) <= POINT_EPSILON_MM
  );
}

function closeRing(points: Pair[]): Ring {
  if (points.length < 3) {
    return [];
  }

  const ring = [...points];
  if (!samePoint(ring[0], ring[ring.length - 1])) {
    ring.push([...ring[0]] as Pair);
  }

  return ring;
}

function ringArea(points: Ring) {
  let area = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(area / 2);
}

function scaledRing(points: ModelPoint[], scale: number) {
  const planarPoints = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point): Pair => [point.x * scale, point.y * scale]);

  if (
    planarPoints.length > 1 &&
    samePoint(planarPoints[0], planarPoints[planarPoints.length - 1])
  ) {
    planarPoints.pop();
  }

  const ring = closeRing(planarPoints);
  return ring.length >= 4 && ringArea(ring) >= MIN_RING_AREA_MM2 ? ring : null;
}

function circleRing(center: Pair, radiusMm: number): Ring {
  const points: Pair[] = [];

  for (let index = 0; index < ROUND_JOIN_SEGMENTS; index += 1) {
    const angle = (index / ROUND_JOIN_SEGMENTS) * Math.PI * 2;
    points.push([
      center[0] + Math.cos(angle) * radiusMm,
      center[1] + Math.sin(angle) * radiusMm,
    ]);
  }

  return closeRing(points);
}

function lineMaskPolygons(
  line: WaterLineMaskInput,
  scale: number,
): Polygon[] {
  const points = line.points.map(
    (point): Pair => [point.x * scale, point.y * scale],
  );
  const halfWidthMm = line.widthMm / 2;
  const polygons: Polygon[] = [];

  if (points.length < 2 || halfWidthMm <= 0) {
    return polygons;
  }

  for (const point of points) {
    polygons.push([circleRing(point, halfWidthMm)]);
  }

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaY);

    if (length <= POINT_EPSILON_MM) {
      continue;
    }

    const normalX = (-deltaY / length) * halfWidthMm;
    const normalY = (deltaX / length) * halfWidthMm;
    polygons.push([
      closeRing([
        [start[0] + normalX, start[1] + normalY],
        [start[0] - normalX, start[1] - normalY],
        [end[0] - normalX, end[1] - normalY],
        [end[0] + normalX, end[1] + normalY],
      ]),
    ]);
  }

  return polygons;
}

function polygonBounds(polygon: Polygon) {
  const outer = polygon[0];
  const xs = outer.map((point) => point[0]);
  const ys = outer.map((point) => point[1]);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
  };
}

function boundsOverlap(
  left: ReturnType<typeof polygonBounds>,
  right: ReturnType<typeof polygonBounds>,
) {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}

function mergePolygons(polygons: Polygon[]) {
  let merged: MultiPolygon = [];

  for (const polygon of polygons) {
    if (merged.length === 0) {
      merged = [polygon];
      continue;
    }

    const nextBounds = polygonBounds(polygon);
    const overlapping: MultiPolygon = [];
    const disjoint: MultiPolygon = [];
    for (const current of merged) {
      if (boundsOverlap(polygonBounds(current), nextBounds)) {
        overlapping.push(current);
      } else {
        disjoint.push(current);
      }
    }

    if (overlapping.length === 0) {
      merged = [...merged, polygon];
      continue;
    }

    try {
      merged = [
        ...disjoint,
        ...polygonClipping.union(overlapping, polygon),
      ];
    } catch {
      // Preserve valid water even if neighboring source geometry is malformed.
      merged = [...merged, polygon];
    }
  }

  return merged;
}

export function createWaterMask(
  polygonRings: Array<ModelPoint[] | WaterPolygonMaskInput>,
  lines: WaterLineMaskInput[],
  scale: number,
) {
  const polygons = polygonRings.flatMap((polygon): Polygon[] => {
    const points = Array.isArray(polygon) ? polygon : polygon.points;
    const outer = scaledRing(points, scale);
    if (!outer) {
      return [];
    }

    const holes = Array.isArray(polygon)
      ? []
      : (polygon.holes ?? []).flatMap((hole) => {
          const ring = scaledRing(hole, scale);
          return ring ? [ring] : [];
        });

    return [[outer, ...holes]];
  });

  for (const line of lines) {
    polygons.push(...lineMaskPolygons(line, scale));
  }

  return mergePolygons(polygons);
}

export function createPolygonMask(polygonRings: ModelPoint[][], scale: number) {
  return mergePolygons(
    polygonRings.flatMap((points): Polygon[] => {
      const ring = scaledRing(points, scale);
      return ring ? [[ring]] : [];
    }),
  );
}

export function unionMasks(left: MultiPolygon, right: MultiPolygon) {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  try {
    return polygonClipping.union(left, right);
  } catch {
    return left;
  }
}

export function planarRegions(multiPolygon: MultiPolygon): PlanarRegion[] {
  return multiPolygon.flatMap((polygon) => {
    const [outer, ...holes] = polygon;
    return outer?.length >= 4 ? [{ holes, outer }] : [];
  });
}

export function subtractWaterMask(
  points: ModelPoint[],
  scale: number,
  waterMask: MultiPolygon,
) {
  const subject = scaledRing(points, scale);
  if (!subject) {
    return [];
  }

  if (waterMask.length === 0) {
    return planarRegions([[subject]]);
  }

  try {
    return planarRegions(polygonClipping.difference([subject], waterMask));
  } catch {
    return planarRegions([[subject]]);
  }
}

export function subtractMask(subject: MultiPolygon, mask: MultiPolygon) {
  if (subject.length === 0 || mask.length === 0) {
    return subject;
  }

  try {
    return polygonClipping.difference(subject, mask);
  } catch {
    return subject;
  }
}
