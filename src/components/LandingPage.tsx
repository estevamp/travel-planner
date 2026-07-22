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
      <main className="min-h-screen bg-white flex flex-col items-center text-[#0A2342] px-5 py-8 md:flex-row md:items-stretch md:px-0 md:py-0">
        {/* Hero de imagem — visível apenas no desktop, ocupando metade da tela */}
        <div className="hidden md:block md:w-1/2 lg:w-3/5 relative overflow-hidden">
          <img
            src={introImage}
            alt="Destino de viagem"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A2342]/50 via-[#0A2342]/0 to-transparent" />
          <div className="absolute left-10 bottom-10 right-10 text-white">
            <p className="me-label text-sm uppercase tracking-[0.2em] opacity-80">{t("app.name")}</p>
          </div>
        </div>
        <div className="w-full max-w-[402px] flex-1 flex flex-col items-center justify-center md:w-1/2 lg:w-2/5 md:max-w-[440px] md:mx-auto md:px-10">
          <div className="w-full aspect-[.72] max-h-[336px] overflow-hidden rounded-[28px] bg-[#f4f8ff] md:hidden">
            <img
              src={introImage}
              alt="Destino de viagem"
              className="h-full w-full object-cover object-center"
            />
          </div>
          <h1 className="me-display mt-3 max-w-[330px] text-center text-[28px] leading-[1.12] md:mt-0 md:max-w-[360px] md:text-[34px]">{copy.introTitle}</h1>
          <p className="mt-3 max-w-[320px] text-center text-[15px] leading-6 text-slate-600 md:max-w-[340px]">{copy.introBody}</p>
          <Progress current={1} />
          <button onClick={() => session ? setRequestedScreen("create") : void startGoogleSignIn()} disabled={signingIn} className="mt-4 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.12em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50 hover:brightness-110 transition">{signingIn ? t("auth.redirecting") : copy.start}</button>
          {session && <button onClick={() => void skip()} className="mt-5 text-sm text-slate-500">{copy.skip}</button>}
        </div>
      </main>
    );
  }

  if (activeScreen === "create") {
    const suggestions = language === "en" ? ["Fernando de Noronha", "Gramado", "São Paulo"] : ["Fernando de Noronha", "Gramado", "São Paulo"];
    return (
      <main className="min-h-screen bg-white px-5 py-8 text-[#0A2342] md:flex md:flex-col md:items-center md:justify-center md:bg-[#F4F4F4] md:px-10">
        <div className="mx-auto max-w-[402px] md:max-w-[460px] md:mb-3">
          <button type="button" onClick={cancelCreate} aria-label={copy.back} className="rounded-full bg-white p-2 text-slate-400 shadow-sm hover:bg-slate-50 transition-colors">
            <ArrowLeft size={20} />
          </button>
        </div>
        <form onSubmit={createTrip} className="mx-auto flex min-h-[calc(100vh-6.5rem)] max-w-[402px] flex-col md:min-h-0 md:max-w-[460px] md:rounded-3xl md:bg-white md:p-8 md:shadow-xl md:border md:border-slate-100">
          <div className="flex-1">
            <h1 className="me-display text-center text-[28px] leading-8">{copy.createTitle}</h1>
            <p className="mt-5 text-center text-[15px] text-slate-600">{copy.createHint}</p>
            <section className="mt-9 rounded-xl bg-white p-4 shadow-[0_4px_6px_rgba(0,0,0,.22)] md:shadow-none md:border md:border-slate-100 md:p-0 md:bg-transparent">
              <Field label={copy.name} icon={<SlidersHorizontal size={17} />} value={name} onChange={setName} placeholder={language === "en" ? "Ex: Summer Vacation 2024" : "Ex: Férias de Verão 2024"} />
              <Field label={copy.destination} icon={<MapPin size={17} />} value={destination} onChange={setDestination} placeholder={language === "en" ? "City, country or region" : "Cidade, país ou região"} />
              <p className="mt-5 text-xs font-bold">{copy.suggestions}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setDestination(suggestion)} className="rounded-full bg-[#E9EDFF] px-3 py-2 text-xs text-slate-600 hover:bg-[#dbe4ff] transition-colors">{suggestion}</button>)}
              </div>
            </section>
          </div>
          <Progress current={2} />
          <button disabled={creating} className="mt-4 w-full rounded-xl bg-[#2462EB] py-4 text-sm font-extrabold tracking-[.12em] text-white shadow-[0_5px_4px_rgba(10,35,66,.25)] disabled:opacity-50 hover:brightness-110 transition">{creating ? t("landing.creating") : copy.create}</button>
        </form>
      </main>
    );
  }

  const highlightedTrip = settings.onboarding_trip_id;
  return (
    <main className="min-h-screen bg-[#F4F4F4] px-5 py-9 pb-24 text-[#0A2342] md:pb-14">
      <div className="mx-auto max-w-[410px] md:max-w-5xl">
        <header className="flex items-center justify-between">
          <img src="/favicon.svg" alt={t("app.name")} className="h-9 w-9 rounded-lg" />
          <a href="/help" className="rounded-full bg-white p-2 text-slate-300 shadow-sm md:hidden" aria-label={t("landing.help")}><CircleHelp size={19} /></a>
          {/* Barra de ações — visível apenas no desktop, substitui a nav flutuante */}
          <div className="hidden md:flex items-center gap-2">
            <a href="/help" className="rounded-full bg-white p-2.5 text-slate-400 shadow-sm hover:bg-slate-50 transition-colors" aria-label={t("landing.help")}><CircleHelp size={19} /></a>
            <button onClick={() => setShowSettings(true)} aria-label={copy.preferences} className="rounded-full bg-white p-2.5 text-slate-400 shadow-sm hover:bg-slate-50 transition-colors"><Settings size={19} /></button>
            <button onClick={() => setShowProfile(true)} aria-label={copy.profile} className="rounded-full bg-white p-2.5 text-slate-400 shadow-sm hover:bg-slate-50 transition-colors"><UserRound size={19} /></button>
            <button onClick={startCreate} className="ml-2 flex items-center gap-2 rounded-full bg-[#2462EB] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_14px_rgba(36,98,235,.35)] hover:brightness-110 transition">
              <Plus size={18} strokeWidth={3} />
              {t("common.newTrip")}
            </button>
          </div>
        </header>
        <h1 className="me-display mt-20 text-[27px] md:mt-12 md:text-[34px]">{copy.myTrips}</h1>
        <p className="mt-[-2px] text-sm text-slate-400">{copy.tripList}</p>
        <section className="mt-5 space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {loadingTrips && Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 shadow-sm animate-pulse md:h-[104px] md:flex-col md:items-start md:gap-3 md:p-5">
              <span className="h-14 w-14 rounded-lg bg-slate-200 md:h-16 md:w-16 md:rounded-2xl" />
              <span className="min-w-0 flex-1 space-y-2 md:w-full">
                <span className="block h-3 w-2/3 rounded-full bg-slate-200" />
                <span className="block h-2.5 w-1/2 rounded-full bg-slate-100" />
              </span>
            </div>
          ))}
          {!loadingTrips && trips.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm md:col-span-full">{copy.empty}</p>}
          {trips.map((trip) => (
            <React.Fragment key={trip.id}>
              <button onClick={() => openTrip(trip)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 md:h-full md:flex-col md:items-start md:gap-3 md:p-5 md:hover:shadow-md">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#DBE9FD] text-[#2462EB] md:h-16 md:w-16 md:rounded-2xl"><Compass size={25} /></span>
                <span className="min-w-0 flex-1 md:w-full"><strong className="block text-sm md:text-base">{trip.name}</strong><small className="text-xs text-slate-500">{trip.destination || t("common.destinationMissing")}</small></span>
                <ChevronRight className="text-[#c8d6eb] md:hidden" size={20} />
              </button>
              {activeScreen === "created" && trip.id === highlightedTrip && <section className="rounded-xl bg-white px-6 py-8 text-center shadow-[0_4px_8px_rgba(0,0,0,.2)] md:col-span-full"><h2 className="text-[17px] font-extrabold">{copy.created}</h2><p className="mt-5 text-[15px] leading-6 text-slate-600">{copy.createdHint}</p><Progress current={3} /></section>}
            </React.Fragment>
          ))}
        </section>
      </div>
      <nav
        className="fixed inset-x-4 z-40 rounded-[32px] bottom-nav-glass md:hidden"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between h-20 px-8 max-w-[410px] mx-auto">
          <button onClick={() => setShowSettings(true)} aria-label={copy.preferences} className="text-[#0A2342]"><Settings size={20} /></button>
          <button onClick={startCreate} aria-label={t("common.newTrip")} className="-mt-9 rounded-full border-4 border-white bg-[#2462EB] p-3.5 text-white shadow-[0_8px_14px_rgba(36,98,235,.45)]"><Plus size={32} strokeWidth={3} /></button>
          <button onClick={() => setShowProfile(true)} aria-label={copy.profile} className="text-[#0A2342]"><UserRound size={20} /></button>
        </div>
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
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/25 md:items-stretch md:justify-end" onClick={onClose}>
      <section
        className="flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-white p-6 shadow-2xl md:h-full md:max-h-full md:w-full md:max-w-md md:rounded-none md:rounded-l-3xl md:overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
        {children}
      </section>
    </div>
  );
}

function LanguageButtons({ language, onChange }: { language: LanguageCode; onChange: (language: LanguageCode) => void | Promise<void> }) {
  return <div className="mb-3 grid grid-cols-2 gap-2">{(["pt-BR", "en"] as const).map((locale) => <button key={locale} onClick={() => void onChange(locale)} className={`rounded-xl px-3 py-3 text-xs font-bold ${language === locale ? "bg-[#0A2342] text-white" : "bg-slate-100 text-slate-700"}`}>{locale === "pt-BR" ? "Português" : "English"}</button>)}</div>;
}
