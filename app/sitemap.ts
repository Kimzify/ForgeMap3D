import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL.toString(),
      lastModified: new Date("2026-07-24"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
