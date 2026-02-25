import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Info } from "lucide-react";
import { supabase } from "../supabase";
import { Card } from "./Card";
import { UserSettings, TripSummary } from "../types";
import { getThemeStyles } from "../utils/theme";
import { getErrorMessage } from "../utils";

export function LandingPage({ session, settings }: { session: Session; settings: UserSettings }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadTrips = async () => {
    setLoadingTrips(true);
    const { data, error } = await supabase.from("trips").select("id,name,destination,created_at").order("created_at", { ascending: false });
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
      alert(getErrorMessage(error));
      return;
    }
    navigate(`/trip/${data}`);
  };

  return (
    <div className="min-h-screen p-6 md:p-10" style={getThemeStyles(settings)}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Partiu!</h1>
            <p className="text-zinc-500">{session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void supabase.auth.signOut()} className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 flex items-center gap-2 hover:bg-zinc-50 transition-colors">
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="font-bold mb-4">Minhas viagens</h2>
            <div className="space-y-2 max-h-[420px] overflow-auto">
              {loadingTrips && <p className="text-sm text-zinc-500">Carregando...</p>}
              {!loadingTrips && trips.length === 0 && <p className="text-sm text-zinc-500">Nenhuma viagem.</p>}
              {trips.map((trip) => (
                <button key={trip.id} onClick={() => navigate(`/trip/${trip.id}`)} className="w-full text-left p-3 rounded-xl border border-zinc-200 hover:border-zinc-400">
                  <p className="font-semibold">{trip.name}</p>
                  <p className="text-sm text-zinc-500">{trip.destination || "Sem destino"}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold mb-4">Criar viagem</h2>
            <form onSubmit={createTrip} className="space-y-3">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da viagem" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              <button disabled={creating} className="w-full bg-black text-white py-2 rounded-xl font-semibold">{creating ? "Criando..." : "Criar"}</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
