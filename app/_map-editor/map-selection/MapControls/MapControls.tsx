"use client";

import {
  Box,
  CircleDot,
  Hexagon,
  LocateFixed,
  RotateCcw,
  Ruler,
  Search,
  Square,
} from "lucide-react";
import Button from "@/components/Button";
import IconButton from "@/components/IconButton";
import { ICON_SIZES } from "@/lib/constants";
import { APP_TEXT } from "@/lib/text";
import type { SelectionShape } from "@/lib/mapTypes";
import { RADIUS_SLIDER_STEP_METERS } from "../../constants";
import styles from "./MapControls.module.css";
import type { MapControlsProps } from "./MapControls.types";

const MAP_TEXT = APP_TEXT.mapEditor;

export default function MapControls({
  activeDrawShape,
  hasSelection,
  isPrintModelGenerating,
  isSearchLoading,
  isSearchPanelOpen,
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
  selectionShape,
  selectionSizeLabel,
}: MapControlsProps) {
  const displayedShape = activeDrawShape ?? selectionShape;
  const isRadiusEditable = displayedShape !== "rectangle";
  const isToolActive = (shape: SelectionShape) => activeDrawShape === shape;
  const isEditingDisabled = isPrintModelGenerating;

  return (
    <div className={styles.controls} aria-busy={isPrintModelGenerating}>
      <div className={styles.search}>
        <form className={styles.searchForm} onSubmit={onSubmitLocationSearch}>
          <Search aria-hidden="true" size={ICON_SIZES.SEARCH} />
          <input
            aria-label={MAP_TEXT.search.label}
            autoComplete="off"
            disabled={isEditingDisabled}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={MAP_TEXT.search.placeholder}
            type="search"
            value={searchQuery}
          />
        </form>
        {isSearchPanelOpen ? (
          <div className={styles.searchResults}>
            {searchError ? (
              <div className={styles.searchMessage}>{searchError}</div>
            ) : null}
            {!searchError && isSearchLoading ? (
              <div className={styles.searchMessage}>{MAP_TEXT.search.loading}</div>
            ) : null}
            {!searchError && !isSearchLoading
              ? searchResults.map((result) => (
                  <Button
                    className={styles.searchResultButton}
                    key={`${result.id}-${result.latitude}-${result.longitude}`}
                    onClick={() => onFocusLocationSearchResult(result)}
                  >
                    <span>{result.label}</span>
                    <small>{result.type}</small>
                  </Button>
                ))
              : null}
          </div>
        ) : null}
      </div>

      <div className={styles.shapeToolbar} aria-label={MAP_TEXT.aria.areaTools}>
        <div
          className={styles.shapeToolSet}
          role="group"
          aria-label={MAP_TEXT.toolbar.selectionShape}
        >
          <Button
            aria-label={MAP_TEXT.toolbar.drawCircle}
            aria-pressed={isToolActive("circle")}
            active={isToolActive("circle")}
            className={styles.shapeToolButton}
            disabled={isEditingDisabled}
            icon={<CircleDot aria-hidden="true" size={ICON_SIZES.STANDARD} />}
            onClick={() => onToggleShapeDrawing("circle")}
            title={MAP_TEXT.toolbar.drawCircle}
            variant="tool"
          >
            <span>{MAP_TEXT.toolbar.circle}</span>
          </Button>
          <Button
            aria-label={MAP_TEXT.toolbar.drawHexagon}
            aria-pressed={isToolActive("hexagon")}
            active={isToolActive("hexagon")}
            className={styles.shapeToolButton}
            disabled={isEditingDisabled}
            icon={<Hexagon aria-hidden="true" size={ICON_SIZES.STANDARD} />}
            onClick={() => onToggleShapeDrawing("hexagon")}
            title={MAP_TEXT.toolbar.drawHexagon}
            variant="tool"
          >
            <span>{MAP_TEXT.toolbar.hexagon}</span>
          </Button>
          <Button
            aria-label={MAP_TEXT.toolbar.drawRectangle}
            aria-pressed={isToolActive("rectangle")}
            active={isToolActive("rectangle")}
            className={styles.shapeToolButton}
            disabled={isEditingDisabled}
            icon={<Square aria-hidden="true" size={ICON_SIZES.STANDARD} />}
            onClick={() => onToggleShapeDrawing("rectangle")}
            title={MAP_TEXT.toolbar.drawRectangle}
            variant="tool"
          >
            <span>{MAP_TEXT.toolbar.rectangle}</span>
          </Button>
        </div>
        <label className={styles.radiusControl}>
          <Ruler aria-hidden="true" size={ICON_SIZES.RADIUS} />
          {isRadiusEditable ? (
            <input
              aria-label={MAP_TEXT.toolbar.selectionRadius}
              disabled={isEditingDisabled}
              max={maxRadiusMeters}
              min={minRadiusMeters}
              onChange={(event) =>
                onRadiusMetersChange(Number(event.target.value))
              }
              step={RADIUS_SLIDER_STEP_METERS}
              type="range"
              value={radiusMeters}
            />
          ) : null}
          <span className={styles.radiusValue}>{selectionSizeLabel}</span>
        </label>

        <div className={styles.toolbarActionSet}>
          <IconButton
            disabled={isEditingDisabled}
            label={MAP_TEXT.toolbar.resetCamera}
            onClick={onResetCamera}
            title={MAP_TEXT.toolbar.resetCamera}
          >
            <LocateFixed aria-hidden="true" size={ICON_SIZES.STANDARD} />
          </IconButton>
          <IconButton
            disabled={isEditingDisabled}
            label={MAP_TEXT.toolbar.clearArea}
            onClick={onClearSelection}
            title={MAP_TEXT.toolbar.clearArea}
          >
            <RotateCcw aria-hidden="true" size={ICON_SIZES.STANDARD} />
          </IconButton>
          {hasSelection ? (
            <Button
              aria-label={MAP_TEXT.toolbar.generateMap}
              className={styles.toolbarGenerateButton}
              disabled={isPrintModelGenerating}
              icon={<Box aria-hidden="true" size={ICON_SIZES.STANDARD} />}
              onClick={onShowPrintablePreview}
              title={
                isPrintModelGenerating
                  ? MAP_TEXT.toolbar.buildingMap
                  : MAP_TEXT.toolbar.generateMap
              }
              variant="generate"
            >
              <span>
                {isPrintModelGenerating
                  ? MAP_TEXT.toolbar.buildingMap
                  : MAP_TEXT.toolbar.generateMap}
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      {isPrintModelGenerating || printModelGenerationError ? (
        <div
          className={[
            styles.generateStatus,
            printModelGenerationError ? styles.generateStatusError : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
        >
          <div className={styles.generateStatusIcon} aria-hidden="true" />
          <div>
            <strong>
              {printModelGenerationError
                ? MAP_TEXT.status.printModelFailure
                : MAP_TEXT.status.buildingPrintModel}
            </strong>
            <span>
              {printModelGenerationError ??
                MAP_TEXT.status.buildingPrintModelDetail}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
