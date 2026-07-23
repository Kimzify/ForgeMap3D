export type SelectionShape = "circle" | "hexagon" | "rectangle";

export type SelectionCenter = {
  latitude: number;
  longitude: number;
};

export type CircleSelection = SelectionCenter & {
  shape?: "circle";
};

export type HexagonSelection = SelectionCenter & {
  shape: "hexagon";
};

export type RectangleSelection = SelectionCenter & {
  heightMeters: number;
  shape: "rectangle";
  widthMeters: number;
};

export type MapSelection =
  | CircleSelection
  | HexagonSelection
  | RectangleSelection;

export type AreaSummary = {
  selection: MapSelection & {
    radiusMeters: number;
  };
  crs: string;
  bboxRd: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  threeDbag: {
    numberMatched: number | null;
    numberReturned: number | null;
    timeStamp: string | null;
    source: string;
  };
};

export function selectionShape(selection: MapSelection | null): SelectionShape {
  return selection?.shape ?? "circle";
}
