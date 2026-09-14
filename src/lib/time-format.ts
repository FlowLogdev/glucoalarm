/** Shared by the WhatsApp bot (query-bot.ts) and the voice bot (voice-bot.ts) -- never hand Claude or TwiML a raw epoch to do date math on, always format in code first. */
export function formatLocalTime(unixSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(unixSeconds * 1000));
}

export function formatLocalDate(unixSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" }).format(new Date(unixSeconds * 1000));
}
