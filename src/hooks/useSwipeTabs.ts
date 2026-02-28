// useSwipeTabs.ts — versão com direção
import { useRef, useCallback, useState } from "react";

const TABS = ["itinerary", "expenses", "ideas", "documents", "people", "settings"] as const;
type Tab = typeof TABS[number];

export function useSwipeTabs(activeTab: Tab, setActiveTab: (t: Tab) => void) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [direction, setDirection] = useState(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      if (Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (Math.abs(deltaX) < 60) return;

      const currentIndex = TABS.indexOf(activeTab);

      if (deltaX < 0 && currentIndex < TABS.length - 1) {
        setDirection(-1); // indo para direita do array = slide da direita
        setActiveTab(TABS[currentIndex + 1]);
      } else if (deltaX > 0 && currentIndex > 0) {
        setDirection(1); // voltando = slide da esquerda
        setActiveTab(TABS[currentIndex - 1]);
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [activeTab, setActiveTab]
  );

  return { onTouchStart, onTouchEnd, direction };
}