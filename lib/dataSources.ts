import { APP_TEXT } from "./text";

export const DATA_SOURCES = {
  overtureMaps: {
    name: APP_TEXT.dataSources.overtureMaps.name,
    attribution: APP_TEXT.dataSources.overtureMaps.attribution,
    attributionUrl: "https://docs.overturemaps.org/attribution/",
    docsUrl: "https://docs.overturemaps.org/guides/buildings/",
  },
  openStreetMap: {
    name: APP_TEXT.dataSources.openStreetMap.name,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: APP_TEXT.dataSources.openStreetMap.attribution,
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    tilePolicyUrl: "https://operations.osmfoundation.org/policies/tiles/",
  },
  openTopoData: {
    name: APP_TEXT.dataSources.openTopoData.name,
    datasetName: APP_TEXT.dataSources.openTopoData.dataName,
    apiBaseUrl: "https://api.opentopodata.org/v1/srtm30m",
    attribution: APP_TEXT.dataSources.openTopoData.attribution,
    attributionUrl: "https://www.opentopodata.org/datasets/srtm/",
    licenseUrl:
      "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm",
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

const SRTM_MIN_LATITUDE = -60;
const SRTM_MAX_LATITUDE = 60;

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

export function buildingSourceForLocation(
  longitude: number,
  latitude: number,
) {
  return isInsideNetherlands(longitude, latitude)
    ? "threeDbag"
    : "overtureMaps";
}

export function isInsideSrtmLatitudeCoverage(latitude: number) {
  return latitude >= SRTM_MIN_LATITUDE && latitude <= SRTM_MAX_LATITUDE;
}

export function intersectsSrtmLatitudeCoverage(south: number, north: number) {
  return south <= SRTM_MAX_LATITUDE && north >= SRTM_MIN_LATITUDE;
}

export type AppConfig = {
  overtureMaps: typeof DATA_SOURCES.overtureMaps;
  openStreetMap: typeof DATA_SOURCES.openStreetMap;
  openTopoData: typeof DATA_SOURCES.openTopoData;
  threeDbag: typeof DATA_SOURCES.threeDbag;
  view: typeof NETHERLANDS_VIEW;
};

export const APP_CONFIG: AppConfig = {
  overtureMaps: DATA_SOURCES.overtureMaps,
  openStreetMap: DATA_SOURCES.openStreetMap,
  openTopoData: DATA_SOURCES.openTopoData,
  threeDbag: DATA_SOURCES.threeDbag,
  view: NETHERLANDS_VIEW,
};
