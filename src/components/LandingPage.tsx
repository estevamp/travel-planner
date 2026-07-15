import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft, ChevronRight, CircleHelp, Compass, FileText, LogOut, MapPin,
  Plus, Settings, SlidersHorizontal, UserRound, X,
} from "lucide-react";
import { supabase } from "../supabase";
import type { LanguageCode, OnboardingStatus, TripSummary, UserSettings } from "../types";
import { getErrorMessage } from "../utils";
import { useToast } from "../hooks/useToast";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";

interface LandingPageProps {
  session: Session | null;
  settings: UserSettings;
  onLanguageChange: (language: LanguageCode) => void | Promise<void>;
  onOnboardingChange: (status: OnboardingStatus, tripId: string | null) => Promise<boolean>;
}

type LandingScreen = "intro" | "create" | "trips" | "created";

const INTRO_IMAGES = [
  "/pics/13972854661_084a70e106_w.jpg",
  "/pics/4660931639_b42e56675d_c.jpg",
  "/pics/4660938241_e668c867ee_c.jpg",
  "/pics/5185419641_9be0f93c43_c.jpg",
  "/pics/6329653479_ea4db2f711_c.jpg",
  "/pics/6346087908_c655d9cf9a_c.jpg",
  "/pics/6372134987_fb8e6b7b6b_w.jpg",
] as const;

export function LandingPage({
  session,
  settings,
  onLanguageChange,
  onOnboardingChange,
}: LandingPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [introImage] = useState(
    () => INTRO_IMAGES[Math.floor(Math.random() * INTRO_IMAGES.length)]
  );

  const screen = useMemo<LandingScreen>(() => {
    if (!session) return "intro";
    if (settings.onboarding_status === "active" && !settings.onboarding_trip_id) return "intro";
    if (settings.onboarding_status === "active" && settings.onboarding_trip_id) return "created";
    return "trips";
  }, [session, settings.onboarding_status, settings.onboarding_trip_id]);
  const [requestedScreen, setRequestedScreen] = useState<LandingScreen | null>(null);
  const activeScreen = session
    ? (searchParams.get("new") === "trip" ? "create" : (requestedScreen ?? screen))
    : "intro";

  usePageTitle(t("app.name"));

  const loadTrips = async () => {
    setLoadingTrips(true);
    const { data, error } = await supabase
      .from("trips")
      .select("id,name,destination,created_at,theme_palette")
      .order("created_at", { ascending: false });
    setTrips(error ? [] : (data || []) as TripSummary[]);
    setLoadingTrips(false);
  };

  useEffect(() => {
    if (!session) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }
    void loadTrips();
  }, [session]);

  const copy = language === "en" ? {
    introTitle: "Your next adventure starts here",
    introBody: "Plan your trip without losing reservations, ideas and activities.",
    start: "LET'S GO!", skip: "Skip", createTitle: "Let's start your trip",
    createHint: "Fill in the details below:", name: "Trip name", destination: "Destination",
    suggestions: "Popular suggestions", create: "CREATE TRIP", myTrips: "My Trips",
    tripList: "Your list of planned trips", created: "Your trip was created!",
    createdHint: "Click it to start planning your itinerary", empty: "No trips yet.",
    profile: "Account", preferences: "Preferences", back: "Back",
  } : {
    introTitle: "Sua próxima aventura começa aqui",
    introBody: "Planeje sua viagem sem perder reservas, ideias e atividades.",
    start: "VAMOS LÁ!", skip: "Pular", createTitle: "Vamos começar sua viagem",
    createHint: "Preencha os dados abaixo:", name: "Nome da viagem", destination: "Destino",
    suggestions: "Sugestões populares", create: "CRIAR VIAGEM", myTrips: "Minhas Viagens",
    tripList: "Sua lista de viagens planejadas", created: "Sua viagem foi criada!",
    createdHint: "Clique nela para começar a planejar seu roteiro", empty: "Nenhuma viagem ainda.",
    profile: "Conta", preferences: "Preferências", back: "Voltar",
  };

  const createTrip = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !destination.trim()) return;
    setCreating(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc("create_trip_with_admin", {
      p_name: name.trim(), p_destination: destination.trim(), p_start: now, p_end: now,
    });
    setCreating(false);
    if (error || !data) {
      toast(getErrorMessage(error) || t("landing.createTripError"), "error");
      return;
    }
    setName("");
    setDestination("");
    await loadTrips();
    if (settings.onboarding_status === "active") {
      const saved = await onOnboardingChange("active", data as string);
      if (!saved) toast(t("common.unexpectedError"), "error");
      setRequestedScreen("created");
      return;
    }
    navigate(`/trip/${data}`);
  };

  const skip = async () => {
    await onOnboardingChange("skipped", null);
    setRequestedScreen("trips");
  };

  const openTrip = (trip: TripSummary) => navigate(`/trip/${trip.id}`);
  const startCreate = () => setRequestedScreen("create");

  const cancelCreate = () => {
    setName("");
    setDestination("");
    setRequestedScreen(null);
    if (searchParams.get("new") === "trip") setSearchParams({}, { replace: true });
  };

  const startGoogleSignIn = async () => {
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast(getErrorMessage(error), "error");
      setSigningIn(false);
    }
  };

  if (activeScreen === "intro") {
    return (
      <main className="min-h-screen bg-white px-5 py-8 flex flex-col items-center text-[#0A2342]">
        <div className="w-full max-w-[402px] flex-1 flex flex-col items-center justify-center">
          <div className="w-full aspect-[.72] max-h-[336px] overflow-hidden rounded-[28px] bg-[#f4f8ff]">
            <img
              src={introImage}
              alt="Destino de viagem"
              className="h-full w-full object-cover object-center"
            />
          </div>
          <h1 className="mt-3 max-w-[330px] text-center text-[28px] leading-[1.12] font-extrabold tracking-[-0.04em]">{copy.introTitle}</h1>
          <p className="mt-3 max-w-[320px] text-center text-[15px] leading-6 text-slate-600">{copy.introBody}</p>
          <Progress current={1} />
          <button onClick={() => session ? setRequestedScreen("create") : void startGoogleSignIn()} disabled={signingIn} className="mt-4 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.12em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50">{signingIn ? t("auth.redirecting") : copy.start}</button>
          {session && <button onClick={() => void skip()} className="mt-5 text-sm text-slate-500">{copy.skip}</button>}
        </div>
      </main>
    );
  }

  if (activeScreen === "create") {
    const suggestions = language === "en" ? ["Fernando de Noronha", "Gramado", "São Paulo"] : ["Fernando de Noronha", "Gramado", "São Paulo"];
    return (
      <main className="min-h-screen bg-white px-5 py-8 text-[#0A2342]">
        <div className="mx-auto max-w-[402px]">
          <button type="button" onClick={cancelCreate} aria-label={copy.back} className="rounded-full bg-white p-2 text-slate-400 shadow-sm">
            <ArrowLeft size={20} />
          </button>
        </div>
        <form onSubmit={createTrip} className="mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-[402px] flex-col">
          <div className="flex-1">
            <h1 className="text-center text-[28px] leading-8 font-extrabold tracking-[-0.04em]">{copy.createTitle}</h1>
            <p className="mt-5 text-center text-[15px] text-slate-600">{copy.createHint}</p>
            <section className="mt-9 rounded-xl bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,.22)]">
              <Field label={copy.name} icon={<SlidersHorizontal size={17} />} value={name} onChange={setName} placeholder={language === "en" ? "Ex: Summer Vacation 2024" : "Ex: Férias de Verão 2024"} />
              <Field label={copy.destination} icon={<MapPin size={17} />} value={destination} onChange={setDestination} placeholder={language === "en" ? "City, country or region" : "Cidade, país ou região"} />
              <p className="mt-5 text-xs font-bold">{copy.suggestions}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setDestination(suggestion)} className="rounded-full bg-[#E9EDFF] px-3 py-2 text-xs text-slate-600">{suggestion}</button>)}
              </div>
            </section>
          </div>
          <Progress current={2} />
          <button disabled={creating} className="mt-4 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.12em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50">{creating ? t("landing.creating") : copy.create}</button>
        </form>
      </main>
    );
  }

  const highlightedTrip = settings.onboarding_trip_id;
  return (
    <main className="min-h-screen bg-[#F4F4F4] px-5 py-9 pb-32 text-[#0A2342]">
      <div className="mx-auto max-w-[410px]">
        <header className="flex items-center justify-between">
          <img src="/favicon.svg" alt={t("app.name")} className="h-9 w-9 rounded-lg" />
          <a href="/help" className="rounded-full bg-white p-2 text-slate-300 shadow-sm" aria-label={t("landing.help")}><CircleHelp size={19} /></a>
        </header>
        <h1 className="mt-20 text-[27px] font-extrabold tracking-[-0.04em]">{copy.myTrips}</h1>
        <p className="mt-[-2px] text-sm text-slate-400">{copy.tripList}</p>
        <section className="mt-5 space-y-4">
          {loadingTrips && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
          {!loadingTrips && trips.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">{copy.empty}</p>}
          {trips.map((trip) => (
            <React.Fragment key={trip.id}>
              <button onClick={() => openTrip(trip)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#DBE9FD] text-[#2462EB]"><Compass size={25} /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm">{trip.name}</strong><small className="text-xs text-slate-500">{trip.destination || t("common.destinationMissing")}</small></span>
                <ChevronRight className="text-[#c8d6eb]" size={20} />
              </button>
              {activeScreen === "created" && trip.id === highlightedTrip && <section className="rounded-xl bg-white px-6 py-8 text-center shadow-[0_4px_8px_rgba(0,0,0,.2)]"><h2 className="text-[17px] font-extrabold">{copy.created}</h2><p className="mt-5 text-[15px] leading-6 text-slate-600">{copy.createdHint}</p><Progress current={3} /></section>}
            </React.Fragment>
          ))}
        </section>
      </div>
      <nav className="fixed bottom-8 left-1/2 flex h-16 w-[min(88vw,360px)] -translate-x-1/2 items-center justify-between rounded-full bg-white px-8 shadow-[0_16px_22px_rgba(0,0,0,.18)]">
        <button onClick={() => setShowSettings(true)} aria-label={copy.preferences} className="text-[#0A2342]"><Settings size={20} /></button>
        <button onClick={startCreate} aria-label={t("common.newTrip")} className="-mt-8 rounded-full border-4 border-white bg-[#2462EB] p-3 text-white shadow-[0_8px_14px_rgba(36,98,235,.45)]"><Plus size={29} strokeWidth={3} /></button>
        <button onClick={() => setShowProfile(true)} aria-label={copy.profile} className="text-[#0A2342]"><UserRound size={20} /></button>
      </nav>
      {showSettings && <AccountSheet title={copy.preferences} onClose={() => setShowSettings(false)}><LanguageButtons language={settings.language_code} onChange={onLanguageChange} /></AccountSheet>}
      {showProfile && <AccountSheet title={copy.profile} onClose={() => setShowProfile(false)}><LanguageButtons language={settings.language_code} onChange={onLanguageChange} /><a href="/terms" className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-slate-50"><FileText size={17} />{t("landing.terms")}</a><button onClick={() => void supabase.auth.signOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50"><LogOut size={17} />{t("common.signOut")}</button></AccountSheet>}
    </main>
  );
}

function Progress({ current }: { current: number }) {
  return <div className="mt-6 flex justify-center gap-1.5" aria-label={`Etapa ${current} de 6`}>{[1, 2, 3, 4, 5, 6].map((step) => <span key={step} className={`h-1.5 rounded-full ${step === current ? "w-6 bg-[#2462EB]" : "w-1.5 bg-[#c5cad8]"}`} />)}</div>;
}

function Field({ label, icon, value, onChange, placeholder }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-4 block text-xs font-bold first:mt-0">{label}<span className="mt-2 flex items-center gap-2 rounded-b-md border-b-2 border-slate-300 px-3 py-3 text-slate-400"><span>{icon}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></span></label>;
}

function AccountSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/25" onClick={onClose}><section className="w-full rounded-t-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</section></div>;
}

function LanguageButtons({ language, onChange }: { language: LanguageCode; onChange: (language: LanguageCode) => void | Promise<void> }) {
  return <div className="mb-3 grid grid-cols-2 gap-2">{(["pt-BR", "en"] as const).map((locale) => <button key={locale} onClick={() => void onChange(locale)} className={`rounded-xl px-3 py-3 text-xs font-bold ${language === locale ? "bg-[#0A2342] text-white" : "bg-slate-100 text-slate-700"}`}>{locale === "pt-BR" ? "Português" : "English"}</button>)}</div>;
}
