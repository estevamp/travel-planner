import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Info, ShieldCheck, Coffee, Scale } from "lucide-react";
import { UserSettings } from "../types";
import { getThemeStyles } from "../utils/theme";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";

export function AboutPage({ settings }: { settings?: UserSettings }) {
  const navigate = useNavigate();
  const version = import.meta.env.VITE_APP_VERSION || "1.0.0";
  const build = import.meta.env.VITE_APP_BUILD || "20260227.1";
  const { t } = useI18n();

  usePageTitle(`${t("about.title")} | ${t("app.name")}`);

  const themedStyles = settings ? getThemeStyles(settings) : {};

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-slate-900 dark:text-slate-100" style={themedStyles}>
      <header className="bg-[var(--card-bg)] border-b border-[var(--card-border)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <img src="/favicon.svg" alt="Partiu!" className="w-8 h-8" />
          <h1 className="text-xl font-bold">{t("about.title")}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <Info className="w-6 h-6" />
            <h2 className="text-lg font-semibold">{t("about.aboutHeading")}</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {t("about.aboutText")}
          </p>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <Mail className="w-6 h-6" />
            <h2 className="text-lg font-semibold">{t("about.supportHeading")}</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t("about.supportText")}
          </p>
          <a
            href="mailto:estevamp@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-color)] hover:opacity-90 text-white rounded-lg transition-colors font-medium"
          >
            {t("about.supportCta")}
          </a>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-400">
            <Coffee className="w-6 h-6" />
            <h2 className="text-lg font-semibold">{t("about.contributeHeading")}</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {t("about.contributeText")}
          </p>
        </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
            <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
              <Scale className="w-6 h-6" />
              <h2 className="text-lg font-semibold">{t("about.termsHeading")}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {t("about.termsText")}
            </p>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-color)] hover:opacity-90 text-white rounded-lg transition-colors font-medium"
            >
              <Scale className="w-4 h-4" />
              {t("common.viewTerms")}
            </a>
          </section>

        <section className="bg-[var(--card-bg)] p-6 rounded-2xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
          <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
            <ShieldCheck className="w-6 h-6" />
            <h2 className="text-lg font-semibold">{t("about.systemHeading")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-[var(--bg-color)] rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">{t("about.version")}</p>
              <p className="font-mono">{version}</p>
            </div>
            <div className="p-3 bg-[var(--bg-color)] rounded-xl">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">{t("about.build")}</p>
              <p className="font-mono">{build}</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-slate-500 text-sm pt-4">
          &copy; {new Date().getFullYear()} Partiu!. {t("about.rights")}
        </footer>
      </main>
    </div>
  );
}
