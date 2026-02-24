import { LayoutDashboard, DollarSign, Lightbulb, FileText, Users, Settings } from "lucide-react";
import { cn } from "../../utils";

interface TripMobileNavProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export function TripMobileNav({ activeTab, setActiveTab }: TripMobileNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 text-[var(--sidebar-text)]">
      <div className="grid grid-cols-6">
        <button type="button" onClick={() => setActiveTab("itinerary")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "itinerary" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
          <LayoutDashboard size={16} />
          <span className="text-[11px] font-medium">Itinerário</span>
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
  );
}
