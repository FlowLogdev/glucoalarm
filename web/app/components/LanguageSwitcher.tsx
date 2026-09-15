"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, type Locale } from "../../i18n/locales";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("languageSwitcher");
  const router = useRouter();

  function onChange(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    router.refresh();
  }

  return (
    <select
      aria-label={t("en") + "/" + t("es") + "/" + t("pt")}
      value={locale}
      onChange={(e) => onChange(e.target.value as Locale)}
      style={{ background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.85rem" }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </select>
  );
}
