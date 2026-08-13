import { supabase } from "../supabase";

import type {
  LanguageCode,
  OnboardingStatus,
  UserSettings,
} from "../types";

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

export async function loadUserSettings(
  userId: string
): Promise<UserSettings | null> {

  const { data, error } = await supabase
    .from("profiles")
    .select(`
      theme_palette,
      theme_preference,
      dark_mode,
      default_currency,
      language_code,
      spouse_user_id,
      onboarding_status,
      onboarding_trip_id
    `)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  // Deriva a preferência: usa a coluna nova quando presente; caso contrário
  // faz fallback para o booleano legado dark_mode.
  const rawPreference = (data.theme_preference as UserSettings["theme_preference"] | null);
  const themePreference: UserSettings["theme_preference"] =
    rawPreference === "light" || rawPreference === "dark" || rawPreference === "system"
      ? rawPreference
      : (Boolean(data.dark_mode) ? "dark" : "light");

  const resolvedDarkMode =
    themePreference === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : themePreference === "dark";

  return {
    theme_palette:
      (data.theme_palette as any)
      || DEFAULT_SETTINGS.theme_palette,

    theme_preference: themePreference,

    dark_mode: resolvedDarkMode,

    default_currency:
      (data.default_currency as string)
      || DEFAULT_SETTINGS.default_currency,

    language_code:
      (
        data.language_code as
        UserSettings["language_code"] | null
      )
      || DEFAULT_SETTINGS.language_code,

    spouse_user_id:
      (data.spouse_user_id as string | null)
      || null,

    onboarding_status:
      (data.onboarding_status as OnboardingStatus | null)
      || DEFAULT_SETTINGS.onboarding_status,

    onboarding_trip_id:
      (data.onboarding_trip_id as string | null)
      || null,
  };
}

export async function syncProfile(
  userId: string,
  preferredLanguage: LanguageCode
): Promise<void> {

  const { data: existingProfile } =
    await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

  const profileAlreadyExisted =
    Boolean(existingProfile);

  await supabase.rpc("sync_my_profile");

  if (!profileAlreadyExisted) {

    // A first-time user may have accepted an invitation while their profile was
    // being created. In that case they already have a trip to open, so do not
    // send them through the "create your first trip" onboarding flow.
    const { data: membership } = await supabase
      .from("trip_members")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membership) {
      return;
    }

    await supabase
      .from("profiles")
      .update({
        language_code: preferredLanguage,
        onboarding_status: "active",
      })
      .eq("user_id", userId);
  }
}

export async function updateLanguage(
  userId: string,
  language_code: LanguageCode
): Promise<boolean> {

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        language_code,
      },
      {
        onConflict: "user_id",
      }
    );

  return !error;
}

export async function updateOnboarding(
  userId: string,
  status: OnboardingStatus,
  tripId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_status: status, onboarding_trip_id: tripId })
    .eq("user_id", userId);

  return !error;
}
