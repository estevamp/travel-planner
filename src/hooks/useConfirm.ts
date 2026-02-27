import { useState, useCallback, createElement } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  isDark?: boolean;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveCallback, setResolveCallback] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((confirmOptions: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOptions(confirmOptions);
      setResolveCallback(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveCallback) resolveCallback(true);
    setOptions(null);
    setResolveCallback(null);
  }, [resolveCallback]);

  const handleCancel = useCallback(() => {
    if (resolveCallback) resolveCallback(false);
    setOptions(null);
    setResolveCallback(null);
  }, [resolveCallback]);

  const ConfirmDialogNode = options
    ? createElement(ConfirmDialog, {
        isOpen: true,
        ...options,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      })
    : null;

  return { confirm, ConfirmDialogNode };
}
