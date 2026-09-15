import { escapeXml } from "./voice";

export type CallLanguage = "en" | "es" | "pt";

export const VALID_CALL_LANGUAGES: CallLanguage[] = ["en", "es", "pt"];

export function isValidCallLanguage(value: unknown): value is CallLanguage {
  return typeof value === "string" && (VALID_CALL_LANGUAGES as string[]).includes(value);
}

export function normalizeCallLanguage(value: unknown): CallLanguage {
  return isValidCallLanguage(value) ? value : "en";
}

const POLLY_VOICE_BY_LANGUAGE: Record<CallLanguage, { voice: string; language?: string }> = {
  en: { voice: "Polly.Joanna" },
  es: { voice: "Polly.Lupe", language: "es-US" },
  pt: { voice: "Polly.Camila", language: "pt-BR" },
};

/** Builds a <Say> tag using the Polly voice/locale for the given call language. */
export function sayTag(text: string, language: CallLanguage): string {
  const { voice, language: localeAttr } = POLLY_VOICE_BY_LANGUAGE[language];
  const languageAttr = localeAttr ? ` language="${localeAttr}"` : "";
  return `<Say voice="${voice}"${languageAttr}>${escapeXml(text)}</Say>`;
}
