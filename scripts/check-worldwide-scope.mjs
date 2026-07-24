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
      jsx: ts.JsxEmit.ReactJSX,
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
    URLSearchParams,
  });

  return cjsModule.exports;
}

const dataSources = loadTypeScriptModule(
  path.join(projectRoot, "lib/dataSources.ts"),
);
const urlState = loadTypeScriptModule(
  path.join(projectRoot, "app/_map-editor/utils/urlState.ts"),
);
const geography = loadTypeScriptModule(
  path.join(projectRoot, "lib/geography.ts"),
);
const osmLandCover = loadTypeScriptModule(
  path.join(projectRoot, "lib/osmLandCover.ts"),
);

assert.equal(
  dataSources.isInsideNetherlands(4.8869109, 52.3711258),
  true,
  "Amsterdam coordinates should be inside the supported scope.",
);
assert.equal(
  dataSources.isInsideNetherlands(-0.1395703, 51.4891908),
  false,
  "London coordinates should be outside the supported scope.",
);
assert.equal(
  dataSources.buildingSourceForLocation(51.3401616, 35.761063),
  "overtureMaps",
  "Foreign locations should use Overture's enriched building footprints.",
);
assert.equal(
  dataSources.buildingSourceForLocation(4.8869109, 52.3711258),
  "threeDbag",
  "Dutch locations should keep using 3DBAG building meshes.",
);
assert.equal(
  osmLandCover.osmLandCoverKind({ leisure: "park" }),
  "park",
  "OSM parks should be classified as printable green space.",
);
assert.equal(
  osmLandCover.osmLandCoverKind({ leisure: "garden" }),
  "garden",
  "OSM gardens should be classified as printable green space.",
);
assert.match(
  osmLandCover.osmLandCoverQuery(
    {
      east: 51.3467263,
      north: 35.76639,
      south: 35.755736,
      west: 51.3335969,
    },
    20,
  ),
  /way\["leisure"~"park\|garden\|nature_reserve"\]/,
  "The land-cover query should request parks, gardens, and nature reserves.",
);

const dutchRouteState = urlState.getMapEditorRouteState(
  new URLSearchParams("lat=52.3711258&lng=4.8869109&radius=421"),
);
assert.ok(
  dutchRouteState.selection,
  "Dutch coordinates should create a selectable area.",
);

const outsideRouteState = urlState.getMapEditorRouteState(
  new URLSearchParams("lat=51.4891908&lng=-0.1395703&radius=746&generate=1"),
);
assert.ok(
  outsideRouteState.selection,
  "Outside-Netherlands coordinates should create a selectable OSM area.",
);
assert.equal(
  outsideRouteState.shouldAutoGeneratePrintModel,
  true,
  "The route parser should preserve the generate flag for worldwide selections.",
);

const cappedOutsideRouteState = urlState.getMapEditorRouteState(
  new URLSearchParams("lat=35.6764&lng=139.65&radius=5000"),
);
assert.equal(
  cappedOutsideRouteState.radiusMeters,
  2000,
  "OSM-only selections should be capped at a 2 km radius.",
);

const polarRouteState = urlState.getMapEditorRouteState(
  new URLSearchParams("lat=89&lng=0&radius=500"),
);
assert.equal(
  polarRouteState.selection,
  null,
  "Locations outside Web Mercator bounds should be rejected.",
);

const projection = geography.createLocalMetricProjection(-0.1395703, 51.4891908);
const projectedCenter = projection.project(-0.1395703, 51.4891908);
assert.ok(Math.abs(projectedCenter.x) < 1e-8);
assert.ok(Math.abs(projectedCenter.y) < 1e-8);
const roundTrip = projection.unproject(1000, -750);
const projectedRoundTrip = projection.project(
  roundTrip.longitude,
  roundTrip.latitude,
);
assert.ok(Math.abs(projectedRoundTrip.x - 1000) < 1e-6);
assert.ok(Math.abs(projectedRoundTrip.y + 750) < 1e-6);

console.log("Worldwide scope checks passed.");
