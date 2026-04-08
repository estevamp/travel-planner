import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { LanguageCode, UserSettings } from "./types";
import { AuthLanding } from "./components/AuthLanding";
import { LandingPage } from "./components/LandingPage";
import { InvitePage } from "./components/InvitePage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import TripDashboard from "./components/TripDashboard";
import { AboutPage } from "./components/AboutPage";
import { ToastProvider } from "./hooks/useToast";
import { Toast } from "./components/Toast";
import { InstallBanner } from "./components/InstallBanner";
import { I18nProvider } from "./i18n/I18nProvider";
import { HelpPage } from "./components/HelpPage";
import { TermsPage } from "./components/TermsPage";

const LANGUAGE_STORAGE_KEY = "partiu-preferred-language";

const DEFAULT_SETTINGS: UserSettings = {
  theme_palette: "default",
  dark_mode: false,
  default_currency: "BRL",
  language_code: "pt-BR",
  spouse_user_id: null,
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const storedLanguage = typeof window !== "undefined"
      ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      : null;

    if (storedLanguage === "pt-BR" || storedLanguage === "en") {
      return { ...DEFAULT_SETTINGS, language_code: storedLanguage };
    }

    return DEFAULT_SETTINGS;
  });

  const loadUserSettings = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_palette,dark_mode,default_currency,language_code,spouse_user_id")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      setHasProfile(false);
      return;
    }

    const nextSettings = {
      theme_palette: (data.theme_palette as any) || DEFAULT_SETTINGS.theme_palette,
      dark_mode: Boolean(data.dark_mode),
      default_currency: (data.default_currency as string) || DEFAULT_SETTINGS.default_currency,
      language_code: ((data.language_code as UserSettings["language_code"] | null) || DEFAULT_SETTINGS.language_code),
      spouse_user_id: (data.spouse_user_id as string | null) || null,
    };

    setHasProfile(true);
    setUserSettings(nextSettings);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextSettings.language_code);
    }
  };

  const handleLanguageChange = async (language_code: LanguageCode) => {
    setUserSettings((current) => ({ ...current, language_code }));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language_code);
    }

    if (!session?.user?.id) return;

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: session.user.id,
          language_code,
        },
        { onConflict: "user_id" },
      );

    if (!error) {
      setHasProfile(true);
    }
  };

  useEffect(() => {
    let mounted = true;
    console.log("App: Iniciando verificação de sessão...");
    supabase.auth.getSession().then(async ({ data }) => {
      console.log("App: Sessão recuperada:", data.session ? "Usuário logado" : "Sem sessão");
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session) {
        try {
          console.log("App: Sincronizando perfil...");
          await supabase.rpc("sync_my_profile");
          console.log("App: Carregando configurações...");
          await loadUserSettings(data.session.user.id);
        } catch (err) {
          console.error("App: Erro ao carregar dados do usuário:", err);
        }
      } else {
        setHasProfile(false);
        setUserSettings((current) => ({ ...DEFAULT_SETTINGS, language_code: current.language_code }));
      }
      console.log("App: Finalizando loadingAuth");
      setLoadingAuth(false);
    }).catch(err => {
      console.error("App: Erro crítico no getSession:", err);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void supabase.rpc("sync_my_profile");
        void loadUserSettings(nextSession.user.id);
      } else {
        setHasProfile(false);
        setUserSettings((current) => ({ ...DEFAULT_SETTINGS, language_code: current.language_code }));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loadingAuth) {
    const loadingLabel = userSettings.language_code === "en" ? "Loading app..." : "Carregando app...";
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)] px-6">
        <div className="flex flex-col items-center gap-3 text-[var(--accent-color)]">
          <div className="h-10 w-10 rounded-full border-4 border-current border-t-transparent animate-spin" />
          <p className="text-sm font-medium tracking-wide">
            {loadingLabel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider language={userSettings.language_code}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={session ? (
                <LandingPage
                  session={session}
                  settings={userSettings}
                  hasProfile={hasProfile}
                  onLanguageChange={handleLanguageChange}
                />
              ) : (
                <AuthLanding
                  language={userSettings.language_code}
                  onLanguageChange={handleLanguageChange}
                />
              )}
            />
            <Route
              path="/trip/:id"
              element={
                <ProtectedRoute session={session}>
                  <TripDashboard session={session as Session} settings={userSettings} onSettingsChange={setUserSettings} />
                </ProtectedRoute>
              }
            />
            <Route path="/invite/:token" element={<InvitePage session={session} />} />
            <Route path="/about" element={<AboutPage settings={userSettings} />} />
            <Route path="/help" element={<HelpPage settings={userSettings} />} />
            <Route path="/terms" element={<TermsPage settings={userSettings} />} />
          </Routes>
        </BrowserRouter>
        <Toast />
        <InstallBanner />
      </ToastProvider>
    </I18nProvider>
  );
}
