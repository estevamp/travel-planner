import { useState } from "react";
import { SimplifiedTransfer } from "../types/splitting";
import { formatCurrency } from "../utils/splitting";
import { cn } from "../utils";

interface TripSettlementModalProps {
  transfers: SimplifiedTransfer[];
  currency: string;
  onClose: () => void;
  onMarkComplete: (fromId: string, toId: string) => void;
  onUnmarkComplete: (fromId: string, toId: string) => void; // ← NOVO
  onFinalize: () => void;
  isDark?: boolean;
  initialCompleted?: Set<string>; // ← NOVO: transfers já marcados no banco
}

export function TripSettlementModal({
  transfers,
  currency,
  onClose,
  onMarkComplete,
  onUnmarkComplete,
  onFinalize,
  isDark = false,
  initialCompleted = new Set(), // ← NOVO
}: TripSettlementModalProps) {
  const [completedTransfers, setCompletedTransfers] = useState<Set<string>>(
    new Set(initialCompleted) // ← Inicializa com os já salvos no banco
  );

  const allCompleted = transfers.every((t) =>
    completedTransfers.has(`${t.from_member_id}-${t.to_member_id}`)
  );

  const handleToggleComplete = (transfer: SimplifiedTransfer) => {
    const key = `${transfer.from_member_id}-${transfer.to_member_id}`;
    const newCompleted = new Set(completedTransfers);

    if (newCompleted.has(key)) {
      newCompleted.delete(key);
      onUnmarkComplete(transfer.from_member_id, transfer.to_member_id); // ← Deleta do banco
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
        <div className={cn("rounded-2xl max-w-md w-full p-6", isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900")}>
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className={cn("text-2xl font-bold mb-2", isDark ? "text-gray-100" : "text-gray-900")}>
              Tudo acertado!
            </h2>
            <p className={cn("mb-6", isDark ? "text-gray-400" : "text-gray-600")}>
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
      <div className={cn("rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col", isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900")}>
        {/* Header */}
        <div className={cn("p-6 border-b", isDark ? "border-gray-700" : "border-gray-200")}>
          <div className="flex items-center justify-between">
            <h2 className={cn("text-2xl font-bold", isDark ? "text-gray-100" : "text-gray-900")}>
              Quitar viagem
            </h2>
            <button
              onClick={onClose}
              className={cn("text-gray-400", isDark ? "hover:text-gray-300" : "hover:text-gray-600")}
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
          <p className={cn("text-sm mt-2", isDark ? "text-gray-400" : "text-gray-600")}>
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
                className={cn("p-4 rounded-lg border-2 transition-all",
                  isCompleted
                    ? (isDark ? "bg-green-900/20 border-green-500" : "bg-green-50 border-green-500")
                    : (isDark ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200")
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : (isDark ? "bg-gray-600 text-gray-300" : "bg-gray-300 text-gray-700")
                      }`}
                    >
                      {index + 1}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("font-semibold", isDark ? "text-gray-100" : "text-gray-900")}>
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
                      <span className={cn("font-semibold", isDark ? "text-gray-100" : "text-gray-900")}>
                        {transfer.to_member_name}
                      </span>
                    </div>

                    <p className={cn("text-2xl font-bold mb-3", isDark ? "text-blue-400" : "text-blue-600")}>
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
        <div className={cn("p-6 border-t", isDark ? "border-gray-700" : "border-gray-200")}>
          <div className="flex items-center justify-between mb-4">
            <span className={cn("text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
              {completedTransfers.size} de {transfers.length} transferências concluídas
            </span>
            {allCompleted && (
              <span className={cn("font-semibold", isDark ? "text-green-400" : "text-green-600")}>
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
                : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-300 text-gray-500 cursor-not-allowed")
            }`}
          >
            {allCompleted ? "Finalizar quitação" : "Marque todas as transferências"}
          </button>
        </div>
      </div>
    </div>
  );
}
