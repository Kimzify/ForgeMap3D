import type { MapSelection, SelectionCenter } from "./mapTypes";
import { selectionShape } from "./mapTypes";
import type { ModelPoint } from "./printModel";

const CIRCLE_SEGMENTS = 96;
const HEXAGON_SIDES = 6;
const FULL_TURN_RADIANS = Math.PI * 2;
const DIAMETER_MULTIPLIER = 2;
const HALF_DIVISOR = 2;

export type SelectionDimensions = {
  heightMeters: number;
  radiusMeters: number;
  widthMeters: number;
};

export type SelectionLocalBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

function polygonByRadius(radiusMeters: number, sides: number) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * FULL_TURN_RADIANS;
    return {
      x: Math.cos(angle) * radiusMeters,
      y: Math.sin(angle) * radiusMeters,
    };
  });
}

function rectanglePolygon(widthMeters: number, heightMeters: number) {
  const halfWidth = widthMeters / HALF_DIVISOR;
  const halfHeight = heightMeters / HALF_DIVISOR;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
}

function squareSideMeters(widthMeters: number, heightMeters: number) {
  return Math.max(widthMeters, heightMeters);
}

export function selectionDimensions(
  selection: MapSelection | null,
  radiusMeters: number,
): SelectionDimensions {
  if (selection?.shape === "rectangle") {
    const sideMeters = squareSideMeters(
      selection.widthMeters,
      selection.heightMeters,
    );

    return {
      heightMeters: sideMeters,
      radiusMeters: sideMeters / DIAMETER_MULTIPLIER,
      widthMeters: sideMeters,
    };
  }

  const diameterMeters = radiusMeters * DIAMETER_MULTIPLIER;
  return {
    heightMeters: diameterMeters,
    radiusMeters,
    widthMeters: diameterMeters,
  };
}

export function selectionLocalFootprint(
  selection: MapSelection | null,
  radiusMeters: number,
  circleSegments = CIRCLE_SEGMENTS,
): ModelPoint[] {
  const dimensions = selectionDimensions(selection, radiusMeters);

  if (selection?.shape === "rectangle") {
    return rectanglePolygon(dimensions.widthMeters, dimensions.heightMeters);
  }

  if (selectionShape(selection) === "hexagon") {
    return polygonByRadius(dimensions.radiusMeters, HEXAGON_SIDES);
  }

  return polygonByRadius(dimensions.radiusMeters, circleSegments);
}

export function selectionLocalBounds(
  selection: MapSelection | null,
  radiusMeters: number,
): SelectionLocalBounds {
  const points = selectionLocalFootprint(selection, radiusMeters);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
  };
}

export function rectangleSelectionFromCenter(
  center: SelectionCenter,
  widthMeters: number,
  heightMeters: number,
): MapSelection {
  const sideMeters = squareSideMeters(widthMeters, heightMeters);

  return {
    ...center,
    heightMeters: sideMeters,
    shape: "rectangle",
    widthMeters: sideMeters,
  };
}
