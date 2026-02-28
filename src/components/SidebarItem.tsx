import type { LucideIcon } from 'lucide-react';
import { cn } from "../utils";

export const SidebarItem = ({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      // LAYOUT: padding aumentado de py-3 para py-2.5, gap ajustado
      "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-150",
      active
        ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-sm"
        : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] opacity-80 hover:opacity-100",
    )}
  >
    {/* LAYOUT: ícone levemente menor no inativo para hierarquia */}
    <Icon size={active ? 20 : 19} strokeWidth={active ? 2.5 : 2} />
    {/* LAYOUT: semibold no ativo, normal no inativo */}
    <span className={cn(
      "text-sm tracking-[-0.01em]",
      active ? "font-semibold" : "font-normal"
    )}>
      {label}
    </span>
    {/* LAYOUT: indicador lateral sutil no item ativo */}
    {active && (
      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-60" />
    )}
  </button>
);
