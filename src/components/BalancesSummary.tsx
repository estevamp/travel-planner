import { TripMember } from "../types";
import { MemberBalance } from "../types/splitting";
import { formatCurrency, simplifyDebts } from "../utils/splitting";

interface BalancesSummaryProps {
  balances: MemberBalance[];
  currentUserId: string;
  members: TripMember[];
  currency: string;
  onSettleClick: () => void;
  isDark?: boolean;
}

export function BalancesSummary({
  balances,
  currentUserId,
  members,
  currency,
  onSettleClick,
  isDark = false,
}: BalancesSummaryProps) {
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const currentMemberBalance = balances.find(
    (b) => b.member_id === currentMember?.id
  );

  const netBalance = currentMemberBalance?.net_balance ?? 0;

  // Usa simplifyDebts para obter as transferências reais entre todos os membros
  const allTransfers = simplifyDebts(balances, currency);
  const hasBalances = allTransfers.length > 0;

  // Helpers de classe por tema
  const surfaceNeutral = isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";
  const textNeutralMain = isDark ? "text-slate-100" : "text-slate-900";
  const textNeutralSub  = isDark ? "text-slate-200" : "text-slate-700";

  const statusBg = (pos: "pos" | "neg" | "neu") => {
    if (isDark) {
      if (pos === "pos") return "bg-green-950 border-green-700";
      if (pos === "neg") return "bg-red-950 border-red-700";
      return "bg-slate-900 border-slate-700";
    } else {
      if (pos === "pos") return "bg-white border-green-300";
      if (pos === "neg") return "bg-white border-red-300";
      return "bg-white border-slate-200";
    }
  };

  const statusTextMain = (pos: "pos" | "neg" | "neu") => {
    if (isDark) {
      if (pos === "pos") return "text-green-100";
      if (pos === "neg") return "text-red-100";
      return "text-slate-100";
    } else {
      return "text-slate-900";
    }
  };

  const statusTextSub = (pos: "pos" | "neg" | "neu") => {
    if (isDark) {
      if (pos === "pos") return "text-green-200";
      if (pos === "neg") return "text-red-200";
      return "text-slate-200";
    } else {
      return "text-slate-600";
    }
  };

  const chipBg = (isDebtor: boolean) =>
    isDebtor ? "bg-red-600 text-white" : "bg-green-600 text-white";

  const lineText = (isCreditor: boolean) =>
    isDark
      ? isCreditor ? "text-green-200" : "text-red-200"
      : isCreditor ? "text-green-800" : "text-red-800";

  const overallKind: "pos" | "neg" | "neu" =
    netBalance > 0 ? "pos" : netBalance < 0 ? "neg" : "neu";

  return (
    <div className="space-y-4">
      {/* Saldo geral do usuário atual */}
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

      {/* Detalhamento — todas as transferências simplificadas da viagem */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className={`font-bold mb-4 ${textNeutralMain}`}>Detalhamento</h3>

          {allTransfers.map((transfer) => {
            const isCurrentUserDebtor =
              transfer.from_member_id === currentMember?.id;
            const isCurrentUserCreditor =
              transfer.to_member_id === currentMember?.id;

            const fromName = isCurrentUserDebtor
              ? "Você"
              : transfer.from_member_name;
            const toName = isCurrentUserCreditor
              ? "Você"
              : transfer.to_member_name;

            const fromInitial = isCurrentUserDebtor
              ? "V"
              : transfer.from_member_name.charAt(0).toUpperCase();

            // Chip vermelho para quem deve, neutro para terceiros
            const chipColor = isCurrentUserDebtor
              ? "bg-red-600 text-white"
              : isCurrentUserCreditor
              ? "bg-green-600 text-white"
              : "bg-slate-400 text-white";

            // Texto da linha: verde quando você recebe, vermelho quando você paga
            const textColor = lineText(isCurrentUserCreditor);

            return (
              <div
                key={`${transfer.from_member_id}-${transfer.to_member_id}`}
                className={`flex items-center p-4 rounded-lg border ${surfaceNeutral}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${chipColor}`}
                  >
                    {fromInitial}
                  </div>
                  <div>
                    <p className={`font-medium ${textNeutralMain}`}>{fromName}</p>
                    <p className={`text-sm ${textColor}`}>
                      deve {formatCurrency(transfer.amount, currency)} para{" "}
                      <strong>{toName}</strong>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Botão de quitar */}
      {hasBalances && (
        <button
          onClick={onSettleClick}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
            isDark
              ? "bg-blue-600 hover:bg-blue-500 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          Quitar viagem
        </button>
      )}

      {!hasBalances && (
        <div className="text-center py-8">
          <p className={textNeutralSub}>Nenhuma despesa compartilhada ainda</p>
        </div>
      )}
    </div>
  );
}
