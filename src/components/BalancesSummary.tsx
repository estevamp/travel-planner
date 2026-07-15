import { useMemo, useState } from "react";
import { TripMember } from "../types";
import { MemberBalance, Settlement } from "../types/splitting";
import { formatCurrency, simplifyDebts, mergeSpouseTransfers, GroupedTransfer } from "../utils/splitting";
import { maskCurrency, parseCurrencyToNumber, cn } from "../utils";
import { getDeterministicColor } from "../utils/colors";
import { useI18n } from "../i18n/I18nProvider";


interface BalancesSummaryProps {
  balances: MemberBalance[];
  currentUserId: string;
  members: TripMember[];
  currency: string;
  settlements: Settlement[];
  onSettleClick: () => void;
  onRegisterPayment: (fromMemberIds: string[], toMemberIds: string[], amount: number) => Promise<void>;
  onUndoPayment: (settlementId: string) => Promise<void>;
  isDark?: boolean;
  /**
   * Se fornecido, usa esta lista de transferências em vez de computar pelo simplifyDebts.
   * Aceita GroupedTransfer[] para exibir casais agrupados.
   */
  transfers?: GroupedTransfer[];
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
  const { language } = useI18n();
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const allTransfers: GroupedTransfer[] = useMemo(() => {
    const activeTransfers = transfersProp !== undefined
      ? transfersProp
      : simplifyDebts(balances, currency).map((t) => ({
          from_member_ids: [t.from_member_id],
          to_member_ids: [t.to_member_id],
          from_display_name: t.from_member_name,
          to_display_name: t.to_member_name,
          amount: t.amount,
          currency: t.currency,
        }));

    const canonicalGroupMap = new Map<string, string>();
    const groupMembers = new Map<string, TripMember[]>();
    const visited = new Set<string>();

    for (const member of members) {
      if (visited.has(member.id)) continue;

      const spouse = member.spouse_member_id
        ? members.find((candidate) => candidate.id === member.spouse_member_id)
        : null;

      const groupId = member.id;

      if (spouse && !visited.has(spouse.id)) {
        canonicalGroupMap.set(member.id, groupId);
        canonicalGroupMap.set(spouse.id, groupId);
        groupMembers.set(groupId, [member, spouse]);
        visited.add(member.id);
        visited.add(spouse.id);
      } else {
        canonicalGroupMap.set(member.id, groupId);
        groupMembers.set(groupId, [member]);
        visited.add(member.id);
      }
    }

    const transferMap = new Map<string, GroupedTransfer>();
    const toKey = (fromIds: string[], toIds: string[]) => `${fromIds.join(",")}-${toIds.join(",")}`;

    for (const transfer of activeTransfers) {
      transferMap.set(toKey(transfer.from_member_ids, transfer.to_member_ids), transfer);
    }

    for (const settlement of settlements.filter((entry) => entry.is_confirmed)) {
      const fromGroupId = canonicalGroupMap.get(settlement.from_member_id) ?? settlement.from_member_id;
      const toGroupId = canonicalGroupMap.get(settlement.to_member_id) ?? settlement.to_member_id;

      if (fromGroupId === toGroupId) continue;

      const fromMembers = groupMembers.get(fromGroupId) ?? members.filter((member) => member.id === settlement.from_member_id);
      const toMembers = groupMembers.get(toGroupId) ?? members.filter((member) => member.id === settlement.to_member_id);
      const fromIds = fromMembers.map((member) => member.id);
      const toIds = toMembers.map((member) => member.id);
      const key = toKey(fromIds, toIds);

      if (transferMap.has(key)) continue;

      transferMap.set(key, {
        from_member_ids: fromIds,
        to_member_ids: toIds,
        from_display_name: fromMembers.map((member) => member.display_name ?? "?").join("/"),
        to_display_name: toMembers.map((member) => member.display_name ?? "?").join("/"),
        amount: 0,
        currency: settlement.currency || currency,
      });
    }

    return Array.from(transferMap.values());
  }, [balances, currency, members, settlements, transfersProp]);

  const hasBalances = allTransfers.length > 0;

  const [openPaymentKey, setOpenPaymentKey] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  // Chave única para um GroupedTransfer
  const transferKey = (t: GroupedTransfer) =>
    `${t.from_member_ids.join(",")}-${t.to_member_ids.join(",")}`;

  const openPayment = (t: GroupedTransfer) => {
    const key = transferKey(t);
    if (openPaymentKey === key) {
      setOpenPaymentKey(null);
      setPaymentAmount("");
      return;
    }
    const remaining = Math.max(0, t.amount);
    setOpenPaymentKey(key);
    setExpandedHistoryKey(null);
    setPaymentAmount(maskCurrency(Math.round(Math.max(remaining, 0) * 100).toFixed(0), language));
  };

  const submitPayment = async (t: GroupedTransfer) => {
    const key = transferKey(t);
    const amount = parseCurrencyToNumber(paymentAmount);
    if (amount <= 0) return;
    setSavingKey(key);
    await onRegisterPayment(t.from_member_ids, t.to_member_ids, amount);
    setSavingKey(null);
    setOpenPaymentKey(null);
    setPaymentAmount("");
  };

  const handleUndoPayment = async (settlementId: string) => {
    setUndoingId(settlementId);
    try {
      await onUndoPayment(settlementId);
    } finally {
      setUndoingId(null);
    }
  };

  // Busca settlements para todos os pares de IDs do grupo
  const getSettlementsForTransfer = (t: GroupedTransfer) =>
    settlements
      .filter(
        (s) =>
          s.is_confirmed &&
          t.from_member_ids.includes(s.from_member_id) &&
          t.to_member_ids.includes(s.to_member_id)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Helpers de tema
  const surfaceNeutral = isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";
  const textNeutralMain = isDark ? "text-slate-100" : "text-slate-900";
  const textNeutralSub = isDark ? "text-slate-200" : "text-slate-700";

  const lineText = (isPaid: boolean) =>
    isDark
      ? isPaid ? "text-green-200" : "text-red-200"
      : isPaid ? "text-green-800" : "text-red-800";

  return (
    <div className="space-y-4">
      {/* Detalhamento */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className={`font-bold mb-4 ${textNeutralMain}`}>Detalhamento</h3>

          {allTransfers.map((transfer) => {
            const myId = currentMember?.id ?? "";
            const spouseId = currentMember?.spouse_member_id ?? null;

            // O usuário (ou seu cônjuge) está no grupo "de"?
            const isCurrentUserDebtor =
              transfer.from_member_ids.includes(myId) ||
              (spouseId ? transfer.from_member_ids.includes(spouseId) : false);

            // O usuário (ou seu cônjuge) está no grupo "para"?
            const isCurrentUserCreditor =
              transfer.to_member_ids.includes(myId) ||
              (spouseId ? transfer.to_member_ids.includes(spouseId) : false);

            const canManagePayments = Boolean(currentMember);

            // Nome do grupo "de"
            const buildFromName = () => {
              if (!isCurrentUserDebtor) return transfer.from_display_name;
              // Substitui o nome do usuário atual (e do cônjuge se presente) por "Você"
              const parts = transfer.from_member_ids.map((id) => {
                const m = members.find((x) => x.id === id);
                if (id === myId || id === spouseId) return "Você";
                return m?.display_name ?? "?";
              });
              // Deduplica "Você/Você" → "Você"
              const unique = [...new Set(parts)];
              return unique.join("/");
            };

            const buildToName = () => {
              if (!isCurrentUserCreditor) return transfer.to_display_name;
              const parts = transfer.to_member_ids.map((id) => {
                const m = members.find((x) => x.id === id);
                if (id === myId || id === spouseId) return "você";
                return m?.display_name ?? "?";
              });
              const unique = [...new Set(parts)];
              return unique.join("/");
            };

            const fromName = buildFromName();
            const toName = buildToName();

            // Initial para o avatar
            const fromInitial = isCurrentUserDebtor
              ? "V"
              : transfer.from_display_name.charAt(0).toUpperCase();

            // Cor do avatar: determinística por pessoa (mesmo padrão da aba Atividades),
            // com um anel indicando a direção da dívida (vermelho = você deve, verde = te devem).
            const avatarMemberId = isCurrentUserDebtor
              ? myId || spouseId || transfer.from_member_ids[0] || null
              : transfer.from_member_ids[0] ?? null;
            const avatarColor = getDeterministicColor(avatarMemberId);
            const avatarRingColor = isCurrentUserDebtor ? "#EF4444" : isCurrentUserCreditor ? "#10B981" : undefined;

            const key = transferKey(transfer);
            const isPaymentOpen = openPaymentKey === key;
            const isHistoryOpen = expandedHistoryKey === key;
            const pairSettlements = getSettlementsForTransfer(transfer);
            const hasPastPayments = pairSettlements.length > 0;
            const paidAmount = pairSettlements.reduce((sum, s) => sum + s.amount, 0);
            const remaining = Math.max(0, transfer.amount);

            // Se é um grupo casal, mostra um badge indicando isso
            const isFromCouple = transfer.from_member_ids.length > 1;
            const isToCouple = transfer.to_member_ids.length > 1;

            return (
              <div key={key} className={cn("rounded-xl border overflow-hidden", surfaceNeutral)}>


                {/* Linha principal — 2 linhas: info em cima, ações embaixo */}
                <div className="p-4">
                  {/* Linha 1: avatar + texto (sem competição com botões) */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-white"
                      style={{
                        backgroundColor: avatarColor,
                        boxShadow: avatarRingColor ? `0 0 0 2px ${avatarRingColor}` : undefined,
                      }}
                    >
                      {fromInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${textNeutralMain}`}>{fromName}</p>
                      <p className={`text-sm ${lineText(remaining <= 0)}`}>
                        {remaining > 0
                          ? <>deve <strong>{formatCurrency(remaining, currency)}</strong> para <strong>{toName}</strong></>
                          : <>pagou um total de <strong>{formatCurrency(paidAmount, currency)}</strong> para <strong>{toName}</strong></>}
                      </p>
                    </div>
                  </div>

                  {/* Linha 2: ações alinhadas à direita (não comprime o texto) */}
                  {(hasPastPayments || canManagePayments) && (
                    <div className="flex items-center justify-end gap-2 mt-2">
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
                          {pairSettlements.length} pagamento{pairSettlements.length > 1 ? "s" : ""}
                        </button>
                      )}
                      {canManagePayments && (
                        <button
                          type="button"
                          onClick={() => openPayment(transfer)}
                          className={cn(
                            "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                            isPaymentOpen
                              ? isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                              : "text-white"
                          )}
                          style={!isPaymentOpen ? { backgroundColor: "var(--accent-color)" } : undefined}
                        >
                          {isPaymentOpen ? "Cancelar" : "Registrar pagamento"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Histórico de pagamentos */}
                {isHistoryOpen && (
                  <div
                    className={cn(
                      "border-t px-4 py-3 space-y-2",
                      isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-100 bg-slate-50"
                    )}
                  >
                    <p className={cn("text-xs font-semibold uppercase mb-2", isDark ? "text-slate-400" : "text-slate-500")}>
                      Pagamentos registrados
                    </p>
                    {pairSettlements.map((s) => {
                      const fromM = members.find((m) => m.id === s.from_member_id);
                      const toM = members.find((m) => m.id === s.to_member_id);
                      const isFromMe = s.from_member_id === myId || s.from_member_id === spouseId;
                      const isToMe = s.to_member_id === myId || s.to_member_id === spouseId;
                      const fName = isFromMe ? "Você" : (fromM?.display_name ?? "?");
                      const tName = isToMe ? "você" : (toM?.display_name ?? "?");
                      return (
                        <div key={s.id} className="flex items-center gap-3">
                          <span className={cn("flex-1 text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>
                            {formatCurrency(s.amount, s.currency)}
                            <span className={cn("ml-1 text-xs font-normal", isDark ? "text-slate-400" : "text-slate-500")}>
                              ({fName} → {tName})
                            </span>
                          </span>
                          <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                            {new Date(s.date).toLocaleDateString(language, { day: "2-digit", month: "short" })}
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
                      );
                    })}
                  </div>
                )}

                {/* Formulário de registrar pagamento */}
                {isPaymentOpen && (
                  <div
                    className={cn(
                      "border-t px-4 py-3 space-y-3",
                      isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-100 bg-slate-50"
                    )}
                  >
                    <p className={cn("text-xs font-semibold uppercase", isDark ? "text-slate-400" : "text-slate-500")}>
                      Valor pago
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(maskCurrency(e.target.value, language))}
                        placeholder="0,00"
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 focus:border-[var(--accent-color)]",
                          isDark
                            ? "bg-slate-700 border-slate-600 text-slate-100"
                            : "bg-white border-slate-200 text-slate-900"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => void submitPayment(transfer)}
                        disabled={savingKey === key}
                        style={{ backgroundColor: "var(--accent-color)" }}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 text-white"
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

      {!hasBalances && (
        <div className={cn(
          "p-6 rounded-xl border text-center",
          isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
        )}>
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            Nenhum saldo pendente entre os participantes.
          </p>
        </div>
      )}
    </div>
  );
}
