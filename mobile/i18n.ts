import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

export type Language = "en" | "es" | "pt";
const LANGUAGE_KEY = "glucoalarm_language";
const VALID_LANGUAGES: Language[] = ["en", "es", "pt"];

const STRINGS: Record<Language, Record<string, string>> = {
  en: {
    brand: "GlucoAlarm",
    tagline: "Live glucose monitoring and coordinated care.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    tabDashboard: "Dashboard",
    tabReports: "Reports",
    tabCare: "Care",
    tabSettings: "Settings",
    tabAccount: "Account",
    language: "Language",
  },
  es: {
    brand: "GlucoAlarm",
    tagline: "Monitoreo de glucosa en vivo y cuidado coordinado.",
    email: "Correo electrónico",
    password: "Contraseña",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión…",
    tabDashboard: "Panel",
    tabReports: "Informes",
    tabCare: "Cuidado",
    tabSettings: "Configuración",
    tabAccount: "Cuenta",
    language: "Idioma",
  },
  pt: {
    brand: "GlucoAlarm",
    tagline: "Monitoramento de glicose ao vivo e cuidado coordenado.",
    email: "E-mail",
    password: "Senha",
    signIn: "Entrar",
    signingIn: "Entrando…",
    tabDashboard: "Painel",
    tabReports: "Relatórios",
    tabCare: "Cuidados",
    tabSettings: "Configurações",
    tabAccount: "Conta",
    language: "Idioma",
  },
};

export function detectDeviceLanguage(): Language {
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (code && (VALID_LANGUAGES as string[]).includes(code)) return code as Language;
  }
  return "en";
}

/** Flat state + expo-secure-store persistence, matching this file's existing
 *  style -- no context needed since App.tsx is a single root component. */
export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    SecureStore.getItemAsync(LANGUAGE_KEY).then((stored) => {
      if (stored && (VALID_LANGUAGES as string[]).includes(stored)) {
        setLanguageState(stored as Language);
      } else {
        setLanguageState(detectDeviceLanguage());
      }
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    SecureStore.setItemAsync(LANGUAGE_KEY, next).catch(() => undefined);
  }, []);

  const t = useCallback((key: string) => STRINGS[language][key] ?? STRINGS.en[key] ?? key, [language]);

  return { language, setLanguage, t };
}
