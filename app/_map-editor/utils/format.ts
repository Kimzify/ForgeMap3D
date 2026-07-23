import type { SelectionCenter } from "@/lib/mapTypes";
import {
  DEFAULT_DECIMAL_FRACTION_DIGITS,
  NUMBER_FORMAT_LOCALE,
} from "@/lib/constants";

const COORDINATE_RADIANS_DIVISOR = 180;
const MIDPOINT_DIVISOR = 2;
const EARTH_RADIUS_METERS = 6371008.8;

const MILLIMETER_FORMATTER = new Intl.NumberFormat(NUMBER_FORMAT_LOCALE, {
  maximumFractionDigits: DEFAULT_DECIMAL_FRACTION_DIGITS,
  minimumFractionDigits: DEFAULT_DECIMAL_FRACTION_DIGITS,
});

export function formatMillimeters(value: number) {
  return MILLIMETER_FORMATTER.format(value);
}

export function clampRadiusMeters(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

export function distanceBetweenCoordinatesMeters(
  start: SelectionCenter,
  end: SelectionCenter,
) {
  const startLatitude = (start.latitude * Math.PI) / COORDINATE_RADIANS_DIVISOR;
  const endLatitude = (end.latitude * Math.PI) / COORDINATE_RADIANS_DIVISOR;
  const deltaLatitude = endLatitude - startLatitude;
  const deltaLongitude =
    ((end.longitude - start.longitude) * Math.PI) / COORDINATE_RADIANS_DIVISOR;
  const x =
    deltaLongitude *
    Math.cos((startLatitude + endLatitude) / MIDPOINT_DIVISOR);

  return EARTH_RADIUS_METERS * Math.hypot(x, deltaLatitude);
}

export function formatDecimal(
  value: number,
  fractionDigits = DEFAULT_DECIMAL_FRACTION_DIGITS,
) {
  return MILLIMETER_FORMATTER.format(Number(value.toFixed(fractionDigits)));
}
