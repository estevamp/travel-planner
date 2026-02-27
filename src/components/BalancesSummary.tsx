import { TripMember } from "../types";
import { MemberBalance } from "../types/splitting";
import { formatCurrency } from "../utils/splitting";

interface BalancesSummaryProps {
  balances: MemberBalance[];
  currentUserId: string;
  members: TripMember[];
  currency: string;
  onSettleClick: () => void;
  isDark?: boolean; // <<< novo
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

  const individualBalances = balances
    .filter((b) => b.member_id !== currentMember?.id)
    .map((balance) => ({
      ...balance,
      isOwed: balance.net_balance < 0,
    }));

  const totalOwed = balances
    .filter((b) => b.net_balance > 0)
    .reduce((sum, b) => sum + b.net_balance, 0);

  const totalOwing = balances
    .filter((b) => b.net_balance < 0)
    .reduce((sum, b) => sum + Math.abs(b.net_balance), 0);

  const hasBalances = balances.some(b => Math.abs(b.net_balance) > 0.01);

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
      // Light bem claro (quase branco) para ficar “light mode de verdade”
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
      // Em light, usar texto escuro para contraste
      if (pos === "pos") return "text-slate-900";
      if (pos === "neg") return "text-slate-900";
      return "text-slate-900";
    }
  };

  const statusTextSub = (pos: "pos" | "neg" | "neu") => {
    if (isDark) {
      if (pos === "pos") return "text-green-200";
      if (pos === "neg") return "text-red-200";
      return "text-slate-200";
    } else {
      if (pos === "pos") return "text-slate-600";
      if (pos === "neg") return "text-slate-600";
      return "text-slate-600";
    }
  };

  const summaryBg = (pos: "pos" | "neg") => {
    if (isDark) {
      return pos === "pos" ? "bg-green-950 border-green-700" : "bg-red-950 border-red-700";
    } else {
      // leve no light
      return pos === "pos" ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300";
    }
  };

  const summaryTextTitle = (pos: "pos" | "neg") =>
    isDark ? (pos === "pos" ? "text-green-200" : "text-red-200")
           : (pos === "pos" ? "text-green-900" : "text-red-900");

  const summaryTextValue = (pos: "pos" | "neg") =>
    isDark ? (pos === "pos" ? "text-green-100" : "text-red-100")
           : (pos === "pos" ? "text-green-900" : "text-red-900");

  const chipBg = (pos: boolean) => (pos ? "bg-green-600 text-white" : "bg-red-600 text-white");
  const lineText = (pos: boolean) =>
    isDark ? (pos ? "text-green-200" : "text-red-200")
           : (pos ? "text-green-800" : "text-red-800");

  const overallKind: "pos" | "neg" | "neu" = netBalance > 0 ? "pos" : netBalance < 0 ? "neg" : "neu";

  return (
    <div className="space-y-4">
      {/* Overall Status */}
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

      {/* Individual Balances */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className={`font-bold mb-4 ${textNeutralMain}`}>Detalhamento</h3>

            {individualBalances.map((balance) => {
              const amount = Math.abs(balance.net_balance);
              const isPositive = balance.net_balance > 0; // they owe current user
              
              // When owing: "Você → Fulano". When owed: "Fulano → Você"
              const avatarLetter = isPositive
                ? balance.member_name.charAt(0).toUpperCase()  // they owe you → show them
                : "V"; // you owe them → show "Você" first

              return (
                <div
                  key={balance.member_id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${surfaceNeutral}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${chipBg(isPositive)}`}
                    >
                      {avatarLetter}
                    </div>

                    <div>
                      {isPositive ? (
                        // "Fulano deve R$ X para você"
                        <>
                          <p className={`font-medium ${textNeutralMain}`}>{balance.member_name}</p>
                          <p className={`text-sm ${lineText(true)}`}>
                            deve {formatCurrency(amount, currency)} para <strong>você</strong>
                          </p>
                        </>
                      ) : (
                        // "Você deve R$ X para Fulano"
                        <>
                          <p className={`font-medium ${textNeutralMain}`}>Você</p>
                          <p className={`text-sm ${lineText(false)}`}>
                            deve {formatCurrency(amount, currency)} para <strong>{balance.member_name}</strong>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Summary Stats */}
      {hasBalances && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg border ${summaryBg("pos")}`}>
            <p className={`text-xs mb-1 ${summaryTextTitle("pos")}`}>Total a receber</p>
            <p className={`text-lg font-bold ${summaryTextValue("pos")}`}>{formatCurrency(totalOwed, currency)}</p>
          </div>
          <div className={`p-4 rounded-lg border ${summaryBg("neg")}`}>
            <p className={`text-xs mb-1 ${summaryTextTitle("neg")}`}>Total a pagar</p>
            <p className={`text-lg font-bold ${summaryTextValue("neg")}`}>{formatCurrency(totalOwing, currency)}</p>
          </div>
        </div>
      )}

      {/* Settle Button */}
      {hasBalances && (
        <button
          onClick={onSettleClick}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors
            ${isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
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