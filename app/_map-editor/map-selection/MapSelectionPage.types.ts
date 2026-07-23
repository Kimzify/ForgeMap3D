export type CesiumModule = typeof import("cesium");
export type CesiumViewer = import("cesium").Viewer;
export type CesiumEntity = import("cesium").Entity;
export type CesiumHandler = import("cesium").ScreenSpaceEventHandler;
export type CesiumPositionedEvent =
  import("cesium").ScreenSpaceEventHandler.PositionedEvent;
export type CesiumMotionEvent =
  import("cesium").ScreenSpaceEventHandler.MotionEvent;
export type CesiumCartesian2 = import("cesium").Cartesian2;

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}
