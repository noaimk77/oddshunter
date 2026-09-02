import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/settings", "/api/"],
    },
    sitemap: "https://oddshunter98.netlify.app/sitemap.xml",
  };
}
