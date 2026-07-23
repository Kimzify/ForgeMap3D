import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "app/_map-editor/print/PrintPage/PrintPage.tsx",
  "utf8",
);

const exportStart = source.indexOf("const exportPrintableModel = useCallback");
const setExporting = source.indexOf("setIsExporting(true)", exportStart);
const paintYield = source.indexOf("await waitForNextPaint()", exportStart);
const exportArchive = source.indexOf("exportArchive()", exportStart);

assert.ok(exportStart >= 0, "PrintPage should define exportPrintableModel.");
assert.ok(setExporting >= 0, "Export should enter an exporting state.");
assert.ok(paintYield >= 0, "Export should yield to the browser paint loop.");
assert.ok(exportArchive >= 0, "Export should call exportArchive.");
assert.ok(
  setExporting < paintYield && paintYield < exportArchive,
  "Export should set loading, wait for paint, then start archive generation.",
);

console.log("Export loading paint-yield checks passed.");
