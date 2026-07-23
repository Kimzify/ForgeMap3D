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
  (source) =>
    `${source}\nexport { createPrintableModel, createSlicerExportModel };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

const settings = printModel.createDefaultPrintableModelSettings();
const size = printModel.getPrintableModelSize(421, settings);
const input = {
  errorMessage: null,
  isLoading: false,
  layers: {
    buildings: true,
    landCover: true,
    roads: true,
    water: true,
  },
  modelData: {
    buildings: [],
    generatedAt: "2026-07-23T00:00:00.000Z",
    landCover: [],
    radiusMeters: 421,
    roads: [],
    sourceCounts: {
      buildings: 0,
      buildingSurfaces: 0,
      landCover: 0,
      osmElements: 0,
      roads: 0,
      water: 0,
    },
    warnings: [],
    water: [],
    waterLines: [],
  },
  modelSettings: settings,
  radiusMeters: 421,
  selection: {
    latitude: 52.3711258,
    longitude: 4.8869109,
    shape: "circle",
  },
  size,
};

const exportModel = preview.createPrintableModel(input);
const slicerExportModel = preview.createSlicerExportModel(exportModel);

const bounds = new THREE.Box3().setFromObject(slicerExportModel);
const spans = new THREE.Vector3();
bounds.getSize(spans);

assert.ok(
  spans.z < spans.x * 0.25 && spans.z < spans.y * 0.25,
  `Export should be flat on the slicer bed with height on Z. Got spans x=${spans.x.toFixed(3)}, y=${spans.y.toFixed(3)}, z=${spans.z.toFixed(3)}.`,
);

console.log("Export orientation checks passed.");
