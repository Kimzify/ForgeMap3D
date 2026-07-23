import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile("lib/printBoundary.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const cjsModule = { exports: {} };

vm.runInNewContext(compiled, {
  exports: cjsModule.exports,
  module: cjsModule,
  require,
});

const { isSurfaceInsideCircle } = cjsModule.exports;
const radiusMeters = 5;
const partlyOutsideSurface = [
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0 },
  { x: 0, y: 0, z: 6 },
];
const fullyInsideSurface = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 0, y: 3, z: 6 },
];

assert.equal(
  isSurfaceInsideCircle(partlyOutsideSurface, radiusMeters),
  false,
  "A building surface with any XY vertex outside the selected circle must be rejected.",
);
assert.equal(
  isSurfaceInsideCircle(fullyInsideSurface, radiusMeters),
  true,
  "A building surface with all XY vertices inside the selected circle should be kept.",
);
