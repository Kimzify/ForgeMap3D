"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_CONFIG, type AppConfig } from "@/lib/dataSources";
import type { PrintableModelData } from "@/lib/printModel";
import { APP_TEXT } from "@/lib/text";
import type {
  MapSelection,
  SelectionCenter,
  SelectionShape,
} from "@/lib/mapTypes";
import { selectionShape } from "@/lib/mapTypes";
import {
  rectangleSelectionFromCenter,
  selectionDimensions,
  selectionLocalFootprint,
} from "@/lib/selectionGeometry";
import { lngLatToRd, rdToLngLat } from "@/lib/rd";
import TopBar from "@/components/TopBar";
import {
  CAMERA_MAXIMUM_ZOOM_DISTANCE_METERS,
  CAMERA_MINIMUM_ZOOM_DISTANCE_METERS,
  CAMERA_RESET_DURATION_SECONDS,
  CESIUM_BASE_URL_PATH,
  LOCATION_SEARCH_DEBOUNCE_MS,
  LOCATION_FOCUS_DURATION_SECONDS,
  LOCATION_SEARCH_CAMERA_HEIGHT_RATIO,
  MAX_RADIUS_METERS,
  MAP_READY_MIN_SIZE_PX,
  MIN_RADIUS_METERS,
  MIN_LOCATION_SEARCH_CAMERA_HEIGHT_METERS,
  OSM_IMAGERY_MAXIMUM_LEVEL,
  OSM_IMAGERY_TILE_URL,
  SELECTION_ENTITY_HEIGHT_METERS,
  SELECTION_FILL_ALPHA,
  SELECTION_FILL_COLOR,
  SELECTION_OUTLINE_COLOR,
  SELECTION_OUTLINE_WIDTH_PX,
  SELECTION_POINT_PIXEL_SIZE,
} from "../constants";
import {
  clampRadiusMeters,
} from "../utils/format";
import {
  createPrintUrl,
  getMapEditorRouteState,
  selectionQueryParams,
} from "../utils/urlState";
import { writeCachedPrintModel } from "../print/printModelCache";
import MapPane from "./MapPane";
import type {
  LocationSearchOptions,
  LocationSearchResult,
} from "../types";
import type {
  CesiumCartesian2,
  CesiumEntity,
  CesiumHandler,
  CesiumModule,
  CesiumMotionEvent,
  CesiumPositionedEvent,
  CesiumViewer,
} from "./MapSelectionPage.types";

const MAP_TEXT = APP_TEXT.mapEditor;
const MAP_STATUS = APP_TEXT.mapEditor.status;
const DIAMETER_MULTIPLIER = 2;

function clampRectangleSideMeters(value: number) {
  return clampRadiusMeters(
    value / DIAMETER_MULTIPLIER,
    MIN_RADIUS_METERS,
    MAX_RADIUS_METERS,
  ) * DIAMETER_MULTIPLIER;
}

function selectionRadiusMeters(
  nextSelection: MapSelection,
  fallbackRadiusMeters: number,
) {
  if (nextSelection.shape === "rectangle") {
    return clampRadiusMeters(
      Math.max(nextSelection.widthMeters, nextSelection.heightMeters) /
        DIAMETER_MULTIPLIER,
      MIN_RADIUS_METERS,
      MAX_RADIUS_METERS,
    );
  }

  return fallbackRadiusMeters;
}

function selectionSizeLabel(
  selection: MapSelection | null,
  radiusMeters: number,
) {
  const dimensions = selectionDimensions(selection, radiusMeters);

  if (selection?.shape === "rectangle") {
    return `${dimensions.widthMeters.toLocaleString()} ${APP_TEXT.common.units.metersShort}`;
  }

  return `${dimensions.radiusMeters.toLocaleString()} ${APP_TEXT.common.units.metersShort}`;
}

function centeredSelectionForShape(
  center: SelectionCenter,
  shape: SelectionShape,
  radiusMeters: number,
  currentSelection: MapSelection | null,
): MapSelection {
  if (shape === "rectangle") {
    const dimensions = selectionDimensions(currentSelection, radiusMeters);
    return rectangleSelectionFromCenter(
      center,
      dimensions.widthMeters,
      dimensions.widthMeters,
    );
  }

  return {
    ...center,
    shape,
  };
}

function rectangleSelectionFromCenterDrag(
  center: SelectionCenter,
  end: SelectionCenter,
) {
  const startRd = lngLatToRd(center.longitude, center.latitude);
  const endRd = lngLatToRd(end.longitude, end.latitude);
  const deltaX = endRd.x - startRd.x;
  const deltaY = endRd.y - startRd.y;
  const sideMeters = clampRectangleSideMeters(
    Math.max(Math.abs(deltaX), Math.abs(deltaY)) * DIAMETER_MULTIPLIER,
  );

  return rectangleSelectionFromCenter(
    center,
    sideMeters,
    sideMeters,
  );
}

function selectionDistanceMeters(start: SelectionCenter, end: SelectionCenter) {
  const startRd = lngLatToRd(start.longitude, start.latitude);
  const endRd = lngLatToRd(end.longitude, end.latitude);

  return Math.hypot(endRd.x - startRd.x, endRd.y - startRd.y);
}

function readyStatusForShape(shape: SelectionShape) {
  if (shape === "hexagon") {
    return MAP_STATUS.hexagonDrawReady;
  }

  if (shape === "rectangle") {
    return MAP_STATUS.rectangleDrawReady;
  }

  return MAP_STATUS.circleDrawReady;
}

function dragStatusForShape(shape: SelectionShape) {
  if (shape === "hexagon") {
    return MAP_STATUS.dragToSetHexagonSize;
  }

  if (shape === "rectangle") {
    return MAP_STATUS.dragToSetRectangleSize;
  }

  return MAP_STATUS.dragToSetCircleSize;
}

function drawingStatusForSelection(
  selection: MapSelection,
  radiusMeters: number,
) {
  if (selection.shape === "hexagon") {
    return MAP_STATUS.drawingHexagon(radiusMeters.toLocaleString());
  }

  if (selection.shape === "rectangle") {
    return MAP_STATUS.drawingRectangle(selection.widthMeters.toLocaleString());
  }

  return MAP_STATUS.drawingCircle(radiusMeters.toLocaleString());
}

function apiErrorMessage(
  payload: PrintableModelData | { error?: string } | null,
) {
  return payload && "error" in payload ? payload.error : null;
}

export default function MapSelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const routeState = useMemo(
    () => getMapEditorRouteState(new URLSearchParams(routeQuery)),
    [routeQuery],
  );
  const mapRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const clickHandlerRef = useRef<CesiumHandler | null>(null);
  const selectionEntityRef = useRef<CesiumEntity | null>(null);
  const drawStartRef = useRef<SelectionCenter | null>(null);
  const drawShapeRef = useRef<SelectionShape | null>(null);
  const draftSelectionRef = useRef<MapSelection | null>(routeState.selection);
  const draftRadiusRef = useRef(routeState.radiusMeters);
  const pendingDraftRadiusRef = useRef<number | null>(null);
  const pendingDraftSelectionRef = useRef<MapSelection | null>(null);
  const draftRadiusAnimationFrameRef = useRef<number | null>(null);
  const activeDrawShapeRef = useRef<SelectionShape | null>(null);
  const wasCameraInputEnabledRef = useRef(true);
  const printModelControllerRef = useRef<AbortController | null>(null);
  const searchDebounceTimerRef = useRef<number | null>(null);
  const selectedSearchLabelRef = useRef<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const autoGenerateQueryRef = useRef<string | null>(null);

  const [config, setConfig] = useState<AppConfig>(APP_CONFIG);
  const [selection, setSelection] = useState<MapSelection | null>(
    routeState.selection,
  );
  const [radiusMeters, setRadiusMeters] = useState(routeState.radiusMeters);
  const [mapStatus, setMapStatus] = useState<string>(
    MAP_STATUS.loadingMapData,
  );
  const [areaStatus, setAreaStatus] = useState<string>(
    routeState.selection ? MAP_STATUS.areaSelected : MAP_STATUS.noAreaSelected,
  );
  const [activeDrawShape, setActiveDrawShape] =
    useState<SelectionShape | null>(null);
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [isPrintModelGenerating, setIsPrintModelGenerating] = useState(false);
  const [printModelGenerationError, setPrintModelGenerationError] =
    useState<string | null>(null);

  const attribution = useMemo(
    () => ({
      osm: config.openStreetMap,
      threeDbag: config.threeDbag,
    }),
    [config],
  );
  const selectedLatitude = selection?.latitude ?? null;
  const selectedLongitude = selection?.longitude ?? null;
  const selectedSelectionShape = selectionShape(selection);

  useEffect(() => {
    activeDrawShapeRef.current = activeDrawShape;
  }, [activeDrawShape]);

  useEffect(() => {
    draftSelectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    draftRadiusRef.current = radiusMeters;
    viewerRef.current?.scene.requestRender();
  }, [radiusMeters]);

  const resetCamera = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;

    if (!viewer || !Cesium) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        config.view.center.longitude,
        config.view.center.latitude,
        config.view.cameraHeightMeters,
      ),
      duration: CAMERA_RESET_DURATION_SECONDS,
    });
  }, [config]);

  const focusLocationSearchResult = useCallback(
    (result: LocationSearchResult, closePanel = true) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      const center = {
        latitude: result.latitude,
        longitude: result.longitude,
      };
      const nextShape = activeDrawShapeRef.current ?? selectionShape(selection);
      const nextSelection = centeredSelectionForShape(
        center,
        nextShape,
        radiusMeters,
        selection,
      );
      const nextRadiusMeters = selectionRadiusMeters(
        nextSelection,
        radiusMeters,
      );

      if (draftRadiusAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(draftRadiusAnimationFrameRef.current);
        draftRadiusAnimationFrameRef.current = null;
      }

      drawStartRef.current = null;
      drawShapeRef.current = null;
      pendingDraftRadiusRef.current = null;
      pendingDraftSelectionRef.current = null;
      draftSelectionRef.current = nextSelection;
      draftRadiusRef.current = nextRadiusMeters;
      setActiveDrawShape(null);
      setIsDrawingSelection(false);
      setSelection(nextSelection);
      setRadiusMeters(nextRadiusMeters);
      setAreaStatus(MAP_STATUS.areaSelected);
      selectedSearchLabelRef.current = result.label;
      setSearchQuery(result.label);
      setSearchError(null);

      if (closePanel) {
        setSearchResults([]);
        setIsSearchPanelOpen(false);
      }

      if (!viewer || !Cesium) {
        return;
      }

      viewer.scene.screenSpaceCameraController.enableInputs =
        wasCameraInputEnabledRef.current;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          result.longitude,
          result.latitude,
          Math.max(
            config.view.cameraHeightMeters * LOCATION_SEARCH_CAMERA_HEIGHT_RATIO,
            MIN_LOCATION_SEARCH_CAMERA_HEIGHT_METERS,
          ),
        ),
        duration: LOCATION_FOCUS_DURATION_SECONDS,
      });
      viewer.scene.requestRender();
    },
    [config.view.cameraHeightMeters, radiusMeters, selection],
  );

  const runLocationSearch = useCallback(
    async (
      query: string,
      { selectFirst = false, signal }: LocationSearchOptions = {},
    ) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        searchRequestIdRef.current += 1;
        setSearchResults([]);
        setSearchError(MAP_TEXT.search.required);
        setIsSearchPanelOpen(true);
        return;
      }

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setIsSearchLoading(true);
      setSearchError(null);
      setSearchResults([]);
      setIsSearchPanelOpen(true);

      try {
        const params = new URLSearchParams({ q: trimmedQuery });
        const response = await fetch(`/api/location/search?${params}`, {
          cache: "no-store",
          signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              results?: LocationSearchResult[];
            }
          | null;

        if (signal?.aborted || searchRequestIdRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            payload?.error ?? MAP_TEXT.search.failedWithStatus(response.status),
          );
        }

        const results = payload?.results ?? [];
        setSearchResults(results);

        if (results.length === 0) {
          setSearchError(MAP_TEXT.search.noResults);
          setIsSearchPanelOpen(true);
          return;
        }

        if (selectFirst) {
          focusLocationSearchResult(results[0], results.length === 1);
          setIsSearchPanelOpen(results.length > 1);
        }
      } catch (error) {
        if (signal?.aborted || searchRequestIdRef.current !== requestId) {
          return;
        }

        const message =
          error instanceof Error ? error.message : MAP_TEXT.search.failed;
        setSearchError(message);
        setIsSearchPanelOpen(true);
      } finally {
        if (!signal?.aborted && searchRequestIdRef.current === requestId) {
          setIsSearchLoading(false);
        }
      }
    },
    [focusLocationSearchResult],
  );

  const submitLocationSearch = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      await runLocationSearch(searchQuery, { selectFirst: true });
    },
    [runLocationSearch, searchQuery],
  );

  const queueLocationSearch = useCallback(
    (query: string) => {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }

      const trimmedQuery = query.trim();
      if (!trimmedQuery || trimmedQuery === selectedSearchLabelRef.current) {
        return;
      }

      searchDebounceTimerRef.current = window.setTimeout(() => {
        searchDebounceTimerRef.current = null;
        void runLocationSearch(trimmedQuery);
      }, LOCATION_SEARCH_DEBOUNCE_MS);
    },
    [runLocationSearch],
  );

  const handleSearchQueryChange = useCallback(
    (nextQuery: string) => {
      selectedSearchLabelRef.current = null;
      setSearchQuery(nextQuery);
      setSearchError(null);
      queueLocationSearch(nextQuery);

      if (!nextQuery.trim()) {
        searchRequestIdRef.current += 1;
        setSearchResults([]);
        setIsSearchLoading(false);
        setIsSearchPanelOpen(false);
      }
    },
    [queueLocationSearch],
  );

  useEffect(() => {
    return () => {
      printModelControllerRef.current?.abort();
      printModelControllerRef.current = null;

      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
    };
  }, []);

  const clearSelection = useCallback(() => {
    const viewer = viewerRef.current;

    if (viewer && selectionEntityRef.current) {
      viewer.entities.remove(selectionEntityRef.current);
      selectionEntityRef.current = null;
      viewer.scene.requestRender();
    }

    if (viewer) {
      viewer.scene.screenSpaceCameraController.enableInputs =
        wasCameraInputEnabledRef.current;
    }

    drawStartRef.current = null;
    drawShapeRef.current = null;
    draftSelectionRef.current = null;
    pendingDraftSelectionRef.current = null;
    setActiveDrawShape(null);
    setIsDrawingSelection(false);
    setSelection(null);
    setAreaStatus(MAP_STATUS.noAreaSelected);
    router.replace("/");
  }, [router]);

  const toggleShapeDrawing = useCallback((shape: SelectionShape) => {
    const nextShape =
      activeDrawShape === shape && !isDrawingSelection ? null : shape;
    setActiveDrawShape(nextShape);

    if (nextShape) {
      setAreaStatus(readyStatusForShape(nextShape));
    } else if (!drawStartRef.current) {
      setAreaStatus(
        selection ? MAP_STATUS.areaSelected : MAP_STATUS.noAreaSelected,
      );
    }
  }, [activeDrawShape, isDrawingSelection, selection]);

  const showPrintablePreview = useCallback(() => {
    if (!selection) {
      return;
    }

    const nextSelection = selection;
    const selectionQuery = selectionQueryParams(nextSelection, radiusMeters);
    const controller = new AbortController();

    printModelControllerRef.current?.abort();
    printModelControllerRef.current = controller;
    setIsPrintModelGenerating(true);
    setPrintModelGenerationError(null);
    setAreaStatus(MAP_STATUS.loadingPrintModel);

    async function buildPrintModel() {
      try {
        const response = await fetch(`/api/print-model?${selectionQuery}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | PrintableModelData
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            apiErrorMessage(payload) ??
              MAP_STATUS.requestFailedWithStatus(response.status),
          );
        }

        if (!payload || apiErrorMessage(payload)) {
          throw new Error(apiErrorMessage(payload) ?? MAP_STATUS.printModelFailure);
        }

        const modelData = payload as PrintableModelData;
        writeCachedPrintModel(selectionQuery, modelData);
        setAreaStatus(
          modelData.warnings.length > 0
            ? MAP_STATUS.printModelReadyWithWarnings
            : MAP_STATUS.printModelReady,
        );
        router.push(createPrintUrl(nextSelection, radiusMeters));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : MAP_STATUS.printModelFailure;
        setPrintModelGenerationError(message);
        setAreaStatus(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsPrintModelGenerating(false);
          printModelControllerRef.current = null;
        }
      }
    }

    void buildPrintModel();
  }, [radiusMeters, router, selection]);

  useEffect(() => {
    if (
      !routeState.shouldAutoGeneratePrintModel ||
      !selection ||
      isPrintModelGenerating
    ) {
      return;
    }

    const selectionQuery = selectionQueryParams(selection, radiusMeters);
    if (autoGenerateQueryRef.current === selectionQuery) {
      return;
    }

    autoGenerateQueryRef.current = selectionQuery;
    showPrintablePreview();
  }, [
    isPrintModelGenerating,
    radiusMeters,
    routeState.shouldAutoGeneratePrintModel,
    selection,
    showPrintablePreview,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) {
          throw new Error(MAP_STATUS.configFailedWithStatus(response.status));
        }

        const nextConfig = (await response.json()) as AppConfig;
        if (isMounted) {
          setConfig(nextConfig);
        }
      } catch {
        if (isMounted) {
          setConfig(APP_CONFIG);
        }
      }
    }

    void loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || viewerRef.current) {
      return;
    }

    let hasStarted = false;
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function bootMap() {
      setMapStatus(MAP_STATUS.loadingCesium);
      window.CESIUM_BASE_URL = CESIUM_BASE_URL_PATH;

      const Cesium = await import("cesium");

      if (isCancelled || !mapRef.current) {
        return;
      }

      const mapRect = mapRef.current.getBoundingClientRect();
      if (
        mapRect.width <= MAP_READY_MIN_SIZE_PX ||
        mapRect.height <= MAP_READY_MIN_SIZE_PX
      ) {
        hasStarted = false;
        return;
      }

      cesiumRef.current = Cesium;

      const osmCreditHtml = `<a href="${config.openStreetMap.copyrightUrl}" target="_blank">${APP_TEXT.dataSources.openStreetMap.contributors}</a>`;
      const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
        url: OSM_IMAGERY_TILE_URL,
        credit: new Cesium.Credit(osmCreditHtml, true),
        maximumLevel: OSM_IMAGERY_MAXIMUM_LEVEL,
      });

      const viewer = new Cesium.Viewer(mapRef.current, {
        animation: false,
        baseLayer: new Cesium.ImageryLayer(imageryProvider),
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        vrButton: false,
        mapMode2D: Cesium.MapMode2D.INFINITE_SCROLL,
        mapProjection: new Cesium.WebMercatorProjection(),
        requestRenderMode: true,
        sceneMode: Cesium.SceneMode.SCENE2D,
        maximumRenderTimeChange: Infinity,
      });

      viewerRef.current = viewer;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.depthTestAgainstTerrain = false;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = false;
      }
      const cameraController = viewer.scene.screenSpaceCameraController;
      cameraController.enableLook = false;
      cameraController.enableRotate = false;
      cameraController.enableTilt = false;
      cameraController.enableTranslate = true;
      cameraController.minimumZoomDistance = CAMERA_MINIMUM_ZOOM_DISTANCE_METERS;
      cameraController.maximumZoomDistance = CAMERA_MAXIMUM_ZOOM_DISTANCE_METERS;
      const initialSelection = draftSelectionRef.current;
      const initialCameraCenter = initialSelection ?? config.view.center;
      const initialCameraHeightMeters = initialSelection
        ? Math.max(
            config.view.cameraHeightMeters * LOCATION_SEARCH_CAMERA_HEIGHT_RATIO,
            MIN_LOCATION_SEARCH_CAMERA_HEIGHT_METERS,
          )
        : config.view.cameraHeightMeters;
      viewer.scene.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialCameraCenter.longitude,
          initialCameraCenter.latitude,
          initialCameraHeightMeters,
        ),
      });

      setMapStatus(
        draftSelectionRef.current
          ? MAP_STATUS.areaSelected
          : MAP_STATUS.noAreaSelected,
      );
      setIsViewerReady(true);
      viewer.scene.requestRender();

      const pointFromScreenPosition = (position: CesiumCartesian2) => {
        const cartesian = viewer.camera.pickEllipsoid(
          position,
          viewer.scene.globe.ellipsoid,
        );

        if (!cartesian) {
          return null;
        }

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        return {
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
        };
      };
      const queueDraftState = (
        nextSelection: MapSelection,
        nextRadius: number,
      ) => {
        draftSelectionRef.current = nextSelection;
        draftRadiusRef.current = nextRadius;
        pendingDraftSelectionRef.current = nextSelection;
        pendingDraftRadiusRef.current = nextRadius;
        viewer.scene.requestRender();

        if (draftRadiusAnimationFrameRef.current === null) {
          draftRadiusAnimationFrameRef.current = window.requestAnimationFrame(() => {
            const pendingSelection = pendingDraftSelectionRef.current;
            const pendingRadius = pendingDraftRadiusRef.current;
            draftRadiusAnimationFrameRef.current = null;
            pendingDraftSelectionRef.current = null;
            pendingDraftRadiusRef.current = null;

            if (!pendingSelection || pendingRadius === null) {
              return;
            }

            setSelection(pendingSelection);
            setRadiusMeters(pendingRadius);
            setAreaStatus(
              drawingStatusForSelection(pendingSelection, pendingRadius),
            );
          });
        }
      };
      const updateSelectionDraft = (edge: SelectionCenter) => {
        const start = drawStartRef.current;
        const shape = drawShapeRef.current;
        if (!start || !shape) {
          return;
        }

        if (shape === "rectangle") {
          const nextSelection = rectangleSelectionFromCenterDrag(start, edge);
          queueDraftState(
            nextSelection,
            selectionRadiusMeters(nextSelection, draftRadiusRef.current),
          );
          return;
        }

        const nextRadius = clampRadiusMeters(
          selectionDistanceMeters(start, edge),
          MIN_RADIUS_METERS,
          MAX_RADIUS_METERS,
        );
        queueDraftState(
          {
            ...start,
            shape,
          },
          nextRadius,
        );
      };
      const finishSelectionDraft = (edge: SelectionCenter | null) => {
        if (edge) {
          updateSelectionDraft(edge);
        }

        if (draftRadiusAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(draftRadiusAnimationFrameRef.current);
          draftRadiusAnimationFrameRef.current = null;
        }

        const finalRadius = pendingDraftRadiusRef.current ?? draftRadiusRef.current;
        const finalSelection =
          pendingDraftSelectionRef.current ?? draftSelectionRef.current;
        pendingDraftSelectionRef.current = null;
        pendingDraftRadiusRef.current = null;
        if (finalSelection) {
          draftSelectionRef.current = finalSelection;
          setSelection(finalSelection);
        }
        draftRadiusRef.current = finalRadius;
        setRadiusMeters(finalRadius);

        if (drawStartRef.current) {
          setAreaStatus(MAP_STATUS.areaSelected);
        }

        drawStartRef.current = null;
        drawShapeRef.current = null;
        setActiveDrawShape(null);
        setIsDrawingSelection(false);
        viewer.scene.screenSpaceCameraController.enableInputs =
          wasCameraInputEnabledRef.current;
        viewer.scene.requestRender();
      };
      const drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      drawHandler.setInputAction((event: CesiumPositionedEvent) => {
        const shape = activeDrawShapeRef.current;
        if (!shape) {
          return;
        }

        const center = pointFromScreenPosition(event.position);
        if (!center) {
          return;
        }

        wasCameraInputEnabledRef.current =
          viewer.scene.screenSpaceCameraController.enableInputs;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
        draftRadiusRef.current = MIN_RADIUS_METERS;
        pendingDraftRadiusRef.current = null;
        pendingDraftSelectionRef.current = null;
        if (draftRadiusAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(draftRadiusAnimationFrameRef.current);
          draftRadiusAnimationFrameRef.current = null;
        }
        drawStartRef.current = center;
        drawShapeRef.current = shape;
        const initialSelection = centeredSelectionForShape(
          center,
          shape,
          MIN_RADIUS_METERS,
          shape === "rectangle" ? null : draftSelectionRef.current,
        );
        draftSelectionRef.current = initialSelection;
        setIsDrawingSelection(true);
        setSelection(initialSelection);
        setRadiusMeters(MIN_RADIUS_METERS);
        setAreaStatus(dragStatusForShape(shape));
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
      drawHandler.setInputAction((event: CesiumMotionEvent) => {
        if (!drawStartRef.current) {
          return;
        }

        const edge = pointFromScreenPosition(event.endPosition);
        if (edge) {
          updateSelectionDraft(edge);
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      drawHandler.setInputAction((event: CesiumPositionedEvent) => {
        if (!drawStartRef.current) {
          return;
        }

        finishSelectionDraft(pointFromScreenPosition(event.position));
      }, Cesium.ScreenSpaceEventType.LEFT_UP);
      clickHandlerRef.current = drawHandler;
    }

    const startWhenMapHasSize = () => {
      const mapElement = mapRef.current;
      if (!mapElement || viewerRef.current || hasStarted || isCancelled) {
        return;
      }

      const { height, width } = mapElement.getBoundingClientRect();
      if (
        width <= MAP_READY_MIN_SIZE_PX ||
        height <= MAP_READY_MIN_SIZE_PX
      ) {
        setMapStatus(MAP_STATUS.waitingForLayout);
        return;
      }

      hasStarted = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      void bootMap();
    };

    resizeObserver = new ResizeObserver(startWhenMapHasSize);
    resizeObserver.observe(mapRef.current);
    startWhenMapHasSize();

    return () => {
      isCancelled = true;
      resizeObserver?.disconnect();
      clickHandlerRef.current?.destroy();
      clickHandlerRef.current = null;
      drawStartRef.current = null;
      drawShapeRef.current = null;
      draftSelectionRef.current = null;
      pendingDraftSelectionRef.current = null;
      pendingDraftRadiusRef.current = null;
      if (draftRadiusAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(draftRadiusAnimationFrameRef.current);
        draftRadiusAnimationFrameRef.current = null;
      }
      setActiveDrawShape(null);
      setIsDrawingSelection(false);
      setIsViewerReady(false);

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.screenSpaceCameraController.enableInputs =
          wasCameraInputEnabledRef.current;
        viewerRef.current.destroy();
      }

      viewerRef.current = null;
      selectionEntityRef.current = null;
    };
  }, [config]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;

    if (!viewer || !Cesium) {
      return;
    }

    if (selectionEntityRef.current) {
      viewer.entities.remove(selectionEntityRef.current);
      selectionEntityRef.current = null;
    }

    if (selectedLatitude === null || selectedLongitude === null) {
      viewer.scene.requestRender();
      return;
    }

    const position = new Cesium.CallbackPositionProperty(() => {
      const currentSelection = draftSelectionRef.current;
      return Cesium.Cartesian3.fromDegrees(
        currentSelection?.longitude ?? selectedLongitude,
        currentSelection?.latitude ?? selectedLatitude,
      );
    }, false);
    const point = {
      color: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString(SELECTION_OUTLINE_COLOR),
      outlineWidth: SELECTION_OUTLINE_WIDTH_PX,
      pixelSize: SELECTION_POINT_PIXEL_SIZE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    };
    const material = Cesium.Color.fromCssColorString(
      SELECTION_FILL_COLOR,
    ).withAlpha(SELECTION_FILL_ALPHA);
    const outlineColor = Cesium.Color.fromCssColorString(SELECTION_OUTLINE_COLOR);

    if (selectedSelectionShape === "circle") {
      selectionEntityRef.current = viewer.entities.add({
        position,
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(
            () => draftRadiusRef.current,
            false,
          ),
          semiMinorAxis: new Cesium.CallbackProperty(
            () => draftRadiusRef.current,
            false,
          ),
          material,
          outline: true,
          outlineColor,
          outlineWidth: SELECTION_OUTLINE_WIDTH_PX,
          height: SELECTION_ENTITY_HEIGHT_METERS,
        },
        point,
      });
      viewer.scene.requestRender();
      return;
    }

    selectionEntityRef.current = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.CallbackProperty(() => {
          const currentSelection = draftSelectionRef.current;
          if (!currentSelection) {
            return new Cesium.PolygonHierarchy([]);
          }

          const centerRd = lngLatToRd(
            currentSelection.longitude,
            currentSelection.latitude,
          );
          const positions = selectionLocalFootprint(
            currentSelection,
            draftRadiusRef.current,
          ).flatMap((point) => {
            const coordinate = rdToLngLat(
              centerRd.x + point.x,
              centerRd.y + point.y,
            );

            return [coordinate.longitude, coordinate.latitude];
          });

          return new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(positions),
          );
        }, false),
        material,
        outline: true,
        outlineColor,
        outlineWidth: SELECTION_OUTLINE_WIDTH_PX,
        height: SELECTION_ENTITY_HEIGHT_METERS,
      },
      point,
      position,
    });

    viewer.scene.requestRender();
  }, [isViewerReady, selectedLatitude, selectedLongitude, selectedSelectionShape]);

  const topStatus =
    mapStatus === MAP_STATUS.loadingMapData ||
    mapStatus === MAP_STATUS.loadingCesium ||
    mapStatus === MAP_STATUS.waitingForLayout
      ? mapStatus
      : areaStatus;
  const activeToolbarShape = activeDrawShape ?? selectedSelectionShape;
  const toolbarSizeLabel =
    activeToolbarShape === "rectangle" && selection?.shape !== "rectangle"
      ? `${(radiusMeters * DIAMETER_MULTIPLIER).toLocaleString()} ${
          APP_TEXT.common.units.metersShort
        }`
      : selectionSizeLabel(selection, radiusMeters);

  return (
    <main className="editor-shell">
      <TopBar status={topStatus} />

      <section className="workspace map-workspace" aria-label={MAP_TEXT.aria.mapEditor}>
        <MapPane
          activeDrawShape={activeDrawShape}
          attribution={attribution}
          isDrawingSelection={isDrawingSelection}
          isDrawModeArmed={activeDrawShape !== null}
          isPrintModelGenerating={isPrintModelGenerating}
          isSearchLoading={isSearchLoading}
          isSearchPanelOpen={isSearchPanelOpen}
          mapRef={mapRef}
          maxRadiusMeters={MAX_RADIUS_METERS}
          minRadiusMeters={MIN_RADIUS_METERS}
          onClearSelection={clearSelection}
          onFocusLocationSearchResult={focusLocationSearchResult}
          onRadiusMetersChange={setRadiusMeters}
          onResetCamera={resetCamera}
          onSearchQueryChange={handleSearchQueryChange}
          onShowPrintablePreview={showPrintablePreview}
          onSubmitLocationSearch={submitLocationSearch}
          onToggleShapeDrawing={toggleShapeDrawing}
          printModelGenerationError={printModelGenerationError}
          radiusMeters={radiusMeters}
          searchError={searchError}
          searchQuery={searchQuery}
          searchResults={searchResults}
          selection={selection}
          selectionShape={selectedSelectionShape}
          selectionSizeLabel={toolbarSizeLabel}
        />
      </section>
    </main>
  );
}
