import { cn } from "../utils";

export const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
      active ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]" : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]",
    )}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);
