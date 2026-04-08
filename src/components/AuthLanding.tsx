import { useState } from "react";
import { Languages } from "lucide-react";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";
import { supabase } from "../supabase";
import { useToast } from "../hooks/useToast";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";
import type { LanguageCode } from "../types";

export function AuthLanding({
  language,
  onLanguageChange,
}: {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  usePageTitle(t("app.name"));

  async function signInWithGoogle(redirectTo?: string) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.href }
    });
    if (error) throw error;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="bg-[#0A2342] p-4 rounded-2xl shadow-lg shadow-blue-900/20">
            <img src="/icon-192.png" alt="Partiu!" className="w-12 h-12" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">Partiu!</h1>
          <p className="text-zinc-500">{t("auth.tagline")}</p>
        </div>
        <div className="space-y-3 text-left">
          <div className="flex items-center gap-2 text-zinc-700">
            <Languages size={16} />
            <span className="text-sm font-semibold">{t("settings.language")}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["pt-BR", "en"] as const).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => void onLanguageChange(locale)}
                className={
                  language === locale
                    ? "min-h-11 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors duration-200 flex items-center justify-center text-center border-[#0A2342] bg-[#0A2342] text-white shadow-md shadow-blue-900/10"
                    : "min-h-11 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-colors duration-200 flex items-center justify-center text-center border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }
              >
                {t(`settings.language.${locale}` as "settings.language.pt-BR" | "settings.language.en")}
              </button>
            ))}
          </div>
        </div>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await signInWithGoogle(window.location.origin);
            } catch (error) {
              toast(getErrorMessage(error), 'error');
            } finally {
              setLoading(false);
            }
          }}
          className="w-full bg-[#0A2342] hover:bg-[#0D2D54] text-white py-4 rounded-xl font-semibold transition-colors shadow-md shadow-blue-900/10"
        >
          {loading ? t("auth.redirecting") : t("auth.signInGoogle")}
        </button>
      </Card>
    </div>
  );
}
