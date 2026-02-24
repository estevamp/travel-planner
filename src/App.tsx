import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { UserSettings } from "./types";
import { AuthLanding } from "./components/AuthLanding";
import { LandingPage } from "./components/LandingPage";
import { InvitePage } from "./components/InvitePage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import TripDashboard from "./components/TripDashboard";
import { AboutPage } from "./components/AboutPage";

const DEFAULT_SETTINGS: UserSettings = {
  theme_palette: "default",
  dark_mode: false,
  default_currency: "BRL",
  spouse_user_id: null,
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const loadUserSettings = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_palette,dark_mode,default_currency,spouse_user_id")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      setUserSettings(DEFAULT_SETTINGS);
      return;
    }

    setUserSettings({
      theme_palette: (data.theme_palette as any) || DEFAULT_SETTINGS.theme_palette,
      dark_mode: Boolean(data.dark_mode),
      default_currency: (data.default_currency as string) || DEFAULT_SETTINGS.default_currency,
      spouse_user_id: (data.spouse_user_id as string | null) || null,
    });
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session) {
        await supabase.rpc("sync_my_profile");
        await loadUserSettings(data.session.user.id);
      } else {
        setUserSettings(DEFAULT_SETTINGS);
      }
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
        setUserSettings(DEFAULT_SETTINGS);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center">Carregando sessao...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <LandingPage session={session} settings={userSettings} /> : <AuthLanding />} />
        <Route
          path="/trip/:id"
          element={
            <ProtectedRoute session={session}>
              <TripDashboard session={session as Session} settings={userSettings} onSettingsChange={setUserSettings} />
            </ProtectedRoute>
          }
        />
        <Route path="/invite/:token" element={<InvitePage session={session} />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
