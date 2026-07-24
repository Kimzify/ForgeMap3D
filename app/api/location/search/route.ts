import { isSupportedLocation } from "@/lib/geography";

export const runtime = "nodejs";

type NominatimLocation = {
  address?: {
    country?: string;
  };
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_id?: number;
  osm_type?: string;
  type?: string;
};

type LocationSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
};

const NOMINATIM_SEARCH_URL = `${
  process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org"
}/search`;
const NOMINATIM_MINIMUM_INTERVAL_MS = 1000;
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function fetchNominatim(url: URL) {
  const request = nominatimQueue.then(async () => {
    const waitMs = Math.max(
      0,
      lastNominatimRequestAt + NOMINATIM_MINIMUM_INTERVAL_MS - Date.now(),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastNominatimRequestAt = Date.now();

    return fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ForgeMap3D/1.0 (https://forgemap3d.com)",
      },
      next: {
        revalidate: 300,
      },
    });
  });
  nominatimQueue = request.then(
    () => undefined,
    () => undefined,
  );

  return request;
}

function toCoordinateResult(latitude: number, longitude: number) {
  return {
    id: `coordinates-${latitude.toFixed(6)}-${longitude.toFixed(6)}`,
    label: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    latitude,
    longitude,
    type: "Coordinates",
  };
}

function parseCoordinateSearch(query: string): LocationSearchResult | null {
  const matches = query.match(/[-+]?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) {
    return null;
  }

  const first = Number(matches[0].replace(",", "."));
  const second = Number(matches[1].replace(",", "."));

  if (
    Number.isFinite(first) &&
    Number.isFinite(second) &&
    isSupportedLocation(second, first)
  ) {
    return toCoordinateResult(first, second);
  }

  if (
    Number.isFinite(first) &&
    Number.isFinite(second) &&
    isSupportedLocation(first, second)
  ) {
    return toCoordinateResult(second, first);
  }

  return null;
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

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  const language = request.headers.get("accept-language");
  if (language) {
    url.searchParams.set("accept-language", language);
  }

  try {
    const response = await fetchNominatim(url);

    if (!response.ok) {
      return Response.json(
        {
          error: "Location search failed.",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as NominatimLocation[];
    const results = payload.flatMap((location) => {
      const latitude = Number(location.lat);
      const longitude = Number(location.lon);
      if (!isSupportedLocation(longitude, latitude)) {
        return [];
      }

      const displayName = location.display_name ?? "Unnamed location";
      const country = location.address?.country;
      const label =
        country && !displayName.toLocaleLowerCase().includes(country.toLocaleLowerCase())
          ? `${displayName}, ${country}`
          : displayName;

      return [
        {
          id: `${location.osm_type ?? "location"}-${location.osm_id ?? `${latitude}-${longitude}`}`,
          label,
          latitude,
          longitude,
          type: location.type ?? "Location",
        },
      ];
    });

    return Response.json({ results });
  } catch {
    return Response.json(
      { error: "Location search failed." },
      { status: 502 },
    );
  }
}
