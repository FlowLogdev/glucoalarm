// Curated fallback for browsers without Intl.supportedValuesOf (all modern
// browsers support it as of 2022+, but keep a fallback rather than crash).
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export interface TimezoneGroup {
  region: string;
  zones: string[];
}

export function getAllTimezones(): TimezoneGroup[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? FALLBACK_TIMEZONES;
  } catch {
    zones = FALLBACK_TIMEZONES;
  }

  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push(zone);
  }

  return Array.from(groups.entries())
    .map(([region, list]) => ({ region, zones: list.sort() }))
    .sort((a, b) => a.region.localeCompare(b.region));
}
