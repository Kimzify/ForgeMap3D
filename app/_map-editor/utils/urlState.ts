import type { MapSelection, SelectionShape } from "@/lib/mapTypes";
import { selectionShape } from "@/lib/mapTypes";
import { isInsideNetherlands } from "@/lib/dataSources";
import {
  COORDINATE_QUERY_DECIMAL_PLACES,
  DEFAULT_RADIUS_METERS,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
} from "../constants";
import { clampRadiusMeters } from "./format";

const LATITUDE_PARAM = "lat";
const LONGITUDE_PARAM = "lng";
const RADIUS_PARAM = "radius";
const HEIGHT_PARAM = "height";
const SHAPE_PARAM = "shape";
const WIDTH_PARAM = "width";
const GENERATE_PARAM = "generate";
const DIAMETER_MULTIPLIER = 2;

type ReadableSearchParams = {
  get: (name: string) => string | null;
};

export type MapEditorRouteState = {
  shouldAutoGeneratePrintModel: boolean;
  radiusMeters: number;
  selection: MapSelection | null;
};

function readNumberParam(searchParams: ReadableSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readSelectionShape(searchParams: ReadableSearchParams): SelectionShape {
  const shape = searchParams.get(SHAPE_PARAM);

  return shape === "hexagon" || shape === "rectangle" ? shape : "circle";
}

function clampRectangleSideMeters(value: number | null) {
  if (value === null) {
    return DEFAULT_RADIUS_METERS * DIAMETER_MULTIPLIER;
  }

  return clampRadiusMeters(
    value / DIAMETER_MULTIPLIER,
    MIN_RADIUS_METERS,
    MAX_RADIUS_METERS,
  ) * DIAMETER_MULTIPLIER;
}

export function selectionQueryParams(
  selection: MapSelection,
  radiusMeters: number,
) {
  const shape = selectionShape(selection);
  const params = new URLSearchParams({
    [LATITUDE_PARAM]: selection.latitude.toFixed(COORDINATE_QUERY_DECIMAL_PLACES),
    [LONGITUDE_PARAM]: selection.longitude.toFixed(
      COORDINATE_QUERY_DECIMAL_PLACES,
    ),
    [RADIUS_PARAM]: String(
      clampRadiusMeters(radiusMeters, MIN_RADIUS_METERS, MAX_RADIUS_METERS),
    ),
  });

  if (shape !== "circle") {
    params.set(SHAPE_PARAM, shape);
  }

  if (selection.shape === "rectangle") {
    params.set(
      WIDTH_PARAM,
      selection.widthMeters.toFixed(COORDINATE_QUERY_DECIMAL_PLACES),
    );
    params.set(
      HEIGHT_PARAM,
      selection.heightMeters.toFixed(COORDINATE_QUERY_DECIMAL_PLACES),
    );
  }

  return params.toString();
}

export function getMapEditorRouteState(
  searchParams: ReadableSearchParams,
): MapEditorRouteState {
  const latitude = readNumberParam(searchParams, LATITUDE_PARAM);
  const longitude = readNumberParam(searchParams, LONGITUDE_PARAM);
  const shape = readSelectionShape(searchParams);
  const radius =
    readNumberParam(searchParams, RADIUS_PARAM) ?? DEFAULT_RADIUS_METERS;
  const widthMeters = clampRectangleSideMeters(
    readNumberParam(searchParams, WIDTH_PARAM),
  );
  const heightMeters = clampRectangleSideMeters(
    readNumberParam(searchParams, HEIGHT_PARAM),
  );
  const sideMeters = Math.max(widthMeters, heightMeters);
  const radiusMeters =
    shape === "rectangle"
      ? clampRadiusMeters(
          sideMeters / DIAMETER_MULTIPLIER,
          MIN_RADIUS_METERS,
          MAX_RADIUS_METERS,
        )
      : clampRadiusMeters(radius, MIN_RADIUS_METERS, MAX_RADIUS_METERS);
  const selection =
    latitude === null ||
    longitude === null ||
    !isInsideNetherlands(longitude, latitude)
      ? null
      : shape === "rectangle"
        ? {
            heightMeters: sideMeters,
            latitude,
            longitude,
            shape,
            widthMeters: sideMeters,
          }
        : {
            latitude,
            longitude,
            shape,
          };

  return {
    radiusMeters,
    shouldAutoGeneratePrintModel: searchParams.get(GENERATE_PARAM) === "1",
    selection,
  };
}

export function createMapSelectionUrl(
  selection: MapSelection | null,
  radiusMeters: number,
  options: { generate?: boolean } = {},
) {
  if (!selection) {
    return "/";
  }

  const params = new URLSearchParams(selectionQueryParams(selection, radiusMeters));

  if (options.generate) {
    params.set(GENERATE_PARAM, "1");
  }

  return `/?${params.toString()}`;
}

export function createPrintUrl(
  selection: MapSelection,
  radiusMeters: number,
) {
  return `/print?${selectionQueryParams(selection, radiusMeters)}`;
}
