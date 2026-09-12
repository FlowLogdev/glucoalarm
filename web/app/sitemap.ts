import type { MetadataRoute } from "next";

const BASE_URL = "https://glucoalarm.com";

// Only public marketing/legal pages -- everything behind login (dashboard,
// settings, billing, reports, history, onboarding) is excluded, same as
// robots.ts's disallow list, since those pages have no value to a crawler
// and would need a session to render anyway.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/signup", priority: 0.9, changeFrequency: "monthly" },
    { path: "/login", priority: 0.3, changeFrequency: "yearly" },
    { path: "/docs", priority: 0.7, changeFrequency: "monthly" },
    { path: "/support", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/refund-policy", priority: 0.2, changeFrequency: "yearly" },
  ];

  return routes.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
