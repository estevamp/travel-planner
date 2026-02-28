import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Info } from "lucide-react";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { UserSettings, TripSummary } from "../types";
import { getThemeStyles } from "../utils/theme";
import { getErrorMessage } from "../utils";
import { useToast } from "../hooks/useToast";

export function LandingPage({ session, settings }: { session: Session; settings: UserSettings }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const { toast } = useToast();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [creating, setCreating] = useState(false);

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
      toast(getErrorMessage(error) || 'Não foi possível criar a viagem.', 'error');
      return;
    }
    navigate(`/trip/${data}`);
  };

  return (
    <div className="min-h-screen p-6 md:p-10 bg-[var(--bg-color)]" style={{ ...getThemeStyles(settings), ["--bg-color" as string]: getThemeStyles(settings).backgroundColor } as React.CSSProperties}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Partiu!" className="w-12 h-12" />
            <div>
              <h1 className="text-3xl font-bold text-[var(--accent-color)]">Partiu!</h1>
              <p className="opacity-70">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void supabase.auth.signOut()} className="px-4 py-2 rounded-xl border border-[var(--card-border)] text-[var(--accent-color)] flex items-center gap-2 hover:bg-[var(--accent-color)]/5 transition-colors">
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="font-bold mb-4 text-[var(--accent-color)]">Minhas viagens</h2>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {loadingTrips && <p className="text-sm opacity-70">Carregando...</p>}
              {!loadingTrips && trips.length === 0 && <p className="text-sm opacity-70">Nenhuma viagem.</p>}
              {trips.map((trip) => {
                const tripTheme = getThemeStyles({ ...settings, theme_palette: trip.theme_palette || 'default' });
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
                    <p className="text-sm opacity-70" style={{ color: tripTheme['--accent-color'] as string }}>{trip.destination || "Sem destino"}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold mb-4 text-[var(--accent-color)]">Criar viagem</h2>
            <form onSubmit={createTrip} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium required-indicator text-[var(--accent-color)]">Nome da viagem</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Férias de Verão" className="w-full px-4 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium required-indicator text-[var(--accent-color)]">Destino</label>
                <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ex: Paris, França" className="w-full px-4 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none" />
              </div>
              <button disabled={creating} className="w-full bg-[var(--accent-color)] text-white py-2 rounded-xl font-semibold mt-2 hover:opacity-90 transition-colors disabled:opacity-50">{creating ? "Criando..." : "Criar"}</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
