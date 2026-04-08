import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { LogOut, HelpCircle, FileText, Languages } from "lucide-react";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { LanguageCode, UserSettings, TripSummary } from "../types";
import { getThemeStyles } from "../utils/theme";
import { getErrorMessage } from "../utils";
import { useToast } from "../hooks/useToast";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";

export function LandingPage({
  session,
  settings,
  hasProfile,
  onLanguageChange,
}: {
  session: Session;
  settings: UserSettings;
  hasProfile: boolean;
  onLanguageChange: (language: LanguageCode) => void | Promise<void>;
}) {
  // A LandingPage sempre usa o tema padrão claro, independente das preferências do usuário
  const landingSettings: UserSettings = { ...settings, theme_palette: "default", dark_mode: false };

  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const { toast } = useToast();
  const { t } = useI18n();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [creating, setCreating] = useState(false);

  usePageTitle(t("app.name"));

  const loadTrips = async () => {
    setLoadingTrips(true);
    const { data, error } = await supabase.from("trips").select("id,name,destination,created_at,theme_palette").order("created_at", { ascending: false });
    if (error) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }
    setTrips((data || []) as TripSummary[]);
    setLoadingTrips(false);
  };

  useEffect(() => {
    void loadTrips();
  }, []);

  const createTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc("create_trip_with_admin", {
      p_name: name.trim(),
      p_destination: destination.trim(),
      p_start: now,
      p_end: now,
    });
    setCreating(false);
    if (error || !data) {
      toast(getErrorMessage(error) || t("landing.createTripError"), 'error');
      return;
    }
    navigate(`/trip/${data}`);
  };

  return (
    <div
      className="min-h-screen p-6 md:p-10 bg-[var(--bg-color)]"
      style={{ ...getThemeStyles(landingSettings), ["--bg-color" as string]: getThemeStyles(landingSettings).backgroundColor } as React.CSSProperties}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt={t("app.name")} className="w-12 h-12" />
            <div>
              <h1 className="text-3xl font-bold text-[var(--accent-color)]">{t("app.name")}</h1>
              <p className="opacity-70">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/help"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl border border-[var(--card-border)] text-[var(--accent-color)] flex items-center gap-2 hover:bg-[var(--accent-color)]/5 transition-colors"
            >
              <HelpCircle size={16} />
              <span className="hidden sm:inline">{t("landing.help")}</span>
            </a>
            <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl border border-[var(--card-border)] text-[var(--accent-color)] flex items-center gap-2 hover:bg-[var(--accent-color)]/5 transition-colors"
              >
                <FileText size={16} />
                <span className="hidden sm:inline">{t("landing.terms")}</span>
              </a>            
            <button
              onClick={() => void supabase.auth.signOut()}
              className="px-4 py-2 rounded-xl border border-[var(--card-border)] text-[var(--accent-color)] flex items-center gap-2 hover:bg-[var(--accent-color)]/5 transition-colors"
            >
              <LogOut size={16} />
              {t("common.signOut")}
            </button>
          </div>
        </div>

        {!hasProfile && (
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shrink-0">
                <Languages size={20} className="text-white" />
              </div>
              <div className="space-y-1">
                <h2 className="font-bold text-[var(--accent-color)]">{t("settings.language")}</h2>
                <p className="text-sm opacity-70">{t("landing.languageSetupHint")}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["pt-BR", "en"] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  onClick={() => void onLanguageChange(locale)}
                  className={
                    settings.language_code === locale
                      ? "min-h-12 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors duration-200 flex items-center justify-center text-center border-[var(--accent-color)] bg-[var(--accent-color)] text-white shadow-lg"
                      : "min-h-12 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors duration-200 flex items-center justify-center text-center border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--accent-color)] hover:border-[var(--accent-color)]/40"
                  }
                >
                  {t(`settings.language.${locale}` as "settings.language.pt-BR" | "settings.language.en")}
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="font-bold mb-4 text-[var(--accent-color)]">{t("landing.myTrips")}</h2>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {loadingTrips && <p className="text-sm opacity-70">{t("common.loading")}</p>}
              {!loadingTrips && trips.length === 0 && <p className="text-sm opacity-70">{t("landing.noTrips")}</p>}
              {trips.map((trip) => {
                // Cada card de viagem usa o TEMA DA VIAGEM, mas sempre em modo claro
                const tripTheme = getThemeStyles({ ...landingSettings, theme_palette: trip.theme_palette || 'default' });
                return (
                  <button
                    key={trip.id}
                    onClick={() => navigate(`/trip/${trip.id}`)}
                    className="w-full text-left p-3 rounded-xl border transition-colors"
                    style={{
                      borderColor: tripTheme['--accent-color'] as string + '40',
                      backgroundColor: tripTheme['--accent-color'] as string + '08'
                    }}
                  >
                    <p className="font-semibold" style={{ color: tripTheme['--accent-color'] as string }}>{trip.name}</p>
                    <p className="text-sm opacity-70" style={{ color: tripTheme['--accent-color'] as string }}>{trip.destination || t("common.destinationMissing")}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold mb-4 text-[var(--accent-color)]">{t("landing.createTrip")}</h2>
            <form onSubmit={createTrip} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium required-indicator text-[var(--accent-color)]">{t("landing.tripName")}</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("landing.tripNamePlaceholder")}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium required-indicator text-[var(--accent-color)]">{t("landing.destination")}</label>
                <input
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={t("landing.destinationPlaceholder")}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none"
                />
              </div>
              <button
                disabled={creating}
                className="w-full bg-[var(--accent-color)] text-white py-2 rounded-xl font-semibold mt-2 hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {creating ? t("landing.creating") : t("common.create")}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
