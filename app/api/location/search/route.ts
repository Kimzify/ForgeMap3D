import { isInsideNetherlands } from "@/lib/dataSources";

export const runtime = "nodejs";

type PdokLocationDoc = {
  centroide_ll?: string;
  id?: string;
  type?: string;
  weergavenaam?: string;
};

type LocationSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
};

const PDOK_FREE_GEOCODER_URL =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function toCoordinateResult(latitude: number, longitude: number) {
  return {
    id: `coordinates-${latitude.toFixed(6)}-${longitude.toFixed(6)}`,
    label: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    latitude,
    longitude,
    type: "Coordinates",
  };
}

function isValidLatitude(value: number) {
  return value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return value >= -180 && value <= 180;
}

function parseCoordinateSearch(query: string): LocationSearchResult | null {
  const matches = query.match(/[-+]?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) {
    return null;
  }

  const first = Number(matches[0].replace(",", "."));
  const second = Number(matches[1].replace(",", "."));

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  if (
    isValidLatitude(first) &&
    isValidLongitude(second) &&
    isInsideNetherlands(second, first)
  ) {
    return toCoordinateResult(first, second);
  }

  if (
    isValidLatitude(second) &&
    isValidLongitude(first) &&
    isInsideNetherlands(first, second)
  ) {
    return toCoordinateResult(second, first);
  }

  return null;
}

function parsePoint(point: string) {
  const match = point.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) {
    return null;
  }

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return Response.json(
      { error: "A search query is required." },
      { status: 400 },
    );
  }

  const coordinateResult = parseCoordinateSearch(query);
  if (coordinateResult) {
    return Response.json({ results: [coordinateResult] });
  }

  const url = new URL(PDOK_FREE_GEOCODER_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", "8");
  url.searchParams.set("fl", "id,weergavenaam,type,centroide_ll,score");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "forgemap3d/1.0",
      },
      next: {
        revalidate: 60,
      },
    });

    if (!response.ok) {
      return Response.json(
        {
          error: "Location search failed.",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      response?: {
        docs?: PdokLocationDoc[];
      };
    };
    const results = (payload.response?.docs ?? [])
      .flatMap((doc) => {
        const point =
          typeof doc.centroide_ll === "string" ? parsePoint(doc.centroide_ll) : null;
        if (!point || !isInsideNetherlands(point.longitude, point.latitude)) {
          return [];
        }

        return [
          {
            id:
              doc.id ??
              `${point.latitude.toFixed(6)}-${point.longitude.toFixed(6)}`,
            label: doc.weergavenaam ?? "Unnamed location",
            latitude: point.latitude,
            longitude: point.longitude,
            type: doc.type ?? "Location",
          },
        ];
      })
      .slice(0, 6);

    return Response.json({ results });
  } catch {
    return Response.json(
      { error: "Location search failed." },
      { status: 502 },
    );
  }
}
