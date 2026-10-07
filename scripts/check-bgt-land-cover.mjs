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

const bgt = loadTypeScriptModule(path.join(projectRoot, "lib/bgt.ts"));
const preview = loadTypeScriptModule(
  path.join(
    projectRoot,
    "app/_map-editor/print/PrintableModelPreview/PrintableModelPreview.tsx",
  ),
  (source) =>
    `${source}\nexport { createModelMetrics, createPrintableModel, planarRingContainsPoint };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

function rectangle(minX, minY, maxX, maxY) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function feature(fysiekVoorkomen, rings, properties = {}) {
  return {
    geometry: { coordinates: rings, type: "Polygon" },
    properties: {
      eind_registratie: null,
      fysiek_voorkomen: fysiekVoorkomen,
      relatieve_hoogteligging: 0,
      status: "bestaand",
      ...properties,
    },
  };
}

function ringArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function polygonArea(polygon) {
  return (
    ringArea(polygon.points) -
    (polygon.holes ?? []).reduce((sum, hole) => sum + ringArea(hole), 0)
  );
}

// RD bbox 0..40 x 0..20 at 0.5 m per pixel. The color-infrared photo shows
// vegetation (near-infrared above red) west of x = 20 and pavement east of it.
const raster = bgt.createVegetationRaster([0, 0, 40, 20], 80, 40);
const cirImage = { data: new Uint8Array(8 * 4 * 4), height: 4, width: 8 };
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 8; column += 1) {
    const offset = (row * 8 + column) * 4;
    const isGreen = column < 4;
    cirImage.data.set([isGreen ? 200 : 80, isGreen ? 60 : 120, 90, 255], offset);
  }
}
bgt.paintCirImage(raster, [0, 0, 40, 20], cirImage);

assert.equal(
  bgt.vegetatedFraction(raster, [rectangle(2, 2, 10, 10)]),
  1,
  "A parcel on vegetation must read as fully vegetated.",
);
assert.equal(
  bgt.vegetatedFraction(raster, [rectangle(25, 2, 35, 10)]),
  0,
  "A parcel on pavement must read as unvegetated.",
);
assert.equal(
  bgt.vegetatedFraction(raster, [rectangle(2, 2, 3, 3)]),
  null,
  "A parcel covering too few pixels must not be judged.",
);

const center = { x: 20, y: 10 };
// Local square -18..18 x -9..9, which is RD 2..38 x 1..19.
const boundary = [
  { x: -18, y: -9 },
  { x: 18, y: -9 },
  { x: 18, y: 9 },
  { x: -18, y: 9 },
];
const landCover = bgt.classifyBgtLandCover({
  boundary,
  center,
  raster,
  vegetation: [
    feature("groenvoorziening", [rectangle(4, 12, 10, 16)]),
    feature("groenvoorziening", [rectangle(10, 12, 16, 16)]),
    feature("loofbos", [rectangle(30, 12, 36, 16)]),
    feature("grasland overig", [rectangle(22, 1, 30, 9), rectangle(24, 3, 28, 7)]),
    feature("groenvoorziening", [rectangle(0, 2, 4, 6)]),
    feature("groenvoorziening", [rectangle(32, 2, 36, 6)], {
      eind_registratie: "2020-01-01T00:00:00Z",
    }),
  ],
  yards: [
    feature("erf", [rectangle(6, 2, 12, 8)]),
    feature("erf", [rectangle(32, 6, 38, 10)]),
    feature("erf", [rectangle(13, 2, 17, 6)], {
      eind_registratie: "2021-01-01T00:00:00Z",
    }),
    feature("erf", [rectangle(13, 7, 17, 11)], { relatieve_hoogteligging: 1 }),
    feature("gesloten verharding", [rectangle(13, 12, 17, 16)]),
    feature("erf", [rectangle(18, 2, 18.8, 2.8)]),
  ],
});

const byKind = (kind) => landCover.filter((polygon) => polygon.kind === kind);
const gardens = byKind("garden");
assert.equal(gardens.length, 1, "Only the green, current, ground-level yard becomes a garden.");
assert.ok(
  gardens[0].points.every((point) => point.x >= -14 - 1e-9 && point.x <= -8 + 1e-9),
  "The garden must be the yard on vegetation (RD x 6..12).",
);
assert.equal(gardens[0].category, "grass", "Gardens print as grass.");

const grass = byKind("grass");
const mergedLawn = grass.find((polygon) =>
  polygon.points.some((point) => Math.abs(point.y - 6) < 1e-9),
);
assert.ok(mergedLawn, "Adjacent lawns must be present.");
assert.ok(
  Math.abs(polygonArea(mergedLawn) - 48) < 1e-6,
  "Adjacent BGT lawns must merge into one 12 x 4 m polygon.",
);
const lawnWithPond = grass.find((polygon) => polygon.holes?.length);
assert.ok(lawnWithPond, "Holes in BGT vegetation must be kept.");
assert.ok(
  Math.abs(polygonArea(lawnWithPond) - (64 - 16)) < 1e-6,
  "A lawn around a 4 x 4 m hole keeps 48 m² of grass.",
);
const clippedLawn = grass.find((polygon) =>
  polygon.points.some((point) => Math.abs(point.x + 18) < 1e-9),
);
assert.ok(clippedLawn, "Vegetation crossing the selection edge must be clipped, not dropped.");
assert.ok(
  Math.abs(polygonArea(clippedLawn) - 8) < 1e-6,
  "Only the 2 x 4 m inside the selection remains of a lawn crossing its edge.",
);
assert.equal(grass.length, 3, "Retired BGT objects must be ignored.");

const forest = byKind("forest");
assert.equal(forest.length, 1, "Deciduous woodland must become forest land cover.");
assert.equal(forest[0].category, "forest");
assert.ok(
  landCover.every((polygon) =>
    [polygon.points, ...(polygon.holes ?? [])].every((ring) =>
      ring.every(
        (point) =>
          point.x >= -18 - 1e-9 &&
          point.x <= 18 + 1e-9 &&
          point.y >= -9 - 1e-9 &&
          point.y <= 9 + 1e-9,
      ),
    ),
  ),
  "All BGT land cover must stay inside the selection.",
);

assert.equal(
  bgt.classifyBgtLandCover({
    boundary,
    center,
    raster: null,
    vegetation: [],
    yards: [feature("erf", [rectangle(6, 2, 12, 8)])],
  }).length,
  0,
  "Yards must not become gardens without aerial imagery to confirm them.",
);

const dataSources = loadTypeScriptModule(
  path.join(projectRoot, "lib/dataSources.ts"),
);
assert.equal(dataSources.usesBgtLandCover(4.8922041, 52.3768249, 650), true);
assert.equal(
  dataSources.usesBgtLandCover(4.8922041, 52.3768249, 1500),
  false,
  "BGT must be skipped above its radius cap.",
);
assert.equal(
  dataSources.usesBgtLandCover(2.3522, 48.8566, 300),
  false,
  "BGT must be skipped outside the Netherlands.",
);

const closedSquare = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];
assert.equal(
  preview.planarRingContainsPoint(closedSquare, [500, 0]),
  false,
  "A closed ring's repeated vertex must not make far points count as inside.",
);
assert.equal(preview.planarRingContainsPoint(closedSquare, [0.5, 0.5]), true);
assert.equal(preview.planarRingContainsPoint(closedSquare, [1, 0.5]), true);

const settings = printModel.createDefaultPrintableModelSettings();
const holeInput = {
  layers: { buildings: false, landCover: true, roads: false, water: false },
  modelData: {
    buildings: [],
    generatedAt: "2026-10-04T00:00:00.000Z",
    landCover: [
      {
        category: "grass",
        holes: [
          [
            { x: -10, y: -10 },
            { x: 10, y: -10 },
            { x: 10, y: 10 },
            { x: -10, y: 10 },
          ],
        ],
        kind: "garden",
        points: [
          { x: -30, y: -30 },
          { x: 30, y: -30 },
          { x: 30, y: 30 },
          { x: -30, y: 30 },
        ],
      },
    ],
    radiusMeters: 50,
    roads: [],
    sourceCounts: {
      buildings: 0,
      buildingSurfaces: 0,
      landCover: 1,
      osmElements: 0,
      roads: 0,
      water: 0,
    },
    warnings: [],
    water: [],
    waterLines: [],
  },
  modelSettings: settings,
  radiusMeters: 50,
  selection: { latitude: 52.3711258, longitude: 4.8869109, shape: "circle" },
  size: printModel.getPrintableModelSize(50, settings),
};
const holeGroup = preview.createPrintableModel(holeInput);
holeGroup.updateMatrixWorld(true);
const grassColor = settings.layers.landCover.categories.grass.color.toLowerCase();
function topColorAt(x, z) {
  const [hit] = new THREE.Raycaster(
    new THREE.Vector3(x, 100, z),
    new THREE.Vector3(0, -1, 0),
  ).intersectObject(holeGroup, true);
  return hit ? `#${hit.object.material.color.getHexString()}` : null;
}
const { horizontalScale } = preview.createModelMetrics(holeInput);
assert.equal(
  topColorAt(20 * horizontalScale, 0),
  grassColor,
  "Garden land cover must render around its courtyard hole.",
);
assert.notEqual(
  topColorAt(0, 0),
  grassColor,
  "Land cover holes must stay open instead of being filled.",
);

console.log("BGT land cover checks passed.");
