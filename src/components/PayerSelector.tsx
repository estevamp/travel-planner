import React from "react";
import { TripMember } from "../types";

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
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Quem pagou?
      </label>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentUserId;
          const isSelected = member.id === selectedPayerId;
          const displayName = isCurrentUser ? "Eu" : member.display_name || "Membro";

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelect(member.id)}
              className={`
                flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-all
                ${
                  isSelected
                    ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-md"
                    : "bg-[var(--sidebar-hover)] text-zinc-700 dark:text-zinc-300 hover:opacity-80"
                }
              `}
            >
              {displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
