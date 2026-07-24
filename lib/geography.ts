import { isInsideNetherlands } from "./dataSources";

const EARTH_RADIUS_METERS = 6_378_137;
export const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
export const WORLDWIDE_OSM_MAX_RADIUS_METERS = 2000;
export const NETHERLANDS_MAX_RADIUS_METERS = 5000;

export type Wgs84Bounds = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export function isSupportedLocation(longitude: number, latitude: number) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -WEB_MERCATOR_MAX_LATITUDE &&
    latitude <= WEB_MERCATOR_MAX_LATITUDE
  );
}

export function maximumRadiusForLocation(
  longitude: number,
  latitude: number,
) {
  return isInsideNetherlands(longitude, latitude)
    ? NETHERLANDS_MAX_RADIUS_METERS
    : WORLDWIDE_OSM_MAX_RADIUS_METERS;
}

export function createLocalMetricProjection(
  centerLongitude: number,
  centerLatitude: number,
) {
  const centerLatitudeRadians = (centerLatitude * Math.PI) / 180;
  const longitudeScale =
    (Math.PI / 180) *
    EARTH_RADIUS_METERS *
    Math.max(Math.cos(centerLatitudeRadians), 0.000001);
  const latitudeScale = (Math.PI / 180) * EARTH_RADIUS_METERS;

  return {
    project(longitude: number, latitude: number) {
      return {
        x: (longitude - centerLongitude) * longitudeScale,
        y: (latitude - centerLatitude) * latitudeScale,
      };
    },
    unproject(x: number, y: number) {
      return {
        latitude: centerLatitude + y / latitudeScale,
        longitude: centerLongitude + x / longitudeScale,
      };
    },
  };
}

export function localBoundsToWgs84(
  centerLongitude: number,
  centerLatitude: number,
  bounds: { maxX: number; maxY: number; minX: number; minY: number },
): Wgs84Bounds {
  const projection = createLocalMetricProjection(
    centerLongitude,
    centerLatitude,
  );
  const southwest = projection.unproject(bounds.minX, bounds.minY);
  const northeast = projection.unproject(bounds.maxX, bounds.maxY);

  return {
    east: northeast.longitude,
    north: northeast.latitude,
    south: southwest.latitude,
    west: southwest.longitude,
  };
}

export function crossesInternationalDateLine(bounds: Wgs84Bounds) {
  return bounds.west < -180 || bounds.east > 180;
}
