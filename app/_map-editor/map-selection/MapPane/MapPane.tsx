"use client";

import MapAttribution from "../MapAttribution";
import MapControls from "../MapControls";
import styles from "./MapPane.module.css";
import type { MapPaneProps } from "./MapPane.types";

export default function MapPane({
  activeDrawShape,
  attribution,
  isDrawingSelection,
  isDrawModeArmed,
  isPrintModelGenerating,
  isSearchLoading,
  isSearchPanelOpen,
  mapRef,
  maxRadiusMeters,
  minRadiusMeters,
  onClearSelection,
  onFocusLocationSearchResult,
  onRadiusMetersChange,
  onResetCamera,
  onSearchQueryChange,
  onShowPrintablePreview,
  onSubmitLocationSearch,
  onToggleShapeDrawing,
  printModelGenerationError,
  radiusMeters,
  searchError,
  searchQuery,
  searchResults,
  selection,
  selectionShape,
  selectionSizeLabel,
}: MapPaneProps) {
  const paneClassName = [
    styles.pane,
    isDrawModeArmed ? styles.drawMode : "",
    isDrawingSelection ? styles.drawingSelection : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={paneClassName}>
      <div ref={mapRef} className={styles.mapCanvas} />

      <MapControls
        activeDrawShape={activeDrawShape}
        hasSelection={selection !== null}
        isPrintModelGenerating={isPrintModelGenerating}
        isSearchLoading={isSearchLoading}
        isSearchPanelOpen={isSearchPanelOpen}
        maxRadiusMeters={maxRadiusMeters}
        minRadiusMeters={minRadiusMeters}
        onClearSelection={onClearSelection}
        onFocusLocationSearchResult={onFocusLocationSearchResult}
        onRadiusMetersChange={onRadiusMetersChange}
        onResetCamera={onResetCamera}
        onSearchQueryChange={onSearchQueryChange}
        onShowPrintablePreview={onShowPrintablePreview}
        onSubmitLocationSearch={onSubmitLocationSearch}
        onToggleShapeDrawing={onToggleShapeDrawing}
        printModelGenerationError={printModelGenerationError}
        radiusMeters={radiusMeters}
        searchError={searchError}
        searchQuery={searchQuery}
        searchResults={searchResults}
        selectionShape={selectionShape}
        selectionSizeLabel={selectionSizeLabel}
      />

      <MapAttribution attribution={attribution} />
    </div>
  );
}
