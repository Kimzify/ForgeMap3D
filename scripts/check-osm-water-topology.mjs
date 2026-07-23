import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

function loadTypeScriptModule(filePath) {
  const cached = moduleCache.get(filePath);
  if (cached) {
    return cached.exports;
  }

  const cjsModule = { exports: {} };
  moduleCache.set(filePath, cjsModule);
  const compiled = ts.transpileModule(readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = (specifier) => {
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
  });

  return cjsModule.exports;
}

const { extractOsmWaterPolygons } = loadTypeScriptModule(
  path.join(projectRoot, "lib/osmWaterGeometry.ts"),
);
const boundary = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
];
const projectPoint = (longitude, latitude) => ({
  x: longitude,
  y: latitude,
});
const point = (lon, lat) => ({ lat, lon });
const closedSquare = (minX, minY, maxX, maxY) => [
  point(minX, minY),
  point(maxX, minY),
  point(maxX, maxY),
  point(minX, maxY),
  point(minX, minY),
];

function containsPoint(ring, target) {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (
      (current.y > target.y) !== (previous.y > target.y) &&
      target.x <
        ((previous.x - current.x) * (target.y - current.y)) /
          (previous.y - current.y) +
          current.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

const crossingWay = {
  geometry: closedSquare(-5, -5, 15, 5),
  id: 900001,
  tags: { natural: "water", water: "river" },
  type: "way",
};
const crossingResult = extractOsmWaterPolygons(
  [crossingWay],
  projectPoint,
  boundary,
);
assert.equal(crossingResult.length, 1);
assert.ok(containsPoint(crossingResult[0].points, { x: 0, y: 0 }));
assert.ok(
  crossingResult[0].points.every(
    (entry) =>
      entry.x >= -10 &&
      entry.x <= 10 &&
      entry.y >= -10 &&
      entry.y <= 10,
  ),
  "Boundary-crossing water must be clipped without losing its interior.",
);

const splitRelation = {
  id: 900002,
  members: [
    {
      geometry: [point(-8, -8), point(8, -8), point(8, 8)],
      ref: 910001,
      role: "outer",
      type: "way",
    },
    {
      geometry: [point(8, 8), point(-8, 8), point(-8, -8)],
      ref: 910002,
      role: "outer",
      type: "way",
    },
    {
      geometry: closedSquare(-2, -2, 2, 2),
      ref: 910003,
      role: "inner",
      type: "way",
    },
  ],
  tags: { natural: "water", type: "multipolygon" },
  type: "relation",
};
const relationResult = extractOsmWaterPolygons(
  [splitRelation],
  projectPoint,
  boundary,
);
assert.equal(relationResult.length, 1);
assert.equal(relationResult[0].holes?.length, 1);
assert.ok(containsPoint(relationResult[0].points, { x: 6, y: 0 }));
assert.ok(
  containsPoint(relationResult[0].holes[0], { x: 0, y: 0 }),
  "Multipolygon inner rings must remain holes.",
);

const disconnectedRelation = {
  id: 900003,
  members: [
    {
      geometry: closedSquare(-9, -3, -5, 3),
      ref: 920001,
      role: "outer",
      type: "way",
    },
    {
      geometry: closedSquare(5, -3, 9, 3),
      ref: 920002,
      role: "outer",
      type: "way",
    },
  ],
  tags: { natural: "water", type: "multipolygon" },
  type: "relation",
};
assert.equal(
  extractOsmWaterPolygons(
    [disconnectedRelation],
    projectPoint,
    boundary,
  ).length,
  2,
  "Disconnected relation outers must remain separate water polygons.",
);

const clippedIntoTwoPieces = {
  geometry: [
    point(-15, -8),
    point(15, -8),
    point(15, -3),
    point(-12, -3),
    point(-12, 3),
    point(15, 3),
    point(15, 8),
    point(-15, 8),
    point(-15, -8),
  ],
  id: 900004,
  tags: { natural: "water" },
  type: "way",
};
assert.equal(
  extractOsmWaterPolygons(
    [clippedIntoTwoPieces],
    projectPoint,
    boundary,
  ).length,
  2,
  "Clipping may produce multiple disconnected water pieces.",
);

const malformedRelation = {
  id: 900005,
  members: [
    {
      geometry: [point(-8, 0), point(-4, 4)],
      ref: 930001,
      role: "outer",
      type: "way",
    },
  ],
  tags: { natural: "water", type: "multipolygon" },
  type: "relation",
};
const validNeighbor = {
  geometry: closedSquare(4, -2, 8, 2),
  id: 900006,
  tags: { natural: "water" },
  type: "way",
};
const isolatedResult = extractOsmWaterPolygons(
  [malformedRelation, validNeighbor],
  projectPoint,
  boundary,
);
assert.equal(isolatedResult.length, 1);
assert.ok(
  containsPoint(isolatedResult[0].points, { x: 6, y: 0 }),
  "Malformed water must not remove a separate valid water body.",
);

console.log("Synthetic OSM water topology checks passed.");
