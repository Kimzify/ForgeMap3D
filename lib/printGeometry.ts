export type PlanarModelPoint = {
  x: number;
  z: number;
};

export type PlanarLineSegment = {
  end: PlanarModelPoint;
  start: PlanarModelPoint;
};

const CLIP_EPSILON = 0.000001;

function isPlanarPointInsideCircle(point: PlanarModelPoint, radiusMm: number) {
  return Math.hypot(point.x, point.z) <= radiusMm;
}

function planarSegmentCircleIntersections(
  start: PlanarModelPoint,
  end: PlanarModelPoint,
  radiusMm: number,
) {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const segmentA = deltaX * deltaX + deltaZ * deltaZ;
  const segmentB = 2 * (start.x * deltaX + start.z * deltaZ);
  const segmentC = start.x * start.x + start.z * start.z - radiusMm * radiusMm;
  const discriminant = segmentB * segmentB - 4 * segmentA * segmentC;

  if (segmentA === 0 || discriminant < 0) {
    return [];
  }

  const root = Math.sqrt(discriminant);
  return [
    (-segmentB - root) / (2 * segmentA),
    (-segmentB + root) / (2 * segmentA),
  ]
    .filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
}

function interpolatePlanarPoint(
  start: PlanarModelPoint,
  end: PlanarModelPoint,
  t: number,
): PlanarModelPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

export function linePrismCenterlineRadius(
  terrainRadiusMm: number,
  halfWidthMm: number,
) {
  return Math.max(terrainRadiusMm - halfWidthMm, 0);
}

export function clipPlanarSegmentToCircle(
  start: PlanarModelPoint,
  end: PlanarModelPoint,
  radiusMm: number,
): PlanarLineSegment | null {
  const startInside = isPlanarPointInsideCircle(start, radiusMm);
  const endInside = isPlanarPointInsideCircle(end, radiusMm);
  const intersections = planarSegmentCircleIntersections(start, end, radiusMm);

  if (startInside && endInside) {
    return { end, start };
  }

  if (startInside && !endInside) {
    const exit = intersections[0];
    return exit === undefined
      ? null
      : { end: interpolatePlanarPoint(start, end, exit), start };
  }

  if (!startInside && endInside) {
    const entry = intersections[intersections.length - 1];
    return entry === undefined
      ? null
      : { end, start: interpolatePlanarPoint(start, end, entry) };
  }

  if (intersections.length === 2) {
    return {
      end: interpolatePlanarPoint(start, end, intersections[1]),
      start: interpolatePlanarPoint(start, end, intersections[0]),
    };
  }

  return null;
}

function planarCrossProduct(
  a: PlanarModelPoint,
  b: PlanarModelPoint,
  c: PlanarModelPoint,
) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

export function insetPlanarBoundary(
  boundary: PlanarModelPoint[],
  insetMm: number,
) {
  if (insetMm <= 0) {
    return boundary;
  }

  return boundary.map((point) => {
    const length = Math.hypot(point.x, point.z);

    if (length <= insetMm || length <= CLIP_EPSILON) {
      return { x: 0, z: 0 };
    }

    const scale = (length - insetMm) / length;
    return {
      x: point.x * scale,
      z: point.z * scale,
    };
  });
}

export function clipPlanarSegmentToConvexPolygon(
  start: PlanarModelPoint,
  end: PlanarModelPoint,
  boundary: PlanarModelPoint[],
): PlanarLineSegment | null {
  if (boundary.length < 3) {
    return null;
  }

  const direction = {
    x: end.x - start.x,
    z: end.z - start.z,
  };
  let entry = 0;
  let exit = 1;

  for (let index = 0; index < boundary.length; index += 1) {
    const current = boundary[index];
    const next = boundary[(index + 1) % boundary.length];
    const edge = {
      x: next.x - current.x,
      z: next.z - current.z,
    };
    const currentValue = planarCrossProduct(current, next, start);
    const directionValue = edge.x * direction.z - edge.z * direction.x;

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
    end: interpolatePlanarPoint(start, end, exit),
    start: interpolatePlanarPoint(start, end, entry),
  };
}
