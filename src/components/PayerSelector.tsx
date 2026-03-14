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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {currentUserMember && (
          <button
            type="button"
            onClick={() => onSelect(currentUserMember.id)}
            className={cn(
              "w-full sm:w-auto flex-shrink-0 px-3 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all duration-200",
              isCurrentUserSelected
                ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "border-[var(--card-border)] bg-[var(--card-bg)] opacity-60 hover:opacity-100"
            )}
          >
            Eu
          </button>
        )}

        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-sm font-semibold block required-indicator whitespace-nowrap">Outra pessoa:</span>
          <select
            value={isOtherPersonSelected ? selectedPayerId : ""}
            onChange={(e) => onSelect(e.target.value)}
            className={cn(
              "w-full flex-1 px-3 py-2 rounded-xl border-2",
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
