import { APP_TEXT } from "./text";

export const DATA_SOURCES = {
  openStreetMap: {
    name: APP_TEXT.dataSources.openStreetMap.name,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: APP_TEXT.dataSources.openStreetMap.attribution,
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    tilePolicyUrl: "https://operations.osmfoundation.org/policies/tiles/",
  },
  threeDbag: {
    name: APP_TEXT.dataSources.threeDbag.name,
    apiBaseUrl: "https://api.3dbag.nl",
    collectionUrl: "https://api.3dbag.nl/collections/pand",
    docsUrl: "https://docs.3dbag.nl/en/delivery/webservices/",
    copyrightUrl: "https://docs.3dbag.nl/en/copyright/",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: APP_TEXT.dataSources.threeDbag.attribution,
    tilesets: {
      lod22: "https://data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json",
    },
  },
} as const;

export const NETHERLANDS_VIEW = {
  center: {
    latitude: 52.4388,
    longitude: 4.827,
  },
  cameraHeightMeters: 18000,
  boundsWgs84: {
    minLatitude: 50.68,
    maxLatitude: 53.72,
    minLongitude: 3.12,
    maxLongitude: 7.28,
  },
  rdExtent: {
    minX: 10000,
    minY: 306250,
    maxX: 287760,
    maxY: 623690,
  },
} as const;

export function isInsideNetherlands(longitude: number, latitude: number) {
  const bounds = NETHERLANDS_VIEW.boundsWgs84;

  return (
    latitude >= bounds.minLatitude &&
    latitude <= bounds.maxLatitude &&
    longitude >= bounds.minLongitude &&
    longitude <= bounds.maxLongitude
  );
}

export type AppConfig = {
  openStreetMap: typeof DATA_SOURCES.openStreetMap;
  threeDbag: typeof DATA_SOURCES.threeDbag;
  view: typeof NETHERLANDS_VIEW;
};

export const APP_CONFIG: AppConfig = {
  openStreetMap: DATA_SOURCES.openStreetMap,
  threeDbag: DATA_SOURCES.threeDbag,
  view: NETHERLANDS_VIEW,
};
