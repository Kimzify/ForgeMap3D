import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const moduleCache = new Map();

function resolveLocalModule(specifier, parentPath) {
  const unresolved = specifier.startsWith("@/")
    ? path.join(projectRoot, specifier.slice(2))
    : path.resolve(path.dirname(parentPath), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function loadTypeScriptModule(filePath, sourceTransform = (source) => source) {
  const cached = moduleCache.get(filePath);
  if (cached) {
    return cached.exports;
  }

  const cjsModule = { exports: {} };
  moduleCache.set(filePath, cjsModule);
  const source = sourceTransform(readFileSync(filePath, "utf8"));
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier.endsWith(".module.css")) {
      return {};
    }

    if (specifier === "three/examples/jsm/controls/OrbitControls.js") {
      return { OrbitControls: class OrbitControls {} };
    }

    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const resolved = resolveLocalModule(specifier, filePath);
      if (!resolved) {
        throw new Error(`Could not resolve ${specifier} from ${filePath}`);
      }
      return loadTypeScriptModule(resolved);
    }

    return require(specifier);
  };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
    TextEncoder,
  });

  return cjsModule.exports;
}

const preview = loadTypeScriptModule(
  path.join(
    projectRoot,
    "app/_map-editor/print/PrintableModelPreview/PrintableModelPreview.tsx",
  ),
  (source) => `${source}\nexport { addOpenStreetMapLayers, createModelMetrics };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

const settings = printModel.createDefaultPrintableModelSettings();
const landCoverColors = new Set(
  Object.values(settings.layers.landCover.categories).map((category) =>
    category.color.toLowerCase(),
  ),
);
const input = {
  layers: {
    buildings: false,
    landCover: true,
    roads: false,
    water: false,
  },
  modelData: {
    buildings: [],
    generatedAt: "2026-07-23T00:00:00.000Z",
    landCover: [
      {
        category: "grass",
        kind: "park",
        points: [
          { x: -28, y: -18 },
          { x: 8, y: -18 },
          { x: 8, y: 18 },
          { x: -28, y: 18 },
          { x: -28, y: -18 },
        ],
      },
      {
        category: "grass",
        kind: "grass",
        points: [
          { x: -8, y: -18 },
          { x: 28, y: -18 },
          { x: 28, y: 18 },
          { x: -8, y: 18 },
          { x: -8, y: -18 },
        ],
      },
    ],
    radiusMeters: 50,
    roads: [],
    sourceCounts: {
      buildings: 0,
      buildingSurfaces: 0,
      landCover: 2,
      osmElements: 2,
      roads: 0,
      water: 0,
    },
    warnings: [],
    water: [],
    waterLines: [],
  },
  modelSettings: settings,
  radiusMeters: 50,
  selection: {
    latitude: 52.3711258,
    longitude: 4.8869109,
    shape: "circle",
  },
  size: {
    baseHeightMm: 2,
    diameterMm: 104,
    frameHeightMm: 1,
    frameWidthMm: 2,
    heightMm: 10,
    mapSideMm: 100,
    terrainHeightMm: 8,
    totalSideMm: 104,
  },
};

const group = new THREE.Group();
const metrics = preview.createModelMetrics(input);
preview.addOpenStreetMapLayers(group, input, metrics);
group.updateMatrixWorld(true);

function isLandCoverMaterial(material) {
  return (
    material instanceof THREE.MeshStandardMaterial &&
    landCoverColors.has(`#${material.color.getHexString()}`)
  );
}

function landCoverHitsAt(group, x, z) {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 100, z),
    new THREE.Vector3(0, -1, 0),
  );

  return raycaster.intersectObject(group, true).filter((intersection) => {
    const material = intersection.object.material;
    return isLandCoverMaterial(material);
  });
}

function assertSingleLandCoverTopSurface(group, x, z, description) {
  const landCoverTopHits = landCoverHitsAt(group, x, z);

  assert.ok(landCoverTopHits.length > 0, `${description} should hit land cover.`);

  const topDistance = landCoverTopHits[0].distance;
  const coplanarTopHits = landCoverTopHits.filter(
    (hit) => Math.abs(hit.distance - topDistance) <= 0.000001,
  );

  assert.equal(
    coplanarTopHits.length,
    1,
    `${description} must collapse to one top surface to avoid flickering fragments.`,
  );
}

assertSingleLandCoverTopSurface(
  group,
  0,
  0,
  "Overlapping synthetic land-cover polygons",
);

const liveModelPath = process.argv[2];
if (liveModelPath) {
  const liveModelData = JSON.parse(readFileSync(liveModelPath, "utf8"));
  const liveRadiusMeters = liveModelData.radiusMeters;
  const liveInput = {
    ...input,
    modelData: liveModelData,
    radiusMeters: liveRadiusMeters,
    size: printModel.getPrintableModelSize(liveRadiusMeters, settings),
  };
  const liveGroup = new THREE.Group();
  const liveMetrics = preview.createModelMetrics(liveInput);
  preview.addOpenStreetMapLayers(liveGroup, liveInput, liveMetrics);
  liveGroup.updateMatrixWorld(true);

  const samplePoints = [];
  liveGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !isLandCoverMaterial(child.material)) {
      return;
    }

    const positions = child.geometry.getAttribute("position");
    const index = child.geometry.getIndex();
    const triangleCount = index
      ? index.count / 3
      : Math.floor(positions.count / 3);

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const vertexIndices = index
        ? [
            index.getX(triangle * 3),
            index.getX(triangle * 3 + 1),
            index.getX(triangle * 3 + 2),
          ]
        : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
      const vertices = vertexIndices.map((vertexIndex) =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, vertexIndex)
          .applyMatrix4(child.matrixWorld),
      );
      const minY = Math.min(...vertices.map((vertex) => vertex.y));
      const maxY = Math.max(...vertices.map((vertex) => vertex.y));

      if (maxY - minY > 0.0001) {
        continue;
      }

      samplePoints.push(
        vertices
          .reduce((centroid, vertex) => centroid.add(vertex), new THREE.Vector3())
          .multiplyScalar(1 / 3),
      );
    }
  });

  assert.ok(
    samplePoints.length >= 20,
    "The live payload should provide enough land-cover surface samples.",
  );

  const sampleStride = Math.max(1, Math.floor(samplePoints.length / 250));
  for (const point of samplePoints.filter(
    (_point, index) => index % sampleStride === 0,
  )) {
    assertSingleLandCoverTopSurface(
      liveGroup,
      point.x,
      point.z,
      "Sampled live land-cover geometry",
    );
  }
}
