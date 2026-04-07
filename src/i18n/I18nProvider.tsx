import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { LanguageCode } from "../types";
import { DEFAULT_LANGUAGE, translations, type TranslationKey } from "./translations";

type TranslationVars = Record<string, string | number>;

interface I18nContextValue {
  language: LanguageCode;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function replaceVars(template: string, vars?: TranslationVars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function I18nProvider({
  language,
  children,
}: {
  language?: LanguageCode;
  children: ReactNode;
}) {
  const activeLanguage = language ?? DEFAULT_LANGUAGE;

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = translations[activeLanguage] ?? translations[DEFAULT_LANGUAGE];
    const fallback = translations[DEFAULT_LANGUAGE];

    return {
      language: activeLanguage,
      t: (key, vars) => replaceVars(dictionary[key] ?? fallback[key] ?? key, vars),
      formatCurrency: (amount, currency = "BRL") =>
        new Intl.NumberFormat(activeLanguage, { style: "currency", currency }).format(amount),
      formatNumber: (amount, options) => new Intl.NumberFormat(activeLanguage, options).format(amount),
      formatDate: (value, options) =>
        new Intl.DateTimeFormat(activeLanguage, options ?? { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)),
      formatDateTime: (value, options) =>
        new Intl.DateTimeFormat(
          activeLanguage,
          options ?? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
        ).format(new Date(value)),
    };
  }, [activeLanguage]);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
  }, [activeLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
