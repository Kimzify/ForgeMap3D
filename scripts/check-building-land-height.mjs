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
  (source) => `${source}\nexport { createModelMetrics, createPrintableModel };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

function buildingBoxFor(
  category,
  categoryHeightMm,
  landCoverEnabled = true,
  landHeightMm = 0.2,
) {
  const settings = printModel.createDefaultPrintableModelSettings();
  settings.layers.landCover.landHeightMm = landHeightMm;
  settings.layers.landCover.categories[category].extrudedHeightMm =
    categoryHeightMm;
  const input = {
    layers: {
      buildings: true,
      landCover: landCoverEnabled,
      roads: false,
      terrain: false,
      water: false,
    },
    modelData: {
      buildings: [
        {
          buildingId: "test-building",
          id: "test-building",
          surfaces: [
            [
              { x: -5, y: -5, z: 0 },
              { x: 5, y: -5, z: 0 },
              { x: 5, y: -5, z: 4 },
              { x: -5, y: -5, z: 4 },
            ],
          ],
        },
      ],
      generatedAt: "2026-08-31T00:00:00.000Z",
      landCover: [
        {
          category,
          kind: category === "urban" ? "residential" : "grass",
          points: [
            { x: -20, y: -20 },
            { x: 20, y: -20 },
            { x: 20, y: 20 },
            { x: -20, y: 20 },
            { x: -20, y: -20 },
          ],
        },
      ],
      radiusMeters: 50,
      roads: [],
      sourceCounts: {
        buildings: 1,
        buildingSurfaces: 1,
        landCover: 1,
        osmElements: 2,
        roads: 0,
        water: 0,
      },
      terrain: null,
      warnings: [],
      water: [],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: {
      latitude: 52.4017362,
      longitude: 5.3152422,
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
  const group = preview.createPrintableModel(input);
  group.updateMatrixWorld(true);
  const buildingColor = settings.layers.buildings.color.toLowerCase();
  const box = new THREE.Box3();
  let found = false;

  group.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial &&
      `#${object.material.color.getHexString()}` === buildingColor
    ) {
      box.union(new THREE.Box3().setFromObject(object));
      found = true;
    }
  });

  assert.ok(found, "The synthetic building mesh should be generated.");
  return {
    box,
    expectedLandTopY:
      landCoverEnabled
        ? Math.max(
            2 + landHeightMm,
            2 +
              settings.layers.landCover.verticalOffsetMm +
              (settings.layers.landCover.categories[category].carveIntoTerrain
                ? -settings.layers.landCover.categories[category].carveDepthMm
                : 0) +
              0.02 +
              categoryHeightMm,
          )
        : 2,
  };
}

for (const [category, height] of [
  ["urban", 1.4],
  ["grass", 0.65],
]) {
  const { box, expectedLandTopY } = buildingBoxFor(category, height);
  assert.ok(
    Math.abs(box.min.y - expectedLandTopY) < 0.001,
    `${category} buildings should start at the ${height}mm land-cover top; got y=${box.min.y}.`,
  );
  assert.ok(
    Math.abs(box.max.y - box.min.y - 4) < 0.001,
    `${category} land must not change the building's measured height.`,
  );
}

const withoutLand = buildingBoxFor("urban", 1.4, false).box;
assert.ok(
  Math.abs(withoutLand.min.y - 2) < 0.001,
  "A building without rendered land cover should still start at terrain level.",
);

const buildingOnTallLand = buildingBoxFor("grass", 0.2, true, 1.3).box;
assert.ok(
  Math.abs(buildingOnTallLand.min.y - 3.3) < 0.001,
  "Buildings should start on the independent earth height when it is above the local category.",
);
assert.ok(
  Math.abs(buildingOnTallLand.max.y - buildingOnTallLand.min.y - 4) < 0.001,
  "Independent earth height must not change the building's measured height.",
);
