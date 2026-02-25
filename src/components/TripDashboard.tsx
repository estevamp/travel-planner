import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Bus, LayoutDashboard, Lightbulb, LogOut, MapPin, Plane, Plus, Shield, DollarSign, FileText, Users, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber } from "../utils";
import { getThemeStyles } from "../utils/theme";
import type { UserSettings, Trip, ItineraryItem, Expense, Idea } from "../types";

// Hooks customizados
import { useTripData } from "../hooks/useTripData";
import { useTripBudget } from "../hooks/useTripBudget";
import { useTripList } from "../hooks/useTripList";

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

interface TripDashboardProps {
  session: Session;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
}

function TripDashboard({ session, settings, onSettingsChange }: TripDashboardProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Hooks customizados - toda lógica de dados encapsulada
  const { trip, setTrip, members, invites, categories, setCategories, loading, spouseByUserId, setSpouseByUserId, reloadTrip } = useTripData(id, session.user.id);
  const { tripBudget, setTripBudget, budgetOwnerUserId, budgetCurrency, setBudgetCurrency, reloadBudget } = useTripBudget(id, session.user.id);
  const { tripOptions, createTripFromSidebar, creatingTripFromSidebar, reloadTripOptions } = useTripList();
  
  // Estado local apenas para UI
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings">("itinerary");
  const [showMobileTripSelector, setShowMobileTripSelector] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'itinerary' | 'expense' | 'idea' | null>(null);
  
  // Moedas para cada formulário
  const [itineraryCurrency, setItineraryCurrency] = useState(settings.default_currency);
  const [expenseCurrency, setExpenseCurrency] = useState(settings.default_currency);
  const [ideaCurrency, setIdeaCurrency] = useState(settings.default_currency);

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
  };

  const closeModal = () => {
    setShowAddModal(false);
    setModalType(null);
  };

  // Realtime subscriptions (mantidas aqui para centralizar)
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`trip-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_links" }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_assets" }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_budgets", filter: `trip_id=eq.${id}` }, () => void reloadBudget())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, reloadTrip, reloadBudget]);

  // Funções de criação (mantidas aqui pois são usadas nos modais)
  const createItinerary = async (form: FormData) => {
    if (!id || !currentMember) return;
    const itineraryId = crypto.randomUUID();
    const title = ((form.get("title") as string) || "").trim() || "Item do itinerário";
    const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
    const visibility = form.get("is_private") === "on" ? "private" : "public";
    const type = form.get("type") as any;
    const description = (form.get("description") as string) || "";
    const location = (form.get("location") as string) || "";
    const now = new Date().toISOString();

    // Optimistic update
    const newItem: ItineraryItem = {
      id: itineraryId,
      trip_id: id,
      created_by_member_id: currentMember.id,
      type,
      title,
      description,
      location,
      start_time: now,
      end_time: now,
      amount,
      currency: itineraryCurrency,
      visibility,
      photo_url: null,
    };

    setTrip(prev => prev ? { ...prev, itinerary: [...prev.itinerary, newItem].sort((a, b) => a.start_time.localeCompare(b.start_time)) } : null);

    const { error } = await supabase.from("itinerary").insert({
      id: itineraryId,
      trip_id: id,
      created_by_member_id: currentMember.id,
      type,
      title,
      description,
      location,
      start_time: now,
      end_time: now,
      amount,
      currency: itineraryCurrency,
      visibility,
      photo_url: null,
    });

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    if (amount > 0) {
      await supabase.from("expenses").insert({
        id: crypto.randomUUID(),
        trip_id: id,
        created_by_member_id: currentMember.id,
        itinerary_item_id: itineraryId,
        description: title,
        amount,
        currency: itineraryCurrency,
        visibility,
        date: new Date().toISOString().split("T")[0],
      });
    }

    closeModal();
    setItineraryCurrency(settings.default_currency);
  };

  const createExpense = async (form: FormData) => {
    if (!id || !currentMember) return;
    const visibility = form.get("is_private") === "on" ? "private" : "public";
    const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
    const description = (form.get("description") as string) || "Despesa";
    const category_id = (form.get("category_id") as string) || null;
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
      category: category_id ? categories.find(c => c.id === category_id) || null : null
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
    });
    
    if (error) alert(getErrorMessage(error));
    else {
      closeModal();
      setExpenseCurrency(settings.default_currency);
    }
  };

  const createIdea = async (form: FormData) => {
    if (!id || !currentMember) return;
    const title = ((form.get("title") as string) || "").trim();
    if (!title) return;
    
    const visibility = form.get("is_private") === "on" ? "private" : "public";
    const estimatedAmount = parseCurrencyToNumber(form.get("estimated_amount") as string) || 0;
    const mapsUrl = ((form.get("maps_url") as string) || "").trim() || null;
    const ideaId = crypto.randomUUID();

    // Optimistic update
    const newIdea: Idea = {
      id: ideaId,
      trip_id: id,
      created_by_member_id: currentMember.id,
      title,
      maps_url: mapsUrl,
      estimated_amount: estimatedAmount,
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
      maps_url: mapsUrl,
      estimated_amount: estimatedAmount,
      currency: ideaCurrency,
      visibility,
      created_at: new Date().toISOString(),
    });

    if (error) alert(getErrorMessage(error));
    else {
      closeModal();
      setIdeaCurrency(settings.default_currency);
    }
  };

  const deleteCurrentTrip = async () => {
    if (!id || !trip || !isAdmin) return;
    const confirmed = window.confirm(`Excluir a viagem "${trip.name}"? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    await reloadTripOptions();
    navigate("/");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem não encontrada ou sem permissão.</div>;

  return (
    <div className="min-h-screen flex flex-col md:flex-row max-w-full overflow-x-hidden bg-[var(--bg-color)]" style={themedStyles}>
      {/* Sidebar Desktop */}
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
        <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
          <Plane size={18} />
          <span className="font-bold text-xl">Viajando</span>
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
            onClick={async () => {
              const newTripId = await createTripFromSidebar();
              if (newTripId) navigate(`/trip/${newTripId}`);
            }}
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
              <h2 className="text-2xl md:text-4xl font-bold truncate flex-1 bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/70 bg-clip-text text-transparent">{trip.name}</h2>
              <button
                onClick={() => setShowMobileTripSelector(true)}
                className="md:hidden p-2 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Trocar viagem"
              >
                <Bus size={20} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm md:text-base">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                <MapPin size={14} className="text-white" />
              </div>
              <span className="truncate font-medium">{trip.destination}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="px-4 py-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-xs font-bold uppercase flex items-center gap-2 shadow-lg">
                <Shield size={14} />
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
                    onClick={async () => {
                      setShowMobileTripSelector(false);
                      const newTripId = await createTripFromSidebar();
                      if (newTripId) navigate(`/trip/${newTripId}`);
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
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createItinerary(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <select name="type" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm">
            <option value="activity">Atividade</option>
            <option value="flight">Voo</option>
            <option value="bus">Ônibus</option>
            <option value="hotel">Hospedagem</option>
          </select>
          
          <input name="title" required placeholder="Título" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          <input name="location" placeholder="Local" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          
          <div className="grid grid-cols-2 gap-3">
            <input
              name="amount"
              placeholder="Valor (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
            />
            <CurrencySelector
              value={itineraryCurrency}
              onChange={setItineraryCurrency}
            />
          </div>
          
          <textarea name="description" placeholder="Notas" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm h-20" />
          
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_private" />
            Marcar como privado
          </label>
          
          <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
            Adicionar
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal && modalType === 'expense'}
        onClose={closeModal}
        title="Nova Despesa"
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createExpense(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <input name="description" required placeholder="Descrição" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          
          <select name="category_id" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm">
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          
          <div className="grid grid-cols-2 gap-3">
            <input
              name="amount"
              required
              placeholder="Valor"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
            />
            <CurrencySelector
              value={expenseCurrency}
              onChange={setExpenseCurrency}
            />
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_private" />
            Marcar como privado
          </label>
          
          <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
            Adicionar
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showAddModal && modalType === 'idea'}
        onClose={closeModal}
        title="Nova Ideia"
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await createIdea(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <input name="title" required placeholder="Título" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          <input name="maps_url" placeholder="URL do Google Maps" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          
          <div className="grid grid-cols-2 gap-3">
            <input
              name="estimated_amount"
              placeholder="Valor estimado (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
            />
            <CurrencySelector
              value={ideaCurrency}
              onChange={setIdeaCurrency}
            />
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_private" />
            Marcar como privado
          </label>
          
          <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold">
            Salvar Ideia
          </button>
        </form>
      </Modal>

      {/* Mobile Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 text-[var(--sidebar-text)]">
        <div className="grid grid-cols-6">
          <button type="button" onClick={() => setActiveTab("itinerary")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "itinerary" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <LayoutDashboard size={16} />
            <span className="text-[11px] font-medium">Atividades</span>
          </button>
          <button type="button" onClick={() => setActiveTab("expenses")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "expenses" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <DollarSign size={16} />
            <span className="text-[11px] font-medium">Despesas</span>
          </button>
          <button type="button" onClick={() => setActiveTab("ideas")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "ideas" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Lightbulb size={16} />
            <span className="text-[11px] font-medium">Ideias</span>
          </button>
          <button type="button" onClick={() => setActiveTab("documents")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "documents" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <FileText size={16} />
            <span className="text-[11px] font-medium">Docs</span>
          </button>
          <button type="button" onClick={() => setActiveTab("people")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "people" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Users size={16} />
            <span className="text-[11px] font-medium">Pessoas</span>
          </button>
          <button type="button" onClick={() => setActiveTab("settings")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "settings" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Settings size={16} />
            <span className="text-[11px] font-medium">Config</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default TripDashboard;
