import type { FormEvent, RefObject } from "react";
import type { MapSelection, SelectionShape } from "@/lib/mapTypes";
import type {
  LocationSearchResult,
  MapAttribution as Attribution,
} from "../../types";

export type MapPaneProps = {
  activeDrawShape: SelectionShape | null;
  attribution: Attribution;
  isDrawingSelection: boolean;
  isDrawModeArmed: boolean;
  isPrintModelGenerating: boolean;
  isSearchLoading: boolean;
  isSearchPanelOpen: boolean;
  mapRef: RefObject<HTMLDivElement | null>;
  maxRadiusMeters: number;
  minRadiusMeters: number;
  onClearSelection: () => void;
  onFocusLocationSearchResult: (result: LocationSearchResult) => void;
  onRadiusMetersChange: (radiusMeters: number) => void;
  onResetCamera: () => void;
  onSearchQueryChange: (query: string) => void;
  onShowPrintablePreview: () => void;
  onSubmitLocationSearch: (event: FormEvent<HTMLFormElement>) => void;
  onToggleShapeDrawing: (shape: SelectionShape) => void;
  printModelGenerationError: string | null;
  radiusMeters: number;
  searchError: string | null;
  searchQuery: string;
  searchResults: LocationSearchResult[];
  selection: MapSelection | null;
  selectionShape: SelectionShape;
  selectionSizeLabel: string;
};
