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
  });

  return cjsModule.exports;
}

const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);

const settings = printModel.createDefaultPrintableModelSettings();
settings.layers.buildings.heightExaggeration = 2;

const modelData = {
  buildings: [
    {
      buildingId: "test-building",
      id: "test-building",
      surfaces: [
        [
          { x: 0, y: 0, z: 100 },
          { x: 1, y: 0, z: 100 },
          { x: 1, y: 1, z: 100 },
        ],
      ],
    },
  ],
  generatedAt: "2026-08-25T00:00:00.000Z",
  landCover: [],
  radiusMeters: 500,
  roads: [],
  sourceCounts: {
    buildings: 1,
    buildingSurfaces: 1,
    landCover: 0,
    osmElements: 1,
    roads: 0,
    water: 0,
  },
  sources: {
    buildings: "openStreetMap",
    openStreetMap: true,
    overtureMaps: false,
    terrain: false,
    threeDbag: false,
  },
  terrain: null,
  warnings: [],
  water: [],
  waterLines: [],
};

const dynamicSize = printModel.getPrintableModelSize(500, settings, {
  layers: {
    buildings: true,
    landCover: false,
    roads: false,
    terrain: false,
    water: false,
  },
  modelData,
});

assert.equal(
  dynamicSize.heightMm,
  32.2,
  `Final height should include base plus scaled active buildings, got ${dynamicSize.heightMm}mm.`,
);

const buildingsDisabledSize = printModel.getPrintableModelSize(500, settings, {
  layers: {
    buildings: false,
    landCover: false,
    roads: false,
    terrain: false,
    water: false,
  },
  modelData,
});

assert.equal(
  buildingsDisabledSize.heightMm,
  2,
  `Disabled buildings should not affect final height, got ${buildingsDisabledSize.heightMm}mm.`,
);

settings.dimensions.lockModelHeight = true;
const lockedSize = printModel.getPrintableModelSize(500, settings, {
  layers: {
    buildings: true,
    landCover: false,
    roads: false,
    terrain: false,
    water: false,
  },
  modelData,
});

assert.equal(
  lockedSize.heightMm,
  13,
  `Locked model height should keep the fixed height budget, got ${lockedSize.heightMm}mm.`,
);

console.log("Printable size height checks passed.");
