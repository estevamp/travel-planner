import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";

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
        Convite inválido.
      </div>
    );

  // ── Detecção de in-app browser ──────────────────
  if (isInAppBrowser()) {
    const appName = getInAppBrowserName();
    const currentUrl = window.location.href;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        alert("Link copiado! Agora cole no Chrome ou Safari.");
      } catch {
        // fallback silencioso
      }
    };

    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold">Abrir no navegador</h1>
          <p className="text-sm text-zinc-600">
            Você está abrindo este link dentro do <strong>{appName}</strong>.
            Para aceitar o convite corretamente, abra no{" "}
            <strong>Chrome</strong> ou <strong>Safari</strong>.
          </p>

          <div className="bg-zinc-100 rounded-xl p-3 text-xs text-zinc-500 text-left space-y-2">
            {isAndroid() && (
              <div>
                <p className="font-semibold text-zinc-700 mb-1">Como abrir no Chrome (Android):</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Toque nos <strong>3 pontinhos (⋮)</strong> no canto superior direito</li>
                  <li>Toque em <strong>"Abrir no Chrome"</strong> ou <strong>"Abrir no navegador"</strong></li>
                </ol>
              </div>
            )}
            {isIOS() && (
              <div>
                <p className="font-semibold text-zinc-700 mb-1">Como abrir no Safari (iPhone):</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Toque no ícone de <strong>compartilhar</strong> ou nos <strong>3 pontinhos</strong></li>
                  <li>Escolha <strong>"Abrir no Safari"</strong> ou <strong>"Abrir no navegador"</strong></li>
                </ol>
              </div>
            )}
            {!isAndroid() && !isIOS() && (
              <p>Copie o link abaixo e abra no Chrome ou Safari.</p>
            )}
          </div>

          <button
            onClick={handleCopy}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold"
          >
            📋 Copiar link
          </button>

          <p className="text-xs text-zinc-400">
            Após abrir no navegador, o convite será aceito automaticamente.
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
          <h1 className="text-xl font-bold">Aceitar convite</h1>
          <p className="text-sm text-zinc-500">Faça login com Google.</p>
          <button
            onClick={() => void signInWithGoogle(window.location.href)}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold"
          >
            Entrar com Google
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-bold">Aceitar convite</h1>
        {loading && <p className="text-sm text-zinc-500">Processando...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {tripId && <p className="text-sm text-emerald-600">Convite aceito.</p>}
        <div className="flex gap-2">
          {tripId && (
            <button
              onClick={() => navigate(`/trip/${tripId}`)}
              className="flex-1 bg-black text-white py-2 rounded-xl font-semibold"
            >
              Ir para viagem
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="flex-1 border border-zinc-200 py-2 rounded-xl font-semibold"
          >
            Inicio
          </button>
        </div>
      </Card>
    </div>
  );
}