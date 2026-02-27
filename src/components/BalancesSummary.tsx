import { TripMember } from "../types";
import { MemberBalance } from "../types/splitting";
import { formatCurrency } from "../utils/splitting";

interface BalancesSummaryProps {
  balances: MemberBalance[];
  currentUserId: string;
  members: TripMember[];
  currency: string;
  onSettleClick: () => void;
}

export function BalancesSummary({
  balances,
  currentUserId,
  members,
  currency,
  onSettleClick,
}: BalancesSummaryProps) {
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const currentMemberBalance = balances.find(
    (b) => b.member_id === currentMember?.id
  );

  const netBalance = currentMemberBalance?.net_balance || 0;

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

  const hasBalances = balances.length > 0;


return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div
        className={`p-6 rounded-xl border-2 ${
          netBalance > 0
            // LIGHT mais claro: bg-green-100 + border-green-300
            // DARK (mantido): bg-green-950 + border-green-700
            ? "bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-700"
            : netBalance < 0
            ? "bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-700"
            : // Neutro mais claro no light
              "bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
        }`}
      >
        <div className="text-center">
          <p
            className={`text-sm mb-2 ${
              netBalance > 0
                ? "text-green-900 dark:text-green-100"
                : netBalance < 0
                ? "text-red-900 dark:text-red-100"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            Seu saldo
          </p>

          <p
            className={`text-3xl font-bold ${
              netBalance > 0
                ? "text-green-900 dark:text-green-100"
                : netBalance < 0
                ? "text-red-900 dark:text-red-100"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {formatCurrency(Math.abs(netBalance), currency)}
          </p>

          <p
            className={`text-sm mt-1 ${
              netBalance > 0
                ? "text-green-800 dark:text-green-200"
                : netBalance < 0
                ? "text-red-800 dark:text-red-200"
                : "text-slate-800 dark:text-slate-200"
            }`}
          >
            {netBalance > 0
              ? "Você tem a receber"
              : netBalance < 0
              ? "Você deve"
              : "Tudo acertado! 🎉"}
          </p>
        </div>
      </div>

      {/* Individual Balances */}
      {hasBalances && (
        <div className="space-y-3">
          <h3 className="font-bold mb-4 text-slate-900 dark:text-slate-100">
            Detalhamento
          </h3>

          {individualBalances.map((balance) => {
            const amount = Math.abs(balance.net_balance);
            const isPositive = balance.net_balance > 0;

            return (
              <div
                key={balance.member_id}
                // Light: branco sólido; Dark: slate-900 (mantido)
                className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      isPositive ? "bg-green-600" : "bg-red-600"
                    }`}
                  >
                    {balance.member_name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {balance.member_name}
                    </p>

                    <p
                      className={`text-sm ${
                        isPositive
                          ? "text-green-800 dark:text-green-200"
                          : "text-red-800 dark:text-red-200"
                      }`}
                    >
                      {isPositive
                        ? `deve ${formatCurrency(amount, currency)} para você`
                        : `você deve ${formatCurrency(amount, currency)}`}
                    </p>
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
          <div className="p-4 rounded-lg bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-700">
            <p className="text-xs text-green-900 dark:text-green-200 mb-1">
              Total a receber
            </p>
            <p className="text-lg font-bold text-green-900 dark:text-green-100">
              {formatCurrency(totalOwed, currency)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700">
            <p className="text-xs text-red-900 dark:text-red-200 mb-1">
              Total a pagar
            </p>
            <p className="text-lg font-bold text-red-900 dark:text-red-100">
              {formatCurrency(totalOwing, currency)}
            </p>
          </div>
        </div>
      )}

      {/* Settle Button */}
      {hasBalances && (
        <button
          onClick={onSettleClick}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
        >
          Quitar viagem
        </button>
      )}

      {!hasBalances && (
        <div className="text-center py-8">
          <p className="text-slate-700 dark:text-slate-200">
            Nenhuma despesa compartilhada ainda
          </p>
        </div>
      )}
    </div>
  );
}