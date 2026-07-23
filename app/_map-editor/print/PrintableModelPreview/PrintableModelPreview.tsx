"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
  PRINTABLE_LAND_COVER_CATEGORIES,
  PRINTABLE_ROAD_CATEGORIES,
  type ModelPoint,
  type ModelPoint3,
  type PrintableLine,
  type PrintableLandCoverCategoryKey,
  type PrintableModelData,
  type PrintableRenderMode,
} from "@/lib/printModel";
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
const TERRAIN_SURFACE_COLOR = "#fff8df";
const CIRCLE_GEOMETRY_SEGMENTS = 256;

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

function maxBuildingHeightMeters(modelData: PrintableModelData | null) {
  if (!modelData) {
    return 0;
  }

  let maxHeight = 0;

  for (const building of modelData.buildings) {
    for (const surface of building.surfaces) {
      for (const point of surface) {
        maxHeight = Math.max(maxHeight, point.z);
      }
    }
  }

  return maxHeight;
}

function createModelMetrics(input: ModelInput): ModelMetrics {
  const terrainRadiusMm = input.size.mapSideMm / 2;
  const totalRadiusMm = input.size.totalSideMm / 2;
  const horizontalScale = modelScale(input.radiusMeters, terrainRadiusMm);
  const autoVerticalScale =
    horizontalScale * input.modelSettings.layers.buildings.heightExaggeration;
  const lockedHeightMm = Math.max(input.size.heightMm - input.size.baseHeightMm, 1);
  const maxHeightMeters = maxBuildingHeightMeters(input.modelData);
  const verticalScale =
    input.modelSettings.dimensions.lockModelHeight && maxHeightMeters > 0
      ? lockedHeightMm / maxHeightMeters
      : autoVerticalScale;

  return {
    baseHeightMm: input.size.baseHeightMm,
    frameHeightMm: input.size.frameHeightMm,
    frameWidthMm: input.size.frameWidthMm,
    horizontalScale,
    surfaceY: input.size.baseHeightMm,
    terrainRadiusMm,
    totalRadiusMm,
    verticalScale,
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
  metrics: ModelMetrics,
) {
  positions.push(
    point.x * metrics.horizontalScale,
    metrics.surfaceY + verticalOffsetMm + point.z * metrics.verticalScale,
    -point.y * metrics.horizontalScale,
  );

  return positions.length / 3 - 1;
}

function createLod22SolidGeometry(
  buildings: PrintableModelData["buildings"],
  verticalOffsetMm: number,
  metrics: ModelMetrics,
) {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const building of buildings) {
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
        pushModelVertex(positions, point, verticalOffsetMm, metrics);
      }

      for (const triangle of triangles) {
        indices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2]);
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

function createLayerMaterial(color: string, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    depthWrite: opacity >= 0.98,
    metalness: 0,
    opacity,
    roughness: 0.72,
    transparent: opacity < 0.98,
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

function addLinePrisms(
  group: THREE.Group,
  lines: PrintableLine[],
  input: ModelInput,
  metrics: ModelMetrics,
  material: THREE.Material,
  topY: number,
  heightMm: number,
  widthForLine: (line: PrintableLine) => number,
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
        bottomY,
        startZ + normalZ,
        startX - normalX,
        bottomY,
        startZ - normalZ,
        endX - normalX,
        bottomY,
        endZ - normalZ,
        endX + normalX,
        bottomY,
        endZ + normalZ,
        startX + normalX,
        topY,
        startZ + normalZ,
        startX - normalX,
        topY,
        startZ - normalZ,
        endX - normalX,
        topY,
        endZ - normalZ,
        endX + normalX,
        topY,
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

function addBuildings(group: THREE.Group, input: ModelInput, metrics: ModelMetrics) {
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
    metrics,
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

function visibleWaterGeometry(input: ModelInput, metrics: ModelMetrics) {
  if (!input.modelData || !input.layers.water) {
    return createWaterMask([], [], metrics.horizontalScale);
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
  const waterLines = input.modelData.waterLines.filter(
    (line) =>
      !settings.hideSmallWaterBodies ||
      waterLineWidthMm(line, metrics) >= settings.minimumWidthMm,
  );

  return createWaterMask(
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
  );
}

function addWater(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  waterMask: ReturnType<typeof createWaterMask>,
) {
  if (!input.modelData || !input.layers.water || waterMask.length === 0) {
    return;
  }

  const settings = input.modelSettings.layers.water;
  const height =
    settings.renderMode === "extruded"
      ? settings.extrudedHeightMm
      : SURFACE_MODE_THICKNESS_MM;
  const topY =
    metrics.surfaceY +
      settings.verticalOffsetMm -
    (settings.sinkIntoTerrain ? settings.sinkDepthMm : 0) +
    MIN_LAYER_LIFT_MM;
  const waterMaterial = createLayerMaterial(settings.color, settings.opacity);

  for (const region of planarRegions(waterMask)) {
    addPlanarRegionLayer(
      group,
      region,
      waterMaterial,
      settings.renderMode,
      settings.renderMode === "extruded" ? topY + height : topY,
      height,
    );
  }
}

function addLandCover(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
  waterMask: ReturnType<typeof createWaterMask>,
) {
  if (!input.modelData || !input.layers.landCover) {
    return;
  }

  const settings = input.modelSettings.layers.landCover;
  const polygonsByCategory = new Map<
    PrintableLandCoverCategoryKey,
    PrintableModelData["landCover"]
  >();
  for (const polygon of input.modelData.landCover) {
    const categoryKey = getPrintableLandCoverCategory(polygon);
    const category = settings.categories[categoryKey];

    if (!category.enabled) {
      continue;
    }

    polygonsByCategory.set(categoryKey, [
      ...(polygonsByCategory.get(categoryKey) ?? []),
      polygon,
    ]);
  }

  let occupiedMask = waterMask;
  for (const { key: categoryKey } of PRINTABLE_LAND_COVER_CATEGORIES) {
    const category = settings.categories[categoryKey];
    const polygons = polygonsByCategory.get(categoryKey) ?? [];

    if (!category.enabled || polygons.length === 0) {
      continue;
    }

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
    const categoryMask = subtractMask(
      createPolygonMask(
        polygons.map((polygon) => polygon.points),
        metrics.horizontalScale,
      ),
      occupiedMask,
    );
    const stableRegions = planarRegions(categoryMask).filter(
      stableLandCoverRegion,
    );
    const material = createLayerMaterial(category.color, settings.opacity);

    for (const region of stableRegions) {
      addPlanarRegionLayer(
        group,
        region,
        material,
        category.renderMode,
        topY,
        height,
      );
    }

    const stableMask: ReturnType<typeof createWaterMask> = stableRegions.map(
      (region) => [region.outer, ...region.holes],
    );
    occupiedMask = unionMasks(occupiedMask, stableMask);
  }
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
      height,
      () => getRoadCategoryWidthMm(settings, categoryInfo.key),
    );
  }
}

function addOpenStreetMapLayers(
  group: THREE.Group,
  input: ModelInput,
  metrics: ModelMetrics,
) {
  if (!input.modelData) {
    return;
  }

  const waterMask = visibleWaterGeometry(input, metrics);
  addLandCover(group, input, metrics, waterMask);
  addWater(group, input, metrics, waterMask);
  addRoads(group, input, metrics);
}

function addBase(group: THREE.Group, input: ModelInput, metrics: ModelMetrics) {
  if (metrics.baseHeightMm <= 0) {
    return;
  }

  const material = new THREE.MeshStandardMaterial({
    color: BASE_MATERIAL_COLOR,
    metalness: 0,
    roughness: 0.76,
  });
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

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: TERRAIN_SURFACE_COLOR,
    metalness: 0,
    roughness: 0.82,
  });

  addBase(group, input, metrics);
  addFrame(group, input, metrics);

  const topShape = createSelectionShape(input, metrics);
  if (!topShape) {
    return group;
  }

  const top = new THREE.Mesh(
    new THREE.ShapeGeometry(topShape, CIRCLE_GEOMETRY_SEGMENTS),
    surfaceMaterial,
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = metrics.surfaceY;
  group.add(top);

  addOpenStreetMapLayers(group, input, metrics);
  addBuildings(group, input, metrics);

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
  const size = useMemo(
    () => getPrintableModelSize(radiusMeters, modelSettings),
    [modelSettings, radiusMeters],
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
    modelRef.current = model;
    scene.add(model);

    return () => {
      scene.remove(model);
      disposeObject(model);
      if (modelRef.current === model) {
        modelRef.current = null;
      }
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
      {isLoading || errorMessage || !modelData ? (
        <div className={styles.loading} role="status">
          <strong>
            {errorMessage
              ? PREVIEW_TEXT.errorTitle
              : isLoading
                ? PREVIEW_TEXT.loading
                : PREVIEW_TEXT.waitingForMapData}
          </strong>
          <span>{errorMessage ?? PREVIEW_TEXT.fetchingData}</span>
        </div>
      ) : null}
    </section>
  );
});

export default PrintableModelPreview;
