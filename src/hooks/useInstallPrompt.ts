import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as any).standalone === true)
  );
}

const DISMISSED_KEY = "pwa_install_dismissed";

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const isIOSDevice = isIOS();
  const alreadyDismissed = localStorage.getItem(DISMISSED_KEY) === "1";
  const alreadyInstalled = isInStandaloneMode();

  useEffect(() => {
    if (alreadyInstalled || alreadyDismissed) return;

    // Android / Chrome — captura o evento nativo
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS — sem evento nativo, exibimos instruções manuais
    if (isIOSDevice) {
      setShowBanner(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [alreadyDismissed, alreadyInstalled, isIOSDevice]);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowBanner(false);
  };

  return {
    showBanner: showBanner && !alreadyInstalled,
    isIOS: isIOSDevice,
    canInstallNatively: !!deferredPrompt,
    install,
    dismiss,
  };
}