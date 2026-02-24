import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { getErrorMessage } from "../utils";

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
      options: { redirectTo: redirectTo || window.location.href } 
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
      .then(({ data, error: rpcError }) => {
        if (rpcError || !data) {
          setError(getErrorMessage(rpcError));
          return;
        }
        setTripId(data as string);
      })
      .finally(() => setLoading(false));
  }, [session, token, attempted, tripId]);

  if (!token) return <div className="min-h-screen flex items-center justify-center">Convite invalido.</div>;

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold">Aceitar convite</h1>
          <p className="text-sm text-zinc-500">Faça login com Google.</p>
          <button onClick={() => void signInWithGoogle(window.location.href)} className="w-full bg-black text-white py-3 rounded-xl font-semibold">
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
          {tripId && <button onClick={() => navigate(`/trip/${tripId}`)} className="flex-1 bg-black text-white py-2 rounded-xl font-semibold">Ir para viagem</button>}
          <button onClick={() => navigate("/")} className="flex-1 border border-zinc-200 py-2 rounded-xl font-semibold">Inicio</button>
        </div>
      </Card>
    </div>
  );
}
