import { ShapeUtils, Vector2 } from "three";
import type { ModelPoint, ModelPoint3 } from "./printModel";

// Vertices this close (in meters) to a cut count as on it. Cutting closer
// than this makes sliver faces the preview drops as degenerate.
const PLANE_EPSILON = 0.01;

type ClipPlane = {
  normal: ModelPoint;
  origin: ModelPoint;
  direction: ModelPoint;
};

function clipPlanes(boundary: ModelPoint[]): ClipPlane[] {
  return boundary.flatMap((start, index) => {
    const end = boundary[(index + 1) % boundary.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < PLANE_EPSILON) {
      return [];
    }

    const direction = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    };
    // The selection boundary winds counter-clockwise, so the inside is left.
    return [{ direction, normal: { x: -direction.y, y: direction.x }, origin: start }];
  });
}

function signedDistance(point: ModelPoint, plane: ClipPlane) {
  return (
    (point.x - plane.origin.x) * plane.normal.x +
    (point.y - plane.origin.y) * plane.normal.y
  );
}

function pointKey(point: ModelPoint3) {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
}

// Neighbouring faces share this edge, so compute the crossing from a canonical
// endpoint order to get identical points on both sides of the cut.
function planeCrossing(
  from: ModelPoint3,
  to: ModelPoint3,
  plane: ClipPlane,
): ModelPoint3 {
  const [start, end] = pointKey(from) < pointKey(to) ? [from, to] : [to, from];
  const startDistance = signedDistance(start, plane);
  const t = startDistance / (startDistance - signedDistance(end, plane));

  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function surfaceTriangles(surface: ModelPoint3[]) {
  if (surface.length === 3) {
    return [surface];
  }

  const normal = { x: 0, y: 0, z: 0 };
  surface.forEach((current, index) => {
    const next = surface[(index + 1) % surface.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  });
  const absNormal = {
    x: Math.abs(normal.x),
    y: Math.abs(normal.y),
    z: Math.abs(normal.z),
  };
  const contour = surface.map((point) =>
    absNormal.x > absNormal.y && absNormal.x > absNormal.z
      ? new Vector2(point.y, point.z)
      : absNormal.y > absNormal.z
        ? new Vector2(point.x, point.z)
        : new Vector2(point.x, point.y),
  );
  const isClockwise = ShapeUtils.isClockWise(contour);

  return ShapeUtils.triangulateShape(contour, []).map((triangle) =>
    ShapeUtils.isClockWise(triangle.map((index) => contour[index])) === isClockwise
      ? triangle.map((index) => surface[index])
      : triangle.map((index) => surface[index]).reverse(),
  );
}

// Clips a convex polygon (a triangle) against the plane, returning the kept
// part and the new edge it gained along the plane, in the polygon's winding.
// Vertices within PLANE_EPSILON of the plane count as on it, so a cut through
// an existing vertex reuses it instead of adding a duplicate.
function clipConvexPolygon(polygon: ModelPoint3[], plane: ClipPlane) {
  const sides = polygon.map((point) => {
    const distance = signedDistance(point, plane);
    return distance > PLANE_EPSILON ? 1 : distance < -PLANE_EPSILON ? -1 : 0;
  });
  const kept: ModelPoint3[] = [];
  let exit: ModelPoint3 | null = null;
  let entry: ModelPoint3 | null = null;

  polygon.forEach((current, index) => {
    const nextIndex = (index + 1) % polygon.length;
    const next = polygon[nextIndex];
    const side = sides[index];
    const nextSide = sides[nextIndex];

    if (side >= 0) {
      kept.push(current);
    }
    if (side >= 0 && nextSide < 0) {
      exit = side === 0 ? current : planeCrossing(current, next, plane);
      if (side > 0) {
        kept.push(exit);
      }
    } else if (side < 0 && nextSide >= 0) {
      entry = nextSide === 0 ? next : planeCrossing(current, next, plane);
      if (nextSide > 0) {
        kept.push(entry);
      }
    }
  });

  return {
    cut:
      exit && entry && pointKey(exit) !== pointKey(entry)
        ? ([exit, entry] as [ModelPoint3, ModelPoint3])
        : null,
    kept: kept.length >= 3 ? kept : null,
  };
}

function capLoops(cuts: Array<[ModelPoint3, ModelPoint3]>) {
  // The cap runs opposite to the clipped faces' new edges.
  const nextByStart = new Map<string, [ModelPoint3, ModelPoint3]>();
  for (const [from, to] of cuts) {
    if (pointKey(from) !== pointKey(to)) {
      nextByStart.set(pointKey(to), [to, from]);
    }
  }

  const loops: ModelPoint3[][] = [];
  while (nextByStart.size > 0) {
    const [startKey, first] = nextByStart.entries().next().value!;
    nextByStart.delete(startKey);
    const loop = [first[0]];
    let current = first;

    while (pointKey(current[1]) !== startKey) {
      const next = nextByStart.get(pointKey(current[1]));
      if (!next) {
        break;
      }
      nextByStart.delete(pointKey(current[1]));
      loop.push(next[0]);
      current = next;
    }

    // Open chains come from source meshes that were not closed; skip them.
    if (pointKey(current[1]) === startKey && loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function capSurfaces(
  cuts: Array<[ModelPoint3, ModelPoint3]>,
  plane: ClipPlane,
) {
  const loops = capLoops(cuts).map((loop) => ({
    contour: loop.map(
      (point) =>
        new Vector2(
          (point.x - plane.origin.x) * plane.direction.x +
            (point.y - plane.origin.y) * plane.direction.y,
          point.z,
        ),
    ),
    loop,
  }));
  const containsPoint = (contour: Vector2[], point: Vector2) => {
    let inside = false;
    for (
      let index = 0, previous = contour.length - 1;
      index < contour.length;
      previous = index, index += 1
    ) {
      const a = contour[index];
      const b = contour[previous];
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
    return inside;
  };
  // Nesting depth, not winding, decides outlines and holes so caps still
  // work when a source solid has inverted faces.
  const nested = loops.map((loop) => ({
    ...loop,
    depth: loops.filter(
      (other) => other !== loop && containsPoint(other.contour, loop.contour[0]),
    ).length,
  }));

  return nested
    .filter(({ depth }) => depth % 2 === 0)
    .flatMap((outer) => {
      const outerHoles = nested.filter(
        (hole) =>
          hole.depth === outer.depth + 1 &&
          containsPoint(outer.contour, hole.contour[0]),
      );
      const points = [outer, ...outerHoles].flatMap(({ loop }) => loop);
      const contours = [outer, ...outerHoles].flatMap(({ contour }) => contour);
      const isClockwise = ShapeUtils.isClockWise(outer.contour);

      return ShapeUtils.triangulateShape(
        outer.contour,
        outerHoles.map(({ contour }) => contour),
      ).map((triangle) =>
        ShapeUtils.isClockWise(triangle.map((index) => contours[index])) ===
        isClockwise
          ? triangle.map((index) => points[index])
          : triangle.map((index) => points[index]).reverse(),
      );
    });
}

// A dropped face can share an edge lying on the plane with a face that is
// kept whole; that edge still bounds the cap. Reverse it to match the winding
// of the kept neighbour, like the cuts from clipConvexPolygon.
function droppedEdgesOnPlane(polygon: ModelPoint3[], plane: ClipPlane) {
  return polygon.flatMap((current, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return Math.abs(signedDistance(current, plane)) <= PLANE_EPSILON &&
      Math.abs(signedDistance(next, plane)) <= PLANE_EPSILON
      ? [[next, current] as [ModelPoint3, ModelPoint3]]
      : [];
  });
}

function clipSurfacesToPlane(surfaces: ModelPoint3[][], plane: ClipPlane) {
  const clipped: ModelPoint3[][] = [];
  const cuts: Array<[ModelPoint3, ModelPoint3]> = [];

  for (const surface of surfaces) {
    const distances = surface.map((point) => signedDistance(point, plane));
    if (distances.every((distance) => distance >= -PLANE_EPSILON)) {
      clipped.push(surface);
      continue;
    }
    if (distances.every((distance) => distance <= PLANE_EPSILON)) {
      cuts.push(...droppedEdgesOnPlane(surface, plane));
      continue;
    }

    for (const triangle of surfaceTriangles(surface)) {
      if (
        triangle.every((point) => signedDistance(point, plane) <= PLANE_EPSILON)
      ) {
        cuts.push(...droppedEdgesOnPlane(triangle, plane));
        continue;
      }

      const { cut, kept } = clipConvexPolygon(triangle, plane);
      if (kept) {
        clipped.push(kept);
      }
      if (cut) {
        cuts.push(cut);
      }
    }
  }

  return [...clipped, ...capSurfaces(cuts, plane)];
}

// Trims a closed building solid to a convex, counter-clockwise selection
// boundary and closes each cut with a wall along the boundary edge.
export function clipSolidToSelectionBoundary(
  surfaces: ModelPoint3[][],
  boundary: ModelPoint[],
) {
  let clipped = surfaces;

  for (const plane of clipPlanes(boundary)) {
    if (clipped.length === 0) {
      break;
    }
    if (
      clipped.every((surface) =>
        surface.every((point) => signedDistance(point, plane) >= -PLANE_EPSILON),
      )
    ) {
      continue;
    }

    clipped = clipSurfacesToPlane(clipped, plane);
  }

  return clipped;
}
