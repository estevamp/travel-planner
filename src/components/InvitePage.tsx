import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return /\bFB[\w_]+\/|Instagram|WhatsApp|Snapchat|Line\/|Twitter|FBAN|FBAV/i.test(ua);
}

function getInAppBrowserName(): string {
  const ua = navigator.userAgent || "";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/Twitter/i.test(ua)) return "Twitter";
  return "este aplicativo";
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function InvitePage({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const { t } = useI18n();

  usePageTitle(`${t("invite.title")} | ${t("app.name")}`);

  async function signInWithGoogle(redirectTo?: string) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.href },
    });
    if (error) throw error;
  }

  useEffect(() => {
    setAttempted(false);
    setError(null);
    setTripId(null);
  }, [token]);

  useEffect(() => {
    if (!session || !token || attempted || tripId) return;
    setAttempted(true);
    setLoading(true);
    setError(null);
    supabase
      .rpc("accept_trip_invite", { p_token: token })
      .then(async ({ data, error: rpcError }) => {
        if (rpcError || !data) {
          setError(getErrorMessage(rpcError));
          return;
        }
        await supabase.auth.refreshSession();
        setTripId(data as string);
        if (tripId) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          window.location.href = `/trip/${tripId}`;
        }
      })
      .finally(() => setLoading(false));
  }, [session, token, attempted, tripId]);

  if (!token)
    return (
      <div className="min-h-screen flex items-center justify-center">
        {t("invite.invalid")}
      </div>
    );

  // ── Detecção de in-app browser ──────────────────
  if (isInAppBrowser()) {
    const appName = getInAppBrowserName();
    const currentUrl = window.location.href;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        alert(t("invite.copyLinkSuccess"));
      } catch {
        // fallback silencioso
      }
    };

    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold">{t("invite.openInBrowser")}</h1>
          <p className="text-sm text-zinc-600">
            {t("invite.inAppBrowserMessage", { appName })}
          </p>

          <div className="bg-zinc-100 rounded-xl p-3 text-xs text-zinc-500 text-left space-y-2">
            {isAndroid() && (
              <div>
                <p className="font-semibold text-zinc-700 mb-1">{t("invite.androidHowTo")}</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>{t("invite.androidStep1")}</li>
                  <li>{t("invite.androidStep2")}</li>
                </ol>
              </div>
            )}
            {isIOS() && (
              <div>
                <p className="font-semibold text-zinc-700 mb-1">{t("invite.iosHowTo")}</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>{t("invite.iosStep1")}</li>
                  <li>{t("invite.iosStep2")}</li>
                </ol>
              </div>
            )}
            {!isAndroid() && !isIOS() && (
              <p>{t("invite.desktopHelp")}</p>
            )}
          </div>

          <button
            onClick={handleCopy}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold"
          >
            📋 {t("invite.copyLink")}
          </button>

          <p className="text-xs text-zinc-400">
            {t("invite.afterOpenBrowser")}
          </p>
        </Card>
      </div>
    );
  }

  // ── Fluxo normal ────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold">{t("invite.title")}</h1>
          <p className="text-sm text-zinc-500">{t("invite.signInPrompt")}</p>
          <button
            onClick={() => void signInWithGoogle(window.location.href)}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold"
          >
            {t("auth.signInGoogle")}
          </button>
        </Card>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-bold">{t("invite.title")}</h1>
        {loading && <p className="text-sm text-zinc-500">{t("invite.processing")}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {tripId && <p className="text-sm text-emerald-600">{t("invite.accepted")}</p>}
        <div>
          {tripId && (
            <button
              onClick={() => navigate(`/trip/${tripId}`)}
              className="w-full bg-black text-white py-2 rounded-xl font-semibold"
            >
              {t("invite.goToTrip")}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
