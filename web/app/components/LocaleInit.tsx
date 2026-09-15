"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "../../i18n/locales";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function detectLocaleFromBrowser(): Locale {
  const browserLanguages = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const lang of browserLanguages) {
    const base = lang.split("-")[0].toLowerCase();
    if ((LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}

function getCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

/**
 * Runs once on first client render. The server can't read navigator.language,
 * so a locale cookie is only set client-side here -- this means true first
 * visits render in the server's default (English) until this effect fires
 * and refreshes, a deliberate, documented trade-off (see plan Phase B).
 */
export function LocaleInit() {
  const router = useRouter();

  useEffect(() => {
    if (getCookie(LOCALE_COOKIE)) return;
    const detected = detectLocaleFromBrowser();
    document.cookie = `${LOCALE_COOKIE}=${detected}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    if (detected !== DEFAULT_LOCALE) {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
