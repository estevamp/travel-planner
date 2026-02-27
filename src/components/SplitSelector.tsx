import { TripMember } from "../types";
import { CreateExpenseSplitInput, SplitType } from "../types/splitting";
import { calculateEqualSplits, validateUnequalSplits } from "../utils/splitting";
import { useState, useEffect } from "react";
import { cn, maskCurrency, parseCurrencyToNumber } from "../utils";

interface SplitSelectorProps {
  members: TripMember[];
  totalAmount: number;
  currentUserId: string;
  onSplitsChange: (splits: CreateExpenseSplitInput[], splitType: SplitType, isValid: boolean) => void;
}

export function SplitSelector({
  members,
  totalAmount,
  currentUserId,
  onSplitsChange,
}: SplitSelectorProps) {
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [validationError, setValidationError] = useState<string>("");

  // Initialize with current user selected
  useEffect(() => {
    const currentMember = members.find((m) => m.user_id === currentUserId);
    if (currentMember && selectedMembers.size === 0) {
      setSelectedMembers(new Set([currentMember.id]));
    }
  }, [members, currentUserId, selectedMembers.size]);

  // Calculate and emit splits whenever dependencies change
  useEffect(() => {
    if (selectedMembers.size === 0 || totalAmount <= 0) {
      onSplitsChange([], splitType, true);
      return;
    }

    const participantIds = Array.from(selectedMembers);

    if (splitType === "equal") {
      const splits = calculateEqualSplits(totalAmount, participantIds);
      setValidationError("");
      onSplitsChange(splits, splitType, true);
    } else {
      // Unequal split
      const splits: CreateExpenseSplitInput[] = participantIds.map((member_id) => ({
        member_id,
        amount: customAmounts[member_id] || 0,
      }));

      const validation = validateUnequalSplits(totalAmount, splits);
      if (!validation.isValid) {
        setValidationError(
          `A soma não bate! Faltam ${Math.abs(validation.difference).toFixed(2)}`
        );
      } else {
        setValidationError("");
      }

      onSplitsChange(splits, splitType, validation.isValid);
    }
  }, [selectedMembers, splitType, customAmounts, totalAmount, onSplitsChange]);

  // Initialize unequal split values with equal split amounts when switching to unequal
  const handleSetSplitType = (type: SplitType) => {
    if (type === "unequal" && splitType === "equal") {
      const equalAmount = getEqualAmount();
      const newCustomAmounts: Record<string, number> = {};
      selectedMembers.forEach(id => {
        newCustomAmounts[id] = Number(equalAmount.toFixed(2));
      });
      setCustomAmounts(newCustomAmounts);
    }
    setSplitType(type);
  };

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const handleCustomAmountChange = (memberId: string, value: string) => {
    const amount = parseCurrencyToNumber(value);
    setCustomAmounts((prev) => ({ ...prev, [memberId]: amount }));
  };

  const getEqualAmount = () => {
    if (selectedMembers.size === 0) return 0;
    return totalAmount / selectedMembers.size;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold block required-indicator">
          Dividir despesa
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSetSplitType("equal")}
            className={`
              px-3 py-1 rounded-md text-sm font-medium transition-all
              ${
                splitType === "equal"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                  : "bg-[var(--sidebar-hover)] text-zinc-700 dark:text-zinc-300"
              }
            `}
          >
            Dividir igualmente
          </button>
          <button
            type="button"
            onClick={() => handleSetSplitType("unequal")}
            className={`
              px-3 py-1 rounded-md text-sm font-medium transition-all
              ${
                splitType === "unequal"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                  : "bg-[var(--sidebar-hover)] text-zinc-700 dark:text-zinc-300"
              }
            `}
          >
            Divisão desigual
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentUserId;
          const displayName = isCurrentUser ? "Eu" : member.display_name || "Membro";
          const isSelected = selectedMembers.has(member.id);

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--card-border)',
                color: 'inherit'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleMember(member.id)}
                className="w-5 h-5 text-[var(--accent-color)] rounded-lg focus:ring-2 focus:ring-[var(--accent-color)]/20"
              />
              <span className="flex-1 text-sm font-medium">
                {displayName}
              </span>

              {isSelected && (
                <div className="flex items-center gap-2">
                  {splitType === "equal" ? (
                    <span className="text-sm opacity-70">
                      {maskCurrency((getEqualAmount() * 100).toFixed(0))}
                    </span>
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customAmounts[member.id] ? maskCurrency((customAmounts[member.id] * 100).toFixed(0)) : ""}
                      onChange={(e) => handleCustomAmountChange(member.id, e.target.value)}
                      placeholder="0,00"
                      className="w-24 px-2 py-1 text-sm border rounded-md"
                      style={{
                        backgroundColor: 'var(--card-bg)',
                        borderColor: 'var(--card-border)',
                        color: 'inherit'
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {validationError && (
        <div className="p-3 rounded-lg border-2 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
        </div>
      )}

      {selectedMembers.size > 0 && (
        <div className="p-3 rounded-lg border-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {selectedMembers.size} {selectedMembers.size === 1 ? "pessoa" : "pessoas"}{" "}
            selecionada{selectedMembers.size === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
