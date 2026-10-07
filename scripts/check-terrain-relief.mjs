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

const settings = printModel.createDefaultPrintableModelSettings();
const size = printModel.getPrintableModelSize(100, settings);
const baseInput = {
  errorMessage: null,
  isLoading: false,
  layers: {
    buildings: true,
    landCover: true,
    roads: true,
    terrain: true,
    water: true,
  },
  modelData: {
    buildings: [],
    generatedAt: "2026-07-26T00:00:00.000Z",
    landCover: [],
    radiusMeters: 100,
    roads: [],
    sourceCounts: {
      buildings: 0,
      buildingSurfaces: 0,
      landCover: 0,
      osmElements: 0,
      roads: 0,
      water: 0,
    },
    sources: {
      buildings: "openStreetMap",
      openStreetMap: true,
      overtureMaps: false,
      terrain: true,
      threeDbag: false,
    },
    terrain: {
      attribution: "Terrain: synthetic test grid",
      columns: 3,
      elevations: [0, 20, 0, 20, 100, 20, 0, 20, 0],
      maxElevationMeters: 100,
      minElevationMeters: 0,
      minX: -100,
      minY: -100,
      rows: 3,
      source: "opentopodata-srtm30m",
      spacingMeters: 100,
    },
    warnings: [],
    water: [],
    waterLines: [],
  },
  modelSettings: settings,
  radiusMeters: 100,
  selection: {
    heightMeters: 200,
    latitude: 46.8523,
    longitude: -121.7603,
    shape: "rectangle",
    widthMeters: 200,
  },
  size,
};

function modelHeight(input) {
  const model = preview.createPrintableModel(input);
  const bounds = new THREE.Box3().setFromObject(model);
  const spans = new THREE.Vector3();
  bounds.getSize(spans);
  return spans.y;
}

const raisedHeight = modelHeight(baseInput);
const flatHeight = modelHeight({
  ...baseInput,
  layers: {
    ...baseInput.layers,
    terrain: false,
  },
});

assert.ok(
  raisedHeight > flatHeight + 50,
  `Terrain relief should materially raise the model. Got raised=${raisedHeight.toFixed(
    3,
  )}mm flat=${flatHeight.toFixed(3)}mm.`,
);

assert.equal(
  printModel.DEFAULT_PRINTABLE_LAYERS.terrain,
  false,
  "Terrain relief should be off in the base layer defaults.",
);

assert.equal(
  printModel.shouldEnableTerrainReliefByDefault(baseInput.modelData),
  true,
  "High-relief terrain should enable relief by default.",
);

assert.equal(
  printModel.shouldEnableTerrainReliefByDefault({
    ...baseInput.modelData,
    terrain: {
      ...baseInput.modelData.terrain,
      elevations: [0, 5, 0, 5, 20, 5, 0, 5, 0],
      maxElevationMeters: 20,
      minElevationMeters: 0,
    },
  }),
  false,
  "Low-relief terrain should stay flat by default.",
);

// With water sunk into the terrain, the relief is built per land region. Its
// underside must lie on the flat base: a bottom following the relief leaves
// a hidden cavity that slicers fill with supports from the bed at the rim.
const pondInput = {
  ...baseInput,
  modelData: {
    ...baseInput.modelData,
    water: [
      {
        kind: "pond",
        points: [
          { x: 60, y: 60 },
          { x: 90, y: 60 },
          { x: 90, y: 90 },
          { x: 60, y: 90 },
        ],
      },
    ],
  },
};
const pondModel = preview.createPrintableModel(pondInput);
pondModel.updateMatrixWorld(true);
const { surfaceY } = preview.createModelMetrics(pondInput);
const terrainColor = settings.layers.terrain.color.toLowerCase();
let terrainFaces = 0;
pondModel.traverse((object) => {
  if (!object.isMesh || `#${object.material.color.getHexString()}` !== terrainColor) {
    return;
  }

  const positions = object.geometry.getAttribute("position");
  const index = object.geometry.getIndex();
  const corner = (vertex) =>
    new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld);
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const [a, b, c] = [0, 1, 2].map((offset) => corner(index.getX(triangle + offset)));
    const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (normal.lengthSq() === 0 || normal.normalize().y > -0.7) {
      continue;
    }
    terrainFaces += 1;
    assert.ok(
      Math.max(a.y, b.y, c.y) <= surfaceY + 1e-6,
      "The terrain's underside must lie on the base, not follow the relief.",
    );
  }
});
assert.ok(terrainFaces > 0, "The terrain relief must be built when water is sunk into it.");

console.log("Terrain relief checks passed.");
