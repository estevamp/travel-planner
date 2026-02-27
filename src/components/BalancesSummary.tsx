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

  // Calculate individual balances with other members
  const individualBalances = balances
    .filter((b) => b.member_id !== currentMember?.id)
    .map((balance) => ({
      ...balance,
      isOwed: balance.net_balance < 0, // They owe money
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
        className={`p-6 rounded-xl ${
          netBalance > 0
            ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800"
            : netBalance < 0
            ? "bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800"
            : "bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700"
        }`}
      >
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Seu saldo</p>
          <p
            className={`text-3xl font-bold ${
              netBalance > 0
                ? "text-green-600 dark:text-green-400"
                : netBalance < 0
                ? "text-red-600 dark:text-red-400"
                : "text-gray-600 dark:text-gray-400"
            }`}
          >
            {formatCurrency(Math.abs(netBalance), currency)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
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
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Detalhamento
          </h3>
          {individualBalances.map((balance) => {
            const amount = Math.abs(balance.net_balance);
            const isPositive = balance.net_balance > 0;

            return (
              <div
                key={balance.member_id}
                className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      isPositive ? "bg-green-500" : "bg-red-500"
                    }`}
                  >
                    {balance.member_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {balance.member_name}
                    </p>
                    <p
                      className={`text-sm ${
                        isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
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
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-600 dark:text-green-400 mb-1">
              Total a receber
            </p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">
              {formatCurrency(totalOwed, currency)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">Total a pagar</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-300">
              {formatCurrency(totalOwing, currency)}
            </p>
          </div>
        </div>
      )}

      {/* Settle Button */}
      {hasBalances && (
        <button
          onClick={onSettleClick}
          className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
        >
          Quitar viagem
        </button>
      )}

      {!hasBalances && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            Nenhuma despesa compartilhada ainda
          </p>
        </div>
      )}
    </div>
  );
}
