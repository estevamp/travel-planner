import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Briefcase, LayoutDashboard, Lightbulb, LogOut, MapPin, Plane, Plus, Shield, DollarSign, FileText, Users, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber, resizeImage } from "../utils";
import { getThemeStyles } from "../utils/theme";
import type { UserSettings, Trip, ItineraryItem, Expense, Idea, CreateExpenseSplitInput, SplitType } from "../types";

// Hooks customizados
import { useTripData } from "../hooks/useTripData";
import { useTripBudget } from "../hooks/useTripBudget";
import { useTripList } from "../hooks/useTripList";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { useRealtimeTrip } from "../hooks/useRealtimeTrip";

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

function TripDashboard({ session, settings, onSettingsChange }: TripDashboardProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Hooks customizados - toda lógica de dados encapsulada
  const {
    trip, setTrip, members, invites, categories, setCategories,
    itineraryTypes, setItineraryTypes, loading, loadError, notAuthorized,
    spouseByUserId, setSpouseByUserId, reloadTrip,
    reloadItinerary, reloadExpenses, reloadDocuments, reloadIdeas, reloadMembers,
  } = useTripData(id, session.user.id);
  const { tripBudget, setTripBudget, budgetOwnerUserId, budgetCurrency, setBudgetCurrency, reloadBudget } = useTripBudget(id, session.user.id);
  const { tripOptions, createTripFromSidebar, creatingTripFromSidebar, reloadTripOptions } = useTripList();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  
  // Estado local apenas para UI
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings">("itinerary");

  useEffect(() => {
    if (notAuthorized) {
      toast('Você não tem acesso a esta viagem.', 'error');
      navigate('/');
    }
  }, [notAuthorized, navigate, toast]);

  useEffect(() => {
    if (id) {
      localStorage.setItem(`activeTab_${id}`, activeTab);
    }
  }, [activeTab, id]);
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

  // Estados para rateio de despesas (Edição)
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpensePayerId, setEditExpensePayerId] = useState<string>("");
  const [editExpenseSplits, setEditExpenseSplits] = useState<CreateExpenseSplitInput[]>([]);
  const [editExpenseSplitType, setEditExpenseSplitType] = useState<SplitType>("equal");
  const [editExpenseAmount, setEditExpenseAmount] = useState<string>("0");
  const [editExpenseCurrency, setEditExpenseCurrency] = useState(settings.default_currency);
  const [isEditExpenseSplitValid, setIsEditExpenseSplitValid] = useState(true);

  // Computed values
  const currentMember = useMemo(() => members.find((member) => member.user_id === session.user.id) || null, [members, session.user.id]);
  const isAdmin = currentMember?.role === "admin";
  
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

  const openEditExpenseModal = async (expense: Expense) => {
    setEditingExpense(expense);
    setEditExpenseAmount(maskCurrency(String((expense.amount || 0) * 100)));
    setEditExpenseCurrency(expense.currency || settings.default_currency);
    
    // Buscar dados extras da despesa (pagador e tipo de rateio)
    const { data: expenseData } = await supabase
      .from("expenses")
      .select("paid_by_member_id, split_type")
      .eq("id", expense.id)
      .single();
    
    if (expenseData) {
      setEditExpensePayerId(expenseData.paid_by_member_id || currentMember?.id || "");
      setEditExpenseSplitType(expenseData.split_type || "equal");
    } else {
      setEditExpensePayerId(currentMember?.id || "");
      setEditExpenseSplitType("equal");
    }

    // Buscar splits existentes
    const { data: splitsData } = await supabase
      .from("expense_splits")
      .select("*")
      .eq("expense_id", expense.id);
    
    if (splitsData) {
      setEditExpenseSplits(splitsData.map(s => ({
        member_id: s.member_id,
        amount: s.amount,
        percentage: s.percentage,
      })));
    } else {
      setEditExpenseSplits([]);
    }

    setShowEditExpenseModal(true);
  };

  const closeEditExpenseModal = () => {
    setShowEditExpenseModal(false);
    setEditingExpense(null);
    setEditExpensePayerId("");
    setEditExpenseSplits([]);
    setEditExpenseSplitType("equal");
    setEditExpenseAmount("0");
  };

  // Realtime subscriptions centralizadas
  useRealtimeTrip(id, {
    onItineraryChange: reloadItinerary,
    onExpensesChange: reloadExpenses,
    onDocumentsChange: reloadDocuments,
    onIdeasChange: reloadIdeas,
    onMembersChange: reloadMembers,
    onBudgetChange: reloadBudget,
    onGlobalCatalogChange: reloadTrip,
  });

  // Funções de criação (mantidas aqui pois são usadas nos modais)
  const createItinerary = async (form: FormData) => {
    if (!id || !currentMember) return;
    
    setIsSubmittingItinerary(true);
    try {
      const itineraryId = crypto.randomUUID();
      const title = ((form.get("title") as string) || "").trim() || "Item do itinerário";
      const visibility = "public";
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
        trip_id: id,
        created_by_member_id: currentMember.id,
        type_id,
        type: type_id ? itineraryTypes.find(t => t.id === type_id) : null,
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

      const { error } = await supabase.from("itinerary").insert({
        id: itineraryId,
      trip_id: id,
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
    if (!id || !currentMember) return;
    
    setIsSubmittingExpense(true);
    try {
      const visibility = "public";
      const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
      const description = (form.get("description") as string) || "Despesa";
      const category_id = (form.get("category_id") as string) || null;
      const is_confirmed = form.get("is_confirmed") === "on";
      const expenseId = crypto.randomUUID();
      
      // Optimistic update
      const newExpense: Expense = {
        id: expenseId,
        trip_id: id,
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

      const { error } = await supabase.from("expenses").insert({
        id: expenseId,
        trip_id: id,
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

  const saveEditExpense = async (form: FormData) => {
    if (!editingExpense || !id || !currentMember) return;
    
    setIsSubmittingExpense(true);
    try {
      const visibility = "public";
      const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
      const description = (form.get("description") as string) || "Despesa";
      const category_id = (form.get("category_id") as string) || null;
      const is_confirmed = form.get("is_confirmed") === "on";
      
      // Optimistic update
      setTrip((prev) => prev ? ({
        ...prev,
        expenses: prev.expenses.map((exp) =>
          exp.id === editingExpense.id
            ? {
                ...exp,
                description,
                category_id,
                amount,
                currency: editExpenseCurrency,
                visibility,
                is_confirmed,
                category: category_id ? categories.find(c => c.id === category_id) || null : null
              }
            : exp
        ),
      }) : null);

      const { error } = await supabase
        .from("expenses")
        .update({
          description,
          amount,
          currency: editExpenseCurrency,
          category_id,
          visibility,
          is_confirmed,
          paid_by_member_id: editExpensePayerId,
          split_type: editExpenseSplitType,
        })
        .eq("id", editingExpense.id);
      
      if (error) {
        toast(getErrorMessage(error), 'error');
      } else {
        // Deletar splits antigos
        await supabase.from("expense_splits").delete().eq("expense_id", editingExpense.id);

        // Salvar novos splits se houver e for pública
        if (editExpenseSplits.length > 0 && visibility === "public") {
          const { error: splitsError } = await supabase.from("expense_splits").insert(
            editExpenseSplits.map(split => ({
              expense_id: editingExpense.id,
              member_id: split.member_id,
              amount: split.amount || 0,
              percentage: split.percentage,
            }))
          );
          
          if (splitsError) {
            console.error("Erro ao salvar splits na edição:", splitsError);
          }
        }
        
        closeEditExpenseModal();
      }
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const createIdea = async (form: FormData) => {
    if (!id || !currentMember) return;
    
    setIsSubmittingIdea(true);
    try {
      const title = ((form.get("title") as string) || "").trim();
      if (!title) return;
      
      const visibility = "public";
      const notes = ((form.get("notes") as string) || "").trim() || null;
      const mapsUrl = ((form.get("maps_url") as string) || "").trim() || null;
      const ideaId = crypto.randomUUID();

      // Optimistic update
      const newIdea: Idea = {
        id: ideaId,
        trip_id: id,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency: ideaCurrency,
        visibility,
        created_at: new Date().toISOString(),
      };

      setTrip(prev => prev ? { ...prev, ideas: [newIdea, ...prev.ideas] } : null);

      const { error } = await supabase.from("ideas").insert({
        id: ideaId,
        trip_id: id,
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

  const deleteCurrentTrip = async () => {
    if (!id || !trip || !isAdmin) return;
    const confirmed = await confirm({
      title: 'Excluir viagem?',
      message: `Excluir a viagem "${trip.name}"? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) {
      toast(getErrorMessage(error), 'error');
      return;
    }

    await reloadTripOptions();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)]" style={themedStyles}>
        <p className="text-zinc-500 animate-pulse">Carregando viagem...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-[var(--bg-color)]" style={themedStyles}>
        <p className="text-red-500 font-semibold text-center">{loadError}</p>
        <button
          onClick={() => void reloadTrip()}
          className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors"
        >
          Tentar novamente
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-zinc-500 hover:underline"
        >
          Voltar para minhas viagens
        </button>
      </div>
    );
  }

  if (!trip) return null; // notAuthorized vai redirecionar via useEffect acima

  return (
    <div className="min-h-screen flex flex-col md:flex-row max-w-full overflow-x-hidden bg-[var(--bg-color)]" style={themedStyles}>
      {/* Sidebar Desktop */}
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
        <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
          <Plane size={18} />
          <span className="font-bold text-xl">Partiu!</span>
        </button>
        <nav className="space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Atividades" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem icon={DollarSign} label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem icon={Lightbulb} label="Ideias" active={activeTab === "ideas"} onClick={() => setActiveTab("ideas")} />
          <SidebarItem icon={FileText} label="Documentos" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
          <SidebarItem icon={Users} label="Pessoas" active={activeTab === "people"} onClick={() => setActiveTab("people")} />
          <SidebarItem icon={Settings} label="Configurações" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </nav>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs uppercase font-bold opacity-70 mb-2 px-1">Minhas viagens</p>
          <div className="space-y-2 overflow-y-auto pr-1">
            {tripOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => navigate(`/trip/${option.id}`)}
                className={cn("w-full text-left rounded-xl border px-3 py-2", option.id === id ? "bg-[var(--sidebar-hover)] border-[var(--sidebar-active-bg)]" : "border-[var(--sidebar-border)] hover:bg-[var(--sidebar-hover)]")}
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
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 pb-24 md:p-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2
                onClick={() => setActiveTab("itinerary")}
                className="text-2xl md:text-4xl font-bold truncate flex-1 bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/70 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity"
              >
                {trip.name}
              </h2>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <div className="md:hidden px-2 py-1 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-[10px] font-bold uppercase flex items-center gap-1 shadow-md">
                    <Shield size={10} />
                    Admin
                  </div>
                )}
                <button
                  onClick={() => setShowMobileTripSelector(true)}
                  className="md:hidden flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors min-h-[44px] min-w-[44px]"
                  aria-label="Trocar viagem"
                >
                  <Briefcase size={20} />
                  <span className="text-[10px] font-bold uppercase">Viagens</span>
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
                {activeTab === "people" && "Pessoas"}
                {activeTab === "settings" && "Configurações"}
              </h3>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {isAdmin && (
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-md">
                <Shield size={12} />
                Admin
              </div>
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
                          option.id === id
                            ? "bg-[var(--sidebar-active-bg)] border-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                            : ""
                        )}
                        style={option.id !== id ? {
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

        {/* Tabs Content - Componentes separados */}
        <AnimatePresence mode="wait">
          {activeTab === "itinerary" && (
            <ItineraryTab
              trip={trip}
              currentMember={currentMember}
              settings={settings}
              itineraryTypes={itineraryTypes}
              onOpenModal={() => openModal('itinerary')}
              onTripUpdate={setTrip}
            />
          )}

          {activeTab === "expenses" && (
            <ExpensesTab
              trip={trip}
              currentMember={currentMember}
              categories={categories}
              settings={settings}
              tripBudget={tripBudget}
              onOpenModal={() => openModal('expense')}
              onOpenEditModal={openEditExpenseModal}
              onSetActiveTab={setActiveTab}
              onTripUpdate={setTrip}
            />
          )}

          {activeTab === "ideas" && (
            <IdeasTab
              trip={trip}
              currentMember={currentMember}
              isAdmin={isAdmin}
              settings={settings}
              onOpenModal={() => openModal('idea')}
              onSetActiveTab={setActiveTab}
              onTripUpdate={setTrip}
            />
          )}

          {activeTab === "documents" && (
            <DocumentsTab
              trip={trip}
              currentMember={currentMember}
              tripId={id!}
              onTripUpdate={setTrip}
              isDark={settings.dark_mode}
            />
          )}

          {activeTab === "people" && (
            <PeopleTab
              tripId={id!}
              members={members}
              invites={invites}
              currentMember={currentMember}
              isAdmin={isAdmin}
              settings={settings}
              spouseByUserId={spouseByUserId}
              trip={trip}
              onSettingsChange={onSettingsChange}
              onReloadTrip={reloadTrip}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              trip={trip}
              tripId={id!}
              currentMember={currentMember}
              isAdmin={isAdmin}
              settings={settings}
              members={members}
              categories={categories}
              itineraryTypes={itineraryTypes}
              onSetItineraryTypes={setItineraryTypes}
              tripBudget={tripBudget}
              budgetOwnerUserId={budgetOwnerUserId}
              budgetCurrency={budgetCurrency}
              userId={session.user.id}
              onSettingsChange={onSettingsChange}
              onSetCategories={setCategories}
              onSetTripBudget={setTripBudget}
              onSetTrip={setTrip}
              onDeleteTrip={deleteCurrentTrip}
              onReloadTripOptions={reloadTripOptions}
              onNavigateToAbout={() => navigate("/about")}
            />
          )}
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
              "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          >
            <option value="">Sem tipo</option>
            {itineraryTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Título</label>
            <input
              name="title"
              disabled={isSubmittingItinerary}
              required
              placeholder="Ex: Jantar no restaurante"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
                    "w-full px-3 py-2 rounded-xl border text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              ) : (
                <input
                  type="datetime-local"
                  name="start_time"
                  disabled={isSubmittingItinerary}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
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
                    "w-full px-3 py-2 rounded-xl border text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                  )}
                />
              ) : (
                <input
                  type="datetime-local"
                  name="end_time"
                  disabled={isSubmittingItinerary}
                  className={cn(
                    "w-full px-3 py-2 rounded-xl border text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
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
              "w-full px-3 py-2 rounded-xl border text-sm h-20 disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          />
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Foto</label>
            <input
              type="file"
              name="photo"
              accept="image/*"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
              disabled={isSubmittingItinerary}
            />
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
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          <select
            name="category_id"
            disabled={isSubmittingExpense}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
                  "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
          
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_confirmed" disabled={isSubmittingExpense} />
            Marcar como confirmada
          </label>
          
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
        isOpen={showEditExpenseModal}
        onClose={closeEditExpenseModal}
        title="Editar Despesa"
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveEditExpense(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Descrição</label>
            <input
              name="description"
              disabled={isSubmittingExpense}
              required
              defaultValue={editingExpense?.description}
              placeholder="Ex: Almoço"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          <select
            name="category_id"
            disabled={isSubmittingExpense}
            defaultValue={editingExpense?.category_id || ""}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
                value={editExpenseAmount}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                onChange={(e) => {
                  const masked = maskCurrency(e.target.value);
                  setEditExpenseAmount(masked);
                  e.target.value = masked;
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Moeda</label>
              <CurrencySelector
                value={editExpenseCurrency}
                onChange={setEditExpenseCurrency}
                disabled={isSubmittingExpense}
              />
            </div>
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_confirmed"
              disabled={isSubmittingExpense}
              defaultChecked={editingExpense?.is_confirmed}
            />
            Marcar como confirmada
          </label>
          
          {/* Seção de Rateio */}
          <div className="border-t pt-4 space-y-4" style={{ borderColor: 'var(--card-border)' }}>
            <h3 className="text-[10px] font-bold uppercase text-zinc-400 px-1">Rateio</h3>
            
            <PayerSelector
              members={members}
              selectedPayerId={editExpensePayerId}
              currentUserId={session.user.id}
              onSelect={setEditExpensePayerId}
            />
            
            <SplitSelector
              key={`edit-expense-split-${editingExpense?.id || 'new'}`}
              members={members}
              totalAmount={parseCurrencyToNumber(editExpenseAmount) || 0}
              currentUserId={session.user.id}
              onSplitsChange={(splits, splitType, isValid) => {
                setEditExpenseSplits(splits);
                setEditExpenseSplitType(splitType);
                setIsEditExpenseSplitValid(isValid);
              }}
              initialSplits={editExpenseSplits}
              initialSplitType={editExpenseSplitType}
            />
          </div>
          
          <button
            disabled={isSubmittingExpense || !isEditExpenseSplitValid}
            className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmittingExpense ? "Salvando..." : "Salvar Alterações"}
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
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
                "w-full px-3 py-2 rounded-xl border text-sm h-20 disabled:opacity-50 disabled:cursor-not-allowed",
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
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          
          <p className="text-[10px] text-zinc-400 px-1 italic">Dica: Você poderá adicionar fotos, anexos e links extras após salvar a ideia, editando-a.</p>
          
          <button disabled={isSubmittingIdea} className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmittingIdea ? "Salvando..." : "Salvar Ideia"}
          </button>
        </form>
      </Modal>

      {/* Mobile Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 text-[var(--sidebar-text)]">
        <div className="grid grid-cols-6">
          <button type="button" onClick={() => setActiveTab("itinerary")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "itinerary" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <LayoutDashboard size={24} />
          </button>
          <button type="button" onClick={() => setActiveTab("expenses")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "expenses" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <DollarSign size={24} />
          </button>
          <button type="button" onClick={() => setActiveTab("ideas")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "ideas" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <Lightbulb size={24} />
          </button>
          <button type="button" onClick={() => setActiveTab("documents")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "documents" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <FileText size={24} />
          </button>
          <button type="button" onClick={() => setActiveTab("people")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "people" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <Users size={24} />
          </button>
          <button type="button" onClick={() => setActiveTab("settings")} className={cn("flex flex-col items-center justify-center py-4", activeTab === "settings" ? "text-[var(--sidebar-active-bg)]" : "text-[var(--sidebar-text)]")}>
            <Settings size={24} />
          </button>
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

      {ConfirmDialogNode}
    </div>
  );
}

export default TripDashboard;
