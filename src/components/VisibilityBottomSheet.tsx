import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, X } from 'lucide-react';
import { Visibility } from '../types';

interface VisibilityBottomSheetProps {
  isOpen: boolean;
  currentVisibility: Visibility;
  onConfirm: () => void;
  onClose: () => void;
  isDark?: boolean;
}

export const VisibilityBottomSheet: React.FC<VisibilityBottomSheetProps> = ({
  isOpen,
  currentVisibility,
  onConfirm,
  onClose,
  isDark = false,
}) => {
  const isMakingPrivate = currentVisibility === 'public';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed bottom-0 left-0 right-0 z-[101] rounded-t-3xl p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-2xl ${
              isDark ? 'bg-gray-900 text-white' : 'bg-[var(--card-bg)] text-[var(--foreground)]'
            }`}
          >
            {/* Handle */}
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-6" />

            <div className="flex flex-col items-center text-center">
              <div className={`p-4 rounded-full mb-4 ${
                isMakingPrivate ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {isMakingPrivate ? <Lock size={48} /> : <Unlock size={48} />}
              </div>

              <h3 className="text-xl font-bold mb-2">
                {isMakingPrivate ? 'Tornar privado' : 'Tornar público'}
              </h3>
              
              <p className="text-sm opacity-80 mb-8 max-w-[280px]">
                {isMakingPrivate 
                  ? 'Este item ficará visível apenas para você e seu cônjuge.'
                  : 'Este item ficará visível para todos os membros da viagem.'}
              </p>

              <div className="flex flex-col w-full gap-3">
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="w-full py-4 rounded-2xl font-semibold bg-[var(--sidebar-active-bg)] text-white transition-transform active:scale-95"
                >
                  Confirmar
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 rounded-2xl font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-transform active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
