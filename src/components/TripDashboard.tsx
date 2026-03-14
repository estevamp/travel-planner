import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Briefcase, HelpCircle, LayoutDashboard, Lightbulb, LogOut, ImagePlus, MapPin, Lock, Unlock, Plus, Crown, DollarSign, FileText, Users, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber, resizeImage } from "../utils";
import { getThemeStyles } from "../utils/theme";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { SyncIndicator } from "./SyncIndicator";
import type { UserSettings, Trip, ItineraryItem, Expense, Idea, CreateExpenseSplitInput, SplitType } from "../types";

// Context
import { TripProvider, useTripContext } from "../context/TripContext";

// Hooks customizados
import { useTripList } from "../hooks/useTripList";
import { useTour } from "../hooks/useTour";
import { useToast } from "../hooks/useToast";

// Componentes de abas
import { ItineraryTab } from "./tabs/ItineraryTab";
import { ExpensesTab } from "./tabs/ExpensesTab";
import { IdeasTab } from "./tabs/IdeasTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { PeopleTab } from "./tabs/PeopleTab";
import { SettingsTab } from "./tabs/SettingsTab";

// Componentes compartilhados
import { Card } from "./Card";
import { SidebarItem } from "./SidebarItem";
import { Modal } from "./Modal";
import { CurrencySelector } from "./CurrencySelector";
import { PayerSelector } from "./PayerSelector";
import { SplitSelector } from "./SplitSelector";
import { CreateTripModal } from "./CreateTripModal";

interface TripDashboardProps {
  session: Session;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
}

type ActiveTab = "itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings";

const VALID_TABS: readonly ActiveTab[] = [
  "itinerary", "expenses", "ideas", "documents", "people", "settings",
] as const;

function isValidTab(value: string): value is ActiveTab {
  return (VALID_TABS as readonly string[]).includes(value);
}

function TripDashboard({ session, settings, onSettingsChange }: TripDashboardProps) {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <TripProvider
      tripId={id}
      userId={session.user.id}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onTripDeleted={() => navigate('/')}
    >
      <TripDashboardContent session={session} />
    </TripProvider>
  );
}

interface TripDashboardContentProps {
  session: Session;
}

function TripDashboardContent({ session }: TripDashboardContentProps) {
  const navigate = useNavigate();
  
  // Get data from context
  const {
    trip, setTrip, members, categories, itineraryTypes, currentMember, isAdmin,
    settings, tripId, tripBudget
  } = useTripContext();
  
  const { tripOptions, createTripFromSidebar, creatingTripFromSidebar } = useTripList();
  const { toast } = useToast();
  
  // Estado local apenas para UI
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");
  const { startTour } = useTour(!!trip, setActiveTab);

  const { enqueue, pendingCount, isSyncing, isOnline } = useOfflineQueue();

    // Restaurar aba salva quando a viagem carrega (uma vez por id)
  useEffect(() => {
    if (!tripId) return;
    const saved = localStorage.getItem(`activeTab_${tripId}`);
    if (saved && isValidTab(saved)) {
      setActiveTab(saved);
    }
  }, [tripId]);

  const [swipeDirection, setSwipeDirection] = useState(0); // -1 esq, 1 dir
  const { onTouchStart, onTouchEnd, direction } = useSwipeTabs(activeTab, setActiveTab);

  // variants para slide horizontal
  const tabVariants = {
    enter: (dir: number) => ({
      x: dir === 0 ? 0 : (dir < 0 ? "100%" : "-100%"),
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir === 0 ? 0 : (dir < 0 ? "-100%" : "100%"),
      opacity: 0,
    }),
  };
  
  // Persistir aba atual
  useEffect(() => {
    if (tripId) {
      localStorage.setItem(`activeTab_${tripId}`, activeTab);
    }
  }, [activeTab, tripId]);
  const [showMobileTripSelector, setShowMobileTripSelector] = useState(false);
  const [showCreateTripModal, setShowCreateTripModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'itinerary' | 'expense' | 'idea' | null>(null);
  
  // Estados de submissão para evitar múltiplos cliques
  const [isSubmittingItinerary, setIsSubmittingItinerary] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [isSubmittingIdea, setIsSubmittingIdea] = useState(false);
  
  // Feature: Dia Todo (All Day)
  const [itineraryAllDay, setItineraryAllDay] = useState(false);
  
  // Moedas para cada formulário
  const [itineraryCurrency, setItineraryCurrency] = useState(settings.default_currency);
  const [expenseCurrency, setExpenseCurrency] = useState(settings.default_currency);
  const [ideaCurrency, setIdeaCurrency] = useState(settings.default_currency);
  
  // Estados para rateio de despesas (Criação)
  const [expensePayerId, setExpensePayerId] = useState<string>("");
  const [expenseSplits, setExpenseSplits] = useState<CreateExpenseSplitInput[]>([]);
  const [expenseSplitType, setExpenseSplitType] = useState<SplitType>("equal");
  const [expenseAmount, setExpenseAmount] = useState<string>("0");
  const [isExpenseSplitValid, setIsExpenseSplitValid] = useState(true);

  const themedStyles = useMemo(() => {
    const effectivePalette = trip?.theme_palette && trip.theme_palette !== 'default'
      ? trip.theme_palette
      : settings.theme_palette;
    return getThemeStyles({ ...settings, theme_palette: effectivePalette });
  }, [settings, trip?.theme_palette]);

  // Modal helpers
  const openModal = (type: 'itinerary' | 'expense' | 'idea') => {
    setModalType(type);
    setShowAddModal(true);
    if (type === 'itinerary') {
      setItineraryAllDay(false);
    }
    if (type === 'expense' && currentMember) {
      // Inicializar pagador como o usuário atual
      setExpensePayerId(currentMember.id);
      setExpenseSplits([]);
      setExpenseSplitType("equal");
      setExpenseAmount("0");
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setModalType(null);
    setItineraryAllDay(false);
    // Resetar estados de rateio
    setExpensePayerId("");
    setExpenseSplits([]);
    setExpenseSplitType("equal");
    setExpenseAmount("0");
  };

  // Funções de criação (mantidas aqui pois são usadas nos modais)
  const createItinerary = async (form: FormData) => {
    if (!tripId || !currentMember) return;
    
    setIsSubmittingItinerary(true);
    try {
      const itineraryId = crypto.randomUUID();
      const title = ((form.get("title") as string) || "").trim() || "Item do itinerário";
      const visibility = (form.get("visibility") as string) === "private" ? "private" : "public";
      const type_id = (form.get("type_id") as string) || null;
      const description = (form.get("description") as string) || "";
      const location = (form.get("location") as string) || "";
      
      // Handle all-day events
      let start_time: string | null = null;
      let end_time: string | null = null;
      
      if (itineraryAllDay) {
        const start_date = (form.get("start_date") as string) || null;
        const end_date = (form.get("end_date") as string) || null;
        // Store as dates only (00:00:00)
        start_time = start_date ? `${start_date}T00:00:00` : null;
        end_time = end_date ? `${end_date}T00:00:00` : null;
      } else {
        start_time = (form.get("start_time") as string) || null;
        end_time = (form.get("end_time") as string) || null;
      }
      
      const photoFile = form.get("photo") as File;
      let photo_url = null;

      if (photoFile && photoFile.size > 0) {
        try {
          photo_url = await resizeImage(photoFile);
        } catch (err) {
          console.error("Error resizing photo:", err);
        }
      }

      // Optimistic update
      const newItem: ItineraryItem = {
        id: itineraryId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        type_id,
        type: type_id ? (itineraryTypes.find(t => t.id === type_id) ?? null) : null,
        title,
        description,
        location,
        start_time,
        end_time,
        is_all_day: itineraryAllDay,
        amount: 0,
        currency: settings.default_currency,
        visibility,
        photo_url,
      };

      setTrip(prev => prev ? { ...prev, itinerary: [...prev.itinerary, newItem].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")) } : null);

      // ── OFFLINE GUARD ──
      const itineraryPayload = {
        id: itineraryId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        type_id,
        title,
        description,
        location,
        start_time,
        end_time,
        is_all_day: itineraryAllDay,
        amount: 0,
        currency: settings.default_currency,
        visibility,
        photo_url,
      };

      if (!isOnline) {
        enqueue({ id: itineraryId, tripId, type: "insert", table: "itinerary", payload: itineraryPayload });
        toast("Atividade salva offline — será sincronizada ao reconectar.", "info");
        closeModal();
        return;
      }
      // ── FIM OFFLINE GUARD ──
      
      const { error } = await supabase.from("itinerary").insert({
        id: itineraryId,
      trip_id: tripId,
      created_by_member_id: currentMember.id,
      type_id,
      title,
      description,
      location,
      start_time,
      end_time,
      is_all_day: itineraryAllDay,
      amount: 0,
      currency: settings.default_currency,
      visibility,
      photo_url,
    });

      if (error) {
        toast(getErrorMessage(error), 'error');
      } else {
        closeModal();
      }
    } finally {
      setIsSubmittingItinerary(false);
    }
  };

  const createExpense = async (form: FormData) => {
    if (!tripId || !currentMember) return;
    
    setIsSubmittingExpense(true);
    try {
      const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
      // Despesas com rateio devem ser obrigatoriamente públicas
      const visibility = expenseSplits.length > 0 ? "public" : ((form.get("visibility") as string) === "private" ? "private" : "public");
      const description = (form.get("description") as string) || "Despesa";
      const category_id = (form.get("category_id") as string) || null;
      const is_confirmed = form.get("is_confirmed") === "on";
      const expenseId = crypto.randomUUID();
      
      // Optimistic update
      const newExpense: Expense = {
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency: expenseCurrency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        category: category_id ? categories.find(c => c.id === category_id) || null : null,
        is_confirmed
      };

      setTrip(prev => prev ? { ...prev, expenses: [...prev.expenses, newExpense].sort((a, b) => a.date.localeCompare(b.date)) } : null);
    // ── OFFLINE GUARD 
      const expensePayload = {
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency: expenseCurrency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        is_confirmed,
        paid_by_member_id: expensePayerId || currentMember.id,
        split_type: expenseSplitType,
      };

      if (!isOnline) {
        enqueue({ id: expenseId, tripId, type: "insert", table: "expenses", payload: expensePayload });
        toast("Despesa salva offline — será sincronizada ao reconectar.", "info");
        closeModal();
        setExpenseCurrency(settings.default_currency);
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("expenses").insert({
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency: expenseCurrency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        is_confirmed,
        paid_by_member_id: expensePayerId || currentMember.id,
        split_type: expenseSplitType,
      });
      
      if (error) {
        toast(getErrorMessage(error), 'error');
      } else {
        // Salvar splits se houver
        if (expenseSplits.length > 0 && visibility === "public") {
          const { error: splitsError } = await supabase.from("expense_splits").insert(
            expenseSplits.map(split => ({
              expense_id: expenseId,
              member_id: split.member_id,
              amount: split.amount || 0,
              percentage: split.percentage,
            }))
          );
          
          if (splitsError) {
            console.error("Erro ao salvar splits:", splitsError);
            toast("Despesa criada, mas houve erro ao salvar o rateio: " + getErrorMessage(splitsError), 'error');
          }
        }
        
        closeModal();
        setExpenseCurrency(settings.default_currency);
      }
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const createIdea = async (form: FormData) => {
    if (!tripId || !currentMember) return;
    
    setIsSubmittingIdea(true);
    try {
      const title = ((form.get("title") as string) || "").trim();
      if (!title) return;
      
      const visibility = (form.get("visibility") as string) === "private" ? "private" : "public";
      const notes = ((form.get("notes") as string) || "").trim() || null;
      const mapsUrl = ((form.get("maps_url") as string) || "").trim() || null;
      const ideaId = crypto.randomUUID();

      // Optimistic update
      const newIdea: Idea = {
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency: ideaCurrency,
        visibility,
        is_converted: false,
        created_at: new Date().toISOString(),
      };

      setTrip(prev => prev ? { ...prev, ideas: [newIdea, ...(prev.ideas || [])] } : null);

      // ── OFFLINE GUARD ──
      const ideaPayload = {
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency: ideaCurrency,
        visibility,
        is_converted: false,
      };

      if (!isOnline) {
        enqueue({ id: ideaId, tripId, type: "insert", table: "ideas", payload: ideaPayload });
        toast("Ideia salva offline — será sincronizada ao reconectar.", "info");
        closeModal();
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("ideas").insert({
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency: ideaCurrency,
        visibility,
        created_at: new Date().toISOString(),
      });

      if (error) {
        toast(getErrorMessage(error), 'error');
      } else {
        closeModal();
        setIdeaCurrency(settings.default_currency);
      }
    } finally {
      setIsSubmittingIdea(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row max-w-full overflow-x-hidden bg-[var(--bg-color)]" style={themedStyles}>
      {/* Tab Progress Indicator — mobile only */}
      <div className="fixed top-0 inset-x-0 z-[60] md:hidden flex gap-1 px-4 pt-1 pointer-events-none">
        {VALID_TABS.map((tab) => (
          <motion.div
            key={tab}
            className="h-[3px] flex-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
            animate={{
              opacity: activeTab === tab ? 1 : 0.3,
              scaleY: activeTab === tab ? 1 : 0.7,
            }}
            transition={{ duration: 0.2 }}
            style={{ backgroundColor: 'var(--sidebar-active-bg)' }}
          />
        ))}
      </div>
        {/* Sidebar Desktop */}
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
        <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
          <img src="/favicon.svg" alt="Partiu!" className="w-6 h-6" />
          <span className="font-bold text-xl">Partiu!</span>
        </button>
        <nav className="space-y-2">
          <SidebarItem id="tour-tab-itinerary" icon={LayoutDashboard} label="Atividades" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem id="tour-tab-ideas" icon={Lightbulb} label="Ideias" active={activeTab === "ideas"} onClick={() => setActiveTab("ideas")} />
          <SidebarItem id="tour-tab-expenses" icon={DollarSign} label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem id="tour-tab-documents" icon={FileText} label="Documentos" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
          <SidebarItem id="tour-tab-people" icon={Users} label="Amigos" active={activeTab === "people"} onClick={() => setActiveTab("people")} />
          <SidebarItem icon={Settings} label="Configurações" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </nav>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs uppercase font-bold opacity-70 mb-2 px-1">Minhas viagens</p>
          <div className="space-y-2 overflow-y-auto pr-1">
            {tripOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => navigate(`/trip/${option.id}`)}
                // LAYOUT: cards de viagem com melhor separação visual e padding
                className={cn(
                  "w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-150",
                  option.id === tripId
                    ? "bg-[var(--sidebar-hover)] border-[var(--sidebar-active-bg)] shadow-sm"
                    : "border-[var(--sidebar-border)] hover:bg-[var(--sidebar-hover)] hover:border-[var(--sidebar-active-bg)]/40"
                )}
              >
                <p className="text-sm font-semibold truncate">{option.name}</p>
                <p className="text-xs opacity-80 truncate">{option.destination || "Sem destino"}</p>
              </button>
            ))}
            {tripOptions.length === 0 && <p className="text-xs opacity-70 px-1">Nenhuma viagem.</p>}
          </div>
          <button
            type="button"
            onClick={() => setShowCreateTripModal(true)}
            disabled={creatingTripFromSidebar}
            className="mt-3 w-full px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center justify-center gap-2 text-sm hover:bg-[var(--sidebar-hover)] disabled:opacity-60"
          >
            <Plus size={14} />
            {creatingTripFromSidebar ? "Criando..." : "Adicionar viagem"}
          </button>
        </div>
        <button onClick={() => void supabase.auth.signOut()} className="px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center gap-2 justify-center hover:bg-[var(--sidebar-hover)]">
          <LogOut size={16} />Sair
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 pb-24 md:p-10 relative"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        >
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2
                id="tour-trip-name"
                onClick={() => setActiveTab("itinerary")}
                className="text-2xl md:text-4xl font-bold truncate flex-1 bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/70 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity"
              >
                {trip.name} {isAdmin && (
                  <Crown size={14} className="md:hidden text-amber-400 opacity-80" title="Administrador da viagem" />
                )} 
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMobileTripSelector(true)}
                  className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-zinc-500 hover:bg-zinc-100 transition-colors"
                  aria-label="Trocar viagem"
                >
                  <Briefcase size={20} />
                </button>
                <button
                  onClick={startTour}
                  className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-zinc-500 hover:bg-zinc-100 transition-colors"
                  title="Ver tour do app"
                  aria-label="Tour do app"
                >
                  <HelpCircle size={18} />
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={cn(
                    "md:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors",
                    activeTab === "settings"
                      ? "text-[var(--sidebar-active-bg)] bg-[var(--sidebar-active-bg)]/10"
                      : "text-zinc-500 hover:bg-zinc-100"
                  )}
                  aria-label="Configurações"
                >
                  <Settings size={20} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm md:text-base">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform cursor-pointer"
                title="Ver no Google Maps"
              >
                <MapPin size={14} className="text-white" />
              </a>
              <span className="truncate font-medium">{trip.destination}</span>
            </div>
            <div className="mt-4 md:mt-6">
              <h3 className="text-lg md:text-xl font-bold text-zinc-800">
                {activeTab === "itinerary" && "Atividades"}
                {activeTab === "expenses" && "Despesas"}
                {activeTab === "ideas" && "Ideias"}
                {activeTab === "documents" && "Documentos"}
                {activeTab === "people" && "Amigos"}
                {activeTab === "settings" && "Configurações"}
              </h3>
                {activeTab !== "settings" && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {activeTab === "itinerary" && "Seu roteiro e as atividades planejadas para essa viagem"}
                    {activeTab === "ideas" && "Guarde ideias soltas e transforme as melhores em atividades com um toque"}
                    {activeTab === "expenses" && "Lance gastos, divida com amigos e não deixe o orçamento fugir do controle"}
                    {activeTab === "documents" && "Guarde aqui seus documentos, vouchers e reservas"}
                    {activeTab === "people" && "Convide amigos e planejem essa viagem juntos"}
                  </p>
                )}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {isAdmin && (
              <Crown size={14} className="text-amber-400 opacity-80" title="Administrador da viagem" />
            )}
          </div>
        </header>

        {/* Mobile Trip Selector */}
        <AnimatePresence>
          {showMobileTripSelector && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="w-full max-w-[95vw] rounded-3xl overflow-hidden shadow-2xl"
                style={{ backgroundColor: 'var(--card-bg)' }}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Minhas Viagens</h3>
                    <button
                      onClick={() => setShowMobileTripSelector(false)}
                      className="p-2 rounded-full transition-colors"
                      style={{ backgroundColor: 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Plus size={20} className="rotate-45" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {tripOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => {
                          navigate(`/trip/${option.id}`);
                          setShowMobileTripSelector(false);
                        }}
                        className={cn(
                          "w-full text-left rounded-2xl border p-4 transition-all",
                          option.id === tripId
                            ? "bg-[var(--sidebar-active-bg)] border-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                            : ""
                        )}
                        style={option.id !== tripId ? {
                          backgroundColor: 'var(--card-bg)',
                          borderColor: 'var(--card-border)'
                        } : undefined}
                      >
                        <p className="font-bold truncate">{option.name}</p>
                        <p className="text-sm opacity-80 truncate">{option.destination || "Sem destino"}</p>
                      </button>
                    ))}
                    {tripOptions.length === 0 && <p className="text-center py-8 text-zinc-500">Nenhuma viagem encontrada.</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileTripSelector(false);
                      setShowCreateTripModal(true);
                    }}
                    className="w-full py-4 rounded-2xl bg-black text-white font-bold flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Nova Viagem
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "itinerary" && <ItineraryTab onOpenModal={() => openModal('itinerary')} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "expenses"  && <ExpensesTab  onOpenModal={() => openModal('expense')}  onSetActiveTab={setActiveTab} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "ideas"     && <IdeasTab     onOpenModal={() => openModal('idea')}     onSetActiveTab={setActiveTab} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "documents" && <DocumentsTab onTripUpdate={setTrip} isOnline={isOnline}/>}
            {activeTab === "people"    && <PeopleTab    onTripUpdate={setTrip} isOnline={isOnline}/>}
            {activeTab === "settings"  && <SettingsTab />}
          </motion.div>
        </AnimatePresence>   
      </main>

      {/* Modals */}
      <Modal
        isOpen={showAddModal && modalType === 'itinerary'}
        onClose={closeModal}
        title="Nova Atividade"
        size="md"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createItinerary(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <select
            name="type_id"
            disabled={isSubmittingItinerary}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          >
            <option value="">Sem tipo</option>
            {itineraryTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 px-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="visibility"
                value="private"
                disabled={isSubmittingItinerary}
                className="rounded border-zinc-300 text-[var(--sidebar-active-bg)] focus:ring-[var(--sidebar-active-bg)]"
              />
              <div className="flex items-center gap-1.5 text-zinc-600">
                <Lock size={14} />
                <span>Privado (apenas eu e cônjuge)</span>
              </div>
            </label>
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Título</label>
            <input
              name="title"
              disabled={isSubmittingItinerary}
              required
              placeholder="Ex: Jantar no restaurante"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Local</label>
            <input
              name="location"
              disabled={isSubmittingItinerary}
              placeholder="Ex: Rua Augusta, 123"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input 
              type="checkbox" 
              disabled={isSubmittingItinerary} 
              checked={itineraryAllDay}
              onChange={(e) => setItineraryAllDay(e.target.checked)}
            />
            Dia todo
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Início</label>
              {itineraryAllDay ? (
                <input 
                  type="date" 
                  name="start_date" 
                  disabled={isSubmittingItinerary} 
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              ) : (
                <input
                  type="datetime-local"
                  name="start_time"
                  disabled={isSubmittingItinerary}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Fim</label>
              {itineraryAllDay ? (
                <input
                  type="date"
                  name="end_date"
                  disabled={isSubmittingItinerary}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              ) : (
                <input
                  type="datetime-local"
                  name="end_time"
                  disabled={isSubmittingItinerary}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              )}
            </div>
          </div>
          
          <textarea
            name="description"
            disabled={isSubmittingItinerary}
            placeholder="Notas"
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-base sm:text-sm h-20 disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          />
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Foto</label>
            <label className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all w-fit",
              isSubmittingItinerary ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
              settings.dark_mode
                ? "border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-400 hover:bg-zinc-700"
                : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-100"
            )}>
              <span className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg",
                settings.dark_mode ? "bg-zinc-700" : "bg-white shadow-sm"
              )}>
                <ImagePlus size={17} className={settings.dark_mode ? "text-zinc-300" : "text-zinc-500"} />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-semibold">Adicionar foto</span>
                <span className="text-[10px] opacity-60">JPG, PNG ou HEIC</span>
              </div>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="hidden"
                disabled={isSubmittingItinerary}
              />
            </label>
          </div>
          
          <button disabled={isSubmittingItinerary} className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmittingItinerary ? "Salvando..." : "Adicionar"}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal && modalType === 'expense'}
        onClose={closeModal}
        title="Nova Despesa"
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createExpense(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Descrição</label>
            <input
              name="description"
              disabled={isSubmittingExpense}
              required
              placeholder="Ex: Almoço"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          <select
            name="category_id"
            disabled={isSubmittingExpense}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          >
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Valor</label>
              <input
                name="amount"
                disabled={isSubmittingExpense}
                required
                placeholder="0,00"
                value={expenseAmount}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                onChange={(e) => {
                  const masked = maskCurrency(e.target.value);
                  setExpenseAmount(masked);
                  e.target.value = masked;
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Moeda</label>
              <CurrencySelector
                value={expenseCurrency}
                onChange={setExpenseCurrency}
                disabled={isSubmittingExpense}
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_confirmed" disabled={isSubmittingExpense} />
              Marcar como confirmada
            </label>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="visibility"
                  value="private"
                  disabled={isSubmittingExpense || expenseSplits.length > 0}
                  checked={expenseSplits.length > 0 ? false : undefined}
                  className="rounded border-zinc-300 text-[var(--sidebar-active-bg)] focus:ring-[var(--sidebar-active-bg)] disabled:opacity-50"
                />
                <div className={cn("flex items-center gap-1.5 text-zinc-600", expenseSplits.length > 0 && "opacity-50")}>
                  {expenseSplits.length > 0 ? <Unlock size={14} /> : <Lock size={14} />}
                  <span>{expenseSplits.length > 0 ? "Público (obrigatório para rateio)" : "Privado (apenas eu e cônjuge)"}</span>
                </div>
              </label>
            </div>
          </div>
          
          {/* Seção de Rateio */}
          <div className="border-t pt-4 space-y-4" style={{ borderColor: 'var(--card-border)' }}>
            <h3 className="text-[10px] font-bold uppercase text-zinc-400 px-1">Rateio</h3>
            
            <PayerSelector
              members={members}
              selectedPayerId={expensePayerId}
              currentUserId={session.user.id}
              onSelect={setExpensePayerId}
            />
            
            <SplitSelector
              key="create-expense-split"
              members={members}
              totalAmount={parseCurrencyToNumber(expenseAmount) || 0}
              currentUserId={session.user.id}
              onSplitsChange={(splits, splitType, isValid) => {
                setExpenseSplits(splits);
                setExpenseSplitType(splitType);
                setIsExpenseSplitValid(isValid);
              }}
              initialSplits={expenseSplits}
              initialSplitType={expenseSplitType}
            />

            {expenseSplits.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800/50">
                <Unlock size={14} className="text-blue-800 dark:text-blue-400 flex-shrink-0" />
                <p className="text-[10px] font-bold text-white dark:text-blue-300">
                  Despesas com rateio são obrigatoriamente públicas.
                </p>
                </div>
            )}
          </div>
          
          <button
            disabled={isSubmittingExpense || !isExpenseSplitValid}
            className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmittingExpense ? "Salvando..." : "Adicionar"}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal && modalType === 'idea'}
        onClose={closeModal}
        title="Nova Ideia"
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createIdea(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Qual a ideia?</label>
            <input
              name="title"
              disabled={isSubmittingIdea}
              required
              placeholder="Ex: Museu do Louvre"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Notas</label>
            <textarea
              name="notes"
              disabled={isSubmittingIdea}
              placeholder="Detalhes da ideia..."
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm h-20 disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">URL do Google Maps</label>
            <input
              name="maps_url"
              disabled={isSubmittingIdea}
              placeholder="https://goo.gl/maps/..."
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>

          <div className="flex items-center gap-2 px-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="visibility"
                value="private"
                disabled={isSubmittingIdea}
                className="rounded border-zinc-300 text-[var(--sidebar-active-bg)] focus:ring-[var(--sidebar-active-bg)]"
              />
              <div className="flex items-center gap-1.5 text-zinc-600">
                <Lock size={14} />
                <span>Privado (apenas eu e cônjuge)</span>
              </div>
            </label>
          </div>
          
          <p className="text-[10px] text-zinc-400 px-1 italic">Dica: Você poderá adicionar fotos, anexos e links extras após salvar a ideia, editando-a.</p>
          
          <button disabled={isSubmittingIdea} className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmittingIdea ? "Salvando..." : "Salvar Ideia"}
          </button>
        </form>
      </Modal>

      {/* Mobile Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 backdrop-blur-md text-[var(--sidebar-text)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 h-16">
          {([
            { tab: "itinerary",  icon: LayoutDashboard, label: "Atividades"   },
            { tab: "ideas",      icon: Lightbulb,        label: "Ideias"    },
            { tab: "expenses",   icon: DollarSign,       label: "Despesas"  },
            { tab: "documents",  icon: FileText,          label: "Docs"      },
            { tab: "people",     icon: Users,             label: "Amigos"   },
          ] as const).map(({ tab, icon: Icon, label }) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="relative flex flex-col items-center justify-center gap-0.5 transition-colors duration-150"
                style={{ color: isActive ? 'var(--sidebar-active-bg)' : 'var(--sidebar-text)' }}
              >
                {/* Indicador ativo */}
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full transition-all duration-300"
                    style={{ backgroundColor: 'var(--sidebar-active-bg)' }}
                  />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[9px] font-medium tracking-wide">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <CreateTripModal
        isOpen={showCreateTripModal}
        isDark={settings.dark_mode}
        onClose={() => setShowCreateTripModal(false)}
        onSubmit={async ({ name, destination }) => {
          try {
            const newTripId = await createTripFromSidebar(name, destination);
            if (newTripId) navigate(`/trip/${newTripId}`);
          } catch (error) {
            toast(getErrorMessage(error), 'error');
          }
        }}
      />
      <SyncIndicator
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        isOnline={isOnline}
        darkMode={settings.dark_mode}
      />
    </div>
  );
}

export default TripDashboard;
