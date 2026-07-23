import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cesiumBuild = join(projectRoot, "node_modules", "cesium", "Build", "Cesium");
const publicCesium = join(projectRoot, "public", "cesium");
const assetFolders = ["Assets", "ThirdParty", "Workers", "Widgets"];

if (!existsSync(cesiumBuild)) {
  throw new Error(`Cesium build folder was not found at ${cesiumBuild}`);
}

rmSync(publicCesium, { recursive: true, force: true });
mkdirSync(publicCesium, { recursive: true });

for (const folder of assetFolders) {
  cpSync(join(cesiumBuild, folder), join(publicCesium, folder), {
    recursive: true,
  });
}
