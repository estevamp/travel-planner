import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Info, ShieldCheck } from "lucide-react";

export function AboutPage() {
  const navigate = useNavigate();
  const version = "1.0.0";
  const build = "20260224.1";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">Sobre o Viajando</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4 text-blue-600 dark:text-blue-400">
            <Info className="w-6 h-6" />
            <h2 className="text-lg font-semibold">O Aplicativo</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            O Viajando é o seu planejador de viagens colaborativo. Organize roteiros, despesas, voos e documentos em um só lugar, facilitando a coordenação com seus amigos e familiares.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4 text-green-600 dark:text-green-400">
            <Mail className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Suporte Técnico</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Encontrou algum problema ou tem alguma sugestão? Entre em contato conosco.
          </p>
          <a
            href="mailto:estevamp@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Enviar mensagem para estevamp@gmail.com
          </a>
        </section>

        <section className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4 text-purple-600 dark:text-purple-400">
            <ShieldCheck className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Informações do Sistema</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Versão</p>
              <p className="font-mono">{version}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Build</p>
              <p className="font-mono">{build}</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-slate-500 text-sm pt-4">
          &copy; {new Date().getFullYear()} Viajando. Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
