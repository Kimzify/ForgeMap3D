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
const THREE = require("three");

const p = (x, y, z) => ({ x, y, z });
// An outward-wound box building over x 3..10, y -3..3, 6 m tall.
const building = {
  buildingId: "quay-house",
  id: "quay-house",
  surfaces: [
    [p(3, -3, 0), p(3, 3, 0), p(10, 3, 0), p(10, -3, 0)],
    [p(3, -3, 6), p(10, -3, 6), p(10, 3, 6), p(3, 3, 6)],
    [p(3, -3, 0), p(10, -3, 0), p(10, -3, 6), p(3, -3, 6)],
    [p(10, -3, 0), p(10, 3, 0), p(10, 3, 6), p(10, -3, 6)],
    [p(10, 3, 0), p(3, 3, 0), p(3, 3, 6), p(10, 3, 6)],
    [p(3, 3, 0), p(3, -3, 0), p(3, -3, 6), p(3, 3, 6)],
  ],
};

for (const terrain of [false, true]) {
  const settings = printModel.createDefaultPrintableModelSettings();
  settings.layers.water.sinkDepthMm = 1.5;
  const input = {
    layers: { buildings: true, landCover: true, roads: true, terrain, water: true },
    modelData: {
      buildings: [building],
      generatedAt: "2026-10-05T00:00:00.000Z",
      landCover: [],
      radiusMeters: 50,
      // A sidewalk along the other quay that reaches 1 m into the canal.
      roadSurfaces: [
        {
          category: "sidewalks",
          kind: "road:sidewalks",
          points: [
            { x: -9, y: -20 },
            { x: -4, y: -20 },
            { x: -4, y: 20 },
            { x: -9, y: 20 },
          ],
        },
      ],
      roads: [],
      sourceCounts: { buildings: 1, buildingSurfaces: 6, landCover: 0, osmElements: 0, roads: 1, water: 1 },
      terrain: terrain
        ? {
            attribution: "Synthetic flat terrain",
            columns: 2,
            elevations: [0, 0, 0, 0],
            maxElevationMeters: 0,
            minElevationMeters: 0,
            minX: -50,
            minY: -50,
            rows: 2,
            source: "opentopodata-srtm30m",
            spacingMeters: 100,
          }
        : null,
      warnings: [],
      // The mapped canal (x -5..5) runs 2 m under the house and 1 m under
      // the sidewalk.
      water: [
        {
          kind: "canal",
          points: [
            { x: -5, y: -60 },
            { x: 5, y: -60 },
            { x: 5, y: 60 },
            { x: -5, y: 60 },
          ],
        },
      ],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: { latitude: 52.3711258, longitude: 4.8869109, shape: "circle" },
    size: printModel.getPrintableModelSize(50, settings),
  };
  const group = preview.createPrintableModel(input);
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object.isMesh) {
      object.material.side = THREE.DoubleSide;
    }
  });
  const h = preview.createModelMetrics(input).horizontalScale;
  const waterColor = settings.layers.water.color.toLowerCase();
  const column = (x, y) =>
    new THREE.Raycaster(new THREE.Vector3(x * h, 100, -y * h), new THREE.Vector3(0, -1, 0))
      .intersectObject(group, true)
      .map((hit) => ({
        color: `#${hit.object.material.color.getHexString()}`,
        up: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0,
        y: hit.point.y,
      }));
  // Every downward face in the column must rest on an upward face at the
  // same height: no gap a slicer would have to support.
  const assertResting = (x, y, description) => {
    const hits = column(x, y);
    for (const bottom of hits.filter((hit) => !hit.up && hit.y > 0.01)) {
      assert.ok(
        hits.some((hit) => hit.up && Math.abs(hit.y - bottom.y) < 1e-3),
        `${description} must stand on solid ground, not over the carved canal (terrain ${terrain}).`,
      );
    }
    assert.ok(
      hits.every((hit) => hit.color !== waterColor),
      `${description} must not have water carved under it (terrain ${terrain}).`,
    );
  };

  assertResting(4, 0, "A house reaching over the mapped canal");
  assertResting(-4.5, 0, "A sidewalk reaching over the mapped canal");
  assert.equal(
    column(0, 0)[0]?.color,
    waterColor,
    `The open canal must still be carved (terrain ${terrain}).`,
  );
}

console.log("Solid ground checks passed.");
