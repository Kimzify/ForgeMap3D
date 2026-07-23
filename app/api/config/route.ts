import { APP_CONFIG } from "@/lib/dataSources";

export const runtime = "nodejs";

export function GET() {
  return Response.json(APP_CONFIG, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
