import {
  APP_CONFIG,
  isInsideNetherlands,
  NETHERLANDS_VIEW,
} from "@/lib/dataSources";
import type { MapSelection, SelectionShape } from "@/lib/mapTypes";
import { clamp, lngLatToRd } from "@/lib/rd";
import { selectionLocalBounds } from "@/lib/selectionGeometry";

export const runtime = "nodejs";

type ThreeDbagFeatureResponse = {
  numberMatched?: number;
  numberReturned?: number;
  timeStamp?: string;
  links?: Array<{
    href: string;
    rel: string;
    title?: string;
    type?: string;
  }>;
};

function parseNumber(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseLongitude(searchParams: URLSearchParams) {
  return parseNumber(searchParams, "lng");
}

function parseShape(searchParams: URLSearchParams): SelectionShape {
  const shape = searchParams.get("shape");

  return shape === "hexagon" || shape === "rectangle" ? shape : "circle";
}

function clampRadius(value: number | null) {
  return clamp(value ?? 1250, 100, 5000);
}

function clampRectangleSide(value: number | null, fallbackRadius: number) {
  return clamp((value ?? fallbackRadius * 2) / 2, 100, 5000) * 2;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = parseNumber(searchParams, "lat");
  const longitude = parseLongitude(searchParams);
  const shape = parseShape(searchParams);
  const radius = clampRadius(parseNumber(searchParams, "radius"));

  if (latitude === null || longitude === null) {
    return Response.json(
      { error: "lat and lng query parameters are required." },
      { status: 400 },
    );
  }

  const widthMeters = clampRectangleSide(parseNumber(searchParams, "width"), radius);
  const heightMeters = clampRectangleSide(
    parseNumber(searchParams, "height"),
    radius,
  );
  const sideMeters = Math.max(widthMeters, heightMeters);
  const selection: MapSelection =
    shape === "rectangle"
      ? {
          heightMeters: sideMeters,
          latitude,
          longitude,
          shape,
          widthMeters: sideMeters,
        }
      : {
          latitude,
          longitude,
          shape,
        };
  const radiusMeters =
    shape === "rectangle"
      ? clamp(sideMeters / 2, 100, 5000)
      : radius;

  if (!isInsideNetherlands(longitude, latitude)) {
    return Response.json(
      {
        error: "Forge Map 3D currently supports locations in the Netherlands only.",
      },
      { status: 400 },
    );
  }

  const center = lngLatToRd(longitude, latitude);
  const rdExtent = NETHERLANDS_VIEW.rdExtent;
  const bounds = selectionLocalBounds(selection, radiusMeters);
  const bbox = [
    clamp(center.x + bounds.minX, rdExtent.minX, rdExtent.maxX),
    clamp(center.y + bounds.minY, rdExtent.minY, rdExtent.maxY),
    clamp(center.x + bounds.maxX, rdExtent.minX, rdExtent.maxX),
    clamp(center.y + bounds.maxY, rdExtent.minY, rdExtent.maxY),
  ];

  const url = new URL(`${APP_CONFIG.threeDbag.apiBaseUrl}/collections/pand/items`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("bbox", bbox.map((value) => value.toFixed(2)).join(","));
  url.searchParams.set(
    "bbox-crs",
    "http://www.opengis.net/def/crs/EPSG/0/7415",
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    return Response.json(
      {
        error: "3DBAG rejected the area query.",
        status: response.status,
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as ThreeDbagFeatureResponse;

  return Response.json({
    selection: {
      ...selection,
      radiusMeters,
    },
    crs: "EPSG:7415",
    bboxRd: {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
    },
    threeDbag: {
      numberMatched: data.numberMatched ?? null,
      numberReturned: data.numberReturned ?? null,
      timeStamp: data.timeStamp ?? null,
      source: url.toString(),
    },
  });
}
