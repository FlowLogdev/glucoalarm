import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/settings", "/billing", "/reports", "/history", "/onboarding", "/log", "/api"],
      },
    ],
    sitemap: "https://glucoalarm.com/sitemap.xml",
  };
}
