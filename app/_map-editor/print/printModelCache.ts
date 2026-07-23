import type { PrintableModelData } from "@/lib/printModel";

const PRINT_MODEL_CACHE_PREFIX = "forgemap3d:print-model:";
const printModelCache = new Map<string, PrintableModelData>();

function cacheKey(selectionQuery: string) {
  return `${PRINT_MODEL_CACHE_PREFIX}${selectionQuery}`;
}

export function readCachedPrintModel(selectionQuery: string) {
  return printModelCache.get(cacheKey(selectionQuery)) ?? null;
}

export function writeCachedPrintModel(
  selectionQuery: string,
  modelData: PrintableModelData,
) {
  printModelCache.set(cacheKey(selectionQuery), modelData);
}
