import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://itxiva.uz";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 1 }];
}
