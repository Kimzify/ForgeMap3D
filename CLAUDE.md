# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Forge Map 3D: a Next.js (App Router, React 19, TypeScript) app that turns a real-world area into a 3D-printable model (STL + color OBJ/MTL zip). Map data comes from OpenStreetMap (Overpass), Overture Maps buildings (PMTiles), 3DBAG LoD2.2 meshes (Netherlands only), Open Topo Data SRTM elevation, and Nominatim search. Node 22+. Licensed AGPL-3.0-only.

## Commands

```bash
npm ci               # also runs postinstall: copies Cesium assets into public/cesium (gitignored)
npm run dev          # next dev --webpack on :3000
npm run check        # full release gate (CI runs this on Node 22 & 24): typecheck + lint + test + build
npm run typecheck
npm run lint
npm test             # runs every scripts/check-*.mjs listed in package.json, sequentially
node scripts/check-water-visibility.mjs   # run a single regression check
docker compose up --build
```

Webpack is required (`--webpack` in dev/build): `next.config.mjs` aliases `@spz-loader/core` to a stub, defines `CESIUM_BASE_URL`, and stubs Node builtins for Cesium.

## Tests

There is no test framework. Each `scripts/check-*.mjs` is a standalone Node script using `node:assert/strict`. They load `.ts`/`.tsx` sources directly by transpiling with the `typescript` package and running them in a `vm` context with a custom `require` that resolves `@/` paths, stubs `*.module.css`, and stubs a few three.js addons. Some checks append an `export { ... }` line to a source file to reach internal (non-exported) functions — e.g. `PrintableModelPreview.tsx`'s `createPrintableModel`, `addOpenStreetMapLayers`. If you rename such internal functions, update the corresponding check script.

- `npm test` must stay offline and deterministic — use small fixtures (`scripts/fixtures/`) and assert on output geometry, not live services.
- A new check script must be added to the `test` script in `package.json` to run. `check-osm-water-topology.mjs` and `check-preview-camera-lifecycle.mjs` exist but are not part of `npm test`.

## Architecture

Two-step UI flow, both under `app/_map-editor/`:

1. **Map selection** (`/`, `map-selection/MapSelectionPage.tsx`): Cesium globe, location search (`/api/location/search`), shape (circle/square/hexagon) and radius selection. Generating calls `GET /api/print-model?<selection query>`, stores the resulting `PrintableModelData` in the in-memory client cache (`print/printModelCache.ts`), then navigates to `/print`.
2. **Print** (`/print`, `print/PrintPage`): reads the cached model by the same selection query (refetches if missing), and renders `PrintableModelPreview` plus settings panels. `usePrintSettings.ts` owns layer/model settings state.

Selection state lives in the URL (`utils/urlState.ts`: `selectionQueryParams`, `createPrintUrl`, `getMapEditorRouteState`); user-chosen generation defaults persist in localStorage (`utils/localDefaults.ts`, versioned schema).

**Server side — `app/api/print-model/route.ts`** (Node runtime, large single file): fetches and normalizes all source data into local metric coordinates (meters, centered on the selection) and clips it to the selection boundary:
- OSM roads/water/land cover/buildings via Overpass, with endpoint fallback order: Tracestrack (if `TRACESTRACK_API_KEY`) → `OVERPASS_INTERPRETER_URLS` → built-in public mirrors; in-memory TTL + stale caches.
- Buildings: 3DBAG CityJSON tiles inside the Netherlands, else Overture footprints (`lib/overtureBuildings.ts`), else OSM with estimated heights.
- Terrain grid from Open Topo Data (rate-limited, spaced requests, cached).
- Water fetch failures intentionally fail the request rather than produce a wrong map.

**Client side — `PrintableModelPreview.tsx`** (large file): builds the three.js scene from `PrintableModelData` + settings (base, frame, terrain relief, water mask, land cover, roads as line prisms, buildings/LoD2.2 solids), and performs STL export and OBJ/MTL zip creation (custom `createZip`) in the browser.

**Shared `lib/`**:
- `printModel.ts` — central types (`PrintableModelData`, `PrintableModelSettings`, layers, road/land-cover categories), defaults, limits, and sizing (`getPrintableModelSize`). Start here when adding a setting.
- `geography.ts` / `selectionGeometry.ts` / `printBoundary.ts` — local metric projection, supported-location and radius limits (2 km worldwide, 5 km in NL), selection footprints, boundary tests.
- `osmWaterGeometry.ts`, `printWaterGeometry.ts`, `osmLandCover.ts` — water polygon assembly and water masking; land cover must not cover water.
- `dataSources.ts` — source metadata/attribution, NL bounds, app config (exposed via `/api/config`). Keep attribution visible when touching sources.
- `rd.ts` — Dutch RD (EPSG:28992) conversions for 3DBAG.
- `text.ts` — UI strings.

UI primitives live in `components/` (each as `Name/Name.tsx`, `Name.types.ts`, `Name.module.css`, `index.ts`); follow the same folder pattern for new components.

## Contribution conventions

- Never commit generated STL/OBJ/MTL/ZIP files, API keys, or personal location data.
- Document new env vars in `.env.example` (all current ones are optional).
- Map-data changes: verify inside the Netherlands (3DBAG available) and outside it (Overture/OSM fallback); document new upstream terms, rate limits, and attribution.
- UI changes: PRs include desktop and mobile screenshots.
