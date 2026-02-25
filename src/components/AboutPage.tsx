import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Info, ShieldCheck, Coffee } from "lucide-react";
import { UserSettings } from "../types";
import { getThemeStyles } from "../utils/theme";

export function AboutPage({ settings }: { settings?: UserSettings }) {
  const navigate = useNavigate();
  const version = "1.0.0";
  const build = "20260224.1";

  const themedStyles = settings ? getThemeStyles(settings) : {};

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-slate-900 dark:text-slate-100" style={themedStyles}>
      <header className="bg-[var(--card-bg)] border-b border-[var(--card-border)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">Sobre o Partiu!</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <Info className="w-6 h-6" />
            <h2 className="text-lg font-semibold">O Aplicativo</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            O Partiu! é o seu planejador de viagens colaborativo. Organize roteiros, despesas, voos e documentos em um só lugar, facilitando a coordenação com seus amigos e familiares.
          </p>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <Mail className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Suporte Técnico</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Encontrou algum problema ou tem alguma sugestão? Entre em contato...
          </p>
          <a
            href="mailto:estevamp@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-color)] hover:opacity-90 text-white rounded-lg transition-colors font-medium"
          >
            Enviar mensagem para estevamp@gmail.com
          </a>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-400">
            <Coffee className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Contribua</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Esse app é distribuído sem custo. Se quiser me ajudar com um cafézinho, pode fazer um pix para <span className="font-medium text-amber-600 dark:text-slate-100">estevamp@gmail.com</span>.
          </p>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-sm border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <ShieldCheck className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Informações do Sistema</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-[var(--bg-color)] rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Versão</p>
              <p className="font-mono">{version}</p>
            </div>
            <div className="p-3 bg-[var(--bg-color)] rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Build</p>
              <p className="font-mono">{build}</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-slate-500 text-sm pt-4">
          &copy; {new Date().getFullYear()} Partiu!. Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
