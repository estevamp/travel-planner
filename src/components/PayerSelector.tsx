import React from "react";
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
  const otherMembers = members.filter(m => m.user_id !== currentUserId);
  const isCurrentUserSelected = currentUserMember?.id === selectedPayerId;
  const isOtherPersonSelected = !isCurrentUserSelected && selectedPayerId !== "";

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold block required-indicator">
        Quem pagou?
      </label>
      <div className="flex items-center gap-3">
        {currentUserMember && (
          <button
            type="button"
            onClick={() => onSelect(currentUserMember.id)}
            className={`
              flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all
              ${
                isCurrentUserSelected
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-md"
                  : "bg-[var(--sidebar-hover)] text-zinc-700 dark:text-zinc-300 hover:opacity-80 border border-transparent"
              }
            `}
          >
            Eu
          </button>
        )}

        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm font-semibold block required-indicator">Outra pessoa:</span>
          <select
            value={isOtherPersonSelected ? selectedPayerId : ""}
            onChange={(e) => onSelect(e.target.value)}
            className={cn(
              "flex-1 px-3 py-2 rounded-xl border-2",
              "text-sm font-medium",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
              "transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
              color: 'inherit'
            }}
          >
            <option value="" disabled>Selecione...</option>
            {otherMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name || "Membro"}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
