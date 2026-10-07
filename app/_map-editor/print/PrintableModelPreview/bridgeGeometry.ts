import polygonClipping, { type Pair, type Polygon } from "polygon-clipping";
import * as THREE from "three";
import type {
  PrintableBridgeDeck,
  PrintableBridgeSpan,
} from "@/lib/printModel";

// About three 0.2 mm print layers, so decks survive slicing as a slab.
export const BRIDGE_DECK_THICKNESS_MM = 0.6;
// Lowest arch opening that still prints as an opening (1.5 layers at 0.2 mm).
export const BRIDGE_MIN_ARCH_HEIGHT_MM = 0.3;
const BRIDGE_MIN_OPENING_WIDTH_MM = 0.3;
// Width of the slices the deck is cut into along its span; the arch curve
// and the deck's rise are sampled at slice edges.
const BRIDGE_SLICE_MM = 0.1;

type PlanarPoint = { x: number; y: number };

export type ArchBridgeInput = {
  deck: PrintableBridgeDeck;
  horizontalScale: number;
  // Whether planar millimetre coordinates lie over rendered water.
  isOverWater: (point: PlanarPoint) => boolean;
  roadTopY: number;
  span: PrintableBridgeSpan;
  supportY: number;
  // Terrain relief in millimetres at planar millimetre coordinates.
  terrainAt: (point: PlanarPoint) => number;
  verticalScale: number;
};

function profileHeightMeters(span: PrintableBridgeSpan, offset: number) {
  const { profile } = span;
  if (profile.length === 0) {
    return 0;
  }
  if (offset <= profile[0].offset) {
    return profile[0].heightMeters;
  }

  for (let index = 1; index < profile.length; index += 1) {
    const next = profile[index];
    if (offset <= next.offset) {
      const previous = profile[index - 1];
      const t = (offset - previous.offset) / (next.offset - previous.offset || 1);
      return previous.heightMeters + (next.heightMeters - previous.heightMeters) * t;
    }
  }

  return profile[profile.length - 1].heightMeters;
}

function signedArea(ring: Pair[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function openRing(ring: Pair[]) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
}

// A masonry bridge: the deck rises with its AHN profile, piers and
// abutments reach down to the water, and each opening between supports is
// a half-ellipse arch where there is room for one. Returns a closed solid
// per slice, merged into one geometry, in model coordinates.
export function createArchBridgeGeometry({
  deck,
  horizontalScale: scale,
  isOverWater,
  roadTopY,
  span,
  supportY,
  terrainAt,
  verticalScale,
}: ArchBridgeInput) {
  const offsetOf = (point: PlanarPoint) =>
    (point.x / scale - span.origin.x) * span.axis.x +
    (point.y / scale - span.origin.y) * span.axis.y;
  const pointAt = (offset: number, across = 0): Pair => [
    (span.origin.x + span.axis.x * offset - span.axis.y * across) * scale,
    (span.origin.y + span.axis.y * offset + span.axis.x * across) * scale,
  ];

  const offsets = deck.points.map((point) => offsetOf({ x: point.x * scale, y: point.y * scale }));
  const start = Math.min(...offsets);
  const end = Math.max(...offsets);
  const supports = span.supports
    .map(([from, to]) => [Math.max(from, start), Math.min(to, end)] as const)
    .filter(([from, to]) => to > from);
  const bounds = [[start, start] as const, ...supports, [end, end] as const];
  const openings: Array<[number, number]> = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index][1];
    const to = bounds[index + 1][0];
    if ((to - from) * scale < BRIDGE_MIN_OPENING_WIDTH_MM) {
      continue;
    }

    // Past the outermost piers a deck rests on the quay unless water runs
    // under it there.
    const isEnd = index === 0 || index === bounds.length - 2;
    const [x, y] = pointAt((from + to) / 2);
    if (!isEnd || isOverWater({ x, y })) {
      openings.push([from, to]);
    }
  }

  // The deck meets the road and rises only by its measured AHN profile.
  const topAt = (offset: number) =>
    roadTopY + profileHeightMeters(span, offset) * verticalScale;
  // Like Amsterdam's masonry bridges, each arch rises from the water to just
  // under the deck, so it stays in proportion however tall the bridge is
  // drawn. Openings too low to print stay solid.
  const arches = openings
    .map(([from, to]) => {
      const middle = (from + to) / 2;
      const rise = topAt(middle) - BRIDGE_DECK_THICKNESS_MM - supportY;
      return { from, half: (to - from) / 2, middle, rise, to };
    })
    .filter((arch) => arch.rise >= BRIDGE_MIN_ARCH_HEIGHT_MM);
  const bottomAt = (offset: number) => {
    const arch = arches.find(({ from, to }) => offset > from && offset < to);
    if (!arch) {
      return supportY;
    }

    const t = (offset - arch.middle) / arch.half;
    return Math.min(
      supportY + arch.rise * Math.sqrt(Math.max(1 - t * t, 0)),
      topAt(offset) - BRIDGE_DECK_THICKNESS_MM,
    );
  };

  const cuts = new Set<number>([
    start,
    end,
    ...arches.flatMap(({ from, to }) => [from, to]),
  ]);
  const step = BRIDGE_SLICE_MM / scale;
  for (let offset = start + step; offset < end; offset += step) {
    cuts.add(offset);
  }
  const sortedCuts = [...cuts].sort((left, right) => left - right);
  const deckPolygon: Polygon = [deck.points, ...(deck.holes ?? [])].map((ring) =>
    ring.map((point): Pair => [point.x * scale, point.y * scale]),
  );
  const reach =
    Math.max(
      ...deck.points.map((point) =>
        Math.hypot(point.x - span.origin.x, point.y - span.origin.y),
      ),
    ) + 1;

  const positions: number[] = [];
  const indices: number[] = [];
  const pushTriangle = (
    a: number,
    b: number,
    c: number,
    normal: [number, number, number],
  ) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax;
    const uy = positions[b * 3 + 1] - ay;
    const uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax;
    const vy = positions[c * 3 + 1] - ay;
    const vz = positions[c * 3 + 2] - az;
    const facing =
      (uy * vz - uz * vy) * normal[0] +
      (uz * vx - ux * vz) * normal[1] +
      (ux * vy - uy * vx) * normal[2];
    indices.push(...(facing >= 0 ? [a, b, c] : [a, c, b]));
  };

  for (let index = 0; index < sortedCuts.length - 1; index += 1) {
    const from = sortedCuts[index];
    const to = sortedCuts[index + 1];
    const band: Polygon = [
      [pointAt(from, -reach), pointAt(to, -reach), pointAt(to, reach), pointAt(from, reach)],
    ];
    let slices: Pair[][][];
    try {
      slices = polygonClipping.intersection(deckPolygon, band);
    } catch {
      continue;
    }

    for (const slice of slices) {
      const rings = slice
        .map(openRing)
        .filter((ring) => ring.length >= 3)
        .map((ring, ringIndex) => {
          const isOuter = ringIndex === 0;
          return (signedArea(ring) > 0) === isOuter ? ring : [...ring].reverse();
        });
      if (rings.length === 0) {
        continue;
      }

      const [outer, ...holes] = rings.map((ring) =>
        ring.map(([x, y]) => new THREE.Vector2(x, y)),
      );
      const triangles = THREE.ShapeUtils.triangulateShape(outer, holes);
      const vertices = rings.flat();
      const topStart = positions.length / 3;
      for (const [x, y] of vertices) {
        const offset = offsetOf({ x, y });
        positions.push(x, topAt(offset) + terrainAt({ x, y }), -y);
      }
      const bottomStart = positions.length / 3;
      for (const [x, y] of vertices) {
        const offset = offsetOf({ x, y });
        positions.push(x, bottomAt(offset) + terrainAt({ x, y }), -y);
      }

      for (const [a, b, c] of triangles) {
        pushTriangle(topStart + a, topStart + b, topStart + c, [0, 1, 0]);
        pushTriangle(bottomStart + a, bottomStart + b, bottomStart + c, [0, -1, 0]);
      }

      let ringStart = 0;
      for (const ring of rings) {
        for (let corner = 0; corner < ring.length; corner += 1) {
          const next = (corner + 1) % ring.length;
          const [x1, y1] = ring[corner];
          const [x2, y2] = ring[next];
          // Outer rings run counter-clockwise and holes clockwise, so
          // (dy, -dx) points out of the solid; planar y is model -z.
          const outward: [number, number, number] = [y2 - y1, 0, x2 - x1];
          const topA = topStart + ringStart + corner;
          const topB = topStart + ringStart + next;
          const bottomA = bottomStart + ringStart + corner;
          const bottomB = bottomStart + ringStart + next;
          pushTriangle(topA, bottomA, bottomB, outward);
          pushTriangle(topA, bottomB, topB, outward);
        }
        ringStart += ring.length;
      }
    }
  }

  if (indices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
