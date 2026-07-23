import type { MapSelection } from "@/lib/mapTypes";
import type {
  getPrintableModelSize,
  PrintableLayers,
  PrintableModelData,
  PrintableModelSettings,
} from "@/lib/printModel";

export type PrintableModelPreviewProps = {
  errorMessage: string | null;
  isLoading: boolean;
  layers: PrintableLayers;
  modelData: PrintableModelData | null;
  modelSettings: PrintableModelSettings;
  radiusMeters: number;
  selection: MapSelection;
};

export type PrintableModelPreviewHandle = {
  exportArchive: () => Promise<void>;
};

export type PrintableSize = ReturnType<typeof getPrintableModelSize>;

export type ModelInput = PrintableModelPreviewProps & {
  size: PrintableSize;
};

export type ArchiveFile = {
  data: Uint8Array;
  name: string;
};

export type ObjMtlExport = {
  mtl: string;
  obj: string;
};

export type ModelMetrics = {
  baseHeightMm: number;
  frameHeightMm: number;
  frameWidthMm: number;
  horizontalScale: number;
  surfaceY: number;
  terrainRadiusMm: number;
  totalRadiusMm: number;
  verticalScale: number;
};

export type PreviewView = {
  cameraDistance: number;
  cameraFarPlane: number;
  gridPositionY: number;
  gridSize: number;
  targetY: number;
  viewHeight: number;
  viewRadius: number;
};
