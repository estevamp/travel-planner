import { useEffect, useCallback } from "react";
import { useI18n } from "../i18n/I18nProvider";

const TOUR_KEY = "partiu_tour_done";

export function useTour(isReady: boolean, setActiveTab: (tab: string) => void) {
  const { t } = useI18n();
  const startTour = useCallback(() => {
    const win = window as any;
    const driverFactory =
      win?.driver?.js?.driver ??
      win?.["driver.js"]?.driver ??
      win?.driverjs?.driver ??
      win?.driver;

    if (typeof driverFactory !== "function") return;

    let driverObj: any;
    driverObj = driverFactory({
      showProgress: true,
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.prev"),
      doneBtnText: t("tour.done"),
      progressText: t("tour.progress"),
      onDestroyed: () => localStorage.setItem(TOUR_KEY, "true"),
      steps: [
        {
          element: "#tour-trip-name",
          popover: {
            title: t("tour.tripName.title"),
            description: t("tour.tripName.body"),
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#tour-tab-itinerary",
          popover: {
            title: t("tour.itinerary.title"),
            description: t("tour.itinerary.body"),
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("itinerary"),
        },
        {
          element: "#tour-tab-ideas",
          popover: {
            title: t("tour.ideas.title"),
            description: t("tour.ideas.body"),
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("ideas"),
        },
        {
          element: "#tour-tab-expenses",
          popover: {
            title: t("tour.expenses.title"),
            description: t("tour.expenses.body"),
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("expenses"),
        },
        {
          element: "#tour-tab-documents",
          popover: {
            title: t("tour.documents.title"),
            description: t("tour.documents.body"),
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("documents"),
        },
        {
          element: "#tour-tab-people",
          popover: {
            title: t("tour.people.title"),
            description: t("tour.people.body"),
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("people"),
        },
        {
          element: "#tour-fab",
          popover: {
            title: t("tour.fab.title"),
            description: t("tour.fab.body"),
            side: "top",
          },
          onHighlightStarted: () => {
            setActiveTab("itinerary");
            // The tab switch triggers an exit/enter animation (AnimatePresence
            // mode="wait") plus the FAB's own scale-in animation, so the button
            // isn't in its final position when driver.js first measures it.
            // Refresh the highlight once the FAB has settled.
            const waitForFab = (attempt = 0) => {
              const fab = document.querySelector("#tour-fab");
              if (fab) {
                driverObj?.refresh?.();
              } else if (attempt < 20) {
                setTimeout(() => waitForFab(attempt + 1), 50);
              }
            };
            setTimeout(() => waitForFab(), 350);
          },
        },
      ],
    });

    driverObj.drive();
  }, [setActiveTab, t]);

  // Dispara automaticamente só na primeira visita
  useEffect(() => {
    if (!isReady) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const timer = setTimeout(startTour, 800);
    return () => clearTimeout(timer);
  }, [isReady, startTour]);

  return { startTour };
}
