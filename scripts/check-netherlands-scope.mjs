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
assert.equal(
  outsideRouteState.selection,
  null,
  "Outside-Netherlands coordinates should not create a selectable area.",
);
assert.equal(
  outsideRouteState.shouldAutoGeneratePrintModel,
  true,
  "The route parser should preserve the generate flag while rejecting the selection.",
);

console.log("Netherlands-only scope checks passed.");
