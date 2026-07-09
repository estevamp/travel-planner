import { useAuth } from "./context/AuthContext";
import { useUserSettings } from "./hooks/useUserSettings";

import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { AuthLanding } from "./components/AuthLanding";
import { LandingPage } from "./components/LandingPage";
import { InvitePage } from "./components/InvitePage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import TripDashboard from "./components/TripDashboard";
import { AboutPage } from "./components/AboutPage";
import { HelpPage } from "./components/HelpPage";
import { TermsPage } from "./components/TermsPage";

import { ToastProvider } from "./hooks/useToast";
import { Toast } from "./components/Toast";
import { InstallBanner } from "./components/InstallBanner";

import { I18nProvider } from "./i18n/I18nProvider";
import { DEFAULT_LANGUAGE, translations } from "./i18n/translations";

export default function App() {
  // 1. Pega a sessão e o estado de loading do AuthContext
  const { session, loading } = useAuth();

  // 2. Pega as configurações do usuário (e toda a lógica relacionada)
  const { userSettings, setUserSettings, handleLanguageChange, handleOnboardingChange } =
    useUserSettings();

  if (loading) {
    const loadingLabel =
      translations[userSettings.language_code]?.["app.loading"] ??
      translations[DEFAULT_LANGUAGE]["app.loading"];

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
              element={
                session ? (
                  <LandingPage
                    settings={userSettings}
                    onLanguageChange={handleLanguageChange}
                    onOnboardingChange={handleOnboardingChange}
                  />
                ) : (
                  <AuthLanding
                    language={userSettings.language_code}
                    onLanguageChange={handleLanguageChange}
                  />
                )
              }
            />

            <Route
              path="/trip/:id"
              element={
                <ProtectedRoute session={session}>
                  <TripDashboard
                    session={session as Session}
                    settings={userSettings}
                    onSettingsChange={setUserSettings}
                    onOnboardingComplete={() => handleOnboardingChange("completed", null)}
                  />
                </ProtectedRoute>
              }
            />

            <Route
              path="/invite/:token"
              element={<InvitePage session={session} />}
            />

            <Route
              path="/about"
              element={<AboutPage settings={userSettings} />}
            />

            <Route
              path="/help"
              element={<HelpPage settings={userSettings} />}
            />

            <Route
              path="/terms"
              element={<TermsPage settings={userSettings} />}
            />
          </Routes>
        </BrowserRouter>

        <Toast />

        <InstallBanner />
      </ToastProvider>
    </I18nProvider>
  );
}
