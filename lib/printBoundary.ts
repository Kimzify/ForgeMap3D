import type { ModelPoint, ModelPoint3 } from "./printModel";

const BOUNDARY_EPSILON = 0.001;

export function pointDistance(point: ModelPoint) {
  return Math.hypot(point.x, point.y);
}

export function isInsideCircle(point: ModelPoint, radiusMeters: number) {
  return pointDistance(point) <= radiusMeters;
}

export function surfaceCentroid(points: ModelPoint3[]): ModelPoint3 {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

export function isSurfaceInsideCircle(
  surface: ModelPoint3[],
  radiusMeters: number,
) {
  return surface.every((point) => isInsideCircle(point, radiusMeters));
}

function crossProduct(a: ModelPoint, b: ModelPoint, c: ModelPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function isInsideSelectionBoundary(
  point: ModelPoint,
  boundary: ModelPoint[],
) {
  if (boundary.length < 3) {
    return false;
  }

  return boundary.every((current, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return crossProduct(current, next, point) >= -BOUNDARY_EPSILON;
  });
}

export function isSurfaceInsideSelectionBoundary(
  surface: ModelPoint3[],
  boundary: ModelPoint[],
) {
  return surface.every((point) => isInsideSelectionBoundary(point, boundary));
}
