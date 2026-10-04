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

// 3DBAG buildings that cross the selection edge must be trimmed to it and
// closed with a wall on the edge, not lose every surface that crosses it.
const centerRd = { x: 150000, y: 480000 };
const boundary = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
];

function boxBuilding(id, [minX, minY, maxX, maxY], height) {
  const vertices = [
    [minX, minY, 0],
    [maxX, minY, 0],
    [maxX, maxY, 0],
    [minX, maxY, 0],
    [minX, minY, height],
    [maxX, minY, height],
    [maxX, maxY, height],
    [minX, maxY, height],
  ];
  const faces = [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  return { faces, id, vertices };
}

function tileFor(buildings) {
  const vertices = [];
  const CityObjects = {};
  for (const building of buildings) {
    const offset = vertices.length;
    vertices.push(...building.vertices);
    CityObjects[building.id] = { type: "Building" };
    CityObjects[`${building.id}-0`] = {
      geometry: [
        {
          boundaries: [
            building.faces.map((face) => [face.map((index) => index + offset)]),
          ],
          lod: "2.2",
          type: "Solid",
        },
      ],
      parents: [building.id],
      type: "BuildingPart",
    };
  }
  return {
    CityObjects,
    transform: { scale: [1, 1, 1], translate: [centerRd.x, centerRd.y, 0] },
    vertices,
  };
}

const pointKey = (point) =>
  [point.x, point.y, point.z].map((value) => value.toFixed(3)).join(",");

function openEdgeCount(surfaces) {
  const edgeUses = new Map();
  for (const surface of surfaces) {
    surface.forEach((point, index) => {
      const edge = [pointKey(point), pointKey(surface[(index + 1) % surface.length])]
        .sort()
        .join("|");
      edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
    });
  }
  return [...edgeUses.values()].filter((uses) => uses !== 2).length;
}

function enclosedVolume(surfaces) {
  let volume = 0;
  for (const surface of surfaces) {
    for (let index = 1; index + 1 < surface.length; index += 1) {
      const [a, b, c] = [surface[0], surface[index], surface[index + 1]];
      volume +=
        (a.x * (b.y * c.z - b.z * c.y) -
          a.y * (b.x * c.z - b.z * c.x) +
          a.z * (b.x * c.y - b.y * c.x)) /
        6;
    }
  }
  return volume;
}

// Ground vertices are raised to the 0.02 m minimum height.
const cases = [
  { bounds: [-3, -3, 3, 3], height: 5, id: "inside", volume: 6 * 6 * 4.98 },
  { bounds: [5, -3, 15, 3], height: 6, id: "edge", volume: 5 * 6 * 5.98 },
  { bounds: [5, 5, 15, 15], height: 4, id: "corner", volume: 5 * 5 * 3.98 },
];
const extracted = new Map(
  route
    .extractBuildingsFromCityJsonTiles(
      [
        tileFor([
          ...cases.map(({ bounds, height, id }) => boxBuilding(id, bounds, height)),
          boxBuilding("outside", [12, -3, 18, 3], 5),
        ]),
      ],
      centerRd,
      boundary,
    )
    .map((building) => [building.id, building]),
);

assert.equal(
  extracted.has("outside"),
  false,
  "Buildings entirely outside the selection should be dropped.",
);
for (const { id, volume } of cases) {
  const building = extracted.get(id);
  assert.ok(building, `The ${id} building should be kept.`);
  assert.equal(
    openEdgeCount(building.surfaces),
    0,
    `The ${id} building should stay a closed solid after clipping.`,
  );
  assert.ok(
    building.surfaces
      .flat()
      .every((point) => Math.abs(point.x) <= 10.001 && Math.abs(point.y) <= 10.001),
    `The ${id} building should not extend past the selection edge.`,
  );
  assert.ok(
    Math.abs(Math.abs(enclosedVolume(building.surfaces)) - volume) < 0.01,
    `The ${id} building should keep exactly its part inside the selection; got ${enclosedVolume(building.surfaces)} m3, expected ${volume} m3.`,
  );
}
