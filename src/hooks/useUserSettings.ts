import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";

import type {
  LanguageCode,
  OnboardingStatus,
  UserSettings,
} from "../types";

import {
  loadUserSettings,
  syncProfile,
  updateLanguage,
  updateOnboarding,
} from "../services/profileService";

const LANGUAGE_STORAGE_KEY =
  "partiu-preferred-language";

const DEFAULT_SETTINGS: UserSettings = {
  theme_palette: "default",
  theme_preference: "light",
  dark_mode: false,
  default_currency: "BRL",
  language_code: "pt-BR",
  spouse_user_id: null,
  onboarding_status: "completed",
  onboarding_trip_id: null,
};

/**
 * Hook responsável pelas configurações do usuário.
 *
 * Responsabilidades:
 * - manter estado local
 * - reagir à sessão
 * - coordenar sincronização
 * - expor API para UI
 */
export function useUserSettings() {

  const { session } = useAuth();

  const [hasProfile, setHasProfile] =
    useState(false);

  const [userSettings, setUserSettings] =
    useState<UserSettings>(() => {

      const storedLanguage =
        getStoredLanguage();

      if (storedLanguage) {
        return {
          ...DEFAULT_SETTINGS,
          language_code: storedLanguage,
        };
      }

      return DEFAULT_SETTINGS;
    });

  /**
   * Altera idioma localmente
   * e sincroniza com backend.
   */
  const handleLanguageChange = async (
    language_code: LanguageCode
  ) => {

    // Atualização otimista
    setUserSettings((current) => ({
      ...current,
      language_code,
    }));

    saveLanguageToStorage(language_code);

    if (!session?.user?.id) {
      return;
    }

    const success =
      await updateLanguage(
        session.user.id,
        language_code
      );

    if (success) {
      setHasProfile(true);
    }
  };

  const handleOnboardingChange = async (
    status: OnboardingStatus,
    tripId: string | null
  ) => {
    if (!session?.user?.id) return false;

    const success = await updateOnboarding(session.user.id, status, tripId);
    if (success) {
      setUserSettings((current) => ({
        ...current,
        onboarding_status: status,
        onboarding_trip_id: tripId,
      }));
    }
    return success;
  };

  /**
   * Resolve o dark_mode efetivo a partir da preferência escolhida.
   * Quando "system", acompanha a preferência do sistema operacional em
   * tempo real via matchMedia.
   */
  useEffect(() => {
    const preference = userSettings.theme_preference;

    if (preference !== "system") {
      const shouldBeDark = preference === "dark";
      setUserSettings((current) =>
        current.dark_mode === shouldBeDark
          ? current
          : { ...current, dark_mode: shouldBeDark }
      );
      return;
    }

    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      setUserSettings((current) =>
        current.dark_mode === mql.matches
          ? current
          : { ...current, dark_mode: mql.matches }
      );

    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [userSettings.theme_preference]);

  /**
   * Reage a login/logout
   */
  useEffect(() => {

    async function initialize() {

      // LOGOUT
      if (!session) {

        setHasProfile(false);

        setUserSettings((current) => ({
          ...DEFAULT_SETTINGS,
          language_code:
            current.language_code,
        }));

        return;
      }

      // LOGIN

      const preferredLanguage =
        getStoredLanguage()
        ?? userSettings.language_code;

      await syncProfile(
        session.user.id,
        preferredLanguage
      );

      const settings =
        await loadUserSettings(
          session.user.id
        );

      if (!settings) {

        setHasProfile(false);

        return;
      }

      setHasProfile(true);

      setUserSettings(settings);

      saveLanguageToStorage(
        settings.language_code
      );
    }

    void initialize();

  }, [session]);

  return {
    userSettings,
    setUserSettings,
    hasProfile,
    handleLanguageChange,
    handleOnboardingChange,
  };
}

/**
 * Busca idioma salvo localmente
 */
function getStoredLanguage():
  LanguageCode | null {

  if (typeof window === "undefined") {
    return null;
  }

  const storedLanguage =
    window.localStorage.getItem(
      LANGUAGE_STORAGE_KEY
    );

  return storedLanguage === "pt-BR"
    || storedLanguage === "en"
    ? storedLanguage
    : null;
}

/**
 * Persiste idioma localmente
 */
function saveLanguageToStorage(
  language: LanguageCode
): void {

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LANGUAGE_STORAGE_KEY,
    language
  );
}
