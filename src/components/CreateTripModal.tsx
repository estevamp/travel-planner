import { useState } from 'react';
import { Modal } from './Modal';
import { cn } from '../utils';

export interface CreateTripModalProps {
  isOpen: boolean;
  isDark?: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; destination: string }) => Promise<void>;
}

export function CreateTripModal({ isOpen, isDark = false, onClose, onSubmit }: CreateTripModalProps) {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !destination) return;

    setIsSubmitting(true);
    try {
      await onSubmit({ name, destination });
      setName('');
      setDestination('');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova viagem"
      size="sm"
      isDark={isDark}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label 
            htmlFor="trip-name" 
            className={cn("text-sm font-medium", isDark ? "text-zinc-400" : "text-zinc-500")}
          >
            Nome da viagem
          </label>
          <input
            id="trip-name"
            type="text"
            required
            placeholder="Ex: Férias de Verão"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(
              "w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2 text-base sm:text-sm",
              isDark
                ? "bg-zinc-800 border-zinc-700 text-white focus:ring-zinc-600 placeholder:text-zinc-600"
                : "bg-white border-zinc-200 text-zinc-900 focus:ring-zinc-200 placeholder:text-zinc-400"
            )}
          />
        </div>

        <div className="space-y-2">
          <label 
            htmlFor="trip-destination" 
            className={cn("text-sm font-medium", isDark ? "text-zinc-400" : "text-zinc-500")}
          >
            Destino
          </label>
          <input
            id="trip-destination"
            type="text"
            required
            placeholder="Ex: Paris, França"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={cn(
              "w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2 text-base sm:text-sm",
              isDark
                ? "bg-zinc-800 border-zinc-700 text-white focus:ring-zinc-600 placeholder:text-zinc-600"
                : "bg-white border-zinc-200 text-zinc-900 focus:ring-zinc-200 placeholder:text-zinc-400"
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-4 py-2 rounded-xl font-medium transition-colors",
              isDark 
                ? "bg-zinc-800 hover:bg-zinc-700 text-white" 
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
            )}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name || !destination}
            className={cn(
              "px-4 py-2 rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
              "bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900"
            )}
          >
            {isSubmitting ? "Criando..." : "Criar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
