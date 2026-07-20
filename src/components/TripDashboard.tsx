import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Briefcase, Download, HelpCircle, LayoutDashboard, Lightbulb, LogOut, ImagePlus, MapPin, Lock, Unlock, Plus, Crown, DollarSign, FileText, Users, Settings, FilePenLine, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber, exportItineraryToPdf } from "../utils";
import { getThemeStyles } from "../utils/theme";
import { useSwipeTabs } from "../hooks/useSwipeTabs";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { SyncIndicator } from "./SyncIndicator";
import type { UserSettings, CreateExpenseSplitInput, SplitType, Visibility } from "../types";

// Context
import { TripProvider, useTripContext } from "../context/TripContext";

// Hooks customizados
import { useTripList } from "../hooks/useTripList";
import { useTour } from "../hooks/useTour";
import { useToast } from "../hooks/useToast";
import { useCreateItinerary } from "../hooks/useCreateItinerary";
import { useCreateExpense } from "../hooks/useCreateExpense";
import { useCreateIdea } from "../hooks/useCreateIdea";

// Componentes de abas
import { ItineraryTab } from "./tabs/ItineraryTab";
import { ExpensesTab } from "./tabs/ExpensesTab";
import { IdeasTab } from "./tabs/IdeasTab";
import { DocumentsTab, type DocumentsTabHandle } from "./tabs/DocumentsTab";
import { PeopleTab, type PeopleTabHandle } from "./tabs/PeopleTab";
import { SettingsTab } from "./tabs/SettingsTab";

// Componentes compartilhados
import { Card } from "./Card";
import { SidebarItem } from "./SidebarItem";
import { Modal } from "./Modal";
import { CurrencySelector } from "./CurrencySelector";
import { PayerSelector } from "./PayerSelector";
import { SplitSelector } from "./SplitSelector";
import { OnboardingActivityModal, OnboardingDots } from "./OnboardingActivityModal";
import { useI18n } from "../i18n/I18nProvider";

interface TripDashboardProps {
  session: Session;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
  onOnboardingComplete: () => Promise<boolean>;
}

type ActiveTab = "itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings";

const VALID_TABS: readonly ActiveTab[] = [
  "itinerary", "expenses", "ideas", "documents", "people", "settings",
] as const;

function isValidTab(value: string): value is ActiveTab {
  return (VALID_TABS as readonly string[]).includes(value);
}

function TripDashboard({ session, settings, onSettingsChange, onOnboardingComplete }: TripDashboardProps) {
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
      <TripDashboardContent session={session} onOnboardingComplete={onOnboardingComplete} />
    </TripProvider>
  );
}

interface TripDashboardContentProps {
  session: Session;
  onOnboardingComplete: () => Promise<boolean>;
}

function TripDashboardContent({ session, onOnboardingComplete }: TripDashboardContentProps) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  
  // Get data from context
  const {
    trip, setTrip, members, categories, itineraryTypes, currentMember, isAdmin,
    settings, tripId,
  } = useTripContext();
  
  const { tripOptions } = useTripList();
  const { toast } = useToast();
  
  // Estado local apenas para UI
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");
  const setKnownActiveTab = useCallback((tab: string) => {
    if (isValidTab(tab)) {
      setActiveTab(tab);
    }
  }, []);
  const { startTour } = useTour(!!trip, setKnownActiveTab);

  const { enqueue, pendingCount, isSyncing, isOnline } = useOfflineQueue();

  // Restaurar aba salva quando a viagem carrega (uma vez por id)
  useEffect(() => {
    if (!tripId) return;
    const saved = localStorage.getItem(`activeTab_${tripId}`);
    if (saved && isValidTab(saved)) {
      setActiveTab(saved);
    }
  }, [tripId]);

  const { onTouchStart, onTouchEnd } = useSwipeTabs(activeTab, setActiveTab);

  // Header compacto ao rolar (mobile): aparece quando o header completo sai da tela
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useEffect(() => {
    const onScroll = () => setHeaderCollapsed(window.scrollY > 96);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Persistir aba atual
  useEffect(() => {
    if (tripId) {
      localStorage.setItem(`activeTab_${tripId}`, activeTab);
    }
  }, [activeTab, tripId]);

  const documentsTabRef = useRef<DocumentsTabHandle>(null);
  const peopleTabRef = useRef<PeopleTabHandle>(null);

  const [showMobileTripSelector, setShowMobileTripSelector] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'itinerary' | 'expense' | 'idea' | null>(null);
  const isGuidedTrip = settings.onboarding_status === "active" && settings.onboarding_trip_id === tripId;
  const [onboardingStep, setOnboardingStep] = useState<"hint" | "form" | "complete" | "done">("hint");

  // Custom hooks para CRUD
  const { create: createItinerary, isSubmitting: isSubmittingItinerary } = useCreateItinerary({
    enqueue,
    isOnline,
  });
  const { create: createExpense, isSubmitting: isSubmittingExpense } = useCreateExpense({
    enqueue,
    isOnline,
  });
  const { create: createIdea, isSubmitting: isSubmittingIdea } = useCreateIdea({
    enqueue,
    isOnline,
  });

  // Feature: Dia Todo (All Day)
  const [itineraryAllDay, setItineraryAllDay] = useState(false);
  const [itineraryVisibility, setItineraryVisibility] = useState<Visibility>("public");
  
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

  const handleExportPdf = () => {
    if (!trip || !members || !settings) {
      toast(t("itinerary.exportError"), "error");
      return;
    }
    try {
      exportItineraryToPdf(
        trip.name,
        trip.destination,
        trip.start_date,
        trip.end_date,
        trip.itinerary,
        itineraryTypes,
        members,
        settings.language_code,
        settings.default_currency
      );
      toast(t("itinerary.exportSuccess"), "success");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    }
  };

  // Modal helpers
  const openModal = (type: 'itinerary' | 'expense' | 'idea') => {
    setModalType(type);
    setShowAddModal(true);
    if (type === 'itinerary') {
      setItineraryAllDay(false);
      setItineraryVisibility("public");
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
    setItineraryVisibility("public");
    // Resetar estados de rateio
    setExpensePayerId("");
    setExpenseSplits([]);
    setExpenseSplitType("equal");
    setExpenseAmount("0");
  };

  // Wrappers para os hooks (adaptam as chamadas dos modais)
  const handleCreateItinerary = async (form: FormData) => {
    return createItinerary({
      form,
      allDay: itineraryAllDay,
      onClose: closeModal,
    });
  };

  const createFirstActivity = async (form: FormData) => {
    // Sem campo de data no formulário guiado: agenda para hoje (dia todo)
    // para o item aparecer agrupado sob uma data na Agenda, como no figma.
    const today = format(new Date(), "yyyy-MM-dd");
    form.set("start_date", today);
    form.set("end_date", today);
    const created = await createItinerary({
      form,
      allDay: true,
      onClose: () => undefined,
    });
    if (created) {
      await onOnboardingComplete();
      setOnboardingStep("complete");
    }
    return created;
  };

  const handleCreateExpense = async (form: FormData) => {
    await createExpense({
      form,
      payerId: expensePayerId,
      splits: expenseSplits,
      splitType: expenseSplitType,
      currency: expenseCurrency,
      paymentDate: (form.get("payment_date") as string) || null,
      onClose: closeModal,
      onResetCurrency: () => setExpenseCurrency(settings.default_currency),
    });
  };

  const handleCreateIdea = async (form: FormData) => {
    await createIdea({
      form,
      currency: ideaCurrency,
      onClose: closeModal,
      onResetCurrency: () => setIdeaCurrency(settings.default_currency),
    });
  };

  const tabLabels: Record<ActiveTab, string> = {
    itinerary: t("common.itinerary"),
    expenses: t("common.expenses"),
    ideas: t("common.ideas"),
    documents: t("common.documents"),
    people: t("common.people"),
    settings: t("common.settings"),
  };
  const tabDescriptions: Partial<Record<ActiveTab, string>> = {
    ideas: t("dashboard.tab.ideas.description"),
    expenses: t("dashboard.tab.expenses.description"),
    documents: t("dashboard.tab.documents.description"),
    people: t("dashboard.tab.people.description"),
  };

  const renderNavButton = (tab: ActiveTab, Icon: typeof LayoutDashboard, label: string) => {
    const isActive = activeTab === tab;
    const inactiveColor = settings.dark_mode ? "#A1A1AA" : "#71717A";
    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 my-1.5 rounded-2xl transition-all duration-200",
          isActive ? "bg-[var(--sidebar-active-bg)]/12" : ""
        )}
        style={{ color: isActive ? 'var(--sidebar-active-bg)' : inactiveColor }}
      >
        <Icon
          size={24}
          strokeWidth={isActive ? 2.3 : 1.8}
          className="transition-transform duration-200"
          style={{ transform: isActive ? 'scale(1.14)' : 'scale(1)' }}
        />
        <span className={cn("text-[9.5px] tracking-wide transition-all duration-200", isActive ? "font-bold" : "font-medium")}>{label}</span>
      </button>
    );
  };

  return (
    // overflow-x-clip (e não hidden) para não quebrar position:sticky dos descendentes
    <div className="min-h-screen flex flex-col md:flex-row max-w-full overflow-x-clip bg-[var(--bg-color)]" style={themedStyles}>
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

      {/* Header compacto — mobile, visível apenas após rolar além do header completo */}
      <AnimatePresence>
        {headerCollapsed && (
          <motion.div
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed top-0 inset-x-0 z-50 md:hidden flex items-center gap-2 h-12 px-4 border-b border-[var(--sidebar-border)] bg-[var(--bg-color)]/95 backdrop-blur-md"
          >
            <p className="font-bold text-sm truncate text-[var(--accent-color)]">{trip.name}</p>
            <span className="text-xs opacity-40 flex-shrink-0">·</span>
            <p className="text-xs font-medium opacity-60 truncate flex-shrink-0">
              {tabLabels[activeTab]}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Sidebar Desktop */}
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
        <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
          <img src="/favicon.svg" alt="Partiu!" className="w-6 h-6" />
          <span className="font-bold text-xl">Partiu!</span>
        </button>
        <nav className="space-y-2">
          <SidebarItem id="tour-tab-itinerary" icon={LayoutDashboard} label={t("common.itinerary")} active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem id="tour-tab-ideas" icon={Lightbulb} label={t("common.ideas")} active={activeTab === "ideas"} onClick={() => setActiveTab("ideas")} />
          <SidebarItem id="tour-tab-expenses" icon={DollarSign} label={t("common.expenses")} active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem id="tour-tab-documents" icon={FileText} label={t("common.documents")} active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
          <SidebarItem id="tour-tab-people" icon={Users} label={t("common.people")} active={activeTab === "people"} onClick={() => setActiveTab("people")} />
          <SidebarItem icon={Settings} label={t("common.settings")} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </nav>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs uppercase font-bold opacity-70 mb-2 px-1">{t("dashboard.myTrips")}</p>
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
                <p className="text-xs opacity-80 truncate">{option.destination || t("common.destinationMissing")}</p>
              </button>
            ))}
            {tripOptions.length === 0 && <p className="text-xs opacity-70 px-1">{t("landing.noTrips")}</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate("/?new=trip")}
            className="mt-3 w-full px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center justify-center gap-2 text-sm hover:bg-[var(--sidebar-hover)]"
          >
            <Plus size={14} />
            {t("dashboard.addTrip")}
          </button>
        </div>
        <button onClick={() => void supabase.auth.signOut()} className="px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center gap-2 justify-center hover:bg-[var(--sidebar-hover)]">
          <LogOut size={16} />{t("common.signOut")}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-clip p-4 pb-24 md:p-10 relative"
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
                  <span title={t("dashboard.admin")} aria-label={t("dashboard.admin")}>
                    <Crown size={14} className="md:hidden text-amber-400 opacity-80" />
                  </span>
                )} 
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMobileTripSelector(true)}
                  className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-zinc-500 hover:bg-zinc-100 transition-colors"
                  aria-label={t("dashboard.switchTrip")}
                >
                  <Briefcase size={20} />
                </button>
                <button
                  onClick={startTour}
                  className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-zinc-500 hover:bg-zinc-100 transition-colors"
                  title={t("dashboard.appTour")}
                  aria-label={t("dashboard.appTour")}
                >
                  <HelpCircle size={18} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm md:text-base">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform cursor-pointer"
                title={t("dashboard.viewMaps")}
              >
                <MapPin size={14} className="text-white" />
              </a>
              <span className="truncate font-medium">{trip.destination}</span>
            </div>
            <div className="mt-4 md:mt-6 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className={cn("text-lg md:text-xl font-bold", settings.dark_mode ? "text-zinc-100" : "text-zinc-800")}>
                  {tabLabels[activeTab]}
                </h3>
                {tabDescriptions[activeTab] && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {tabDescriptions[activeTab]}
                  </p>
                )}
              </div>
              {activeTab === "itinerary" && (
                <button
                  onClick={handleExportPdf}
                  title={t("dashboard.exportToPDF")}
                  aria-label={t("dashboard.exportToPDF")}
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 transition-all",
                    settings.dark_mode
                      ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  <Download size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {isAdmin && (
              <span title={t("dashboard.admin")} aria-label={t("dashboard.admin")}>
                <Crown size={14} className="text-amber-400 opacity-80" />
              </span>
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
                    <h3 className="text-xl font-bold">{t("dashboard.myTrips")}</h3>
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
                        <p className="text-sm opacity-80 truncate">{option.destination || t("common.destinationMissing")}</p>
                      </button>
                    ))}
                    {tripOptions.length === 0 && <p className="text-center py-8 text-zinc-500">{t("dashboard.noTripsFound")}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/?new=trip");
                    }}
                    className="w-full py-4 rounded-2xl bg-black text-white font-bold flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    {t("common.newTrip")}
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
            {activeTab === "itinerary" && <ItineraryTab onOpenModal={() => isGuidedTrip ? setOnboardingStep("form") : openModal('itinerary')} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "expenses"  && <ExpensesTab  onOpenModal={() => openModal('expense')}  onSetActiveTab={setKnownActiveTab} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "ideas"     && <IdeasTab     onOpenModal={() => openModal('idea')}     onSetActiveTab={setKnownActiveTab} onTripUpdate={setTrip} isOnline={isOnline} enqueue={enqueue}/>}
            {activeTab === "documents" && <DocumentsTab ref={documentsTabRef} onTripUpdate={setTrip} isOnline={isOnline}/>}
            {activeTab === "people"    && <PeopleTab    ref={peopleTabRef}    onTripUpdate={setTrip} isOnline={isOnline}/>}
            {activeTab === "settings"  && <SettingsTab />}
          </motion.div>
        </AnimatePresence>   
      </main>

      {/* Modals */}
      <Modal
        isOpen={showAddModal && modalType === 'itinerary'}
        onClose={closeModal}
        title={t("dashboard.newActivity")}
        size="md"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const created = await handleCreateItinerary(new FormData(e.currentTarget));
            if (created) (e.target as HTMLFormElement).reset();
          }}
        >
          {(() => {
            const isDark = settings.dark_mode;
            const fieldLabelClass = cn(
              "block text-xs font-semibold mb-1.5",
              isDark ? "text-zinc-400" : "text-zinc-600"
            );
            const fieldIconClass = cn(
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none",
              isDark ? "text-zinc-500" : "text-zinc-400"
            );
            const fieldInputClass = cn(
              "w-full pl-10 pr-3 py-3 rounded-2xl border text-[15px] transition-all disabled:opacity-50 disabled:cursor-not-allowed",
              "focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)]",
              isDark
                ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"
            );
            const fieldTextareaClass = cn(
              "w-full px-3.5 py-3 rounded-2xl border text-[15px] transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed",
              "focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)]",
              isDark
                ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"
            );

            return (
            <>
              <div>
                <label className={fieldLabelClass}>{t("dashboard.type")}</label>
                <div className="relative">
                  <FilePenLine size={16} className={fieldIconClass} />
                  <select
                    name="type_id"
                    disabled={isSubmittingItinerary}
                    className={fieldInputClass}
                  >
                    <option value="">{t("dashboard.noType")}</option>
                    {itineraryTypes.map((type) => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <input type="hidden" name="visibility" value={itineraryVisibility} />

              <div>
                <label className={fieldLabelClass}>{t("dashboard.visibility")}</label>
                <div
                  className={cn(
                    "grid grid-cols-2 gap-1 rounded-2xl border p-1",
                    isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
                  )}
                >
                  {(["public", "private"] as const).map((visibility) => {
                    const active = itineraryVisibility === visibility;
                    const Icon = visibility === "public" ? Users : Lock;
                    return (
                      <button
                        key={visibility}
                        type="button"
                        disabled={isSubmittingItinerary}
                        onClick={() => setItineraryVisibility(visibility)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? isDark
                              ? "bg-zinc-700 text-white"
                              : "bg-white text-zinc-900 shadow-sm"
                            : isDark
                            ? "text-zinc-400 hover:text-zinc-200"
                            : "text-zinc-500 hover:text-zinc-700"
                        )}
                        aria-pressed={active}
                      >
                        <Icon size={13} />
                        {visibility === "public" ? t("common.public") : t("common.private")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={cn(fieldLabelClass, "required-indicator")}>{t("dashboard.title")}</label>
                <div className="relative">
                  <FilePenLine size={16} className={fieldIconClass} />
                  <input
                    name="title"
                    disabled={isSubmittingItinerary}
                    required
                    placeholder={t("dashboard.titlePlaceholder")}
                    className={fieldInputClass}
                  />
                </div>
              </div>

              <div>
                <label className={fieldLabelClass}>{t("dashboard.location")}</label>
                <div className="relative">
                  <MapPin size={16} className={fieldIconClass} />
                  <input
                    name="location"
                    disabled={isSubmittingItinerary}
                    placeholder={t("dashboard.locationPlaceholder")}
                    className={fieldInputClass}
                  />
                </div>
              </div>

              <div>
                <label className={fieldLabelClass}>{t("dashboard.link")}</label>
                <div className="relative">
                  <ExternalLink size={16} className={fieldIconClass} />
                  <input
                    name="url"
                    disabled={isSubmittingItinerary}
                    placeholder={t("dashboard.linkPlaceholder")}
                    className={fieldInputClass}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmittingItinerary}
                onClick={() => setItineraryAllDay((cur) => !cur)}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded-2xl border px-3.5 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
                )}
                aria-pressed={itineraryAllDay}
              >
                <span
                  className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
                  style={{
                    backgroundColor: itineraryAllDay
                      ? "var(--accent-color)"
                      : isDark
                      ? "#3f3f46"
                      : "#d4d4d8",
                  }}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: itineraryAllDay ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </span>
                <span className={cn("text-sm font-medium", isDark ? "text-zinc-200" : "text-zinc-700")}>
                  {t("dashboard.allDay")}
                </span>
              </button>

              <div className="min-w-0">
                <label className={fieldLabelClass}>{t("dashboard.start")}</label>
                {itineraryAllDay ? (
                  <input
                    type="date"
                    name="start_date"
                    disabled={isSubmittingItinerary}
                    className={cn(fieldInputClass, "pl-3 min-w-0 max-w-full appearance-none", isDark && "color-scheme-dark")}
                  />
                ) : (
                  <input
                    type="datetime-local"
                    name="start_time"
                    disabled={isSubmittingItinerary}
                    className={cn(fieldInputClass, "pl-3 min-w-0 max-w-full appearance-none", isDark && "color-scheme-dark")}
                  />
                )}
              </div>

              <div className="min-w-0">
                <label className={fieldLabelClass}>{t("dashboard.end")}</label>
                {itineraryAllDay ? (
                  <input
                    type="date"
                    name="end_date"
                    disabled={isSubmittingItinerary}
                    className={cn(fieldInputClass, "pl-3 min-w-0 max-w-full appearance-none", isDark && "color-scheme-dark")}
                  />
                ) : (
                  <input
                    type="datetime-local"
                    name="end_time"
                    disabled={isSubmittingItinerary}
                    className={cn(fieldInputClass, "pl-3 min-w-0 max-w-full appearance-none", isDark && "color-scheme-dark")}
                  />
                )}
              </div>

              <div>
                <label className={fieldLabelClass}>{t("dashboard.notes")}</label>
                <textarea
                  name="description"
                  disabled={isSubmittingItinerary}
                  placeholder={t("dashboard.notes")}
                  rows={3}
                  className={fieldTextareaClass}
                />
              </div>

              <div>
                <label className={fieldLabelClass}>{t("dashboard.photo")}</label>
                <label className={cn(
                  "flex flex-col items-center justify-center gap-1.5 w-full py-6 rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
                  isSubmittingItinerary ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
                  isDark
                    ? "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100"
                )}>
                  <ImagePlus size={20} />
                  <span className="text-xs font-medium">{t("dashboard.addPhoto")}</span>
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="hidden"
                    disabled={isSubmittingItinerary}
                  />
                </label>
              </div>

              <button
                disabled={isSubmittingItinerary}
                className="w-full text-white py-3 rounded-2xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
                style={{
                  backgroundColor: "var(--accent-color)",
                  boxShadow: "0 8px 20px -8px var(--accent-color)",
                }}
              >
                {isSubmittingItinerary ? t("common.saving") : t("common.add")}
              </button>
            </>
            );
          })()}
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal && modalType === 'expense'}
        onClose={closeModal}
        title={t("dashboard.newExpense")}
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await handleCreateExpense(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">{t("dashboard.description")}</label>
            <input
              name="description"
              disabled={isSubmittingExpense}
              required
              placeholder={t("dashboard.descriptionPlaceholderExpense")}
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
            <option value="">{t("dashboard.noCategory")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.paymentDate")}</label>
              <input
                type="date"
                name="payment_date"
                disabled={isSubmittingExpense}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">{t("dashboard.amount")}</label>
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
                  const masked = maskCurrency(e.target.value, settings.language_code);
                  setExpenseAmount(masked);
                  e.target.value = masked;
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.currency")}</label>
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
              {t("dashboard.markConfirmed")}
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
                  <span>{expenseSplits.length > 0 ? t("dashboard.publicRequiredForSplit") : t("dashboard.privateWithSpouse")}</span>
                </div>
              </label>
            </div>
          </div>
          
          {/* Seção de Rateio */}
          <div className="border-t pt-4 space-y-4" style={{ borderColor: 'var(--card-border)' }}>
            <h3 className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.split")}</h3>
            
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
                  {t("dashboard.splitPublicNotice")}
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
        title={t("ideas.modalNewTitle")}
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await handleCreateIdea(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">{t("ideas.modalIdeaLabel")}</label>
            <input
              name="title"
              disabled={isSubmittingIdea}
              required
              placeholder={t("ideas.modalTitlePlaceholder")}
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.notes")}</label>
            <textarea
              name="notes"
              disabled={isSubmittingIdea}
              placeholder={t("ideas.modalNotesPlaceholder")}
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm h-20 disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("ideas.modalMapsLabel")}</label>
            <input
              name="maps_url"
              disabled={isSubmittingIdea}
              placeholder={t("ideas.modalMapsPlaceholder")}
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
                <span>{t("dashboard.privateWithSpouse")}</span>
              </div>
            </label>
          </div>
          
          <p className="text-[10px] text-zinc-400 px-1 italic">{t("ideas.modalHint")}</p>
          
          <button disabled={isSubmittingIdea} className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmittingIdea ? t("common.saving") : t("ideas.modalSave")}
          </button>
        </form>
      </Modal>

      {/* Mobile Navigation — premium glass, estilo Meta (Instagram/Threads) */}
      <nav
        className={cn(
          "fixed inset-x-4 z-40 md:hidden rounded-[24px] transition-colors duration-200",
          settings.dark_mode ? "bottom-nav-glass-dark" : "bottom-nav-glass"
        )}
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-7 h-[4.5rem] px-1">
          {([
            { tab: "itinerary" as const, icon: LayoutDashboard, label: tabLabels.itinerary },
            { tab: "ideas" as const,     icon: Lightbulb,       label: tabLabels.ideas },
            { tab: "expenses" as const,  icon: DollarSign,      label: tabLabels.expenses },
          ]).map(({ tab, icon, label }) => renderNavButton(tab, icon, label))}

          {(() => {
            const addHandler: Record<typeof activeTab, (() => void) | null> = {
              ideas: () => openModal('idea'),
              expenses: () => openModal('expense'),
              itinerary: () => (isGuidedTrip ? setOnboardingStep("form") : openModal('itinerary')),
              documents: () => documentsTabRef.current?.openAdd(),
              people: () => peopleTabRef.current?.openAdd(),
              settings: null,
            };
            const onAdd = addHandler[activeTab];
            const highlightOnboarding = isGuidedTrip && onboardingStep === "hint";
            return (
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onAdd?.()}
                  disabled={!onAdd}
                  aria-label={t("common.add")}
                  className={cn(
                    "-mt-9 rounded-full border-4 border-white p-3.5 text-white shadow-[0_8px_14px_rgba(0,0,0,.25)] transition-transform active:scale-95 disabled:opacity-40",
                    highlightOnboarding && "z-[75] ring-4 ring-white shadow-[0_8px_22px_rgba(0,0,0,.35)]"
                  )}
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  <Plus size={32} strokeWidth={3} />
                </button>
              </div>
            );
          })()}

          {([
            { tab: "documents" as const, icon: FileText, label: "Docs" },
            { tab: "people" as const,    icon: Users,    label: tabLabels.people },
            { tab: "settings" as const,  icon: Settings, label: "Config" },
          ]).map(({ tab, icon, label }) => renderNavButton(tab, icon, label))}
        </div>
      </nav>

      {isGuidedTrip && onboardingStep === "hint" && activeTab === "itinerary" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[70] mx-auto w-[min(86vw,360px)] rounded-2xl bg-white p-6 text-center shadow-[0_8px_22px_rgba(0,0,0,.22)] md:bottom-28">
          <p className="text-[16px] leading-6 text-slate-600">
            {language === "en"
              ? <>Click the <strong className="text-[#2462EB]">+</strong> to create your<br />first activity</>
              : <>Clique no <strong className="text-[#2462EB]">+</strong> para criar sua<br />primeira atividade</>}
          </p>
          <OnboardingDots current={4} />
        </div>
      )}
      <OnboardingActivityModal
        isOpen={isGuidedTrip && onboardingStep === "form"}
        types={itineraryTypes}
        isSubmitting={isSubmittingItinerary}
        onSubmit={createFirstActivity}
      />
      {onboardingStep === "complete" && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/10 px-5 pb-20" onClick={() => setOnboardingStep("done")}>
          <section className="w-full max-w-[380px] rounded-3xl bg-white p-7 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-[25px] leading-9 font-extrabold text-[#0A2342]">
              {language === "en" ? <>Your itinerary is<br />coming to life!</> : <>Seu roteiro já está<br />ganhando vida!</>}
            </h2>
            <p className="mt-4 text-[20px] leading-8 text-slate-600">
              {language === "en"
                ? "Explore all the features and keep personalizing your trip."
                : "Explore todas as funcionalidades e continue personalizando sua viagem."}
            </p>
            <OnboardingDots current={6} />
            <button onClick={() => setOnboardingStep("done")} className="mt-6 rounded-xl bg-[#2462EB] px-6 py-3 text-sm font-bold text-white">{language === "en" ? "Continue" : "Continuar"}</button>
          </section>
        </div>
      )}
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
