// EXEMPLO DE COMO O TripDashboard.tsx REFATORADO FICARIA
// Este é um exemplo simplificado mostrando a estrutura principal

import React, { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AnimatePresence } from "motion/react";
import { supabase } from "../supabase";
import { getThemeStyles } from "../utils/theme";
import type { UserSettings } from "../types";

// Hooks customizados
import { useTripData } from "../hooks/useTripData";
import { useTripBudget } from "../hooks/useTripBudget";
import { useTripList } from "../hooks/useTripList";

// Componentes de abas
import { ItineraryTab } from "./tabs/ItineraryTab";
import { ExpensesTab } from "./tabs/ExpensesTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
// import { IdeasTab } from "./tabs/IdeasTab";
// import { PeopleTab } from "./tabs/PeopleTab";
// import { SettingsTab } from "./tabs/SettingsTab";

// Componentes compartilhados
import { Modal } from "./Modal";
import { Sidebar } from "./Sidebar"; // A criar
import { MobileNav } from "./MobileNav"; // A criar

interface TripDashboardProps {
  session: Session;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
}

function TripDashboard({ session, settings, onSettingsChange }: TripDashboardProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Hooks customizados - toda lógica de dados encapsulada
  const { trip, setTrip, members, invites, categories, setCategories, loading, reloadTrip } = useTripData(id, session.user.id);
  const { tripBudget, setTripBudget, budgetCurrency, setBudgetCurrency } = useTripBudget(id, session.user.id);
  const { tripOptions, createTripFromSidebar, creatingTripFromSidebar } = useTripList();
  
  // Estado local apenas para UI
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings">("itinerary");
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'itinerary' | 'expense' | 'idea' | null>(null);
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
  React.useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`trip-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `trip_id=eq.${id}` }, () => void reloadTrip())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, reloadTrip]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem não encontrada.</div>;

  return (
    <div className="min-h-screen flex flex-col md:flex-row max-w-full overflow-x-hidden bg-[var(--bg-color)]" style={themedStyles}>
      {/* Sidebar Desktop - pode ser extraído para componente */}
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)]">
        {/* Conteúdo da sidebar */}
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden p-4 pb-24 md:p-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
          <h2 className="text-2xl md:text-4xl font-bold">{trip.name}</h2>
        </header>

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
            />
          )}

          {activeTab === "documents" && (
            <DocumentsTab
              trip={trip}
              currentMember={currentMember}
              tripId={id!}
            />
          )}

          {/* Outras abas... */}
        </AnimatePresence>
      </main>

      {/* Modals - podem ser extraídos para componentes */}
      <Modal
        isOpen={showAddModal && modalType === 'itinerary'}
        onClose={closeModal}
        title="Nova Atividade"
        size="md"
      >
        {/* Formulário de itinerário */}
      </Modal>

      {/* Mobile Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden">
        {/* Navegação mobile */}
      </nav>
    </div>
  );
}

export default TripDashboard;

/*
BENEFÍCIOS DA REFATORAÇÃO:

1. TAMANHO DO ARQUIVO
   - Antes: 2724 linhas
   - Depois: ~500 linhas (redução de 82%)

2. SEPARAÇÃO DE RESPONSABILIDADES
   - Hooks: Lógica de dados e estado
   - Tabs: Apresentação e interação
   - Dashboard: Orquestração e navegação

3. REUTILIZAÇÃO
   - Hooks podem ser usados em outros contextos
   - Componentes de aba são independentes
   - Fácil criar novas features

4. MANUTENIBILIDADE
   - Cada arquivo tem uma responsabilidade clara
   - Bugs são mais fáceis de localizar
   - Testes unitários mais simples

5. PERFORMANCE
   - Code splitting automático
   - Lazy loading de abas possível
   - Re-renders mais otimizados

6. DEVELOPER EXPERIENCE
   - Janela de contexto menor para IA
   - Navegação mais rápida no código
   - Onboarding de novos devs facilitado
*/
