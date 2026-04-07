import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Banner "Adicionar à tela de início" para Android e iOS.
 * Renderize este componente uma única vez em App.tsx.
 */
export function InstallBanner() {
  const { showBanner, isIOS, canInstallNatively, install, dismiss } =
    useInstallPrompt();
  const { language } = useI18n();

  if (!showBanner) return null;

  const copy = language === "en"
    ? {
        title: "Add to home screen",
        subtitle: "Use Partiu! like an app",
        close: "Close",
        install: "Install app",
        installHint: "Works offline and stays on your home screen",
        iosIntro: "Follow the steps below in Safari to add it to your home screen:",
        step1: "Tap the Share icon in Safari",
        step2: "Choose \"Add to Home Screen\"",
        step3: "Confirm by tapping \"Add\"",
        notNow: "Not now",
      }
    : {
        title: "Adicionar à tela de início",
        subtitle: "Acesse o Partiu! como um app",
        close: "Fechar",
        install: "Instalar aplicativo",
        installHint: "Funciona offline e fica na sua tela inicial",
        iosIntro: "Siga os passos abaixo no Safari para adicionar à tela de início:",
        step1: "Toque no ícone de Compartilhar na barra do Safari",
        step2: "Selecione \"Adicionar à Tela de Início\"",
        step3: "Confirme tocando em \"Adicionar\"",
        notNow: "Agora não",
      };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <img src="/favicon.svg" alt="Partiu!" className="w-10 h-10 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-zinc-900 text-sm">{copy.title}</p>
            <p className="text-xs text-zinc-500 truncate">{copy.subtitle}</p>
          </div>
          <button
            onClick={dismiss}
            className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
            aria-label={copy.close}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Android — botão de instalar direto */}
        {canInstallNatively && (
          <div className="px-4 pb-4">
            <button
              onClick={install}
              className="w-full bg-[#0A2342] text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              ✦ {copy.install}
            </button>
            <p className="text-center text-xs text-zinc-400 mt-2">
              {copy.installHint}
            </p>
          </div>
        )}

        {/* iOS — instruções manuais */}
        {isIOS && !canInstallNatively && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-zinc-600">
              {copy.iosIntro}
            </p>
            <ol className="space-y-2">
              {[
                {
                  icon: (
                    // Ícone de compartilhar do iOS
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  ),
                  text: copy.step1,
                },
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <path d="M14 14h.01M14 19h.01M19 14h.01M19 19h.01" />
                    </svg>
                  ),
                  text: copy.step2,
                },
                {
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ),
                  text: copy.step3,
                },
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center">
                    {step.icon}
                  </span>
                  <span className="text-xs text-zinc-700 pt-1">{step.text}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={dismiss}
              className="w-full border border-zinc-200 text-zinc-600 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors"
            >
              {copy.notNow}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
