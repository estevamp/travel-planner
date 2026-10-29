import type { ChangeEvent } from "react";
import { TripMember } from "../types";
import { cn } from "../utils";

interface PayerSelectorProps {
  members: TripMember[];
  selectedPayerId: string;
  currentUserId: string;
  onSelect: (memberId: string) => void;
}

export function PayerSelector({
  members,
  selectedPayerId,
  currentUserId,
  onSelect,
}: PayerSelectorProps) {
  const currentUserMember = members.find(m => m.user_id === currentUserId);
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold block required-indicator">
        Quem pagou?
      </label>
      <select
        value={selectedPayerId}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onSelect(e.target.value)}
        className={cn(
          "w-full px-3 py-2 rounded-xl border",
          "text-sm font-medium",
          "focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20",
          "transition-all duration-200"
        )}
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--card-border)',
          color: 'inherit'
        }}
      >
        <option value="" disabled>Selecione...</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.id === currentUserMember?.id ? "Eu" : member.display_name || "Membro"}
          </option>
        ))}
      </select>
    </div>
  );
}
