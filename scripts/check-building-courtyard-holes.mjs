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

const route = loadTypeScriptModule(
  path.join(projectRoot, "app/api/print-model/route.ts"),
  (source) => `${source}\nexport { extractBuildingsFromCityJsonTiles };\n`,
);
const preview = loadTypeScriptModule(
  path.join(
    projectRoot,
    "app/_map-editor/print/PrintableModelPreview/PrintableModelPreview.tsx",
  ),
  (source) =>
    `${source}\nexport { createLod22SolidGeometry, createModelMetrics };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

// A 20 m square building around an 8 m courtyard, as 3DBAG ships it: the
// ground and roof surfaces each carry the courtyard as an inner ring.
const centerRd = { x: 150000, y: 480000 };
const square = (min, max, z) => [
  [min, min, z],
  [max, min, z],
  [max, max, z],
  [min, max, z],
];
const vertices = [
  ...square(0, 20, 0),
  ...square(6, 14, 0),
  ...square(0, 20, 6),
  ...square(6, 14, 6),
];
const [outerGround, innerGround, outerRoof, innerRoof] = [0, 4, 8, 12];
const ring = (start) => [0, 1, 2, 3].map((index) => start + index);
const walls = (bottom, top) =>
  [0, 1, 2, 3].map((index) => {
    const next = (index + 1) % 4;
    return [[bottom + index, bottom + next, top + next, top + index]];
  });
const tile = {
  CityObjects: {
    "test-building": { type: "Building" },
    "test-building-0": {
      geometry: [
        {
          boundaries: [
            [
              [ring(outerGround).reverse(), ring(innerGround)],
              [ring(outerRoof), ring(innerRoof).reverse()],
              ...walls(outerGround, outerRoof),
              ...walls(innerGround, innerRoof).map(([face]) => [
                [...face].reverse(),
              ]),
            ],
          ],
          lod: "2.2",
          type: "Solid",
        },
      ],
      parents: ["test-building"],
      type: "BuildingPart",
    },
  },
  transform: {
    scale: [1, 1, 1],
    translate: [centerRd.x - 10, centerRd.y - 10, 0],
  },
  vertices,
};
const boundary = [
  { x: -100, y: -100 },
  { x: 100, y: -100 },
  { x: 100, y: 100 },
  { x: -100, y: 100 },
];

const [building] = route.extractBuildingsFromCityJsonTiles(
  [tile],
  centerRd,
  boundary,
);
assert.ok(building, "The courtyard building should be extracted.");

const pointKey = (point) =>
  [point.x, point.y, point.z].map((value) => value.toFixed(3)).join(",");
const edgeUses = new Map();
for (const surface of building.surfaces) {
  surface.forEach((point, index) => {
    const edge = [pointKey(point), pointKey(surface[(index + 1) % surface.length])]
      .sort()
      .join("|");
    edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
  });
}
const openEdges = [...edgeUses.values()].filter((uses) => uses !== 2).length;
assert.equal(
  openEdges,
  0,
  "Surfaces with inner rings must keep their holes so the building shell stays closed.",
);

const settings = printModel.createDefaultPrintableModelSettings();
const input = {
  layers: { ...printModel.DEFAULT_PRINTABLE_LAYERS, landCover: false },
  modelData: {
    buildings: [building],
    landCover: [],
    radiusMeters: 50,
    roads: [],
    terrain: null,
    water: [],
    waterLines: [],
  },
  modelSettings: settings,
  radiusMeters: 50,
  selection: { latitude: 52.37, longitude: 5.25, shape: "square" },
  size: printModel.getPrintableModelSize(50, settings),
};
const metrics = preview.createModelMetrics(input);
const geometry = preview.createLod22SolidGeometry(
  [building],
  0,
  input,
  metrics,
  [],
);
const mesh = new THREE.Mesh(
  geometry,
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
);
const raycaster = new THREE.Raycaster();
const hitsAt = (x, y) => {
  raycaster.set(
    new THREE.Vector3(
      x * metrics.horizontalScale,
      1000,
      -y * metrics.horizontalScale,
    ),
    new THREE.Vector3(0, -1, 0),
  );
  return raycaster.intersectObject(mesh, false).length;
};

assert.equal(
  hitsAt(0, 0),
  0,
  "The courtyard must stay open instead of being capped by ground and roof slabs.",
);
assert.equal(hitsAt(-8, -5), 2, "The building wing should keep its ground and roof.");
