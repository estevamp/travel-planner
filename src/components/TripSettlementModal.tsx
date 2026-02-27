import { useState } from "react";
import { SimplifiedTransfer } from "../types/splitting";
import { formatCurrency } from "../utils/splitting";

interface TripSettlementModalProps {
  transfers: SimplifiedTransfer[];
  currency: string;
  onClose: () => void;
  onMarkComplete: (fromId: string, toId: string) => void;
  onFinalize: () => void;
}

export function TripSettlementModal({
  transfers,
  currency,
  onClose,
  onMarkComplete,
  onFinalize,
}: TripSettlementModalProps) {
  const [completedTransfers, setCompletedTransfers] = useState<Set<string>>(
    new Set()
  );

  const allCompleted = transfers.every((t) =>
    completedTransfers.has(`${t.from_member_id}-${t.to_member_id}`)
  );

  const handleToggleComplete = (transfer: SimplifiedTransfer) => {
    const key = `${transfer.from_member_id}-${transfer.to_member_id}`;
    const newCompleted = new Set(completedTransfers);

    if (newCompleted.has(key)) {
      newCompleted.delete(key);
    } else {
      newCompleted.add(key);
      onMarkComplete(transfer.from_member_id, transfer.to_member_id);
    }

    setCompletedTransfers(newCompleted);
  };

  const handleFinalize = () => {
    if (allCompleted) {
      onFinalize();
    }
  };

  if (transfers.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Tudo acertado!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Nenhum acerto necessário. Todos os saldos estão zerados!
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Quitar viagem
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Transferências necessárias para zerar todos os saldos
          </p>
        </div>

        {/* Transfers List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {transfers.map((transfer, index) => {
            const key = `${transfer.from_member_id}-${transfer.to_member_id}`;
            const isCompleted = completedTransfers.has(key);

            return (
              <div
                key={key}
                className={`p-4 rounded-lg border-2 transition-all ${
                  isCompleted
                    ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                    : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {index + 1}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {transfer.from_member_name}
                      </span>
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 8l4 4m0 0l-4 4m4-4H3"
                        />
                      </svg>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {transfer.to_member_name}
                      </span>
                    </div>

                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-3">
                      {formatCurrency(transfer.amount, currency)}
                    </p>

                    <button
                      onClick={() => handleToggleComplete(transfer)}
                      className={`w-full py-2 px-4 rounded-lg font-medium transition-all ${
                        isCompleted
                          ? "bg-green-500 hover:bg-green-600 text-white"
                          : "bg-blue-500 hover:bg-blue-600 text-white"
                      }`}
                    >
                      {isCompleted ? "✓ Pago" : "Marcar como pago"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {completedTransfers.size} de {transfers.length} transferências concluídas
            </span>
            {allCompleted && (
              <span className="text-green-600 dark:text-green-400 font-semibold">
                ✓ Tudo pago!
              </span>
            )}
          </div>

          <button
            onClick={handleFinalize}
            disabled={!allCompleted}
            className={`w-full py-3 px-4 font-semibold rounded-lg transition-all ${
              allCompleted
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            {allCompleted ? "Finalizar quitação" : "Marque todas as transferências"}
          </button>
        </div>
      </div>
    </div>
  );
}
