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
import { ToastProvider } from "./hooks/useToast";
import { Toast } from "./components/Toast";
import { MapPin, Lock } from "lucide-react";

const DEFAULT_SETTINGS: UserSettings = {
  theme_palette: "default",
  dark_mode: false,
  default_currency: "BRL",
  spouse_user_id: null,
};

function AccessDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-white rounded-2xl shadow-sm border border-zinc-100 p-8">
        <div className="flex justify-center">
          <div className="bg-red-50 p-4 rounded-2xl">
            <Lock className="w-10 h-10 text-red-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-zinc-900">Acesso restrito</h1>
          <p className="text-zinc-500 text-sm">
            O e-mail <span className="font-medium text-zinc-700">{email}</span> não está
            autorizado a usar este aplicativo.
          </p>
          <p className="text-zinc-400 text-xs">
            Entre em contato com o administrador para solicitar acesso.
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="w-full border border-zinc-200 text-zinc-600 py-3 rounded-xl font-semibold hover:bg-zinc-50 transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
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

  const checkAllowlist = async (email: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("allowed_emails")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    return !error && data !== null;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAllowed(null);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const sess = data.session || null;
      setSession(sess);
      if (sess) {
        await supabase.rpc("sync_my_profile");
        const allowed = await checkAllowlist(sess.user.email ?? "");
        if (mounted) setIsAllowed(allowed);
        if (allowed) await loadUserSettings(sess.user.id);
      } else {
        setIsAllowed(null);
        setUserSettings(DEFAULT_SETTINGS);
      }
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void supabase.rpc("sync_my_profile");
        const allowed = await checkAllowlist(nextSession.user.email ?? "");
        setIsAllowed(allowed);
        if (allowed) void loadUserSettings(nextSession.user.id);
      } else {
        setIsAllowed(null);
        setUserSettings(DEFAULT_SETTINGS);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando sessao...
      </div>
    );
  }

  // Usuário logado mas não autorizado
  if (session && isAllowed === false) {
    return (
      <ToastProvider>
        <AccessDenied email={session.user.email ?? ""} onSignOut={handleSignOut} />
        <Toast />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={session ? <LandingPage session={session} settings={userSettings} /> : <AuthLanding />}
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
        </Routes>
      </BrowserRouter>
      <Toast />
    </ToastProvider>
  );
}
