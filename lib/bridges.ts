import type { ElevationRaster } from "./ahn";
import {
  getPrintableRoadCategory,
  type ModelPoint,
  type PrintableBridgeSpan,
  type PrintableLine,
  type PrintablePolygon,
} from "./printModel";

const SAMPLE_SPACING_METERS = 1;
// Sidewalk centerlines run along the deck edge, often just outside it.
const DECK_EDGE_TOLERANCE_METERS = 1.5;
const MIN_ON_DECK_SHARE = 0.5;

type Bounds = { maxX: number; maxY: number; minX: number; minY: number };

function boundsOf(points: ModelPoint[]): Bounds {
  return {
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
  };
}

function ringContains(ring: ModelPoint[], point: ModelPoint) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const before = ring[previous];
    if (
      current.y > point.y !== before.y > point.y &&
      point.x <
        ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) +
          current.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToRing(ring: ModelPoint[], point: ModelPoint) {
  let distance = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(
            Math.max(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0),
            1,
          );
    distance = Math.min(
      distance,
      Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy),
    );
  }

  return distance;
}

function isOnDeck(deck: PrintablePolygon & { bounds: Bounds }, point: ModelPoint) {
  const { bounds } = deck;
  if (
    point.x < bounds.minX - DECK_EDGE_TOLERANCE_METERS ||
    point.x > bounds.maxX + DECK_EDGE_TOLERANCE_METERS ||
    point.y < bounds.minY - DECK_EDGE_TOLERANCE_METERS ||
    point.y > bounds.maxY + DECK_EDGE_TOLERANCE_METERS
  ) {
    return false;
  }

  const inside =
    ringContains(deck.points, point) &&
    !(deck.holes ?? []).some((hole) => ringContains(hole, point));
  return inside || distanceToRing(deck.points, point) <= DECK_EDGE_TOLERANCE_METERS;
}

function samplePoints(points: ModelPoint[]) {
  const samples: ModelPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / SAMPLE_SPACING_METERS),
    );
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  return samples;
}

// OpenStreetMap maps a bridge's carriageway and sidewalks as separate lines;
// where the deck outline itself is known, those lines would print as extra
// strips on top of it, so they are dropped.
export function roadsWithoutDeckedBridges(
  roads: PrintableLine[],
  decks: PrintablePolygon[],
) {
  if (decks.length === 0) {
    return roads;
  }

  const indexedDecks = decks.map((deck) => ({ ...deck, bounds: boundsOf(deck.points) }));
  return roads.filter((line) => {
    if (getPrintableRoadCategory(line) !== "bridges") {
      return true;
    }

    const samples = samplePoints(line.points);
    const onDeck = samples.filter((point) =>
      indexedDecks.some((deck) => isOnDeck(deck, point)),
    ).length;
    return samples.length === 0 || onDeck / samples.length < MIN_ON_DECK_SHARE;
  });
}

const PIER_ATTACH_DISTANCE_METERS = 1;
const PROFILE_BIN_METERS = 0.5;
const PROFILE_MIN_CELLS = 2;
const PROFILE_HEIGHT_PERCENTILE = 0.25;
const PROFILE_OUTLIER_METERS = 0.15;
// Trees, lamps and traffic on a deck must not read as a tall hump.
const MAX_HUMP_METERS = 2;

function centroid(points: ModelPoint[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

// Direction of a pier's long side, as a doubled angle so opposite
// directions average instead of cancelling, weighted by elongation.
function pierDirection(points: ModelPoint[]) {
  const center = centroid(points);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }

  const spread = Math.hypot(xx - yy, 2 * xy);
  return { cos: (xx - yy) / (spread || 1), sin: (2 * xy) / (spread || 1), weight: spread };
}

function isPierOfDeck(deck: PrintablePolygon, pier: PrintablePolygon) {
  const center = centroid(pier.points);
  return (
    (ringContains(deck.points, center) &&
      !(deck.holes ?? []).some((hole) => ringContains(hole, center))) ||
    distanceToRing(deck.points, center) <= PIER_ATTACH_DISTANCE_METERS
  );
}

// Piers stand across a bridge, parallel to the water it spans, so the span
// runs perpendicular to them. Returns null for decks without piers.
export function bridgeSpanFromPiers(
  deck: PrintablePolygon,
  piers: PrintablePolygon[],
): { pierIndexes: number[]; span: PrintableBridgeSpan } | null {
  const pierIndexes = piers
    .map((pier, index) => (isPierOfDeck(deck, pier) ? index : -1))
    .filter((index) => index >= 0);
  if (pierIndexes.length === 0) {
    return null;
  }

  let cos = 0;
  let sin = 0;
  for (const index of pierIndexes) {
    const direction = pierDirection(piers[index].points);
    cos += direction.cos * direction.weight;
    sin += direction.sin * direction.weight;
  }

  const pierAngle = Math.atan2(sin, cos) / 2;
  const axis = { x: -Math.sin(pierAngle), y: Math.cos(pierAngle) };
  const origin = centroid(deck.points);
  const offsetOf = (point: ModelPoint) =>
    (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y;
  const supports = pierIndexes
    .map((index) => {
      const offsets = piers[index].points.map(offsetOf);
      return [Math.min(...offsets), Math.max(...offsets)] as [number, number];
    })
    .sort((left, right) => left[0] - right[0])
    .reduce<Array<[number, number]>>((merged, interval) => {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        merged.push([...interval]);
      }
      return merged;
    }, []);

  return { pierIndexes, span: { axis, origin, profile: [], supports } };
}

// The deck's rise along its span in metres above its lowest point, from
// AHN surface heights over the deck. center converts local to RD.
export function deckHeightProfile(
  deck: PrintablePolygon,
  span: PrintableBridgeSpan,
  raster: ElevationRaster,
  center: ModelPoint,
) {
  const bins = new Map<number, number[]>();
  for (let row = 0; row < raster.height; row += 1) {
    for (let column = 0; column < raster.width; column += 1) {
      const height = raster.values[row * raster.width + column];
      const point = {
        x: raster.minX + (column + 0.5) * raster.cellSize - center.x,
        y: raster.maxY - (row + 0.5) * raster.cellSize - center.y,
      };
      if (
        !Number.isFinite(height) ||
        !ringContains(deck.points, point) ||
        (deck.holes ?? []).some((hole) => ringContains(hole, point))
      ) {
        continue;
      }

      const offset =
        (point.x - span.origin.x) * span.axis.x +
        (point.y - span.origin.y) * span.axis.y;
      const bin = Math.round(offset / PROFILE_BIN_METERS);
      bins.set(bin, [...(bins.get(bin) ?? []), height]);
    }
  }

  // A low height per slice of the deck: trees, lamps and traffic only ever
  // add height.
  const samples = [...bins]
    .filter(([, heights]) => heights.length >= PROFILE_MIN_CELLS)
    .map(([bin, heights]) => {
      const sorted = [...heights].sort((left, right) => left - right);
      return {
        height: sorted[Math.floor((sorted.length - 1) * PROFILE_HEIGHT_PERCENTILE)],
        offset: bin * PROFILE_BIN_METERS,
      };
    })
    .sort((left, right) => left.offset - right.offset);
  if (samples.length < 3) {
    return [];
  }

  // A deck rises to a single crest, so fit a downward parabola and drop
  // slices well above it (tree canopy over the quays) before refitting.
  let kept = samples;
  let fit = fitConcaveParabola(kept);
  for (let round = 0; round < 3; round += 1) {
    const next = kept.filter(
      (sample) => sample.height - fit(sample.offset) <= PROFILE_OUTLIER_METERS,
    );
    if (next.length < 3 || next.length === kept.length) {
      break;
    }
    kept = next;
    fit = fitConcaveParabola(kept);
  }

  const lowest = Math.min(...samples.map((sample) => fit(sample.offset)));
  return samples.map((sample) => ({
    heightMeters: Math.min(Math.max(fit(sample.offset) - lowest, 0), MAX_HUMP_METERS),
    offset: sample.offset,
  }));
}

// Least-squares h = a·s² + b·s + c with a ≤ 0, falling back to a line when
// the data curves upward.
function fitConcaveParabola(samples: Array<{ height: number; offset: number }>) {
  const solve = (columns: Array<(offset: number) => number>) => {
    const size = columns.length;
    const matrix = columns.map((row) =>
      [...columns.map((column) =>
        samples.reduce((sum, sample) => sum + row(sample.offset) * column(sample.offset), 0),
      ), samples.reduce((sum, sample) => sum + row(sample.offset) * sample.height, 0)],
    );
    for (let pivot = 0; pivot < size; pivot += 1) {
      const best = matrix
        .slice(pivot)
        .reduce((top, row, index) =>
          Math.abs(row[pivot]) > Math.abs(matrix[top][pivot]) ? pivot + index : top, pivot);
      [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
      if (Math.abs(matrix[pivot][pivot]) < 1e-12) {
        return null;
      }
      for (let row = 0; row < size; row += 1) {
        if (row !== pivot) {
          const factor = matrix[row][pivot] / matrix[pivot][pivot];
          for (let column = pivot; column <= size; column += 1) {
            matrix[row][column] -= factor * matrix[pivot][column];
          }
        }
      }
    }
    return matrix.map((row, index) => row[size] / row[index]);
  };

  const center = samples.reduce((sum, sample) => sum + sample.offset, 0) / samples.length;
  const parabola = solve([(s) => (s - center) ** 2, (s) => s - center, () => 1]);
  if (parabola && parabola[0] <= 0) {
    const [a, b, c] = parabola;
    return (offset: number) => a * (offset - center) ** 2 + b * (offset - center) + c;
  }

  const line = solve([(s) => s - center, () => 1]) ?? [0, 0];
  return (offset: number) => line[0] * (offset - center) + line[1];
}
