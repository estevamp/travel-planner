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
            description: "Monte o roteiro dia a dia — passeios, voos, restaurantes com horário e local. O cérebro da viagem!",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("itinerary"),
        },
        {
          element: "#tour-tab-ideas",
          popover: {
            title: "💡 Ideias",
            description: "Aquela ideia das 2h da manhã? Salva aqui. Depois vira atividade com um toque.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("ideas"),
        },
        {
          element: "#tour-tab-expenses",
          popover: {
            title: "💸 Despesas",
            description: "Registre quem pagou o quê e divida as contas. Sem o famoso 'a gente acerta depois'.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("expenses"),
        },
        {
          element: "#tour-tab-documents",
          popover: {
            title: "📄 Documentos",
            description: "Passaportes, vouchers e reservas ficam aqui — acessíveis até offline.",
            side: "right",
          },
          onHighlightStarted: () => setActiveTab("documents"),
        },
        {
          element: "#tour-tab-people",
          popover: {
            title: "👥 Amigos",
            description: "Convide seus companheiros por e-mail para planejar juntos.",
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
