import { Plane, LayoutDashboard, DollarSign, Lightbulb, FileText, Users, Settings, Plus, LogOut } from "lucide-react";
import { SidebarItem } from "../SidebarItem";
import { cn } from "../../utils";
import { TripSummary } from "../../types";
import { supabase } from "../../supabase";

interface TripSidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  tripOptions: TripSummary[];
  currentTripId: string;
  navigate: (path: string) => void;
  creatingTripFromSidebar: boolean;
  createTripFromSidebar: () => void;
}

export function TripSidebar({
  activeTab,
  setActiveTab,
  tripOptions,
  currentTripId,
  navigate,
  creatingTripFromSidebar,
  createTripFromSidebar,
}: TripSidebarProps) {
  return (
    <aside className="w-64 border-r p-6 hidden md:flex flex-col gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
      <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
        <Plane size={18} />
        <span className="font-bold text-xl">Voyage</span>
      </button>
      <nav className="space-y-2">
        <SidebarItem icon={LayoutDashboard} label="Itinerário" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
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
              className={cn("w-full text-left rounded-xl border px-3 py-2", option.id === currentTripId ? "bg-[var(--sidebar-hover)] border-[var(--sidebar-active-bg)]" : "border-[var(--sidebar-border)] hover:bg-[var(--sidebar-hover)]")}
            >
              <p className="text-sm font-semibold truncate">{option.name}</p>
              <p className="text-xs opacity-80 truncate">{option.destination || "Sem destino"}</p>
            </button>
          ))}
          {tripOptions.length === 0 && <p className="text-xs opacity-70 px-1">Nenhuma viagem.</p>}
        </div>
        <button
          type="button"
          onClick={() => void createTripFromSidebar()}
          disabled={creatingTripFromSidebar}
          className="mt-3 w-full px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center justify-center gap-2 text-sm hover:bg-[var(--sidebar-hover)] disabled:opacity-60"
        >
          <Plus size={14} />
          {creatingTripFromSidebar ? "Criando..." : "Adicionar viagem"}
        </button>
      </div>
      <button onClick={() => void supabase.auth.signOut()} className="px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center gap-2 justify-center hover:bg-[var(--sidebar-hover)]">
        <LogOut size={16} />
        Sair
      </button>
    </aside>
  );
}
