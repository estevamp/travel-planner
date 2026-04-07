import { ArrowLeft, BookOpen, CalendarDays, FileText, Lightbulb, Settings, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { UserSettings } from "../types";
import { getThemeStyles } from "../utils/theme";
import { useI18n, usePageTitle } from "../i18n/I18nProvider";

export function HelpPage({ settings }: { settings?: UserSettings }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  usePageTitle(`${t("public.help.title")} | ${t("app.name")}`);

  const themedStyles = settings ? getThemeStyles(settings) : {};

  const sections = [
    { icon: BookOpen, title: t("public.help.section.start.title"), body: t("public.help.section.start.body") },
    { icon: CalendarDays, title: t("public.help.section.itinerary.title"), body: t("public.help.section.itinerary.body") },
    { icon: Wallet, title: t("public.help.section.expenses.title"), body: t("public.help.section.expenses.body") },
    { icon: FileText, title: t("public.help.section.documents.title"), body: t("public.help.section.documents.body") },
    { icon: Lightbulb, title: t("public.help.section.ideas.title"), body: t("public.help.section.ideas.body") },
    { icon: Settings, title: t("public.help.section.settings.title"), body: t("public.help.section.settings.body") },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-slate-900 dark:text-slate-100" style={themedStyles}>
      <header className="bg-[var(--card-bg)] border-b border-[var(--card-border)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <img src="/favicon.svg" alt="Partiu!" className="w-8 h-8" />
          <h1 className="text-xl font-bold">{t("public.help.title")}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-[var(--card-bg)] p-6 rounded-3xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
          <h2 className="text-2xl font-bold text-[var(--accent-color)]">{t("public.help.title")}</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">{t("public.help.subtitle")}</p>
        </section>

        {sections.map(({ icon: Icon, title, body }) => (
          <section key={title} className="bg-[var(--card-bg)] p-6 rounded-3xl shadow-[var(--card-shadow)] border border-[var(--card-border)]">
            <div className="flex items-center gap-3 mb-4 text-[var(--accent-color)]">
              <Icon className="w-5 h-5" />
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{body}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
