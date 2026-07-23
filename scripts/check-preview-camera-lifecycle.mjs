import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  "app/_map-editor/print/PrintableModelPreview.tsx",
  "utf8",
);
const sceneEffectMatch = source.match(
  /useEffect\(\(\) => \{[\s\S]*?new OrbitControls[\s\S]*?\}, \[([\s\S]*?)\]\);/,
);

assert.ok(
  sceneEffectMatch,
  "The preview scene setup effect with OrbitControls should be present.",
);

const dependencies = sceneEffectMatch[1];
const resetTriggers = [
  "errorMessage",
  "isLoading",
  "layers",
  "modelData",
  "modelSettings",
  "radiusMeters",
  "selection",
  "size",
];
const lifecycleResetTriggers = resetTriggers.filter((trigger) =>
  dependencies.includes(trigger),
);

assert.deepEqual(
  lifecycleResetTriggers,
  [],
  "Model/settings/data changes must not recreate OrbitControls because that resets the user's zoom.",
);
