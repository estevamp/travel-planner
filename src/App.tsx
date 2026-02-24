import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Bus, Calendar, DollarSign, FilePenLine, FileText, Hotel, LayoutDashboard, LogOut, MapPin, Plane, Plus, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { supabase } from "./supabase";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DOCS_BUCKET = "travel-documents";
type ItineraryType = "flight" | "bus" | "hotel" | "activity";
type Visibility = "public" | "private";

interface ItineraryItem {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  type: ItineraryType;
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  amount: number;
  visibility: Visibility;
  photo_url?: string | null;
}

interface Expense {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  visibility: Visibility;
}

interface DocumentItem {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  name: string;
  url: string;
}

interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: "admin" | "member";
  display_name: string | null;
  spouse_member_id: string | null;
}

interface TripInvite {
  id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  created_at: string;
}

interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  itinerary: ItineraryItem[];
  expenses: Expense[];
  documents: DocumentItem[];
}

interface TripSummary {
  id: string;
  name: string;
  destination: string;
  created_at: string;
}

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div className={cn("bg-white rounded-2xl border border-zinc-100 shadow-sm p-6", className)} onClick={onClick}>{children}</div>
);

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl", active ? "bg-black text-white" : "text-zinc-500 hover:bg-zinc-100")}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Erro inesperado";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function signInWithGoogle(redirectTo?: string) {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo || window.location.href } });
  if (error) throw error;
}

function AuthLanding() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-bold">Voyage</h1>
        <p className="text-zinc-500">Entre com Google para planejar viagens em grupo.</p>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await signInWithGoogle(window.location.origin);
            } catch (error) {
              alert(getErrorMessage(error));
            } finally {
              setLoading(false);
            }
          }}
          className="w-full bg-black text-white py-3 rounded-xl font-semibold"
        >
          {loading ? "Redirecionando..." : "Entrar com Google"}
        </button>
      </Card>
    </div>
  );
}

function LandingPage({ session }: { session: Session }) {
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
    <div className="min-h-screen bg-[#F8F9FA] p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Voyage</h1>
            <p className="text-zinc-500">{session.user.email}</p>
          </div>
          <button onClick={() => void supabase.auth.signOut()} className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 flex items-center gap-2">
            <LogOut size={16} />
            Sair
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="font-bold mb-4">Criar viagem</h2>
            <form onSubmit={createTrip} className="space-y-3">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da viagem" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino" className="w-full px-4 py-2 rounded-xl border border-zinc-200" />
              <button disabled={creating} className="w-full bg-black text-white py-2 rounded-xl font-semibold">{creating ? "Criando..." : "Criar"}</button>
            </form>
          </Card>

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
        </div>
      </div>
    </div>
  );
}
function InvitePage({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !token || loading || tripId) return;
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
  }, [session, token, loading, tripId]);

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

function TripDashboard({ session }: { session: Session }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "documents" | "people">("itinerary");
  const [loading, setLoading] = useState(true);
  const [updatingTrip, setUpdatingTrip] = useState(false);
  const [editTripName, setEditTripName] = useState("");
  const [editTripDestination, setEditTripDestination] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [pairMemberId, setPairMemberId] = useState("");
  const [pairSpouseId, setPairSpouseId] = useState("");
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const currentMember = useMemo(() => members.find((member) => member.user_id === session.user.id) || null, [members, session.user.id]);
  const isAdmin = currentMember?.role === "admin";
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const loadTripOptions = async () => {
    const { data, error } = await supabase.from("trips").select("id,name,destination,created_at").order("created_at", { ascending: false });
    if (error) {
      setTripOptions([]);
      return;
    }
    setTripOptions((data || []) as TripSummary[]);
  };

  const loadTrip = async (tripId: string) => {
    setLoading(true);
    const [tripRes, membersRes, itineraryRes, expensesRes, docsRes] = await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase.from("trip_members").select("id,trip_id,user_id,role,display_name,spouse_member_id").eq("trip_id", tripId),
      supabase.from("itinerary").select("*").eq("trip_id", tripId).order("start_time", { ascending: true }),
      supabase.from("expenses").select("*").eq("trip_id", tripId).order("date", { ascending: true }),
      supabase.from("documents").select("*").eq("trip_id", tripId),
    ]);

    if (tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error || !tripRes.data) {
      console.error(tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error);
      setTrip(null);
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    const nextMembers = (membersRes.data || []) as TripMember[];
    setMembers(nextMembers);

    const me = nextMembers.find((member) => member.user_id === session.user.id);
    if (!me) {
      setTrip(null);
      setInvites([]);
      setLoading(false);
      return;
    }

    if (me.role === "admin") {
      const { data, error } = await supabase.from("trip_invites").select("id,email,token,accepted_at,created_at").eq("trip_id", tripId).order("created_at", { ascending: false });
      if (error) {
        setInvites([]);
      } else {
        setInvites((data || []) as TripInvite[]);
      }
    } else {
      setInvites([]);
    }

    setTrip({
      ...(tripRes.data as Omit<Trip, "itinerary" | "expenses" | "documents">),
      itinerary: (itineraryRes.data || []).map((item) => ({ ...item, amount: Number(item.amount) || 0 })) as ItineraryItem[],
      expenses: (expensesRes.data || []).map((item) => ({ ...item, amount: Number(item.amount) || 0 })) as Expense[],
      documents: (docsRes.data || []) as DocumentItem[],
    });

    setLoading(false);
  };

  useEffect(() => {
    void loadTripOptions();
  }, []);

  useEffect(() => {
    if (!id) return;
    void loadTrip(id);
    const channel = supabase
      .channel(`trip-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    setEditTripName(trip?.name || "");
    setEditTripDestination(trip?.destination || "");
  }, [trip?.id, trip?.name, trip?.destination]);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });

  const createItinerary = async (form: FormData) => {
    if (!id || !currentMember) return;
    const amount = parseFloat(form.get("amount") as string) || 0;
    const visibility: Visibility = form.get("is_private") === "on" ? "private" : "public";
    const now = new Date().toISOString();

    const { error } = await supabase.from("itinerary").insert({
      id: crypto.randomUUID(),
      trip_id: id,
      created_by_member_id: currentMember.id,
      type: form.get("type") as ItineraryType,
      title: form.get("title") as string,
      description: (form.get("description") as string) || "",
      location: (form.get("location") as string) || "",
      start_time: now,
      end_time: now,
      amount,
      visibility,
      photo_url: null,
    });

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    if (amount > 0) {
      const { error: expError } = await supabase.from("expenses").insert({
        id: crypto.randomUUID(),
        trip_id: id,
        created_by_member_id: currentMember.id,
        description: (form.get("title") as string) || "Item do itinerario",
        amount,
        currency: "BRL",
        category: "itinerary",
        visibility,
        date: new Date().toISOString().split("T")[0],
      });
      if (expError) console.error(expError);
    }
  };

  const createExpense = async (form: FormData) => {
    if (!id || !currentMember) return;
    const visibility: Visibility = form.get("is_private") === "on" ? "private" : "public";
    const amount = parseFloat(form.get("amount") as string) || 0;
    const { error } = await supabase.from("expenses").insert({
      id: crypto.randomUUID(),
      trip_id: id,
      created_by_member_id: currentMember.id,
      description: (form.get("description") as string) || "Despesa",
      amount,
      currency: "BRL",
      category: (form.get("category") as string) || "general",
      visibility,
      date: new Date().toISOString().split("T")[0],
    });
    if (error) alert(getErrorMessage(error));
  };
  const createInvite = async () => {
    if (!id) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    const { data, error } = await supabase.rpc("create_trip_invite", { p_trip_id: id, p_email: email });
    if (error || !data) {
      alert(getErrorMessage(error));
      return;
    }

    const link = `${window.location.origin}/invite/${data}`;
    setGeneratedLink(link);
    setInviteEmail("");
    await navigator.clipboard.writeText(link);
    await loadTrip(id);
    alert("Link copiado.");
  };

  const setSpouse = async (memberId: string, spouseMemberId: string | null) => {
    if (!id) return;
    const { error } = await supabase.rpc("set_trip_spouse", {
      p_trip_id: id,
      p_member_id: memberId,
      p_spouse_member_id: spouseMemberId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    await loadTrip(id);
  };

  const updateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !trip || !isAdmin || updatingTrip) return;
    const name = editTripName.trim();
    const destination = editTripDestination.trim();
    if (!name || !destination) return;

    setUpdatingTrip(true);
    const { error } = await supabase.from("trips").update({ name, destination }).eq("id", id);
    setUpdatingTrip(false);

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    await Promise.all([loadTrip(id), loadTripOptions()]);
  };

  const deleteCurrentTrip = async () => {
    if (!id || !trip || !isAdmin || updatingTrip) return;
    const confirmed = window.confirm(`Excluir a viagem "${trip.name}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

    setUpdatingTrip(true);
    const { error } = await supabase.from("trips").delete().eq("id", id);
    setUpdatingTrip(false);

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    await loadTripOptions();
    navigate("/");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem nao encontrada ou sem permissao.</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      <aside className="w-64 border-r border-zinc-200 bg-white p-6 hidden md:flex flex-col gap-8">
        <div className="flex items-center gap-2 px-2"><Plane size={18} /><span className="font-bold text-xl">Voyage</span></div>
        <nav className="space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Itinerario" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem icon={DollarSign} label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem icon={FileText} label="Documentos" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
          <SidebarItem icon={Users} label="Pessoas" active={activeTab === "people"} onClick={() => setActiveTab("people")} />
        </nav>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs uppercase font-bold text-zinc-400 mb-2 px-1">Viagens</p>
          <div className="space-y-2 overflow-y-auto pr-1">
            {tripOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => navigate(`/trip/${option.id}`)}
                className={cn(
                  "w-full text-left rounded-xl border px-3 py-2",
                  option.id === id ? "border-black bg-zinc-100" : "border-zinc-200 hover:border-zinc-400",
                )}
              >
                <p className="text-sm font-semibold truncate">{option.name}</p>
                <p className="text-xs text-zinc-500 truncate">{option.destination || "Sem destino"}</p>
              </button>
            ))}
            {tripOptions.length === 0 && <p className="text-xs text-zinc-400 px-1">Nenhuma viagem.</p>}
          </div>
        </div>
        {isAdmin && trip && (
          <form onSubmit={updateTrip} className="space-y-2 border-t border-zinc-200 pt-4">
            <p className="text-xs uppercase font-bold text-zinc-400 px-1">Editar viagem</p>
            <input
              value={editTripName}
              onChange={(e) => setEditTripName(e.target.value)}
              placeholder="Nome da viagem"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              required
            />
            <input
              value={editTripDestination}
              onChange={(e) => setEditTripDestination(e.target.value)}
              placeholder="Destino"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              required
            />
            <button
              disabled={updatingTrip}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 flex items-center justify-center gap-2 text-sm"
            >
              <FilePenLine size={16} />
              {updatingTrip ? "Salvando..." : "Salvar edicao"}
            </button>
            <button
              type="button"
              onClick={deleteCurrentTrip}
              disabled={updatingTrip}
              className="w-full px-3 py-2 rounded-xl border border-red-200 text-red-600 flex items-center justify-center gap-2 text-sm"
            >
              <Trash2 size={16} />
              Excluir viagem
            </button>
          </form>
        )}
        <button onClick={() => void supabase.auth.signOut()} className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-600 flex items-center gap-2 justify-center"><LogOut size={16} />Sair</button>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold">{trip.name}</h2>
            <div className="flex items-center gap-2 text-zinc-500 mt-1"><MapPin size={16} />{trip.destination}</div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold uppercase flex items-center gap-1"><Shield size={12} />Admin</div>}
            <button onClick={() => void navigator.clipboard.writeText(window.location.href)} className="px-3 py-2 rounded-xl border border-zinc-200">Copiar link</button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "itinerary" && (
            <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {trip.itinerary.map((item) => (
                    <Card key={item.id} className="group p-0 overflow-hidden">
                      {item.photo_url && <img src={item.photo_url} alt={item.title} className="w-full h-40 object-cover" />}
                      <div className="p-5 flex items-start gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.type === "flight" && "bg-blue-50 text-blue-600", item.type === "bus" && "bg-orange-50 text-orange-600", item.type === "hotel" && "bg-purple-50 text-purple-600", item.type === "activity" && "bg-emerald-50 text-emerald-600")}>{item.type === "flight" && <Plane size={20} />}{item.type === "bus" && <Bus size={20} />}{item.type === "hotel" && <Hotel size={20} />}{item.type === "activity" && <Calendar size={20} />}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold truncate">{item.title}</h4>
                            <span className="text-xs text-zinc-400">{format(new Date(item.start_time), "dd/MM HH:mm")}</span>
                          </div>
                          <p className="text-sm text-zinc-500">{item.description}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                            <span>{item.location || "Sem local"}</span>
                            <span>{formatCurrency(item.amount)}</span>
                            {item.visibility === "private" && <span className="font-bold uppercase text-orange-600">Privado</span>}
                          </div>
                          <button onClick={() => photoInputRefs.current[item.id]?.click()} className="text-[10px] font-bold uppercase text-zinc-400 mt-3">{item.photo_url ? "Trocar foto" : "Add foto"}</button>
                          <input
                            ref={(el) => {
                              photoInputRefs.current[item.id] = el;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const photo = await fileToDataUrl(file);
                                const { error } = await supabase.from("itinerary").update({ photo_url: photo }).eq("id", item.id);
                                if (error) throw error;
                              } catch (error) {
                                alert(getErrorMessage(error));
                              }
                              e.target.value = "";
                            }}
                          />
                        </div>
                        <button
                          onClick={async () => {
                            const { error } = await supabase.from("itinerary").delete().eq("id", item.id);
                            if (error) alert(getErrorMessage(error));
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card>
                  <h3 className="font-bold mb-4">Adicionar ao itinerario</h3>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await createItinerary(new FormData(e.currentTarget));
                      (e.target as HTMLFormElement).reset();
                    }}
                  >
                    <select name="type" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"><option value="activity">Atividade</option><option value="flight">Voo</option><option value="bus">Onibus</option><option value="hotel">Hospedagem</option></select>
                    <input name="title" required placeholder="Titulo" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="location" placeholder="Local" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="amount" type="number" min="0" step="0.01" required placeholder="Valor" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <textarea name="description" placeholder="Notas" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm h-20" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_private" />Marcar privado (voce + conjuge)</label>
                    <button className="w-full bg-black text-white py-2 rounded-xl text-sm font-bold">Adicionar</button>
                  </form>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === "expenses" && (
            <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card>
                <h3 className="font-bold mb-4">Adicionar despesa</h3>
                <form
                  className="grid grid-cols-1 md:grid-cols-4 gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await createExpense(new FormData(e.currentTarget));
                    (e.target as HTMLFormElement).reset();
                  }}
                >
                  <input name="description" required placeholder="Descricao" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                  <input name="category" placeholder="Categoria" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                  <input name="amount" required type="number" min="0" step="0.01" placeholder="Valor" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                  <button className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold">Adicionar</button>
                  <label className="md:col-span-4 flex items-center gap-2 text-sm"><input type="checkbox" name="is_private" />Marcar privado (voce + conjuge)</label>
                </form>
              </Card>

              <Card className="p-0 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-zinc-50"><th className="px-4 py-3 text-xs uppercase">Descricao</th><th className="px-4 py-3 text-xs uppercase">Categoria</th><th className="px-4 py-3 text-xs uppercase">Valor</th><th className="px-4 py-3 text-xs uppercase">Visib.</th><th className="px-4 py-3 text-xs uppercase text-right">Acao</th></tr></thead>
                  <tbody className="divide-y divide-zinc-100">
                    {trip.expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="px-4 py-3"><p className="font-medium">{exp.description}</p><p className="text-xs text-zinc-400">{exp.date}</p></td>
                        <td className="px-4 py-3 text-xs uppercase">{exp.category}</td>
                        <td className="px-4 py-3 font-bold">{formatCurrency(exp.amount)}</td>
                        <td className="px-4 py-3 text-xs uppercase">{exp.visibility}</td>
                        <td className="px-4 py-3 text-right"><button onClick={async () => {
                          const { error } = await supabase.from("expenses").delete().eq("id", exp.id);
                          if (error) alert(getErrorMessage(error));
                        }} className="text-zinc-400 hover:text-red-500"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </motion.div>
          )}
          {activeTab === "documents" && (
            <motion.div key="documents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 bg-transparent cursor-pointer" onClick={() => documentInputRef.current?.click()}>
                <Plus className="text-zinc-300 mb-2" size={32} />
                <p className="text-sm font-medium text-zinc-400">Adicionar Documento</p>
                <p className="text-xs text-zinc-300 mt-1">Privado: voce e conjuge</p>
              </Card>
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !id || !currentMember) return;
                  try {
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                    const path = `${id}/${currentMember.id}/${crypto.randomUUID()}-${safeName}`;
                    const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
                    if (uploadError) throw uploadError;
                    const { error: insertError } = await supabase.from("documents").insert({ id: crypto.randomUUID(), trip_id: id, created_by_member_id: currentMember.id, name: file.name, url: path });
                    if (insertError) throw insertError;
                  } catch (error) {
                    alert(getErrorMessage(error));
                  }
                  e.target.value = "";
                }}
              />

              {trip.documents.map((doc) => (
                <Card key={doc.id} className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center"><FileText size={24} /></div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold truncate">{doc.name}</h4>
                    <button
                      type="button"
                      onClick={async () => {
                        const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.url, 60);
                        if (error || !data) {
                          alert(getErrorMessage(error));
                          return;
                        }
                        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="text-xs text-zinc-500"
                    >
                      Abrir documento
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove([doc.url]);
                      if (storageError) {
                        alert(getErrorMessage(storageError));
                        return;
                      }
                      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
                      if (error) alert(getErrorMessage(error));
                    }}
                    className="text-zinc-300 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </Card>
              ))}
            </motion.div>
          )}

          {activeTab === "people" && (
            <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {isAdmin && (
                <Card>
                  <h3 className="font-bold mb-4">Convidar pessoa</h3>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="email@exemplo.com" className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <button onClick={createInvite} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"><UserPlus size={16} />Gerar convite</button>
                  </div>
                  {generatedLink && <div className="mt-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs break-all">{generatedLink}</div>}
                </Card>
              )}

              {isAdmin && (
                <Card>
                  <h3 className="font-bold mb-4">Vinculo de conjuge</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select value={pairMemberId} onChange={(e) => setPairMemberId(e.target.value)} className="px-4 py-2 rounded-xl border border-zinc-200 text-sm"><option value="">Pessoa 1</option>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name || m.user_id}</option>)}</select>
                    <select value={pairSpouseId} onChange={(e) => setPairSpouseId(e.target.value)} className="px-4 py-2 rounded-xl border border-zinc-200 text-sm"><option value="">Pessoa 2</option>{members.filter((m) => m.id !== pairMemberId).map((m) => <option key={m.id} value={m.id}>{m.display_name || m.user_id}</option>)}</select>
                    <button onClick={async () => {
                      if (!pairMemberId || !pairSpouseId) return;
                      await setSpouse(pairMemberId, pairSpouseId);
                      setPairMemberId("");
                      setPairSpouseId("");
                    }} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold">Vincular</button>
                  </div>
                </Card>
              )}

              <Card className="p-0 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-zinc-50"><th className="px-4 py-3 text-xs uppercase">Pessoa</th><th className="px-4 py-3 text-xs uppercase">Papel</th><th className="px-4 py-3 text-xs uppercase">Conjuge</th>{isAdmin && <th className="px-4 py-3 text-xs uppercase text-right">Acao</th>}</tr></thead>
                  <tbody className="divide-y divide-zinc-100">
                    {members.map((member) => {
                      const spouse = member.spouse_member_id ? memberById.get(member.spouse_member_id) : null;
                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-3">{member.display_name || member.user_id}</td>
                          <td className="px-4 py-3 text-xs uppercase">{member.role}</td>
                          <td className="px-4 py-3">{spouse?.display_name || "-"}</td>
                          {isAdmin && <td className="px-4 py-3 text-right">{member.spouse_member_id && <button onClick={() => void setSpouse(member.id, null)} className="text-xs text-red-500">Desvincular</button>}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {isAdmin && (
                <Card>
                  <h3 className="font-bold mb-4">Convites</h3>
                  <div className="space-y-2">
                    {invites.length === 0 && <p className="text-sm text-zinc-500">Nenhum convite gerado.</p>}
                    {invites.map((invite) => (
                      <div key={invite.id} className="p-3 rounded-xl border border-zinc-200 text-sm flex items-center justify-between gap-2">
                        <span>{invite.email}</span>
                        <span className={cn("text-xs font-bold uppercase", invite.accepted_at ? "text-emerald-600" : "text-orange-600")}>{invite.accepted_at ? "Aceito" : "Pendente"}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ProtectedRoute({ session, children }: { session: Session | null; children: React.ReactElement }) {
  if (!session) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session) await supabase.rpc("sync_my_profile");
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void supabase.rpc("sync_my_profile");
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
        <Route path="/" element={session ? <LandingPage session={session} /> : <AuthLanding />} />
        <Route path="/trip/:id" element={<ProtectedRoute session={session}>{<TripDashboard session={session as Session} />}</ProtectedRoute>} />
        <Route path="/invite/:token" element={<InvitePage session={session} />} />
      </Routes>
    </BrowserRouter>
  );
}
