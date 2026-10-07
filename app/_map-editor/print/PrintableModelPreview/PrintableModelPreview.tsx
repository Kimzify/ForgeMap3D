"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { selectionShape } from "@/lib/mapTypes";
import {
  clipPlanarSegmentToConvexPolygon,
  clipPlanarSegmentToCircle,
  insetPlanarBoundary,
  linePrismCenterlineRadius,
} from "@/lib/printGeometry";
import { selectionLocalFootprint } from "@/lib/selectionGeometry";
import { APP_TEXT } from "@/lib/text";
import {
  createPolygonMask,
  createWaterMask,
  intersectMasks,
  planarRegions,
  subtractMask,
  unionMasks,
  type PlanarRegion,
} from "@/lib/printWaterGeometry";
import {
  getPrintableLandCoverCategory,
  getPrintableFileName,
  getPrintableModelSize,
  getPrintableRoadCategory,
  getRoadCategoryWidthMm,
  maxPrintableBuildingHeightMeters,
  PRINTABLE_LAND_COVER_CATEGORIES,
  PRINTABLE_ROAD_CATEGORIES,
  type ModelPoint,
  type ModelPoint3,
  type PrintableLine,
  type PrintableLandCoverCategoryKey,
  type PrintableModelData,
  type PrintableRenderMode,
} from "@/lib/printModel";
import {
  BRIDGE_DECK_THICKNESS_MM,
  createArchBridgeGeometry,
} from "./bridgeGeometry";
import styles from "./PrintableModelPreview.module.css";
import type {
  ArchiveFile,
  ModelInput,
  ModelMetrics,
  ObjMtlExport,
  PrintableModelPreviewHandle,
  PrintableModelPreviewProps,
  PrintableSize,
  PreviewView,
} from "./PrintableModelPreview.types";

const MIN_LAYER_LIFT_MM = 0.02;
const BUILDING_FOOTPRINT_NUDGE_MM = 0.02;
const MIN_LAND_COVER_REGION_AREA_MM2 = 0.08;
const MIN_LAND_COVER_REGION_SPAN_MM = 0.15;
const MIN_LINE_WIDTH_MM = 0.02;
const MIN_LINE_SEGMENT_LENGTH_MM = 0.001;
const SURFACE_MODE_THICKNESS_MM = 0.05;
const PREVIEW_TEXT = APP_TEXT.printPreview;
const MAP_STATUS = APP_TEXT.mapEditor.status;
const PREVIEW_BACKGROUND_COLOR = "#faf8fb";
const RENDERER_CLEAR_ALPHA = 1;
const MAX_DEVICE_PIXEL_RATIO = 2;
const DIAMETER_TO_RADIUS_DIVISOR = 2;
const MIN_VIEW_RADIUS_MM = 35;
const MIN_VIEW_HEIGHT_MM = 1;
const CAMERA_DISTANCE_MULTIPLIER = 3.2;
const CAMERA_FIELD_OF_VIEW_DEGREES = 38;
const CAMERA_ASPECT_RATIO = 1;
const CAMERA_NEAR_PLANE = 0.1;
const CAMERA_FAR_DISTANCE_MULTIPLIER = 4;
const CAMERA_MIN_FAR_PLANE = 500;
const CAMERA_POSITION_X_MULTIPLIER = 1.5;
const CAMERA_POSITION_Y_MULTIPLIER = 1.8;
const CAMERA_POSITION_Z_MULTIPLIER = 2.35;
const CONTROLS_DAMPING_FACTOR = 0.08;
const CONTROLS_MAX_POLAR_ANGLE_FACTOR = 0.49;
const CONTROLS_MIN_DISTANCE_FACTOR = 0.72;
const CONTROLS_MAX_DISTANCE_FACTOR = 5.5;
const CONTROLS_TARGET_HEIGHT_FACTOR = 0.25;
const HEMISPHERE_LIGHT_SKY_COLOR = "#ffffff";
const HEMISPHERE_LIGHT_GROUND_COLOR = "#dfdce5";
const HEMISPHERE_LIGHT_INTENSITY = 2.3;
const KEY_LIGHT_COLOR = "#ffffff";
const KEY_LIGHT_INTENSITY = 3.2;
const KEY_LIGHT_POSITION_X_MULTIPLIER = 1.4;
const KEY_LIGHT_POSITION_Y_MULTIPLIER = 2.1;
const KEY_LIGHT_POSITION_Z_MULTIPLIER = 1.4;
const FILL_LIGHT_COLOR = "#f8eef4";
const FILL_LIGHT_INTENSITY = 1.4;
const FILL_LIGHT_POSITION_X_MULTIPLIER = -1.3;
const FILL_LIGHT_POSITION_Y_MULTIPLIER = 1.2;
const FILL_LIGHT_POSITION_Z_MULTIPLIER = -1.6;
const GRID_SIZE_MULTIPLIER = 2.4;
const GRID_MIN_SIZE_MM = 120;
const GRID_DIVISIONS = 80;
const GRID_PRIMARY_COLOR = "#d2cfd8";
const GRID_SECONDARY_COLOR = "#e8e5ec";
const GRID_BASE_OFFSET_FACTOR = 0.14;
const INITIAL_ANIMATION_FRAME = 0;
const BASE_MATERIAL_COLOR = "#f3ead1";
const CIRCLE_GEOMETRY_SEGMENTS = 256;
const DRAPED_LAND_COVER_CLEARANCE_MM = 0.35;
const TERRAIN_RADIAL_RINGS = 20;
const WATER_EDGE_SNAP_DISTANCE_MM = 1.5;
const PREVIEW_UPDATE_PAINT_DELAY_MS = 60;

type VisibleLandCoverLayer = {
  categoryKey: PrintableLandCoverCategoryKey;
  regions: PlanarRegion[];
};

function createPreviewView(size: PrintableSize): PreviewView {
  const viewRadius = Math.max(
    size.totalSideMm / DIAMETER_TO_RADIUS_DIVISOR,
    MIN_VIEW_RADIUS_MM,
  );
  const viewHeight = Math.max(
    size.heightMm,
    size.frameHeightMm,
    MIN_VIEW_HEIGHT_MM,
  );
  const cameraDistance = viewRadius * CAMERA_DISTANCE_MULTIPLIER;

  return {
    cameraDistance,
    cameraFarPlane: Math.max(
      cameraDistance * CAMERA_FAR_DISTANCE_MULTIPLIER,
      CAMERA_MIN_FAR_PLANE,
    ),
    gridPositionY: -Math.max(
      size.baseHeightMm * GRID_BASE_OFFSET_FACTOR,
      MIN_VIEW_HEIGHT_MM,
    ),
    gridSize: Math.max(
      size.totalSideMm * GRID_SIZE_MULTIPLIER,
      GRID_MIN_SIZE_MM,
    ),
    targetY: Math.max(
      viewHeight * CONTROLS_TARGET_HEIGHT_FACTOR,
      MIN_VIEW_HEIGHT_MM,
    ),
    viewHeight,
    viewRadius,
  };
}

function createPreviewGrid(size: PrintableSize) {
  const view = createPreviewView(size);
  const grid = new THREE.GridHelper(
    view.gridSize,
    GRID_DIVISIONS,
    GRID_PRIMARY_COLOR,
    GRID_SECONDARY_COLOR,
  );
  grid.position.y = view.gridPositionY;

  return grid;
}

function updateCameraBoundsForSize(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  size: PrintableSize,
) {
  const view = createPreviewView(size);
  const currentDistance = camera.position.distanceTo(controls.target);

  camera.far = view.cameraFarPlane;
  camera.updateProjectionMatrix();
  controls.minDistance = Math.min(
    view.viewRadius * CONTROLS_MIN_DISTANCE_FACTOR,
    currentDistance,
  );
  controls.maxDistance = Math.max(
    view.viewRadius * CONTROLS_MAX_DISTANCE_FACTOR,
    currentDistance,
  );
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function modelScale(radiusMeters: number, terrainRadiusMm: number) {
  return terrainRadiusMm / radiusMeters;
}

function layerLift(liftMm: number) {
  return Math.max(liftMm, MIN_LAYER_LIFT_MM);
}

function activeTerrainData(input: ModelInput) {
  return input.layers.terrain ? input.modelData?.terrain ?? null : null;
}

function terrainSurfaceColor(input: ModelInput) {
  return activeTerrainData(input)
    ? input.modelSettings.layers.terrain.color
    : input.modelSettings.layers.landCover.landColor;
}

function printableLandHeightMm(input: ModelInput) {
  if (!input.layers.landCover) {
    return 0;
  }

  const settings = input.modelSettings.layers.landCover;
  return Math.max(
    settings.landHeightMm ?? settings.categories.urban.extrudedHeightMm,
    0,
  );
}

function terrainReliefMeters(input: ModelInput) {
  const terrain = activeTerrainData(input);
  if (!terrain) {
    return 0;
  }

  return Math.max(terrain.maxElevationMeters - terrain.minElevationMeters, 0);
}

function createModelMetrics(input: ModelInput): ModelMetrics {
  const terrainRadiusMm = input.size.mapSideMm / 2;
  const totalRadiusMm = input.size.totalSideMm / 2;
  const horizontalScale = modelScale(input.radiusMeters, terrainRadiusMm);
  const autoBuildingVerticalScale =
    horizontalScale * input.modelSettings.layers.buildings.heightExaggeration;
  const autoTerrainVerticalScale =
    horizontalScale * input.modelSettings.layers.terrain.verticalExaggeration;
  const lockedHeightMm = Math.max(input.size.heightMm - input.size.baseHeightMm, 1);
  const maxHeightMeters = maxPrintableBuildingHeightMeters(input.modelData);
  const terrainHeightMeters = terrainReliefMeters(input);
  const autoMaxHeightMm =
    terrainHeightMeters * autoTerrainVerticalScale +
    maxHeightMeters * autoBuildingVerticalScale;
  const lockedScaleFactor =
    input.modelSettings.dimensions.lockModelHeight && autoMaxHeightMm > 0
      ? lockedHeightMm / autoMaxHeightMm
      : 1;
  const buildingVerticalScale = autoBuildingVerticalScale * lockedScaleFactor;
  const terrainVerticalScale = autoTerrainVerticalScale * lockedScaleFactor;

  return {
    baseHeightMm: input.size.baseHeightMm,
    buildingVerticalScale,
    frameHeightMm: input.size.frameHeightMm,
    frameWidthMm: input.size.frameWidthMm,
    horizontalScale,
    surfaceY: input.size.baseHeightMm,
    terrainVerticalScale,
    terrainRadiusMm,
    totalRadiusMm,
    verticalScale: buildingVerticalScale,
  };
}

function normalizedRing(points: ModelPoint[]) {
  if (points.length < 3) {
    return [];
  }

  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (Math.hypot(first.x - last.x, first.y - last.y) < 0.1) {
    ring.pop();
  }

  return ring;
}

function pointToVector(point: ModelPoint, scale: number) {
  return new THREE.Vector2(point.x * scale, point.y * scale);
}

function terrainReliefAt(
  terrain: PrintableModelData["terrain"] | null | undefined,
  xMeters: number,
  yMeters: number,
) {
  if (!terrain) {
    return 0;
  }

  const column = (xMeters - terrain.minX) / terrain.spacingMeters;
  const row = (yMeters - terrain.minY) / terrain.spacingMeters;
  const left = Math.floor(column);
  const top = Math.floor(row);
  const right = Math.min(left + 1, terrain.columns - 1);
  const bottom = Math.min(top + 1, terrain.rows - 1);
  if (left < 0 || top < 0 || left >= terrain.columns || top >= terrain.rows) {
    return 0;
  }

  const tx = Math.min(Math.max(column - left, 0), 1);
  const ty = Math.min(Math.max(row - top, 0), 1);
  const topLeft = terrain.elevations[top * terrain.columns + left];
  const topRight = terrain.elevations[top * terrain.columns + right];
  const bottomLeft = terrain.elevations[bottom * terrain.columns + left];
  const bottomRight = terrain.elevations[bottom * terrain.columns + right];
  const topValue = topLeft + (topRight - topLeft) * tx;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * tx;

  return Math.max(
    topValue + (bottomValue - topValue) * ty - terrain.minElevationMeters,
    0,
  );
}

function terrainHeightMmAt(input: ModelInput, metrics: ModelMetrics, point: ModelPoint) {
  return terrainReliefAt(activeTerrainData(input), point.x, point.y) *
    metrics.terrainVerticalScale;
}

function polygonArea(points: THREE.Vector2[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

function planarRingArea(points: PlanarRegion["outer"]) {
  let area = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(area / 2);
}

function stableLandCoverRegion(region: PlanarRegion) {
  const outer = region.outer;
  if (outer.length < 4) {
    return false;
  }

  const xs = outer.map((point) => point[0]);
  const ys = outer.map((point) => point[1]);
  const areaMm2 =
    planarRingArea(outer) -
    region.holes.reduce((area, hole) => area + planarRingArea(hole), 0);
  const minimumSpanMm = Math.min(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );

  return (
    areaMm2 >= MIN_LAND_COVER_REGION_AREA_MM2 &&
    minimumSpanMm >= MIN_LAND_COVER_REGION_SPAN_MM
  );
}

function visibleLandCoverLayers(
  input: ModelInput,
  metrics: ModelMetrics,
  waterMask: ReturnType<typeof createWaterMask>,
): VisibleLandCoverLayer[] {
  if (!input.modelData || !input.layers.landCover) {
    return [];
  }

  const settings = input.modelSettings.layers.landCover;
  const polygonsByCategory = new Map<
    PrintableLandCoverCategoryKey,
    PrintableModelData["landCover"]
  >();
  for (const polygon of input.modelData.landCover) {
    const categoryKey = getPrintableLandCoverCategory(polygon);
    if (!settings.categories[categoryKey].enabled) {
      continue;
    }

    polygonsByCategory.set(categoryKey, [
      ...(polygonsByCategory.get(categoryKey) ?? []),
      polygon,
    ]);
  }

  const layers: VisibleLandCoverLayer[] = [];
  let occupiedMask = waterMask;
  for (const { key: categoryKey } of PRINTABLE_LAND_COVER_CATEGORIES) {
    const category = settings.categories[categoryKey];
    const polygons = polygonsByCategory.get(categoryKey) ?? [];
    if (!category.enabled || polygons.length === 0) {
      continue;
    }

    const categoryMask = subtractMask(
      createWaterMask(
        polygons.map((polygon) => ({
          holes: polygon.holes,
          points: polygon.points,
        })),
        [],
        metrics.horizontalScale,
      ),
      occupiedMask,
    );
    const regions = planarRegions(categoryMask).filter(stableLandCoverRegion);
    if (regions.length === 0) {
      continue;
    }

    layers.push({ categoryKey, regions });
    const stableMask: ReturnType<typeof createWaterMask> = regions.map(
      (region) => [region.outer, ...region.holes],
    );
    occupiedMask = unionMasks(occupiedMask, stableMask);
  }

  return layers;
}

// Edges bucketed into horizontal bands, so point and triangle tests only
// visit edges near them instead of every edge of a large water outline.
type PlanarRingIndex = {
  bandHeight: number;
  bands: number[][];
  maxY: number;
  minY: number;
};

const PLANAR_RING_INDEX_PADDING = 0.00001;
const planarRingIndexCache = new WeakMap<PlanarRegion["outer"], PlanarRingIndex>();

function previousRingIndex(ring: PlanarRegion["outer"], index: number) {
  return index === 0 ? ring.length - 1 : index - 1;
}

function planarRingIndex(ring: PlanarRegion["outer"]) {
  const cached = planarRingIndexCache.get(ring);
  if (cached) {
    return cached;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of ring) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const bandCount = Math.min(Math.max(Math.ceil(ring.length / 8), 1), 1024);
  const index: PlanarRingIndex = {
    bandHeight: Math.max((maxY - minY) / bandCount, 0.000001),
    bands: Array.from({ length: bandCount }, () => []),
    maxY,
    minY,
  };
  for (let edge = 0; edge < ring.length; edge += 1) {
    const current = ring[edge];
    const previous = ring[previousRingIndex(ring, edge)];
    const [firstBand, lastBand] = planarRingBandRange(
      index,
      Math.min(current[1], previous[1]),
      Math.max(current[1], previous[1]),
    );
    for (let band = firstBand; band <= lastBand; band += 1) {
      index.bands[band].push(edge);
    }
  }
  planarRingIndexCache.set(ring, index);

  return index;
}

function planarRingBandRange(index: PlanarRingIndex, fromY: number, toY: number) {
  const bandOf = (y: number) =>
    Math.min(
      Math.max(Math.floor((y - index.minY) / index.bandHeight), 0),
      index.bands.length - 1,
    );

  return [
    bandOf(fromY - PLANAR_RING_INDEX_PADDING),
    bandOf(toY + PLANAR_RING_INDEX_PADDING),
  ] as const;
}

// Calls visit once per ring edge (previous vertex -> index) whose y-range
// may overlap fromY..toY; stops early when visit returns true.
function someRingEdgeNearY(
  ring: PlanarRegion["outer"],
  fromY: number,
  toY: number,
  visit: (index: number) => boolean,
) {
  const index = planarRingIndex(ring);
  if (
    toY < index.minY - PLANAR_RING_INDEX_PADDING ||
    fromY > index.maxY + PLANAR_RING_INDEX_PADDING
  ) {
    return false;
  }

  const [firstBand, lastBand] = planarRingBandRange(index, fromY, toY);
  const visited = firstBand === lastBand ? null : new Set<number>();
  for (let band = firstBand; band <= lastBand; band += 1) {
    for (const edge of index.bands[band]) {
      if (visited) {
        if (visited.has(edge)) {
          continue;
        }
        visited.add(edge);
      }

      if (visit(edge)) {
        return true;
      }
    }
  }

  return false;
}

function planarRingContainsPoint(
  ring: PlanarRegion["outer"],
  point: [number, number],
) {
  let inside = false;

  // Only edges spanning the point's y can touch it or cross its ray.
  const onEdge = someRingEdgeNearY(ring, point[1], point[1], (index) => {
    const previous = previousRingIndex(ring, index);
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const segmentX = currentPoint[0] - previousPoint[0];
    const segmentY = currentPoint[1] - previousPoint[1];
    const pointX = point[0] - previousPoint[0];
    const pointY = point[1] - previousPoint[1];
    const cross = segmentX * pointY - segmentY * pointX;
    const dot = pointX * segmentX + pointY * segmentY;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    // A zero-length edge (the repeated closing vertex) passes the collinear
    // test for every point, so it only touches the point it sits on.
    if (
      segmentLengthSquared <= 0.000001
        ? Math.hypot(pointX, pointY) <= 0.000001
        : Math.abs(cross) <= 0.000001 &&
          dot >= -0.000001 &&
          dot <= segmentLengthSquared + 0.000001
    ) {
      return true;
    }

    if (
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) *
          (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]
    ) {
      inside = !inside;
    }

    return false;
  });

  return onEdge || inside;
}

function planarRegionContainsPoint(region: PlanarRegion, point: [number, number]) {
  const bounds = planarRegionBounds(region);
  if (
    point[0] < bounds.minX - PLANAR_RING_INDEX_PADDING ||
    point[0] > bounds.maxX + PLANAR_RING_INDEX_PADDING ||
    point[1] < bounds.minY - PLANAR_RING_INDEX_PADDING ||
    point[1] > bounds.maxY + PLANAR_RING_INDEX_PADDING
  ) {
    return false;
  }

  return (
    planarRingContainsPoint(region.outer, point) &&
    !region.holes.some((hole) => planarRingContainsPoint(hole, point))
  );
}

function triangleContainsPoint(
  triangle: [THREE.Vector2, THREE.Vector2, THREE.Vector2],
  point: [number, number],
) {
  const [first, second, third] = triangle;
  const area =
    (second.y - third.y) * (first.x - third.x) +
    (third.x - second.x) * (first.y - third.y);
  if (Math.abs(area) <= 0.000001) {
    return false;
  }

  const alpha =
    ((second.y - third.y) * (point[0] - third.x) +
      (third.x - second.x) * (point[1] - third.y)) /
    area;
  const beta =
    ((third.y - first.y) * (point[0] - third.x) +
      (first.x - third.x) * (point[1] - third.y)) /
    area;
  const gamma = 1 - alpha - beta;

  return alpha >= -0.000001 && beta >= -0.000001 && gamma >= -0.000001;
}

function segmentDirection(
  start: [number, number],
  end: [number, number],
  point: [number, number],
) {
  return (
    (point[0] - start[0]) * (end[1] - start[1]) -
    (point[1] - start[1]) * (end[0] - start[0])
  );
}

function segmentsIntersect(
  firstStart: [number, number],
  firstEnd: [number, number],
  secondStart: [number, number],
  secondEnd: [number, number],
) {
  const firstToSecondStart = segmentDirection(firstStart, firstEnd, secondStart);
  const firstToSecondEnd = segmentDirection(firstStart, firstEnd, secondEnd);
  const secondToFirstStart = segmentDirection(secondStart, secondEnd, firstStart);
  const secondToFirstEnd = segmentDirection(secondStart, secondEnd, firstEnd);

  return (
    firstToSecondStart * firstToSecondEnd <= 0.000001 &&
    secondToFirstStart * secondToFirstEnd <= 0.000001
  );
}

type PlanarBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

const planarRegionBoundsCache = new WeakMap<PlanarRegion, PlanarBounds>();

function planarRegionBounds(region: PlanarRegion) {
  const cached = planarRegionBoundsCache.get(region);
  if (cached) {
    return cached;
  }

  const bounds = { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity };
  for (const [x, y] of region.outer) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  planarRegionBoundsCache.set(region, bounds);

  return bounds;
}

function planarBoundsOverlap(left: PlanarBounds, right: PlanarBounds) {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}

function triangleOverlapsPlanarRegion(
  triangle: [THREE.Vector2, THREE.Vector2, THREE.Vector2],
  region: PlanarRegion,
) {
  const triangleBounds = {
    maxX: Math.max(triangle[0].x, triangle[1].x, triangle[2].x),
    maxY: Math.max(triangle[0].y, triangle[1].y, triangle[2].y),
    minX: Math.min(triangle[0].x, triangle[1].x, triangle[2].x),
    minY: Math.min(triangle[0].y, triangle[1].y, triangle[2].y),
  };
  if (!planarBoundsOverlap(triangleBounds, planarRegionBounds(region))) {
    return false;
  }

  const trianglePoints = triangle.map((point) => [point.x, point.y] as [number, number]);
  const samplePoints: [number, number][] = [];
  const sampleSteps = 4;
  for (let firstWeight = 0; firstWeight <= sampleSteps; firstWeight += 1) {
    for (
      let secondWeight = 0;
      secondWeight <= sampleSteps - firstWeight;
      secondWeight += 1
    ) {
      const thirdWeight = sampleSteps - firstWeight - secondWeight;
      samplePoints.push([
        (triangle[0].x * firstWeight +
          triangle[1].x * secondWeight +
          triangle[2].x * thirdWeight) /
          sampleSteps,
        (triangle[0].y * firstWeight +
          triangle[1].y * secondWeight +
          triangle[2].y * thirdWeight) /
          sampleSteps,
      ]);
    }
  }

  if (samplePoints.some((point) => planarRegionContainsPoint(region, point))) {
    return true;
  }

  const ring = region.outer;
  if (
    someRingEdgeNearY(ring, triangleBounds.minY, triangleBounds.maxY, (index) =>
      triangleContainsPoint(triangle, [ring[index][0], ring[index][1]]),
    )
  ) {
    return true;
  }

  const triangleEdges = trianglePoints.map(
    (point, index) =>
      [point, trianglePoints[(index + 1) % trianglePoints.length]] as [
        [number, number],
        [number, number],
      ],
  );
  return someRingEdgeNearY(
    ring,
    triangleBounds.minY,
    triangleBounds.maxY,
    (index) => {
      // Edge 0 is the closing edge back to the last vertex, which repeats
      // the first vertex in closed rings.
      if (index === 0) {
        return false;
      }

      const ringStart = ring[index - 1];
      const ringEnd = ring[index];
      if (
        Math.max(ringStart[0], ringEnd[0]) <
          triangleBounds.minX - PLANAR_RING_INDEX_PADDING ||
        Math.min(ringStart[0], ringEnd[0]) >
          triangleBounds.maxX + PLANAR_RING_INDEX_PADDING
      ) {
        return false;
      }

      return triangleEdges.some(([edgeStart, edgeEnd]) =>
        segmentsIntersect(edgeStart, edgeEnd, ringStart, ringEnd),
      );
    },
  );
}

function triangleOverlapsPlanarRegions(
  vertices: THREE.Vector2[],
  triangleIndices: number[],
  regions: PlanarRegion[],
) {
  if (regions.length === 0) {
    return false;
  }

  const triangle = triangleIndices.map((index) => vertices[index]) as [
    THREE.Vector2,
    THREE.Vector2,
    THREE.Vector2,
  ];
  return regions.some((region) => triangleOverlapsPlanarRegion(triangle, region));
}

function landCoverTopOffsetMm(
  input: ModelInput,
  categoryKey: PrintableLandCoverCategoryKey,
) {
  const settings = input.modelSettings.layers.landCover;
  const category = settings.categories[categoryKey];
  const height =
    category.renderMode === "extruded" ? category.extrudedHeightMm : 0;
  const terrainClearance = activeTerrainData(input)
    ? DRAPED_LAND_COVER_CLEARANCE_MM
    : 0;

  return Math.max(
    settings.verticalOffsetMm -
      (category.carveIntoTerrain ? category.carveDepthMm : 0) +
      layerLift(0) +
      height +
      terrainClearance,
    0,
  );
}

function buildingLandCoverLiftMm(
  building: PrintableModelData["buildings"][number],
  input: ModelInput,
  metrics: ModelMetrics,
  landCoverLayers: VisibleLandCoverLayer[],
) {
  const points = building.surfaces.flat();
  const landHeightMm = printableLandHeightMm(input);
  if (points.length === 0 || landCoverLayers.length === 0) {
    return landHeightMm;
  }

  const minimumZ = Math.min(...points.map((point) => point.z));
  const groundPoints = points
    .filter((point) => point.z <= minimumZ + 0.001)
    .map(
      (point) =>
        [
          point.x * metrics.horizontalScale,
          point.y * metrics.horizontalScale,
        ] as [number, number],
    );
  const groundBounds = {
    maxX: Math.max(...groundPoints.map((point) => point[0])),
    maxY: Math.max(...groundPoints.map((point) => point[1])),
    minX: Math.min(...groundPoints.map((point) => point[0])),
    minY: Math.min(...groundPoints.map((point) => point[1])),
  };
  const nearbyLayers = landCoverLayers.map((layer) => ({
    regions: layer.regions.filter((region) =>
      planarBoundsOverlap(groundBounds, planarRegionBounds(region)),
    ),
    topMm: landCoverTopOffsetMm(input, layer.categoryKey),
  }));
  const center = [
    groundPoints.reduce((sum, point) => sum + point[0], 0) / groundPoints.length,
    groundPoints.reduce((sum, point) => sum + point[1], 0) / groundPoints.length,
  ];

  // The building stands on the lowest surface under its footprint, so it
  // never floats over part of it (slicers would support it). Points are
  // nudged just inside the footprint: a garden that only borders the
  // building must not lift it.
  return Math.min(
    ...groundPoints.map((point) => {
      const distance = Math.hypot(center[0] - point[0], center[1] - point[1]);
      const nudge = distance > 0 ? Math.min(BUILDING_FOOTPRINT_NUDGE_MM, distance / 2) / distance : 0;
      const inside: [number, number] = [
        point[0] + (center[0] - point[0]) * nudge,
        point[1] + (center[1] - point[1]) * nudge,
      ];
      return nearbyLayers.reduce(
        (lift, layer) =>
          layer.regions.some((region) => planarRegionContainsPoint(region, inside))
            ? Math.max(lift, layer.topMm)
            : lift,
        landHeightMm,
      );
    }),
  );
}

function planarRingVectors(points: PlanarRegion["outer"]) {
  const ring =
    points.length > 1 &&
    Math.hypot(
      points[0][0] - points[points.length - 1][0],
      points[0][1] - points[points.length - 1][1],
    ) < 0.000001
      ? points.slice(0, -1)
      : points;

  return ring.map((point) => new THREE.Vector2(point[0], point[1]));
}

function createPlanarRegionShape(region: PlanarRegion) {
  const outer = planarRingVectors(region.outer);
  if (outer.length < 3 || polygonArea(outer) < 0.00001) {
    return null;
  }

  const shape = new THREE.Shape(outer);
  shape.holes = region.holes.flatMap((hole) => {
    const vectors = planarRingVectors(hole);
    return vectors.length >= 3 && polygonArea(vectors) >= 0.00001
      ? [createPath(vectors)]
      : [];
  });
  return shape;
}

function scaledFootprintPoints(
  input: ModelInput,
  metrics: ModelMetrics,
  outsetMm = 0,
) {
  return selectionLocalFootprint(
    input.selection,
    input.radiusMeters,
    CIRCLE_GEOMETRY_SEGMENTS,
  ).map((point) => {
    const vector = pointToVector(point, metrics.horizontalScale);
    const length = Math.hypot(vector.x, vector.y);

    if (outsetMm === 0 || length <= 0.00001) {
      return vector;
    }

    const scale = (length + outsetMm) / length;
    return new THREE.Vector2(vector.x * scale, vector.y * scale);
  });
}

function createSelectionShape(
  input: ModelInput,
  metrics: ModelMetrics,
  outsetMm = 0,
) {
  if (selectionShape(input.selection) === "circle") {
    const shape = new THREE.Shape();
    shape.absarc(
      0,
      0,
      metrics.terrainRadiusMm + outsetMm,
      0,
      Math.PI * 2,
      false,
    );
    return shape;
  }

  const vectors = scaledFootprintPoints(input, metrics, outsetMm);
  if (vectors.length < 3 || polygonArea(vectors) < 0.00001) {
    return null;
  }

  return new THREE.Shape(vectors);
}

function selectionMask(input: ModelInput, metrics: ModelMetrics) {
  return createPolygonMask(
    [
      selectionLocalFootprint(
        input.selection,
        input.radiusMeters,
        CIRCLE_GEOMETRY_SEGMENTS,
      ),
    ],
    metrics.horizontalScale,
  );
}

function selectionInsetMask(
  input: ModelInput,
  metrics: ModelMetrics,
  insetMm: number,
) {
  const maxInsetMm = Math.max(metrics.terrainRadiusMm - MIN_LINE_WIDTH_MM, 0);
  const inset = Math.min(Math.max(insetMm, 0), maxInsetMm);
  return createPolygonMask(
    [
      scaledFootprintPoints(input, metrics, -inset).map((point) => ({
        x: point.x / metrics.horizontalScale,
        y: point.y / metrics.horizontalScale,
      })),
    ],
    metrics.horizontalScale,
  );
}

function emptyWaterMask() {
  return createWaterMask([], [], 1);
}

function projectPastSelectionEdge(point: PlanarRegion["outer"][number]) {
  const length = Math.hypot(point[0], point[1]);
  if (length <= MIN_LINE_WIDTH_MM) {
    return point;
  }

  const projectedLength = length + WATER_EDGE_SNAP_DISTANCE_MM * 3;
  const scale = projectedLength / length;
  return [point[0] * scale, point[1] * scale] as [number, number];
}

// solidGround is ground that must stay solid (see solidGroundMask); the fill
// must not reach under it either.
function edgeWaterFillMask(
  input: ModelInput,
  metrics: ModelMetrics,
  waterMask: ReturnType<typeof createWaterMask>,
  solidGround: ReturnType<typeof createWaterMask> = [],
) {
  if (waterMask.length === 0 || WATER_EDGE_SNAP_DISTANCE_MM <= 0) {
    return emptyWaterMask();
  }

  const outerMask = selectionMask(input, metrics);
  const edgeBand = subtractMask(
    outerMask,
    selectionInsetMask(input, metrics, WATER_EDGE_SNAP_DISTANCE_MM),
  );
  const edgeWater = intersectMasks(waterMask, edgeBand);
  const fillPolygons: ModelPoint[][] = [];

  for (const region of planarRegions(edgeWater)) {
    for (let index = 0; index < region.outer.length - 1; index += 1) {
      const current = region.outer[index];
      const next = region.outer[index + 1];
      if (
        Math.hypot(current[0] - next[0], current[1] - next[1]) <=
        MIN_LINE_SEGMENT_LENGTH_MM
      ) {
        continue;
      }

      const projectedNext = projectPastSelectionEdge(next);
      const projectedCurrent = projectPastSelectionEdge(current);
      fillPolygons.push(
        [current, next, projectedNext, projectedCurrent].map((point) => ({
          x: point[0] / metrics.horizontalScale,
          y: point[1] / metrics.horizontalScale,
        })),
      );
    }
  }

  if (fillPolygons.length === 0) {
    return emptyWaterMask();
  }

  const fill = intersectMasks(
    createPolygonMask(fillPolygons, metrics.horizontalScale),
    outerMask,
  );
  return solidGround.length > 0 ? subtractMask(fill, solidGround) : fill;
}

function waterMaskWithEdgeFill(
  input: ModelInput,
  metrics: ModelMetrics,
  waterFeatures: Pick<ReturnType<typeof visibleWaterFeatures>, "mask" | "solidGround">,
) {
  return unionMasks(
    waterFeatures.mask,
    edgeWaterFillMask(input, metrics, waterFeatures.mask, waterFeatures.solidGround),
  );
}

function waterTerrainCutMask(
  input: ModelInput,
  metrics: ModelMetrics,
  waterFeatures: ReturnType<typeof visibleWaterFeatures> | null,
) {
  return input.layers.water &&
    input.modelSettings.layers.water.sinkIntoTerrain &&
    waterFeatures
    ? waterMaskWithEdgeFill(input, metrics, waterFeatures)
    : emptyWaterMask();
}

function printableTerrainRegions(
  input: ModelInput,
  metrics: ModelMetrics,
  waterFeatures: ReturnType<typeof visibleWaterFeatures> | null,
) {
  const terrainMask = selectionMask(input, metrics);
  const cutMask = waterTerrainCutMask(input, metrics, waterFeatures);
  return planarRegions(subtractMask(terrainMask, cutMask));
}

function createPath(points: THREE.Vector2[]) {
  const path = new THREE.Path();
  if (points.length === 0) {
    return path;
  }

  path.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    path.lineTo(point.x, point.y);
  }
  path.closePath();

  return path;
}

function createSquareShape(sideMm: number) {
  const halfSide = sideMm / 2;
  return new THREE.Shape([
    new THREE.Vector2(-halfSide, -halfSide),
    new THREE.Vector2(halfSide, -halfSide),
    new THREE.Vector2(halfSide, halfSide),
    new THREE.Vector2(-halfSide, halfSide),
  ]);
}

function createFrameShape(input: ModelInput, metrics: ModelMetrics) {
  if (
    !input.modelSettings.frame.enabled ||
    metrics.frameHeightMm <= 0 ||
    metrics.frameWidthMm <= 0
  ) {
    return null;
  }

  const outerShape =
    selectionShape(input.selection) === "circle" &&
    input.modelSettings.frame.style === "square"
      ? createSquareShape(metrics.totalRadiusMm * 2)
      : createSelectionShape(input, metrics, metrics.frameWidthMm);
  if (!outerShape) {
    return null;
  }

  const holePoints = scaledFootprintPoints(input, metrics).reverse();
  if (holePoints.length < 3) {
    return null;
  }

  outerShape.holes.push(createPath(holePoints));

  return outerShape;
}

function selectionPlanarBoundary(input: ModelInput, metrics: ModelMetrics) {
  return selectionLocalFootprint(input.selection, input.radiusMeters)
    .map((point) => ({
      x: point.x * metrics.horizontalScale,
      z: -point.y * metrics.horizontalScale,
    }))
    .reverse();
}

function normalizedSurface(points: ModelPoint3[]) {
  if (points.length < 3) {
    return [];
  }

  const surface = [...points];
  const first = surface[0];
  const last = surface[surface.length - 1];

  if (
    Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) < 0.001
  ) {
    surface.pop();
  }

  return surface;
}

function surfaceNormal(points: ModelPoint3[]) {
  const normal = { x: 0, y: 0, z: 0 };

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }

  return normal;
}

function projectSurfacePoint(point: ModelPoint3, dropAxis: "x" | "y" | "z") {
  if (dropAxis === "x") {
    return new THREE.Vector2(point.y, point.z);
  }

  if (dropAxis === "y") {
    return new THREE.Vector2(point.x, point.z);
  }

  return new THREE.Vector2(point.x, point.y);
}

function pushModelVertex(
  positions: number[],
  point: ModelPoint3,
  verticalOffsetMm: number,
  input: ModelInput,
  metrics: ModelMetrics,
) {
  const terrainHeightMm = terrainHeightMmAt(input, metrics, point);
  positions.push(
    point.x * metrics.horizontalScale,
    metrics.surfaceY +
      terrainHeightMm +
      verticalOffsetMm +
      point.z * metrics.buildingVerticalScale,
    -point.y * metrics.horizontalScale,
  );

  return positions.length / 3 - 1;
}

function createLod22SolidGeometry(
  buildings: PrintableModelData["buildings"],
  verticalOffsetMm: number,
  input: ModelInput,
  metrics: ModelMetrics,
  landCoverLayers: VisibleLandCoverLayer[],
) {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const building of buildings) {
    const buildingOffsetMm =
      verticalOffsetMm +
      buildingLandCoverLiftMm(building, input, metrics, landCoverLayers);
    const surfaces = building.surfaces
      .map((rawSurface) => normalizedSurface(rawSurface))
      .filter((surface) => surface.length >= 3);

    for (const surface of surfaces) {
      const normal = surfaceNormal(surface);
      const absNormal = {
        x: Math.abs(normal.x),
        y: Math.abs(normal.y),
        z: Math.abs(normal.z),
      };
      const dropAxis =
        absNormal.x > absNormal.y && absNormal.x > absNormal.z
          ? "x"
          : absNormal.y > absNormal.z
            ? "y"
            : "z";
      const contour = surface.map((point) => projectSurfacePoint(point, dropAxis));
      if (polygonArea(contour) < 0.00001) {
        continue;
      }

      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      if (triangles.length === 0) {
        continue;
      }

      const offset = positions.length / 3;
      for (const point of surface) {
        pushModelVertex(positions, point, buildingOffsetMm, input, metrics);
      }

      // Projecting onto a coordinate plane mirrors some surfaces, so the
      // triangulation can come out wound against the surface's outward
      // normal. Inward faces make slicers treat buildings as hollow and fill
      // them with supports, so each triangle follows the source ring instead.
      for (const triangle of triangles) {
        const [a, b, c] = triangle.map((index) => surface[index]);
        const facing =
          ((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)) * normal.x +
          ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)) * normal.y +
          ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * normal.z;
        indices.push(
          offset + triangle[0],
          offset + (facing >= 0 ? triangle[1] : triangle[2]),
          offset + (facing >= 0 ? triangle[2] : triangle[1]),
        );
      }
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}

type LayerMaterialOptions = {
  polygonOffset?: boolean;
  side?: THREE.Side;
  unlit?: boolean;
};

function createLayerMaterial(
  color: string,
  opacity = 1,
  options: LayerMaterialOptions = {},
) {
  const materialOptions = {
    color,
    depthWrite: opacity >= 0.98,
    opacity,
    transparent: opacity < 0.98,
  };
  const offsetOptions = options.polygonOffset
    ? {
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }
    : {};
  const sideOptions =
    typeof options.side === "number" ? { side: options.side } : {};

  if (options.unlit) {
    return new THREE.MeshBasicMaterial({
      ...materialOptions,
      ...offsetOptions,
      ...sideOptions,
    });
  }

  return new THREE.MeshStandardMaterial({
    ...materialOptions,
    ...offsetOptions,
    ...sideOptions,
    metalness: 0,
    roughness: 0.72,
  });
}

function polygonStats(points: ModelPoint[], metrics: ModelMetrics) {
  const vectors = normalizedRing(points).map((point) =>
    pointToVector(point, metrics.horizontalScale),
  );
  if (vectors.length < 3) {
    return null;
  }

  const xs = vectors.map((point) => point.x);
  const ys = vectors.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  return {
    areaMm2: polygonArea(vectors),
    minimumSpanMm: Math.min(width, height),
  };
}

function addPlanarRegionLayer(
  group: THREE.Group,
  region: PlanarRegion,
  material: THREE.Material,
  renderMode: PrintableRenderMode,
  topY: number,
  heightMm: number,
) {
  const shape = createPlanarRegionShape(region);
  if (!shape) {
    return;
  }

  const layerHeight =
    renderMode === "extruded" ? Math.max(heightMm, SURFACE_MODE_THICKNESS_MM) : 0;
  const geometry =
    renderMode === "extruded"
      ? new THREE.ExtrudeGeometry(shape, {
          bevelEnabled: false,
          curveSegments: CIRCLE_GEOMETRY_SEGMENTS,
          depth: layerHeight,
          steps: 1,
        })
      : new THREE.ShapeGeometry(shape, CIRCLE_GEOMETRY_SEGMENTS);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = renderMode === "extruded" ? topY - layerHeight : topY;
  group.add(mesh);
}

// Adds triangle a-b-c wound so its normal points along the given direction:
// slicers read inward-facing triangles as holes in the solid.
function pushOrientedTriangle(
  indices: number[],
  positions: number[],
  a: number,
  b: number,
  c: number,
  direction: [number, number, number],
) {
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
    (uy * vz - uz * vy) * direction[0] +
    (uz * vx - ux * vz) * direction[1] +
    (ux * vy - uy * vx) * direction[2];
  indices.push(a, ...(facing >= 0 ? [b, c] : [c, b]));
}

function addDrapedPlanarRegionLayer(
  group: THREE.Group,
  region: PlanarRegion,
  input: ModelInput,
  metrics: ModelMetrics,
  material: THREE.Material,
  renderMode: PrintableRenderMode,
  topY: number,
  heightMm: number,
  terrainClearanceMm = 0,
  allExcludedRegions: PlanarRegion[] = [],
  // A flat bottom at this height instead of one following the terrain,
  // for layers that must stand on the flat base.
  flatBottomY?: number,
) {
  const regionBounds = planarRegionBounds(region);
  const excludedRegions = allExcludedRegions.filter((excluded) =>
    planarBoundsOverlap(regionBounds, planarRegionBounds(excluded)),
  );
  const outer = planarRingVectors(region.outer);
  const holes = region.holes
    .map((hole) => planarRingVectors(hole))
    .filter((hole) => hole.length >= 3 && polygonArea(hole) >= 0.00001);
  if (outer.length < 3 || polygonArea(outer) < 0.00001) {
    return;
  }

  const triangles = THREE.ShapeUtils.triangulateShape(outer, holes);
  const vertices = [outer, ...holes].flat();
  if (triangles.length === 0 || vertices.length === 0) {
    return;
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const layerHeight =
    renderMode === "extruded" ? Math.max(heightMm, SURFACE_MODE_THICKNESS_MM) : 0;
  const vertexY = (point: THREE.Vector2) =>
    topY +
    terrainClearanceMm +
    terrainHeightMmAt(input, metrics, {
      x: point.x / metrics.horizontalScale,
      y: point.y / metrics.horizontalScale,
    });

  for (const point of vertices) {
    positions.push(point.x, vertexY(point), -point.y);
  }

  for (const triangle of triangles) {
    if (triangleOverlapsPlanarRegions(vertices, triangle, excludedRegions)) {
      continue;
    }

    pushOrientedTriangle(indices, positions, triangle[0], triangle[1], triangle[2], [0, 1, 0]);
  }

  if (renderMode === "extruded") {
    const bottomOffset = positions.length / 3;
    for (const point of vertices) {
      positions.push(
        point.x,
        flatBottomY ?? vertexY(point) - layerHeight,
        -point.y,
      );
    }

    for (const triangle of triangles) {
      if (triangleOverlapsPlanarRegions(vertices, triangle, excludedRegions)) {
        continue;
      }

      pushOrientedTriangle(
        indices,
        positions,
        bottomOffset + triangle[0],
        bottomOffset + triangle[1],
        bottomOffset + triangle[2],
        [0, -1, 0],
      );
    }

    let ringOffset = 0;
    [outer, ...holes].forEach((ring, ringIndex) => {
      // Walls face out of the solid: away from the outer ring's inside and
      // into each hole, whichever way the rings happen to run.
      const counterClockwise = THREE.ShapeUtils.isClockWise(ring) === false;
      const outwardSign = (ringIndex === 0) === counterClockwise ? 1 : -1;
      for (let index = 0; index < ring.length; index += 1) {
        const nextIndex = (index + 1) % ring.length;
        const topStart = ringOffset + index;
        const topEnd = ringOffset + nextIndex;
        const bottomEnd = bottomOffset + topEnd;
        const bottomStart = bottomOffset + topStart;
        const dx = ring[nextIndex].x - ring[index].x;
        const dy = ring[nextIndex].y - ring[index].y;
        // Planar (dy, -dx) is outward for a counter-clockwise ring; planar y
        // is model -z.
        const outward: [number, number, number] = [outwardSign * dy, 0, outwardSign * dx];
        pushOrientedTriangle(indices, positions, topStart, bottomStart, bottomEnd, outward);
        pushOrientedTriangle(indices, positions, topStart, bottomEnd, topEnd, outward);
      }
      ringOffset += ring.length;
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  group.add(new THREE.Mesh(geometry, material));
}

function addLinePrisms(
  group: THREE.Group,
  lines: PrintableLine[],
  input: ModelInput,
  metrics: ModelMetrics,
  material: THREE.Material,
  topY: number,
  heightMm: number,
  widthForLine: (line: PrintableLine) => number,
  bottomYOverride?: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const bottomY = topY - Math.max(heightMm, SURFACE_MODE_THICKNESS_MM);
  const boundary = selectionPlanarBoundary(input, metrics);
  const isCircleSelection = selectionShape(input.selection) === "circle";

  for (const line of lines) {
    if (line.points.length < 2) {
      continue;
    }

    const halfWidth = Math.max(widthForLine(line), MIN_LINE_WIDTH_MM) / 2;
    const centerlineRadius = linePrismCenterlineRadius(
      metrics.terrainRadiusMm,
      halfWidth,
    );

    if (centerlineRadius <= 0) {
      continue;
    }

    for (let index = 1; index < line.points.length; index += 1) {
      const start = line.points[index - 1];
      const end = line.points[index];
      const planarStart = {
        x: start.x * metrics.horizontalScale,
        z: -start.y * metrics.horizontalScale,
      };
      const planarEnd = {
        x: end.x * metrics.horizontalScale,
        z: -end.y * metrics.horizontalScale,
      };
      const clippedSegment = isCircleSelection
        ? clipPlanarSegmentToCircle(planarStart, planarEnd, centerlineRadius)
        : clipPlanarSegmentToConvexPolygon(
            planarStart,
            planarEnd,
            insetPlanarBoundary(boundary, halfWidth),
          );

      if (!clippedSegment) {
        continue;
      }

      const startX = clippedSegment.start.x;
      const startZ = clippedSegment.start.z;
      const endX = clippedSegment.end.x;
      const endZ = clippedSegment.end.z;
      const startTerrainHeightMm = terrainHeightMmAt(input, metrics, {
        x: startX / metrics.horizontalScale,
        y: -startZ / metrics.horizontalScale,
      });
      const endTerrainHeightMm = terrainHeightMmAt(input, metrics, {
        x: endX / metrics.horizontalScale,
        y: -endZ / metrics.horizontalScale,
      });
      const startTopY = topY + startTerrainHeightMm;
      const endTopY = topY + endTerrainHeightMm;
      const startBottomY = bottomYOverride ?? bottomY + startTerrainHeightMm;
      const endBottomY = bottomYOverride ?? bottomY + endTerrainHeightMm;
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      const length = Math.hypot(deltaX, deltaZ);

      if (length < MIN_LINE_SEGMENT_LENGTH_MM) {
        continue;
      }

      const normalX = (-deltaZ / length) * halfWidth;
      const normalZ = (deltaX / length) * halfWidth;
      const offset = positions.length / 3;
      positions.push(
        startX + normalX,
        startBottomY,
        startZ + normalZ,
        startX - normalX,
        startBottomY,
        startZ - normalZ,
        endX - normalX,
        endBottomY,
        endZ - normalZ,
        endX + normalX,
        endBottomY,
        endZ + normalZ,
        startX + normalX,
        startTopY,
        startZ + normalZ,
        startX - normalX,
        startTopY,
        startZ - normalZ,
        endX - normalX,
        endTopY,
        endZ - normalZ,
        endX + normalX,
        endTopY,
        endZ + normalZ,
      );
      indices.push(
        offset,
        offset + 1,
        offset + 2,
        offset,
        offset + 2,
        offset + 3,
        offset + 4,
        offset + 7,
        offset + 6,
        offset + 4,
        offset + 6,
        offset + 5,
        offset,
        offset + 4,
        offset + 5,
        offset,
        offset + 5,
        offset + 1,
        offset + 1,
        offset + 5,
        offset + 6,
        offset + 1,
        offset + 6,
        offset + 2,
        offset + 2,
        offset + 6,
        offset + 7,
        offset + 2,
        offset + 7,
        offset + 3,
        offset + 3,
        offset + 7,
        offset + 4,
        offset + 3,
        offset + 4,
        offset,
      );
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  group.add(new THREE.Mesh(geometry, material));
}

function addBuildings(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  landCoverLayers: VisibleLandCoverLayer[],
) {
  if (!input.modelData || !input.layers.buildings) {
    return;
  }

  const settings = input.modelSettings.layers.buildings;
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: settings.color,
    metalness: 0,
    roughness: 0.66,
    side: THREE.DoubleSide,
  });
  const geometry = createLod22SolidGeometry(
    input.modelData.buildings,
    settings.verticalOffsetMm,
    input,
    metrics,
    landCoverLayers,
  );
  if (!geometry) {
    return;
  }

  const mesh = new THREE.Mesh(geometry, buildingMaterial);
  group.add(mesh);

  if (settings.showEdges) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({
        color: "#302b33",
        transparent: true,
        opacity: 0.32,
      }),
    );
    group.add(edges);
  }
}

function waterLineWidthMm(line: PrintableLine, metrics: ModelMetrics) {
  return line.widthMeters * metrics.horizontalScale;
}

const SOLID_GROUND_VERTEX_CELL_MM = 2;
const SOLID_GROUND_SAMPLE_MM = 0.25;

// Ground under buildings and roads must not be carved away as water.
// OpenStreetMap canal outlines often run under quay-side houses and road
// edges (and waterways under roads), which would leave those hanging over
// the carved canal on supports. Only features that touch water take part.
function solidGroundMask(
  input: ModelInput,
  metrics: ModelMetrics,
  waterMask: ReturnType<typeof createWaterMask>,
) {
  const data = input.modelData;
  if (!data || waterMask.length === 0) {
    return createWaterMask([], [], metrics.horizontalScale);
  }

  const scale = metrics.horizontalScale;
  const waterRegions = planarRegions(waterMask);
  const waterVertices = new Map<string, Array<[number, number]>>();
  const cellOf = (value: number) => Math.floor(value / SOLID_GROUND_VERTEX_CELL_MM);
  for (const region of waterRegions) {
    for (const ring of [region.outer, ...region.holes]) {
      for (const [x, y] of ring) {
        const key = `${cellOf(x)},${cellOf(y)}`;
        waterVertices.set(key, [...(waterVertices.get(key) ?? []), [x, y]]);
      }
    }
  }

  const inWater = (point: [number, number]) =>
    waterRegions.some((region) => planarRegionContainsPoint(region, point));
  // Samples along the ring's edges lie in water, or a water vertex lies
  // inside the ring.
  const ringTouchesWater = (points: ModelPoint[]) => {
    const ring = points.map((point): [number, number] => [point.x * scale, point.y * scale]);
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / SOLID_GROUND_SAMPLE_MM));
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        if (inWater([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])) {
          return true;
        }
      }
    }

    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    for (let cellX = cellOf(Math.min(...xs)); cellX <= cellOf(Math.max(...xs)); cellX += 1) {
      for (let cellY = cellOf(Math.min(...ys)); cellY <= cellOf(Math.max(...ys)); cellY += 1) {
        for (const vertex of waterVertices.get(`${cellX},${cellY}`) ?? []) {
          if (planarRingContainsPoint([...ring, ring[0]], vertex)) {
            return true;
          }
        }
      }
    }

    return false;
  };

  const polygons: Array<{ holes?: ModelPoint[][]; points: ModelPoint[] }> = [];
  if (input.layers.buildings) {
    for (const building of data.buildings) {
      const minimumZ = Math.min(...building.surfaces.flat().map((point) => point.z));
      const floors = building.surfaces.filter(
        (surface) =>
          surface.length >= 3 &&
          surface.every((point) => Math.abs(point.z - minimumZ) < 0.05),
      );
      if (floors.some(ringTouchesWater)) {
        polygons.push(...floors.map((floor) => ({ points: floor })));
      }
    }
  }

  const lines: Array<{ points: ModelPoint[]; widthMm: number }> = [];
  if (input.layers.roads) {
    const roadSettings = input.modelSettings.layers.roads;
    for (const surface of data.roadSurfaces ?? []) {
      if (roadSettings.categories[surface.category].enabled && ringTouchesWater(surface.points)) {
        polygons.push({ holes: surface.holes, points: surface.points });
      }
    }

    for (const line of data.roads) {
      const category = getPrintableRoadCategory(line);
      if (
        category === "bridges" ||
        category === "tunnels" ||
        category === "ferries" ||
        !roadSettings.categories[category].enabled ||
        line.points.length < 2
      ) {
        continue;
      }

      const samples = line.points.flatMap((point, index) => {
        const next = line.points[index + 1];
        if (!next) {
          return [point];
        }
        const steps = Math.max(
          1,
          Math.ceil((Math.hypot(next.x - point.x, next.y - point.y) * scale) / SOLID_GROUND_SAMPLE_MM),
        );
        return Array.from({ length: steps }, (_, step) => ({
          x: point.x + ((next.x - point.x) * step) / steps,
          y: point.y + ((next.y - point.y) * step) / steps,
        }));
      });
      if (samples.some((point) => inWater([point.x * scale, point.y * scale]))) {
        lines.push({
          points: line.points,
          widthMm: getRoadCategoryWidthMm(roadSettings, category),
        });
      }
    }
  }

  return createWaterMask(polygons, lines, scale);
}

function visibleWaterFeatures(input: ModelInput, metrics: ModelMetrics) {
  if (!input.modelData || !input.layers.water) {
    return {
      mask: createWaterMask([], [], metrics.horizontalScale),
      polygons: [] as PrintableModelData["water"],
      solidGround: createWaterMask([], [], metrics.horizontalScale),
      waterLines: [] as PrintableModelData["waterLines"],
    };
  }

  const settings = input.modelSettings.layers.water;
  const polygons = input.modelData.water.filter((polygon) => {
    const stats = polygonStats(polygon.points, metrics);
    return !(
      settings.hideSmallWaterBodies &&
      stats &&
      (stats.minimumSpanMm < settings.minimumWidthMm ||
        stats.areaMm2 < settings.minimumAreaMm2)
    );
  });
  const waterLines = input.modelData.waterLines;

  // Water line buffers have round end caps, so lines clipped at the
  // selection edge would otherwise bulge past the model's side wall.
  const mapped = intersectMasks(
    createWaterMask(
      polygons.map((polygon) => ({
        holes: polygon.holes,
        points: polygon.points,
      })),
      waterLines.map((line) => ({
        points: line.points,
        widthMm: Math.max(
          waterLineWidthMm(line, metrics),
          settings.minimumWidthMm,
        ),
      })),
      metrics.horizontalScale,
    ),
    selectionMask(input, metrics),
  );
  // Near the rim, water is extended out to the edge; features standing on
  // that extension must keep solid ground too.
  const solidGround = solidGroundMask(
    input,
    metrics,
    unionMasks(mapped, edgeWaterFillMask(input, metrics, mapped)),
  );

  return {
    mask: solidGround.length > 0 ? subtractMask(mapped, solidGround) : mapped,
    polygons,
    solidGround,
    waterLines,
  };
}

function averageTerrainHeightForRegion(
  input: ModelInput,
  metrics: ModelMetrics,
  region: PlanarRegion,
) {
  if (!activeTerrainData(input) || region.outer.length === 0) {
    return 0;
  }

  const sum = region.outer.reduce(
    (total, point) =>
      total +
      terrainHeightMmAt(input, metrics, {
        x: point[0] / metrics.horizontalScale,
        y: point[1] / metrics.horizontalScale,
      }),
    0,
  );

  return sum / region.outer.length;
}

function waterLayerHeightMm(input: ModelInput) {
  const settings = input.modelSettings.layers.water;
  return settings.renderMode === "extruded"
    ? settings.extrudedHeightMm
    : SURFACE_MODE_THICKNESS_MM;
}

// Water surface height before terrain relief is added.
function waterTopYMm(input: ModelInput, metrics: ModelMetrics) {
  const settings = input.modelSettings.layers.water;
  const waterBaseY =
    metrics.surfaceY +
    settings.verticalOffsetMm +
    (settings.sinkIntoTerrain ? -settings.sinkDepthMm : MIN_LAYER_LIFT_MM);
  return settings.renderMode === "extruded"
    ? waterBaseY + waterLayerHeightMm(input)
    : waterBaseY;
}

function addWater(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  waterFeatures: ReturnType<typeof visibleWaterFeatures>,
) {
  if (!input.modelData || !input.layers.water || waterFeatures.mask.length === 0) {
    return;
  }

  const settings = input.modelSettings.layers.water;
  const hasTerrain = Boolean(activeTerrainData(input));
  const height = waterLayerHeightMm(input);
  const waterTopY = waterTopYMm(input, metrics);
  const waterMaterial = createLayerMaterial(settings.color, settings.opacity);
  const polygonsOnlyMask = hasTerrain
    ? intersectMasks(
        createWaterMask(
          waterFeatures.polygons.map((polygon) => ({
            holes: polygon.holes,
            points: polygon.points,
          })),
          [],
          metrics.horizontalScale,
        ),
        selectionMask(input, metrics),
      )
    : null;
  const basePolygonMask = polygonsOnlyMask
    ? waterFeatures.solidGround.length > 0
      ? subtractMask(polygonsOnlyMask, waterFeatures.solidGround)
      : polygonsOnlyMask
    : waterFeatures.mask;
  const polygonMask = unionMasks(
    basePolygonMask,
    edgeWaterFillMask(input, metrics, waterFeatures.mask, waterFeatures.solidGround),
  );

  for (const region of planarRegions(polygonMask)) {
    const terrainHeightMm = averageTerrainHeightForRegion(input, metrics, region);
    const topY = waterTopY + terrainHeightMm;
    addPlanarRegionLayer(
      group,
      region,
      waterMaterial,
      settings.sinkIntoTerrain ? "extruded" : settings.renderMode,
      topY,
      settings.sinkIntoTerrain ? topY : height,
    );
  }

  if (hasTerrain && waterFeatures.waterLines.length > 0) {
    addLinePrisms(
      group,
      waterFeatures.waterLines,
      input,
      metrics,
      waterMaterial,
      waterTopY,
      height,
      (line) =>
        Math.max(
          waterLineWidthMm(line, metrics),
          settings.minimumWidthMm,
          MIN_LINE_WIDTH_MM,
        ),
      settings.sinkIntoTerrain ? 0 : undefined,
    );
  }
}

function addLandCover(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  landCoverLayers: VisibleLandCoverLayer[],
  waterCutoutRegions: PlanarRegion[] = [],
) {
  if (!input.modelData || !input.layers.landCover) {
    return;
  }

  const settings = input.modelSettings.layers.landCover;
  for (const { categoryKey, regions } of landCoverLayers) {
    const category = settings.categories[categoryKey];
    const height =
      category.renderMode === "extruded"
        ? category.extrudedHeightMm
        : SURFACE_MODE_THICKNESS_MM;
    const baseY =
      metrics.surfaceY +
      settings.verticalOffsetMm -
      (category.carveIntoTerrain ? category.carveDepthMm : 0) +
      layerLift(0);
    const topY = category.renderMode === "extruded" ? baseY + height : baseY;
    const solidHeight =
      category.renderMode === "extruded"
        ? heightDownToSurfaceMm(metrics, topY, height)
        : height;
    const hasTerrain = Boolean(activeTerrainData(input));
    const material = createLayerMaterial(category.color, settings.opacity, {
      polygonOffset: hasTerrain,
      side: hasTerrain ? THREE.DoubleSide : undefined,
      unlit: hasTerrain,
    });

    for (const region of regions) {
      if (hasTerrain) {
        addDrapedPlanarRegionLayer(
          group,
          region,
          input,
          metrics,
          material,
          category.renderMode,
          topY,
          solidHeight + DRAPED_LAND_COVER_CLEARANCE_MM,
          DRAPED_LAND_COVER_CLEARANCE_MM,
          waterCutoutRegions,
        );
      } else {
        addPlanarRegionLayer(
          group,
          region,
          material,
          category.renderMode,
          topY,
          solidHeight,
        );
      }
    }

  }
}

// Height for a layer slab topped at topY that reaches down to the land
// surface: a slab hovering on a hairline gap would be printed on supports.
function heightDownToSurfaceMm(metrics: ModelMetrics, topY: number, heightMm: number) {
  return Math.max(heightMm, topY - metrics.surfaceY);
}

function addRoads(group: THREE.Group, input: ModelInput, metrics: ModelMetrics) {
  if (!input.modelData || !input.layers.roads) {
    return;
  }

  const settings = input.modelSettings.layers.roads;
  for (const categoryInfo of PRINTABLE_ROAD_CATEGORIES) {
    const category = settings.categories[categoryInfo.key];
    const lines = input.modelData.roads.filter(
      (line) => getPrintableRoadCategory(line) === categoryInfo.key,
    );

    if (!category.enabled || lines.length === 0) {
      continue;
    }

    const height =
      category.renderMode === "extruded"
        ? category.extrudedHeightMm
        : SURFACE_MODE_THICKNESS_MM;
    const baseY = metrics.surfaceY + settings.verticalOffsetMm + layerLift(0);
    const topY = category.renderMode === "extruded" ? baseY + height : baseY;

    addLinePrisms(
      group,
      lines,
      input,
      metrics,
      createLayerMaterial(category.color),
      topY,
      heightDownToSurfaceMm(metrics, topY, height),
      () => getRoadCategoryWidthMm(settings, categoryInfo.key),
    );
  }
}

function bridgeRegions(
  polygons: PrintableModelData["bridgeDecks"],
  metrics: ModelMetrics,
) {
  return polygons?.length
    ? planarRegions(
        createWaterMask(
          polygons.map((polygon) => ({
            holes: polygon.holes,
            points: polygon.points,
          })),
          [],
          metrics.horizontalScale,
        ),
      )
    : [];
}

// Bridge decks continue the road surface across the sunk water. Decks with
// mapped piers become arch bridges; the rest are slabs on any loose piers,
// open underneath for slicer supports.
function addBridges(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  waterRegions: PlanarRegion[],
) {
  if (!input.modelData || !input.layers.roads) {
    return;
  }

  const settings = input.modelSettings.layers.roads;
  const category = settings.categories.bridges;
  const allDecks = input.modelData.bridgeDecks ?? [];
  if (!category.enabled || allDecks.length === 0) {
    return;
  }

  const roadHeight =
    category.renderMode === "extruded"
      ? category.extrudedHeightMm
      : SURFACE_MODE_THICKNESS_MM;
  const deckTopY =
    metrics.surfaceY +
    settings.verticalOffsetMm +
    layerLift(0) +
    (category.renderMode === "extruded" ? roadHeight : 0);
  const supportY = input.layers.water
    ? waterTopYMm(input, metrics)
    : metrics.surfaceY;
  // Tall road extrusions raise the deck, not thicken it: the deck stays a
  // thin slab and the piers carry it down to the water.
  const deckBottomY = Math.max(deckTopY - BRIDGE_DECK_THICKNESS_MM, supportY);
  const hasTerrain = Boolean(activeTerrainData(input));
  // Draped layers follow terrain relief but are only closed when seen from
  // both sides, matching how land cover is drawn.
  const material = createLayerMaterial(category.color, 1, {
    side: hasTerrain ? THREE.DoubleSide : undefined,
  });
  // Arch bridges are built from thin slices; flat shading keeps their faces
  // from showing the slice seams as stripes.
  const archMaterial = material.clone();
  if ("flatShading" in archMaterial) {
    archMaterial.flatShading = true;
  }
  const terrainAt = (point: { x: number; y: number }) =>
    terrainHeightMmAt(input, metrics, {
      x: point.x / metrics.horizontalScale,
      y: point.y / metrics.horizontalScale,
    });

  for (const deck of allDecks) {
    if (!deck.span) {
      continue;
    }

    const geometry = createArchBridgeGeometry({
      deck,
      horizontalScale: metrics.horizontalScale,
      isOverWater: (point) =>
        input.layers.water &&
        waterRegions.some((region) =>
          planarRegionContainsPoint(region, [point.x, point.y]),
        ),
      roadTopY: deckTopY,
      span: deck.span,
      supportY,
      terrainAt,
      verticalScale: metrics.buildingVerticalScale,
    });
    if (geometry) {
      group.add(new THREE.Mesh(geometry, archMaterial));
    }
  }

  const addSlab = (region: PlanarRegion, topY: number, heightMm: number) => {
    if (hasTerrain) {
      addDrapedPlanarRegionLayer(
        group,
        region,
        input,
        metrics,
        material,
        "extruded",
        topY,
        heightMm,
      );
    } else {
      addPlanarRegionLayer(group, region, material, "extruded", topY, heightMm);
    }
  };

  const flatDecks = allDecks.filter((deck) => !deck.span);
  for (const region of bridgeRegions(flatDecks, metrics)) {
    addSlab(region, deckTopY, deckTopY - deckBottomY);
  }

  if (flatDecks.length === 0 || deckBottomY <= supportY) {
    return;
  }

  for (const region of bridgeRegions(input.modelData.bridgePiers, metrics)) {
    addSlab(region, deckBottomY, deckBottomY - supportY);
  }
}

// Exact road surfaces (BGT, in the Netherlands) at the same height as road
// lines would be, with their real width instead of a per-category width.
function addRoadSurfaces(group: THREE.Group, input: ModelInput, metrics: ModelMetrics) {
  const surfaces = input.modelData?.roadSurfaces ?? [];
  if (!input.layers.roads || surfaces.length === 0) {
    return;
  }

  const settings = input.modelSettings.layers.roads;
  const hasTerrain = Boolean(activeTerrainData(input));
  for (const { key } of PRINTABLE_ROAD_CATEGORIES) {
    const category = settings.categories[key];
    const polygons = surfaces.filter((surface) => surface.category === key);
    if (!category.enabled || polygons.length === 0) {
      continue;
    }

    const height =
      category.renderMode === "extruded"
        ? category.extrudedHeightMm
        : SURFACE_MODE_THICKNESS_MM;
    const baseY = metrics.surfaceY + settings.verticalOffsetMm + layerLift(0);
    const topY = category.renderMode === "extruded" ? baseY + height : baseY;
    const material = createLayerMaterial(category.color, 1, {
      side: hasTerrain ? THREE.DoubleSide : undefined,
    });
    // The server already merged each category, so polygons map straight to
    // regions without another union.
    const toPlanarRing = (ring: ModelPoint[]) => {
      const planar = ring.map(
        (point): [number, number] => [
          point.x * metrics.horizontalScale,
          point.y * metrics.horizontalScale,
        ],
      );
      return [...planar, planar[0]];
    };
    const regions: PlanarRegion[] = polygons.map((polygon) => ({
      holes: (polygon.holes ?? []).map(toPlanarRing),
      outer: toPlanarRing(polygon.points),
    }));

    for (const region of regions) {
      if (hasTerrain) {
        addDrapedPlanarRegionLayer(
          group,
          region,
          input,
          metrics,
          material,
          "extruded",
          topY,
          heightDownToSurfaceMm(metrics, topY, height),
        );
      } else {
        addPlanarRegionLayer(
          group,
          region,
          material,
          "extruded",
          topY,
          heightDownToSurfaceMm(metrics, topY, height),
        );
      }
    }
  }
}

function addOpenStreetMapLayers(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  precomputedWaterFeatures: ReturnType<typeof visibleWaterFeatures> | null = null,
  precomputedLandCoverLayers: VisibleLandCoverLayer[] | null = null,
) {
  if (!input.modelData) {
    return;
  }

  const waterFeatures = precomputedWaterFeatures ?? visibleWaterFeatures(input, metrics);
  const waterMask = waterMaskWithEdgeFill(input, metrics, waterFeatures);
  const landCoverLayers =
    precomputedLandCoverLayers ?? visibleLandCoverLayers(input, metrics, waterMask);
  addLandCover(group, input, metrics, landCoverLayers, planarRegions(waterMask));
  addWater(group, input, metrics, waterFeatures);
  addRoads(group, input, metrics);
  addRoadSurfaces(group, input, metrics);
  addBridges(group, input, metrics, planarRegions(waterMask));
}

function addBase(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  waterFeatures: ReturnType<typeof visibleWaterFeatures> | null,
) {
  if (metrics.baseHeightMm <= 0) {
    return;
  }

  const material = new THREE.MeshStandardMaterial({
    color: BASE_MATERIAL_COLOR,
    metalness: 0,
    roughness: 0.76,
  });
  const regions = printableTerrainRegions(input, metrics, waterFeatures);
  if (
    input.layers.water &&
    input.modelSettings.layers.water.sinkIntoTerrain &&
    waterFeatures?.mask.length
  ) {
    for (const region of regions) {
      addPlanarRegionLayer(
        group,
        region,
        material,
        "extruded",
        metrics.surfaceY,
        metrics.baseHeightMm,
      );
    }
    return;
  }

  const shape = createSelectionShape(input, metrics);
  if (!shape) {
    return;
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: CIRCLE_GEOMETRY_SEGMENTS,
    depth: metrics.baseHeightMm,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(geometry, material));
}

function addFrame(group: THREE.Group, input: ModelInput, metrics: ModelMetrics) {
  const shape = createFrameShape(input, metrics);
  if (!shape) {
    return;
  }

  const material = new THREE.MeshStandardMaterial({
    color: input.modelSettings.frame.color,
    metalness: 0,
    roughness: 0.76,
  });
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: CIRCLE_GEOMETRY_SEGMENTS,
    depth: metrics.frameHeightMm,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(geometry, material));
}

function addFlatTerrainTop(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  material: THREE.Material,
  waterFeatures: ReturnType<typeof visibleWaterFeatures> | null,
) {
  const landHeightMm = printableLandHeightMm(input);
  const renderMode = landHeightMm > 0 ? "extruded" : "surface";
  const topY = metrics.surfaceY + landHeightMm;
  const regions = printableTerrainRegions(input, metrics, waterFeatures);
  if (regions.length > 0) {
    for (const region of regions) {
      addPlanarRegionLayer(
        group,
        region,
        material,
        renderMode,
        topY,
        landHeightMm,
      );
    }
    return;
  }

  if (waterTerrainCutMask(input, metrics, waterFeatures).length > 0) {
    return;
  }

  const topShape = createSelectionShape(input, metrics);
  if (!topShape) {
    return;
  }
  const geometry =
    landHeightMm > 0
      ? new THREE.ExtrudeGeometry(topShape, {
          bevelEnabled: false,
          curveSegments: CIRCLE_GEOMETRY_SEGMENTS,
          depth: landHeightMm,
          steps: 1,
        })
      : new THREE.ShapeGeometry(topShape, CIRCLE_GEOMETRY_SEGMENTS);
  const top = new THREE.Mesh(geometry, material);
  top.rotation.x = -Math.PI / 2;
  top.position.y = metrics.surfaceY;
  group.add(top);
}

function addTerrainReliefTop(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  material: THREE.Material,
  waterFeatures: ReturnType<typeof visibleWaterFeatures> | null,
) {
  const terrain = activeTerrainData(input);
  if (!terrain) {
    addFlatTerrainTop(group, input, metrics, material, waterFeatures);
    return;
  }

  const landHeightMm = printableLandHeightMm(input);

  if (
    input.layers.water &&
    input.modelSettings.layers.water.sinkIntoTerrain &&
    waterFeatures?.mask.length
  ) {
    // The terrain stands on the flat base: a bottom following the relief
    // would leave a hidden cavity that slicers fill with supports, reached
    // from the bed where it opens at the rim.
    for (const region of printableTerrainRegions(input, metrics, waterFeatures)) {
      addDrapedPlanarRegionLayer(
        group,
        region,
        input,
        metrics,
        material,
        "extruded",
        metrics.surfaceY + landHeightMm,
        landHeightMm,
        0,
        [],
        metrics.surfaceY,
      );
    }
    return;
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const boundary = selectionLocalFootprint(
    input.selection,
    input.radiusMeters,
    CIRCLE_GEOMETRY_SEGMENTS,
  );
  const centerIndex = positions.length / 3;

  positions.push(
    0,
    metrics.surfaceY +
      landHeightMm +
      terrainHeightMmAt(input, metrics, { x: 0, y: 0 }),
    0,
  );

  const ringIndices: number[][] = [];
  for (let ring = 1; ring <= TERRAIN_RADIAL_RINGS; ring += 1) {
    const fraction = ring / TERRAIN_RADIAL_RINGS;
    const currentRing: number[] = [];

    for (const boundaryPoint of boundary) {
      const point = {
        x: boundaryPoint.x * fraction,
        y: boundaryPoint.y * fraction,
      };

      positions.push(
        point.x * metrics.horizontalScale,
        metrics.surfaceY +
          landHeightMm +
          terrainHeightMmAt(input, metrics, point),
        -point.y * metrics.horizontalScale,
      );
      currentRing.push(positions.length / 3 - 1);
    }

    ringIndices.push(currentRing);
  }

  const firstRing = ringIndices[0];
  for (let index = 0; index < firstRing.length; index += 1) {
    indices.push(
      centerIndex,
      firstRing[index],
      firstRing[(index + 1) % firstRing.length],
    );
  }

  for (let ring = 1; ring < ringIndices.length; ring += 1) {
    const innerRing = ringIndices[ring - 1];
    const outerRing = ringIndices[ring];

    for (let index = 0; index < outerRing.length; index += 1) {
      const nextIndex = (index + 1) % outerRing.length;
      indices.push(
        innerRing[index],
        outerRing[index],
        outerRing[nextIndex],
        innerRing[index],
        outerRing[nextIndex],
        innerRing[nextIndex],
      );
    }
  }

  const outerRing = ringIndices[ringIndices.length - 1];
  for (let index = 0; index < outerRing.length; index += 1) {
    const nextIndex = (index + 1) % outerRing.length;
    const topStart = outerRing[index];
    const topEnd = outerRing[nextIndex];
    const startPoint = boundary[index];
    const endPoint = boundary[nextIndex];
    const baseEnd = positions.length / 3;
    positions.push(
      endPoint.x * metrics.horizontalScale,
      metrics.surfaceY,
      -endPoint.y * metrics.horizontalScale,
    );
    const baseStart = positions.length / 3;
    positions.push(
      startPoint.x * metrics.horizontalScale,
      metrics.surfaceY,
      -startPoint.y * metrics.horizontalScale,
    );
    indices.push(topStart, baseStart, baseEnd, topStart, baseEnd, topEnd);
  }

  if (boundary.length < 3 || indices.length === 0) {
    addFlatTerrainTop(group, input, metrics, material, waterFeatures);
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  group.add(new THREE.Mesh(geometry, material));
}

const TEXT_ENCODER = new TextEncoder();
const ZIP_CRC_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    return crc >>> 0;
  }),
);

function stringToBytes(value: string) {
  return TEXT_ENCODER.encode(value);
}

function bytesFromExport(value: string | ArrayBuffer | DataView) {
  if (typeof value === "string") {
    return stringToBytes(value);
  }

  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function dosDateTime(date: Date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function createZip(files: ArchiveFile[]) {
  const now = dosDateTime(new Date());
  const entries = files.map((file) => ({
    ...file,
    crc: crc32(file.data),
    encodedName: stringToBytes(file.name),
    offset: 0,
  }));
  const localSize = entries.reduce(
    (sum, entry) => sum + 30 + entry.encodedName.byteLength + entry.data.byteLength,
    0,
  );
  const centralSize = entries.reduce(
    (sum, entry) => sum + 46 + entry.encodedName.byteLength,
    0,
  );
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const entry of entries) {
    entry.offset = offset;
    writeUint32(view, offset, 0x04034b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 0x0800);
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, now.time);
    writeUint16(view, offset + 12, now.date);
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.data.byteLength);
    writeUint32(view, offset + 22, entry.data.byteLength);
    writeUint16(view, offset + 26, entry.encodedName.byteLength);
    writeUint16(view, offset + 28, 0);
    offset += 30;
    output.set(entry.encodedName, offset);
    offset += entry.encodedName.byteLength;
    output.set(entry.data, offset);
    offset += entry.data.byteLength;
  }

  const centralOffset = offset;
  for (const entry of entries) {
    writeUint32(view, offset, 0x02014b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 20);
    writeUint16(view, offset + 8, 0x0800);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, now.time);
    writeUint16(view, offset + 14, now.date);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.data.byteLength);
    writeUint32(view, offset + 24, entry.data.byteLength);
    writeUint16(view, offset + 28, entry.encodedName.byteLength);
    writeUint16(view, offset + 30, 0);
    writeUint16(view, offset + 32, 0);
    writeUint16(view, offset + 34, 0);
    writeUint16(view, offset + 36, 0);
    writeUint32(view, offset + 38, 0);
    writeUint32(view, offset + 42, entry.offset);
    offset += 46;
    output.set(entry.encodedName, offset);
    offset += entry.encodedName.byteLength;
  }

  writeUint32(view, offset, 0x06054b50);
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, entries.length);
  writeUint16(view, offset + 10, entries.length);
  writeUint32(view, offset + 12, offset - centralOffset);
  writeUint32(view, offset + 16, centralOffset);
  writeUint16(view, offset + 20, 0);

  return output;
}

function sanitizeObjectName(value: string) {
  const clean = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean || "mesh";
}

function materialInfo(material: THREE.Material | THREE.Material[] | undefined) {
  const firstMaterial = Array.isArray(material) ? material[0] : material;
  const color =
    firstMaterial && "color" in firstMaterial && firstMaterial.color instanceof THREE.Color
      ? firstMaterial.color
      : new THREE.Color("#daddd1");
  const opacity =
    typeof firstMaterial?.opacity === "number" ? firstMaterial.opacity : 1;

  return {
    color,
    opacity,
    signature: `${color.getHexString()}-${opacity.toFixed(3)}`,
  };
}

function exportObjWithMtl(object: THREE.Object3D, mtlFileName: string): ObjMtlExport {
  object.updateWorldMatrix(true, true);

  const materialNames = new Map<string, string>();
  const materialLines = [`# Material colors exported from the current preview`, ""];
  const objLines = [`mtllib ${mtlFileName}`, ""];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let vertexIndex = 1;
  let normalIndex = 1;
  let meshIndex = 1;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const sourceGeometry = child.geometry;
    if (!sourceGeometry?.getAttribute("position")) {
      return;
    }

    const geometry = sourceGeometry.index
      ? sourceGeometry.toNonIndexed()
      : sourceGeometry;
    const positions = geometry.getAttribute("position");
    const material = materialInfo(child.material);
    let materialName = materialNames.get(material.signature);

    if (!materialName) {
      materialName = `mat_${materialNames.size + 1}_${material.color.getHexString()}`;
      materialNames.set(material.signature, materialName);
      materialLines.push(`newmtl ${materialName}`);
      materialLines.push("Ka 0.000000 0.000000 0.000000");
      materialLines.push(
        `Kd ${material.color.r.toFixed(6)} ${material.color.g.toFixed(6)} ${material.color.b.toFixed(6)}`,
      );
      materialLines.push("Ks 0.000000 0.000000 0.000000");
      materialLines.push(`d ${material.opacity.toFixed(6)}`);
      materialLines.push("");
    }

    objLines.push(`o ${sanitizeObjectName(child.name || `mesh_${meshIndex}`)}`);
    objLines.push(`usemtl ${materialName}`);
    meshIndex += 1;

    for (let index = 0; index < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      b.fromBufferAttribute(positions, index + 1).applyMatrix4(child.matrixWorld);
      c.fromBufferAttribute(positions, index + 2).applyMatrix4(child.matrixWorld);
      normal.subVectors(c, b).cross(a.clone().sub(b)).normalize();

      objLines.push(`v ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`);
      objLines.push(`v ${b.x.toFixed(6)} ${b.y.toFixed(6)} ${b.z.toFixed(6)}`);
      objLines.push(`v ${c.x.toFixed(6)} ${c.y.toFixed(6)} ${c.z.toFixed(6)}`);
      objLines.push(
        `vn ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}`,
      );
      objLines.push(
        `f ${vertexIndex}//${normalIndex} ${vertexIndex + 1}//${normalIndex} ${vertexIndex + 2}//${normalIndex}`,
      );
      vertexIndex += 3;
      normalIndex += 1;
    }

    objLines.push("");

    if (geometry !== sourceGeometry) {
      geometry.dispose();
    }
  });

  return {
    mtl: `${materialLines.join("\n")}\n`,
    obj: `${objLines.join("\n")}\n`,
  };
}

function createSlicerExportModel(model: THREE.Object3D) {
  const exportRoot = new THREE.Group();
  exportRoot.rotation.x = Math.PI / 2;
  exportRoot.add(model);
  exportRoot.updateWorldMatrix(true, true);

  return exportRoot;
}

function createPrintableModel(input: ModelInput) {
  const group = new THREE.Group();
  const metrics = createModelMetrics(input);
  const waterFeatures = visibleWaterFeatures(input, metrics);
  const waterMask = waterMaskWithEdgeFill(input, metrics, waterFeatures);
  const landCoverLayers = visibleLandCoverLayers(input, metrics, waterMask);

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: terrainSurfaceColor(input),
    metalness: 0,
    roughness: 0.82,
  });

  addBase(group, input, metrics, waterFeatures);
  addFrame(group, input, metrics);
  addTerrainReliefTop(group, input, metrics, surfaceMaterial, waterFeatures);

  addOpenStreetMapLayers(
    group,
    input,
    metrics,
    waterFeatures,
    landCoverLayers,
  );
  addBuildings(group, input, metrics, landCoverLayers);

  return group;
}

const PrintableModelPreview = forwardRef<
  PrintableModelPreviewHandle,
  PrintableModelPreviewProps
>(function PrintableModelPreview(
  {
    errorMessage,
    isLoading,
    layers,
    modelData,
    modelSettings,
    radiusMeters,
    selection,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const size = useMemo(
    () =>
      getPrintableModelSize(radiusMeters, modelSettings, {
        layers,
        modelData,
      }),
    [layers, modelData, modelSettings, radiusMeters],
  );
  const initialSizeRef = useRef(size);
  const { diameterMm, heightMm, mapSideMm } = size;

  useImperativeHandle(
    ref,
    () => ({
      async exportArchive() {
        if (!modelData) {
          throw new Error(MAP_STATUS.exportUnavailable);
        }

        const { STLExporter } = await import(
          "three/examples/jsm/exporters/STLExporter.js"
        );
        const exportModel = createPrintableModel({
          errorMessage,
          isLoading,
          layers,
          modelData,
          modelSettings,
          radiusMeters,
          selection,
          size,
        });
        const slicerExportModel = createSlicerExportModel(exportModel);

        const stlFileName = getPrintableFileName(
          selection.latitude,
          selection.longitude,
        );
        const archiveBaseName = stlFileName.replace(/\.stl$/i, "");
        const objFileName = `${archiveBaseName}-color.obj`;
        const mtlFileName = `${archiveBaseName}-color.mtl`;
        const exporter = new STLExporter();

        try {
          const stl = exporter.parse(slicerExportModel, { binary: true });
          const { mtl, obj } = exportObjWithMtl(slicerExportModel, mtlFileName);
          const sourceLines = [
            APP_TEXT.dataSources.openStreetMap.attribution,
            ...(modelData.sources?.overtureMaps
              ? [APP_TEXT.dataSources.overtureMaps.attribution]
              : []),
            ...(modelData.sources?.threeDbag
              ? [APP_TEXT.dataSources.threeDbag.attribution]
              : []),
            ...(modelData.sources?.bgt
              ? [APP_TEXT.dataSources.bgt.attribution]
              : []),
            ...(layers.terrain && modelData.sources?.terrain && modelData.terrain
              ? [modelData.terrain.attribution]
              : [
                  layers.terrain
                    ? "Terrain: flat fallback (elevation data unavailable)"
                    : "Terrain: disabled by user",
                ]),
            "",
            `Generated: ${modelData.generatedAt}`,
            `Center: ${selection.latitude.toFixed(7)}, ${selection.longitude.toFixed(7)}`,
          ];
          const archive = createZip([
            {
              data: bytesFromExport(stl),
              name: stlFileName,
            },
            {
              data: stringToBytes(obj),
              name: objFileName,
            },
            {
              data: stringToBytes(mtl),
              name: mtlFileName,
            },
            {
              data: stringToBytes(sourceLines.join("\n")),
              name: "SOURCES.txt",
            },
          ]);
          const blob = new Blob([archive], { type: "application/zip" });
          const href = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = href;
          anchor.download = `${archiveBaseName}.zip`;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(href);
        } finally {
          disposeObject(exportModel);
        }
      },
    }),
    [
      errorMessage,
      isLoading,
      layers,
      modelData,
      modelSettings,
      radiusMeters,
      selection,
      size,
    ],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(PREVIEW_BACKGROUND_COLOR, RENDERER_CLEAR_ALPHA);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO),
    );
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PREVIEW_BACKGROUND_COLOR);

    const initialView = createPreviewView(initialSizeRef.current);
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FIELD_OF_VIEW_DEGREES,
      CAMERA_ASPECT_RATIO,
      CAMERA_NEAR_PLANE,
      initialView.cameraFarPlane,
    );
    camera.position.set(
      initialView.viewRadius * CAMERA_POSITION_X_MULTIPLIER,
      initialView.viewRadius * CAMERA_POSITION_Y_MULTIPLIER +
        initialView.viewHeight,
      initialView.viewRadius * CAMERA_POSITION_Z_MULTIPLIER,
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = CONTROLS_DAMPING_FACTOR;
    controls.maxPolarAngle = Math.PI * CONTROLS_MAX_POLAR_ANGLE_FACTOR;
    controls.minDistance =
      initialView.viewRadius * CONTROLS_MIN_DISTANCE_FACTOR;
    controls.maxDistance =
      initialView.viewRadius * CONTROLS_MAX_DISTANCE_FACTOR;
    controls.target.set(0, initialView.targetY, 0);

    scene.add(
      new THREE.HemisphereLight(
        HEMISPHERE_LIGHT_SKY_COLOR,
        HEMISPHERE_LIGHT_GROUND_COLOR,
        HEMISPHERE_LIGHT_INTENSITY,
      ),
    );
    const keyLight = new THREE.DirectionalLight(
      KEY_LIGHT_COLOR,
      KEY_LIGHT_INTENSITY,
    );
    keyLight.position.set(
      initialView.viewRadius * KEY_LIGHT_POSITION_X_MULTIPLIER,
      initialView.viewRadius * KEY_LIGHT_POSITION_Y_MULTIPLIER,
      initialView.viewRadius * KEY_LIGHT_POSITION_Z_MULTIPLIER,
    );
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      FILL_LIGHT_COLOR,
      FILL_LIGHT_INTENSITY,
    );
    fillLight.position.set(
      initialView.viewRadius * FILL_LIGHT_POSITION_X_MULTIPLIER,
      initialView.viewRadius * FILL_LIGHT_POSITION_Y_MULTIPLIER,
      initialView.viewRadius * FILL_LIGHT_POSITION_Z_MULTIPLIER,
    );
    scene.add(fillLight);

    const grid = createPreviewGrid(initialSizeRef.current);
    cameraRef.current = camera;
    controlsRef.current = controls;
    gridRef.current = grid;
    rendererRef.current = renderer;
    sceneRef.current = scene;
    scene.add(grid);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(rect.height, MIN_VIEW_HEIGHT_MM);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = INITIAL_ANIMATION_FRAME;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current = null;
      }
      if (gridRef.current) {
        scene.remove(gridRef.current);
        disposeObject(gridRef.current);
        gridRef.current = null;
      }
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    let isCancelled = false;
    setIsPreviewUpdating(Boolean(modelData && !errorMessage && !isLoading));

    const updateTimer = window.setTimeout(() => {
      const model = createPrintableModel({
        errorMessage,
        isLoading,
        layers,
        modelData,
        modelSettings,
        radiusMeters,
        selection,
        size,
      });

      if (isCancelled) {
        disposeObject(model);
        return;
      }

      const previousModel = modelRef.current;
      if (previousModel) {
        scene.remove(previousModel);
        disposeObject(previousModel);
      }

      modelRef.current = model;
      scene.add(model);
      setIsPreviewUpdating(false);
    }, PREVIEW_UPDATE_PAINT_DELAY_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(updateTimer);
    };
  }, [
    errorMessage,
    isLoading,
    layers,
    modelData,
    modelSettings,
    radiusMeters,
    selection,
    size,
  ]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const scene = sceneRef.current;
    if (!camera || !controls || !scene) {
      return;
    }

    updateCameraBoundsForSize(camera, controls, size);

    if (gridRef.current) {
      scene.remove(gridRef.current);
      disposeObject(gridRef.current);
    }

    const grid = createPreviewGrid(size);
    gridRef.current = grid;
    scene.add(grid);
  }, [size]);

  return (
    <section className={styles.stage} aria-label={PREVIEW_TEXT.ariaLabel}>
      <div ref={containerRef} className={styles.canvas} />
      <div className={styles.sizeCard}>
        <strong>{PREVIEW_TEXT.finalSize(diameterMm, heightMm)}</strong>
        <span>{PREVIEW_TEXT.mapSide(mapSideMm)}</span>
      </div>
      {isLoading || isPreviewUpdating || errorMessage || !modelData ? (
        <div className={styles.loading} role="status">
          {isPreviewUpdating ? (
            <div className={styles.loadingSpinner} aria-hidden="true" />
          ) : null}
          <strong>
            {errorMessage
              ? PREVIEW_TEXT.errorTitle
              : isLoading
                ? PREVIEW_TEXT.loading
                : isPreviewUpdating
                  ? PREVIEW_TEXT.updating
                  : PREVIEW_TEXT.waitingForMapData}
          </strong>
          <span>
            {errorMessage ??
              (isPreviewUpdating
                ? PREVIEW_TEXT.updatingDetail
                : PREVIEW_TEXT.fetchingData)}
          </span>
        </div>
      ) : null}
    </section>
  );
});

export default PrintableModelPreview;
