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
const printModel = loadTypeScriptModule(path.join(projectRoot, "lib/printModel.ts"));
const orientation = loadTypeScriptModule(path.join(projectRoot, "lib/buildingOrientation.ts"));
const THREE = require("three");

// A 10 x 6 x 4 m box with outward-wound faces (counter-clockwise seen from
// outside), as CityJSON stores them.
function boxSurfaces(minX, minY, maxX, maxY, height) {
  const p = (x, y, z) => ({ x, y, z });
  return [
    [p(minX, minY, 0), p(minX, maxY, 0), p(maxX, maxY, 0), p(maxX, minY, 0)],
    [p(minX, minY, height), p(maxX, minY, height), p(maxX, maxY, height), p(minX, maxY, height)],
    [p(minX, minY, 0), p(maxX, minY, 0), p(maxX, minY, height), p(minX, minY, height)],
    [p(maxX, minY, 0), p(maxX, maxY, 0), p(maxX, maxY, height), p(maxX, minY, height)],
    [p(maxX, maxY, 0), p(minX, maxY, 0), p(minX, maxY, height), p(maxX, maxY, height)],
    [p(minX, maxY, 0), p(minX, minY, 0), p(minX, minY, height), p(minX, maxY, height)],
  ];
}

function directedEdgeCounts(surfaces) {
  const key = (point) => `${point.x},${point.y},${point.z}`;
  const counts = new Map();
  for (const surface of surfaces) {
    for (let index = 0; index < surface.length; index += 1) {
      const edge = `${key(surface[index])}|${key(surface[(index + 1) % surface.length])}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  return counts;
}

function signedVolume(surfaces) {
  let volume = 0;
  for (const surface of surfaces) {
    for (let index = 1; index < surface.length - 1; index += 1) {
      const [a, b, c] = [surface[0], surface[index], surface[index + 1]];
      volume +=
        a.x * (b.y * c.z - b.z * c.y) -
        a.y * (b.x * c.z - b.z * c.x) +
        a.z * (b.x * c.y - b.y * c.x);
    }
  }
  return volume / 6;
}

const box = boxSurfaces(-5, -3, 5, 3, 4);
assert.ok(Math.abs(signedVolume(box) - 240) < 1e-9, "The fixture box must face outward.");

// One face wound inward, and a whole box wound inward, must come out
// facing outward with every edge paired.
for (const [description, surfaces] of [
  ["one inward face", box.map((surface, index) => (index === 3 ? [...surface].reverse() : surface))],
  ["an inside-out box", box.map((surface) => [...surface].reverse())],
]) {
  const oriented = orientation.orientBuildingSurfaces(surfaces);
  assert.ok(
    Math.abs(signedVolume(oriented) - 240) < 1e-9,
    `A building with ${description} must face outward.`,
  );
  assert.ok(
    [...directedEdgeCounts(oriented).values()].every((count) => count === 1),
    `A building with ${description} must pair every edge in opposite directions.`,
  );
}

function buildModel(buildings, landCover, configure = () => {}) {
  const settings = printModel.createDefaultPrintableModelSettings();
  configure(settings);
  const input = {
    layers: { buildings: true, landCover: true, roads: false, terrain: false, water: false },
    modelData: {
      buildings,
      generatedAt: "2026-10-05T00:00:00.000Z",
      landCover,
      radiusMeters: 50,
      roads: [],
      sourceCounts: { buildings: buildings.length, buildingSurfaces: 0, landCover: landCover.length, osmElements: 0, roads: 0, water: 0 },
      terrain: null,
      warnings: [],
      water: [],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: { latitude: 52.4017362, longitude: 5.3152422, shape: "circle" },
    size: printModel.getPrintableModelSize(50, settings),
  };
  const group = preview.createPrintableModel(input);
  group.updateMatrixWorld(true);
  const buildingColor = settings.layers.buildings.color.toLowerCase();
  let mesh = null;
  group.traverse((object) => {
    if (object.isMesh && `#${object.material.color.getHexString()}` === buildingColor) {
      mesh = object;
    }
  });
  return { metrics: preview.createModelMetrics(input), mesh, settings };
}

// Every triangle of the printed building must face away from its centre:
// walls whose projection mirrors used to come out wound inward, which
// slicers read as a hollow building and fill with supports.
const { mesh: boxMesh } = buildModel([{ buildingId: "box", id: "box", surfaces: box }], []);
const positions = boxMesh.geometry.getAttribute("position");
const index = boxMesh.geometry.getIndex();
const boxCenter = new THREE.Box3().setFromObject(boxMesh).getCenter(new THREE.Vector3());
const corner = (vertex) =>
  new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(boxMesh.matrixWorld);
for (let triangle = 0; triangle < index.count; triangle += 3) {
  const [a, b, c] = [0, 1, 2].map((offset) => corner(index.getX(triangle + offset)));
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  const outward = a.clone().add(b).add(c).divideScalar(3).sub(boxCenter);
  assert.ok(normal.dot(outward) > 0, "Every building triangle must face outward.");
}

// A garden taller than the land, bordering the building on one side: the
// building must stand on the land, not float at the garden's height.
const tallGarden = (settings) => {
  settings.layers.landCover.landHeightMm = 0.2;
  settings.layers.landCover.categories.grass.extrudedHeightMm = 1;
};
const garden = (minX, maxX) => ({
  category: "grass",
  kind: "garden",
  points: [
    { x: minX, y: -3 },
    { x: maxX, y: -3 },
    { x: maxX, y: 3 },
    { x: minX, y: 3 },
  ],
});
const besideGarden = buildModel([{ buildingId: "box", id: "box", surfaces: box }], [garden(5, 15)], tallGarden);
const besideBottom = new THREE.Box3().setFromObject(besideGarden.mesh).min.y;
assert.ok(
  Math.abs(besideBottom - (besideGarden.metrics.surfaceY + 0.2)) < 0.01,
  "A building next to a garden must stand on the land, not float at the garden's height.",
);
const inGarden = buildModel([{ buildingId: "box", id: "box", surfaces: box }], [garden(-15, 15)], tallGarden);
assert.ok(
  new THREE.Box3().setFromObject(inGarden.mesh).min.y > besideBottom + 0.5,
  "A building standing inside a garden must rise to the garden's top.",
);

console.log("Building orientation checks passed.");
