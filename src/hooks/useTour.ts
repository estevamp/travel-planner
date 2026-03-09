import { useEffect, useCallback } from "react";

const TOUR_KEY = "partiu_tour_done";

export function useTour(isReady: boolean, setActiveTab: (tab: string) => void) {
  const startTour = useCallback(() => {
    const win = window as any;
    const driverFactory =
      win?.driver?.js?.driver ??
      win?.["driver.js"]?.driver ??
      win?.driverjs?.driver ??
      win?.driver;

    if (typeof driverFactory !== "function") return;

    const driverObj = driverFactory({
      showProgress: true,
      nextBtnText: "Próximo →",
      prevBtnText: "← Anterior",
      doneBtnText: "Entendi! 🎉",
      progressText: "{{current}} de {{total}}",
      onDestroyed: () => localStorage.setItem(TOUR_KEY, "true"),
      steps: [
        {
          element: "#tour-trip-name",
          popover: {
            title: "✈️ Sua viagem",
            description: "Esse é o nome da sua viagem. Você pode editá-lo nas configurações.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#tour-tab-itinerary",
          popover: {
            title: "📅 Atividades",
            description: "Aqui você monta o roteiro dia a dia — passeios, voos, restaurantes, hoteis com horário e local. É o cérebro da viagem!",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("itinerary"),
        },
        {
          element: "#tour-tab-ideas",
          popover: {
            title: "💡 Ideias",
            description: "Teve uma ideia às 2h da manhã? Salva ela aqui. Depois ela vira uma atividade com um toque.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("ideas"),
        },
        {
          element: "#tour-tab-expenses",
          popover: {
            title: "💸 Despesas",
            description: "Registre quem pagou o quê e divida as contas.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("expenses"),
        },
        {
          element: "#tour-tab-documents",
          popover: {
            title: "📄 Documentos",
            description: "Reservas, documentos e papelada ficam aqui — acessíveis até offline.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("documents"),
        },
        {
          element: "#tour-tab-people",
          popover: {
            title: "👥 Amigos",
            description: "Convide seus amigos por e-mail e planejem juntos.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("people"),
        },
        {
          element: "#tour-fab",
          popover: {
            title: "➕ Adicionar",
            description: "Use este botão para adicionar atividade, despesa ou ideia na aba atual.",
            side: "top",
          },
          onHighlightStarted: () => setActiveTab("itinerary"),
        },
      ],
    });

    driverObj.drive();
  }, [setActiveTab]);

  // Dispara automaticamente só na primeira visita
  useEffect(() => {
    if (!isReady) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const timer = setTimeout(startTour, 800);
    return () => clearTimeout(timer);
  }, [isReady, startTour]);

  return { startTour };
}
