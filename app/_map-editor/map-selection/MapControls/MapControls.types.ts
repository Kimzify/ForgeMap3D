import type { FormEvent } from "react";
import type { SelectionShape } from "@/lib/mapTypes";
import type { LocationSearchResult } from "../../types";

export type MapControlsProps = {
  activeDrawShape: SelectionShape | null;
  hasSelection: boolean;
  isPrintModelGenerating: boolean;
  isSearchLoading: boolean;
  isSearchPanelOpen: boolean;
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
  selectionShape: SelectionShape;
  selectionSizeLabel: string;
};
