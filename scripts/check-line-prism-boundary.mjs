import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile("lib/printGeometry.ts", "utf8");
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

const { clipPlanarSegmentToCircle, linePrismCenterlineRadius } =
  cjsModule.exports;

const terrainRadiusMm = 50;
const halfWidthMm = 3;
const start = { x: 40, z: -20 };
const end = { x: terrainRadiusMm, z: 20 };
const clippedSegment = clipPlanarSegmentToCircle(
  start,
  end,
  linePrismCenterlineRadius(terrainRadiusMm, halfWidthMm),
);

assert.ok(clippedSegment, "The inset line segment should still be printable.");

const deltaX = clippedSegment.end.x - clippedSegment.start.x;
const deltaZ = clippedSegment.end.z - clippedSegment.start.z;
const length = Math.hypot(deltaX, deltaZ);
const normalX = (-deltaZ / length) * halfWidthMm;
const normalZ = (deltaX / length) * halfWidthMm;
const currentPrismCorners = [
  {
    x: clippedSegment.start.x + normalX,
    z: clippedSegment.start.z + normalZ,
  },
  {
    x: clippedSegment.start.x - normalX,
    z: clippedSegment.start.z - normalZ,
  },
  { x: clippedSegment.end.x - normalX, z: clippedSegment.end.z - normalZ },
  { x: clippedSegment.end.x + normalX, z: clippedSegment.end.z + normalZ },
];
const maxCornerRadius = Math.max(
  ...currentPrismCorners.map((point) => Math.hypot(point.x, point.z)),
);

assert.ok(
  maxCornerRadius <= terrainRadiusMm,
  `Line prism corners must stay inside the terrain circle. Saw ${maxCornerRadius.toFixed(
    3,
  )}mm outside ${terrainRadiusMm}mm.`,
);
