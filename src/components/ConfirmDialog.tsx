import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '../utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  isDark?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = 'default',
  isDark = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      isDark={isDark}
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          {variant === 'danger' && (
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          )}
          <p className={cn(
            "text-base leading-relaxed",
            isDark ? "text-zinc-300" : "text-zinc-600"
          )}>
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className={cn(
              "px-4 py-2 rounded-xl font-medium transition-colors",
              isDark 
                ? "bg-zinc-800 hover:bg-zinc-700 text-white" 
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
            )}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 rounded-xl font-medium transition-colors shadow-sm",
              variant === 'danger'
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
