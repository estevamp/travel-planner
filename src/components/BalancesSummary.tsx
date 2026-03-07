import { useState } from "react";
import { TripMember } from "../types";
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
}: BalancesSummaryProps) {
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const currentMemberBalance = balances.find((b) => b.member_id === currentMember?.id);
  const netBalance = currentMemberBalance?.net_balance ?? 0;

  const allTransfers = simplifyDebts(balances, currency);
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
  const textNeutralSub  = isDark ? "text-slate-200" : "text-slate-700";

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
      ? pos === "pos" ? "text-green-100" : pos === "neg" ? "text-red-100" : "text-slate-100"
      : "text-slate-900";

  const statusTextSub = (pos: "pos" | "neg" | "neu") =>
    isDark
      ? pos === "pos" ? "text-green-200" : pos === "neg" ? "text-red-200" : "text-slate-200"
      : "text-slate-600";

  const lineText = (isCreditor: boolean) =>
    isDark
      ? isCreditor ? "text-green-200" : "text-red-200"
      : isCreditor ? "text-green-800" : "text-red-800";

  const overallKind: "pos" | "neg" | "neu" =
    netBalance > 0 ? "pos" : netBalance < 0 ? "neg" : "neu";

  const confirmedSettlements = settlements.filter(s => s.is_confirmed);

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
            {netBalance > 0 ? "Você tem a receber" : netBalance < 0 ? "Você deve" : "Tudo acertado! 🎉"}
          </p>
        </div>
      </div>

      {/* Detalhamento */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className={`font-bold mb-4 ${textNeutralMain}`}>Detalhamento</h3>

          {allTransfers.map((transfer) => {
            const isCurrentUserDebtor   = transfer.from_member_id === currentMember?.id;
            const isCurrentUserCreditor = transfer.to_member_id   === currentMember?.id;
            const isInvolved = isCurrentUserDebtor || isCurrentUserCreditor;

            const fromName    = isCurrentUserDebtor   ? "Você" : transfer.from_member_name;
            const toName      = isCurrentUserCreditor ? "Você" : transfer.to_member_name;
            const fromInitial = isCurrentUserDebtor   ? "V"    : transfer.from_member_name.charAt(0).toUpperCase();

            const chipColor = isCurrentUserDebtor
              ? "bg-red-600 text-white"
              : isCurrentUserCreditor
              ? "bg-green-600 text-white"
              : "bg-slate-400 text-white";

            const key             = `${transfer.from_member_id}-${transfer.to_member_id}`;
            const isPaymentOpen   = openPaymentKey === key;
            const isHistoryOpen   = expandedHistoryKey === key;
            const isSaving        = savingKey === key;
            const pairSettlements = getSettlementsForPair(transfer.from_member_id, transfer.to_member_id);
            const hasPastPayments = pairSettlements.length > 0;

            return (
              <div key={key} className={`rounded-lg border ${surfaceNeutral} overflow-hidden`}>

                {/* Linha principal */}
                <div className="flex flex-wrap items-center p-4 gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${chipColor}`}>
                    {fromInitial}
                  </div>

                  <div className="flex-1 min-w-0" style={{ minWidth: "120px" }}>
                    <p className={`font-medium ${textNeutralMain}`}>{fromName}</p>
                    <p className={`text-sm ${lineText(isCurrentUserCreditor)}`}>
                      deve {formatCurrency(transfer.amount, currency)} para <strong>{toName}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {/* Badge de pagamentos já registrados */}
                    {hasPastPayments && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedHistoryKey(isHistoryOpen ? null : key);
                          setOpenPaymentKey(null);
                          setPaymentAmount("");
                        }}
                        title="Ver pagamentos registrados"
                        className={cn(
                          "text-xs px-2 py-1.5 rounded-lg font-semibold transition-colors",
                          isHistoryOpen
                            ? isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                            : isDark ? "bg-slate-700 text-slate-400 hover:text-slate-200" : "bg-slate-100 text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {pairSettlements.length} pago{pairSettlements.length > 1 ? "s" : ""}
                      </button>
                    )}

                    {/* Botão registrar pagamento */}
                    {isInvolved && (
                      <button
                        type="button"
                        onClick={() => openPayment(transfer.from_member_id, transfer.to_member_id, transfer.amount)}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                          isPaymentOpen
                            ? isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                            : isDark ? "bg-blue-700 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                        )}
                      >
                        {isPaymentOpen ? "Cancelar" : "Registrar pagamento"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Histórico de pagamentos com desfazer */}
                {isHistoryOpen && (
                  <div className={cn(
                    "border-t px-4 py-3 space-y-2",
                    isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-100 bg-slate-50"
                  )}>
                    <p className={cn("text-xs font-semibold uppercase mb-2", isDark ? "text-slate-400" : "text-slate-500")}>
                      Pagamentos registrados
                    </p>
                    {pairSettlements.map((s) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <span className={cn("flex-1 text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>
                          {formatCurrency(s.amount, s.currency)}
                        </span>
                        <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                          {new Date(s.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUndoPayment(s.id)}
                          disabled={undoingId === s.id}
                          className={cn(
                            "text-xs px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-40",
                            isDark
                              ? "text-red-400 hover:bg-red-900/40"
                              : "text-red-500 hover:bg-red-50"
                          )}
                        >
                          {undoingId === s.id ? "..." : "Desfazer"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulário inline de novo pagamento */}
                {isPaymentOpen && (
                  <div className={cn(
                    "px-4 pb-4 pt-3 border-t flex gap-2 items-end",
                    isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50"
                  )}>
                    <div className="flex-1">
                      <p className={cn("text-xs mb-1.5", isDark ? "text-slate-400" : "text-slate-500")}>
                        Valor pago (máx. {formatCurrency(transfer.amount, currency)})
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(maskCurrency(e.target.value))}
                        placeholder="0,00"
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border text-sm",
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                            : "bg-white border-slate-200 text-slate-900"
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void submitPayment(transfer.from_member_id, transfer.to_member_id)}
                      disabled={isSaving || parseCurrencyToNumber(paymentAmount) <= 0}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? "Salvando..." : "Confirmar"}
                    </button>
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
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-500"
              )}>
                {confirmedSettlements.length}
              </span>
            </div>
            {isPaymentsHistoryOpen
              ? <ChevronUp size={16} className={isDark ? "text-slate-400" : "text-slate-500"} />
              : <ChevronDown size={16} className={isDark ? "text-slate-400" : "text-slate-500"} />
            }
          </button>

          {/* Lista de pagamentos */}
          {isPaymentsHistoryOpen && (
            <div className={cn(
              "border-t divide-y",
              isDark ? "border-slate-700 divide-slate-700" : "border-slate-100 divide-slate-100"
            )}>
              {confirmedSettlements
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((s) => {
                  const fromMember = members.find(m => m.id === s.from_member_id);
                  const toMember   = members.find(m => m.id === s.to_member_id);
                  const isFromMe   = s.from_member_id === currentMember?.id;
                  const isToMe     = s.to_member_id   === currentMember?.id;
                  const fromName   = isFromMe ? "Você" : (fromMember?.display_name ?? "?");
                  const toName     = isToMe   ? "você" : (toMember?.display_name   ?? "?");

                  return (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                        isFromMe ? "bg-red-600 text-white" : isToMe ? "bg-green-600 text-white" : "bg-slate-400 text-white"
                      )}>
                        {isFromMe ? "V" : (fromMember?.display_name?.charAt(0).toUpperCase() ?? "?")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", textNeutralMain)}>
                          {fromName} pagou {formatCurrency(s.amount, s.currency)} para <strong>{toName}</strong>
                        </p>
                        <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                          {new Date(s.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUndoPayment(s.id)}
                        disabled={undoingId === s.id}
                        className={cn(
                          "text-xs px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-40 shrink-0",
                          isDark ? "text-red-400 hover:bg-red-900/40" : "text-red-500 hover:bg-red-50"
                        )}
                      >
                        {undoingId === s.id ? "..." : "Desfazer"}
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {!hasBalances && confirmedSettlements.length === 0 && (
        <div className="text-center py-8">
          <p className={textNeutralSub}>Nenhuma despesa compartilhada ainda</p>
        </div>
      )}
    </div>
  );
}