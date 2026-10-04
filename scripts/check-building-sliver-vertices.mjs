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

// 3DBAG meshes contain vertices a few millimetres apart. The sliver edges and
// faces between them make slicers (Bambu Studio) drop layers of other
// buildings in the same model, leaving roofs floating over empty space.
const centerRd = { x: 150000, y: 480000 };
const boundary = [
  { x: -100, y: -100 },
  { x: 100, y: -100 },
  { x: 100, y: 100 },
  { x: -100, y: 100 },
];
const vertices = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 6, 0],
  [0, 6, 0],
  [0, 0, 8],
  [10, 0, 8],
  [10, 6, 8],
  [0, 6, 8],
  [10, 0, 7.998],
];
const faces = [
  [3, 2, 1, 0],
  [4, 5, 6, 7],
  [0, 1, 8, 5, 4],
  [1, 2, 6, 5, 8],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];
const tile = {
  CityObjects: {
    "test-building": { type: "Building" },
    "test-building-0": {
      geometry: [
        {
          boundaries: [faces.map((face) => [face])],
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
    translate: [centerRd.x - 5, centerRd.y - 3, 0],
  },
  vertices,
};

const [building] = route.extractBuildingsFromCityJsonTiles(
  [tile],
  centerRd,
  boundary,
);
assert.ok(building, "The building should be extracted.");

const points = [];
for (const point of building.surfaces.flat()) {
  if (
    !points.some(
      (other) =>
        other.x === point.x && other.y === point.y && other.z === point.z,
    )
  ) {
    points.push(point);
  }
}
for (const [index, point] of points.entries()) {
  for (const other of points.slice(index + 1)) {
    assert.ok(
      Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z) >=
        0.01,
      `Building vertices closer than 1 cm should be merged; found ${JSON.stringify(point)} and ${JSON.stringify(other)}.`,
    );
  }
}

const pointKey = (point) =>
  [point.x, point.y, point.z].map((value) => value.toFixed(4)).join(",");
const edgeUses = new Map();
for (const surface of building.surfaces) {
  assert.ok(
    new Set(surface.map(pointKey)).size >= 3,
    "Surfaces collapsed by merging should be dropped.",
  );
  surface.forEach((point, index) => {
    const edge = [pointKey(point), pointKey(surface[(index + 1) % surface.length])]
      .sort()
      .join("|");
    edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
  });
}
assert.equal(
  [...edgeUses.values()].filter((uses) => uses % 2 !== 0).length,
  0,
  "Merging near-duplicate vertices must keep the building closed.",
);
