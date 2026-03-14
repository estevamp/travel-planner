import { useState } from "react";
import { TripMember } from "../types";
import type { SimplifiedTransfer } from "../types";
import { MemberBalance, Settlement } from "../types/splitting";
import { formatCurrency, simplifyDebts } from "../utils/splitting";
import { maskCurrency, parseCurrencyToNumber, cn } from "../utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface BalancesSummaryProps {
  balances: MemberBalance[];
  currentUserId: string;
  members: TripMember[];
  currency: string;
  settlements: Settlement[];
  onSettleClick: () => void;
  onRegisterPayment: (fromMemberId: string, toMemberId: string, amount: number) => Promise<void>;
  onUndoPayment: (settlementId: string) => Promise<void>;
  isDark?: boolean;
  /** Se fornecido, substitui o simplifyDebts interno (ex: transferências bilaterais) */
  transfers?: SimplifiedTransfer[];
}

export function BalancesSummary({
  balances,
  currentUserId,
  members,
  currency,
  settlements,
  onSettleClick,
  onRegisterPayment,
  onUndoPayment,
  isDark = false,
  transfers: transfersProp,
}: BalancesSummaryProps) {
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const currentMemberBalance = balances.find((b) => b.member_id === currentMember?.id);
  const netBalance = currentMemberBalance?.net_balance ?? 0;

  const allTransfers =
    transfersProp !== undefined ? transfersProp : simplifyDebts(balances, currency);
  const hasBalances = allTransfers.length > 0;

  const [openPaymentKey, setOpenPaymentKey] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  const [isPaymentsHistoryOpen, setIsPaymentsHistoryOpen] = useState(false);

  const openPayment = (fromId: string, toId: string, suggestedAmount: number) => {
    const key = `${fromId}-${toId}`;
    if (openPaymentKey === key) {
      setOpenPaymentKey(null);
      setPaymentAmount("");
      return;
    }
    setOpenPaymentKey(key);
    setExpandedHistoryKey(null);
    setPaymentAmount(maskCurrency(Math.round(suggestedAmount * 100).toFixed(0)));
  };

  const submitPayment = async (fromId: string, toId: string) => {
    const key = `${fromId}-${toId}`;
    const amount = parseCurrencyToNumber(paymentAmount);
    if (amount <= 0) return;
    setSavingKey(key);
    await onRegisterPayment(fromId, toId, amount);
    setSavingKey(null);
    setOpenPaymentKey(null);
    setPaymentAmount("");
  };

  const handleUndoPayment = async (settlementId: string) => {
    setUndoingId(settlementId);
    await onUndoPayment(settlementId);
    setUndoingId(null);
  };

  const getSettlementsForPair = (fromId: string, toId: string) =>
    settlements
      .filter((s) => s.from_member_id === fromId && s.to_member_id === toId && s.is_confirmed)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Helpers de tema
  const surfaceNeutral = isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";
  const textNeutralMain = isDark ? "text-slate-100" : "text-slate-900";
  const textNeutralSub = isDark ? "text-slate-200" : "text-slate-700";

  const statusBg = (pos: "pos" | "neg" | "neu") => {
    if (isDark) {
      if (pos === "pos") return "bg-green-950 border-green-700";
      if (pos === "neg") return "bg-red-950 border-red-700";
      return "bg-slate-900 border-slate-700";
    }
    if (pos === "pos") return "bg-white border-green-300";
    if (pos === "neg") return "bg-white border-red-300";
    return "bg-white border-slate-200";
  };

  const statusTextMain = (pos: "pos" | "neg" | "neu") =>
    isDark
      ? pos === "pos"
        ? "text-green-100"
        : pos === "neg"
        ? "text-red-100"
        : "text-slate-100"
      : "text-slate-900";

  const statusTextSub = (pos: "pos" | "neg" | "neu") =>
    isDark
      ? pos === "pos"
        ? "text-green-200"
        : pos === "neg"
        ? "text-red-200"
        : "text-slate-200"
      : "text-slate-600";

  const lineText = (isCreditor: boolean) =>
    isDark
      ? isCreditor
        ? "text-green-200"
        : "text-red-200"
      : isCreditor
      ? "text-green-800"
      : "text-red-800";

  const overallKind: "pos" | "neg" | "neu" =
    netBalance > 0 ? "pos" : netBalance < 0 ? "neg" : "neu";

  const confirmedSettlements = settlements.filter((s) => s.is_confirmed);

  return (
    <div className="space-y-4">
      {/* Saldo geral */}
      <div className={`p-6 rounded-xl border ${statusBg(overallKind)}`}>
        <div className="text-center">
          <p className={`text-sm mb-2 ${statusTextSub(overallKind)}`}>Seu saldo</p>
          <p className={`text-3xl font-bold ${statusTextMain(overallKind)}`}>
            {formatCurrency(Math.abs(netBalance), currency)}
          </p>
          <p className={`text-sm mt-1 ${statusTextSub(overallKind)}`}>
            {netBalance > 0
              ? "Você tem a receber"
              : netBalance < 0
              ? "Você deve"
              : "Tudo acertado! 🎉"}
          </p>
        </div>
      </div>

      {/* Detalhamento */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className={`font-bold mb-4 ${textNeutralMain}`}>Detalhamento</h3>

          {allTransfers.map((transfer) => {
            const isCurrentUserDebtor = transfer.from_member_id === currentMember?.id;
            const isCurrentUserCreditor = transfer.to_member_id === currentMember?.id;
            const isInvolved = isCurrentUserDebtor || isCurrentUserCreditor;

            const fromName = isCurrentUserDebtor ? "Você" : transfer.from_member_name;
            const toName = isCurrentUserCreditor ? "Você" : transfer.to_member_name;
            const fromInitial = isCurrentUserDebtor
              ? "V"
              : transfer.from_member_name.charAt(0).toUpperCase();

            const chipColor = isCurrentUserDebtor
              ? "bg-red-600 text-white"
              : isCurrentUserCreditor
              ? "bg-green-600 text-white"
              : isDark
              ? "bg-slate-600 text-white"
              : "bg-slate-400 text-white";

            const key = `${transfer.from_member_id}-${transfer.to_member_id}`;
            const isPaymentOpen = openPaymentKey === key;
            const isHistoryOpen = expandedHistoryKey === key;
            const pairSettlements = getSettlementsForPair(
              transfer.from_member_id,
              transfer.to_member_id
            );
            const paidAmount = pairSettlements.reduce((sum, s) => sum + s.amount, 0);
            const remaining = Math.max(0, transfer.amount - paidAmount);

            return (
              <div
                key={key}
                className={cn(
                  "rounded-xl border overflow-hidden",
                  surfaceNeutral
                )}
              >
                {/* Linha principal */}
                <div className="px-4 py-3 flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                      chipColor
                    )}
                  >
                    {fromInitial}
                  </div>

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold leading-tight", textNeutralMain)}>
                      <span className={lineText(!isCurrentUserDebtor)}>{fromName}</span>
                      <span className={isDark ? " text-slate-400" : " text-slate-500"}> paga </span>
                      <span className={lineText(isCurrentUserCreditor)}>{toName}</span>
                    </p>
                    <p className={cn("text-xs mt-0.5", isDark ? "text-slate-400" : "text-slate-500")}>
                      {formatCurrency(transfer.amount, currency)}
                      {paidAmount > 0 && (
                        <span className="ml-1 text-emerald-500">
                          · {formatCurrency(remaining, currency)} restante
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Botões */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {/* Histórico */}
                    {pairSettlements.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedHistoryKey(isHistoryOpen ? null : key)
                        }
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                          isHistoryOpen
                            ? isDark
                              ? "bg-slate-700 text-slate-300"
                              : "bg-slate-100 text-slate-600"
                            : isDark
                            ? "bg-slate-700 text-slate-400 hover:text-slate-200"
                            : "bg-slate-100 text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {pairSettlements.length} pago{pairSettlements.length > 1 ? "s" : ""}
                      </button>
                    )}

                    {/* Botão registrar pagamento */}
                    {isInvolved && (
                      <button
                        type="button"
                        onClick={() =>
                          openPayment(
                            transfer.from_member_id,
                            transfer.to_member_id,
                            transfer.amount
                          )
                        }
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                          isPaymentOpen
                            ? isDark
                              ? "bg-slate-700 text-slate-300"
                              : "bg-slate-100 text-slate-600"
                            : isDark
                            ? "bg-blue-700 hover:bg-blue-600 text-white"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        )}
                      >
                        {isPaymentOpen ? "Cancelar" : "Registrar pagamento"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Histórico de pagamentos com desfazer */}
                {isHistoryOpen && (
                  <div
                    className={cn(
                      "border-t px-4 py-3 space-y-2",
                      isDark
                        ? "border-slate-700 bg-slate-800/40"
                        : "border-slate-100 bg-slate-50"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold uppercase mb-2",
                        isDark ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      Pagamentos registrados
                    </p>
                    {pairSettlements.map((s) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex-1 text-sm font-medium",
                            isDark ? "text-slate-200" : "text-slate-700"
                          )}
                        >
                          {formatCurrency(s.amount, s.currency)}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            isDark ? "text-slate-500" : "text-slate-400"
                          )}
                        >
                          {new Date(s.date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUndoPayment(s.id)}
                          disabled={undoingId === s.id}
                          className={cn(
                            "text-xs px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-40",
                            isDark
                              ? "bg-slate-700 text-slate-300 hover:bg-red-900/40 hover:text-red-300"
                              : "bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          )}
                        >
                          {undoingId === s.id ? "..." : "Desfazer"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulário de registrar pagamento */}
                {isPaymentOpen && (
                  <div
                    className={cn(
                      "border-t px-4 py-3 space-y-3",
                      isDark
                        ? "border-slate-700 bg-slate-800/60"
                        : "border-slate-100 bg-slate-50"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold uppercase",
                        isDark ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      Valor pago
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={paymentAmount}
                        onChange={(e) =>
                          setPaymentAmount(maskCurrency(e.target.value))
                        }
                        placeholder="0,00"
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2",
                          isDark
                            ? "bg-slate-700 border-slate-600 text-slate-100 focus:ring-blue-500"
                            : "bg-white border-slate-200 text-slate-900 focus:ring-blue-400"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void submitPayment(
                            transfer.from_member_id,
                            transfer.to_member_id
                          )
                        }
                        disabled={savingKey === key}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50",
                          isDark
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        )}
                      >
                        {savingKey === key ? "Salvando..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico global de pagamentos registrados — colapsável */}
      {confirmedSettlements.length > 0 && (
        <div className={cn("rounded-lg border overflow-hidden", surfaceNeutral)}>
          {/* Cabeçalho colapsável */}
          <button
            type="button"
            onClick={() => setIsPaymentsHistoryOpen((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 transition-colors",
              isDark ? "hover:bg-slate-800" : "hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("font-semibold text-sm", textNeutralMain)}>
                Pagamentos registrados
              </span>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500"
                )}
              >
                {confirmedSettlements.length}
              </span>
            </div>
            {isPaymentsHistoryOpen ? (
              <ChevronUp
                size={16}
                className={isDark ? "text-slate-400" : "text-slate-500"}
              />
            ) : (
              <ChevronDown
                size={16}
                className={isDark ? "text-slate-400" : "text-slate-500"}
              />
            )}
          </button>

          {/* Lista de pagamentos */}
          {isPaymentsHistoryOpen && (
            <div
              className={cn(
                "border-t divide-y",
                isDark
                  ? "border-slate-700 divide-slate-700"
                  : "border-slate-100 divide-slate-100"
              )}
            >
              {confirmedSettlements
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .map((s) => {
                  const fromMember = members.find((m) => m.id === s.from_member_id);
                  const toMember = members.find((m) => m.id === s.to_member_id);
                  const isFromMe = s.from_member_id === currentMember?.id;
                  const isToMe = s.to_member_id === currentMember?.id;
                  const fromName = isFromMe
                    ? "Você"
                    : (fromMember?.display_name ?? "?");
                  const toName = isToMe ? "você" : (toMember?.display_name ?? "?");

                  return (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                          isFromMe
                            ? "bg-red-600 text-white"
                            : isToMe
                            ? "bg-green-600 text-white"
                            : "bg-slate-400 text-white"
                        )}
                      >
                        {isFromMe
                          ? "V"
                          : (fromMember?.display_name?.charAt(0).toUpperCase() ?? "?")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium leading-tight",
                            textNeutralSub
                          )}
                        >
                          {fromName} pagou {toName}
                        </p>
                        <p
                          className={cn(
                            "text-xs",
                            isDark ? "text-slate-500" : "text-slate-400"
                          )}
                        >
                          {new Date(s.date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums shrink-0",
                          isFromMe
                            ? "text-red-500"
                            : isToMe
                            ? "text-green-600"
                            : isDark
                            ? "text-slate-300"
                            : "text-slate-700"
                        )}
                      >
                        {formatCurrency(s.amount, s.currency)}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {!hasBalances && confirmedSettlements.length === 0 && (
        <div
          className={cn(
            "p-6 rounded-xl border text-center",
            isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
          )}
        >
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            Nenhum saldo pendente entre os participantes.
          </p>
        </div>
      )}
    </div>
  );
}