import React, { useState, useEffect, useRef } from "react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { DollarSign, Users, Palette, Settings, Trash2, Plus, Moon, Sun, Monitor, FileText, Info, Languages, Calendar, HelpCircle, LogOut, Tag } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber } from "../../utils";
import { getDeterministicColor } from "../../utils/colors";
import { THEME_PALETTES, ACTIVITY_ICONS } from "../../constants";
import type { Trip, ThemePalette, UserSettings } from "../../types";
import type { TranslationKey } from "../../i18n/translations";
import { Card } from "../Card";
import { Modal } from "../Modal";
import { ACTIVITY_ICON_COMPONENTS } from '../../constants/icons';
import { useOfflineQueue } from "../../hooks/useOfflineQueue";
import { useI18n } from "../../i18n/I18nProvider";

// Deriva a lista de temas direto de THEME_PALETTES — evita manter duas fontes
// da verdade (array de chaves + THEME_PALETTES) que podem ficar fora de sincronia.
const THEME_KEYS = Object.keys(THEME_PALETTES) as ThemePalette[];

interface SettingsTabProps {
  // Nenhuma prop necessária — tudo vem do contexto
}

export function SettingsTab() {
  const { isOnline } = useOfflineQueue();
  const { t, language } = useI18n();
  const {
    trip, tripId, currentMember, isAdmin, isSuperuser, settings, onSettingsChange,
    members, categories, setCategories, itineraryTypes, setItineraryTypes,
    tripBudget, setTripBudget, budgetOwnerUserId, budgetCurrency, setBudgetCurrency,
    userId, deleteCurrentTrip, navigateToAbout, navigateToHelp, reloadTripOptions, setTrip
  } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editTripName, setEditTripName] = useState(trip.name || "");
  const [editTripDestination, setEditTripDestination] = useState(trip.destination || "");
  const [updatingTrip, setUpdatingTrip] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypeIcon, setEditTypeIcon] = useState("Calendar");
  const [savingType, setSavingType] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryIcon, setEditCategoryIcon] = useState("ShoppingBag");
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  
  const settingsAutosaveReadyRef = useRef(false);
  const tripAutosaveReadyRef = useRef(false);
  const canManageTrip = isAdmin || isSuperuser;

  // Sync settings draft when settings change
  useEffect(() => {
    setSettingsDraft(settings);
    settingsAutosaveReadyRef.current = false;
  }, [settings]);

  // Sync trip fields when trip changes
  useEffect(() => {
    setEditTripName(trip.name || "");
    setEditTripDestination(trip.destination || "");
  }, [trip.id, trip.name, trip.destination]);

  // Autosave settings
  useEffect(() => {
    if (!settingsAutosaveReadyRef.current) {
      settingsAutosaveReadyRef.current = true;
      return;
    }
    const hasChanges =
      settingsDraft.theme_preference !== settings.theme_preference ||
      settingsDraft.dark_mode !== settings.dark_mode ||
      settingsDraft.default_currency !== settings.default_currency ||
      settingsDraft.language_code !== settings.language_code;
    if (!hasChanges) return;

    const timeout = setTimeout(async () => {
      if (savingSettings) return;
      setSavingSettings(true);
      
      // Optimistic update
      onSettingsChange({ ...settingsDraft });

      const { error } = await supabase
        .from("profiles")
        .update({
          theme_preference: settingsDraft.theme_preference,
          dark_mode: settingsDraft.dark_mode,
          default_currency: settingsDraft.default_currency,
          language_code: settingsDraft.language_code,
        })
        .eq("user_id", userId);
      setSavingSettings(false);
      if (error) {
        toast(getErrorMessage(error), 'error');
        // Rollback
        onSettingsChange(settings);
        return;
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [settingsDraft, settings, userId, onSettingsChange, savingSettings]);

  // Manual save trip name and destination
  const handleSaveTripInfo = async () => {
    if (!tripId || !trip || !canManageTrip || updatingTrip) return;

    const name = editTripName.trim();
    const destination = editTripDestination.trim();
    if (!name || !destination) return;
    
    // Check if name or destination actually changed
    if (name === trip.name && destination === trip.destination) return;

    setUpdatingTrip(true);

    // Optimistic update
    setTrip({ ...trip, name, destination });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setUpdatingTrip(false);
      toast(t("trip.sessionExpiredDelete"), 'error');
      setTrip(trip);
      return;
    }

    const response = await fetch('/api/update-trip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tripId, name, destination }),
    });
    
    setUpdatingTrip(false);
    if (!response.ok) {
      let errorMessage = t("common.unexpectedError");
      try {
        const payload = await response.json();
        errorMessage = payload?.error || payload?.details || errorMessage;
      } catch {
        // Keep fallback.
      }
      toast(errorMessage, 'error');
      // Rollback
      setTrip(trip);
      return;
    }
    await reloadTripOptions();
  };

  const expectedDeleteConfirmation = `delete ${trip.name}`;
  const isDeleteConfirmationValid = deleteConfirmationValue.trim() === expectedDeleteConfirmation;

  const handleDeleteTrip = async () => {
    if (!isDeleteConfirmationValid || updatingTrip) return;

    setUpdatingTrip(true);
    const deleted = await deleteCurrentTrip();
    setUpdatingTrip(false);
    if (!deleted) return;
    setIsDeleteModalOpen(false);
    setDeleteConfirmationValue("");
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);

    if (error) {
      toast(getErrorMessage(error), "error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <span>📶</span>
          <p>{t("settings.offlineNotice")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center">
            <Languages size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t("settings.language")}</h3>
            <p className="text-sm text-zinc-500">{t("settings.languageDescription")}</p>
          </div>
        </div>
        <div className={cn(
          "inline-flex w-full rounded-xl p-1 gap-1",
          settings.dark_mode ? "bg-zinc-800/60" : "bg-zinc-100"
        )}>
          {(["pt-BR", "en"] as const).map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => setSettingsDraft((current) => ({ ...current, language_code: locale }))}
              className={cn(
                "flex-1 min-h-10 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center justify-center text-center",
                settingsDraft.language_code === locale
                  ? "bg-[var(--accent-color)] text-white shadow-sm"
                  : cn(settings.dark_mode ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700")
              )}
            >
              {t(`settings.language.${locale}` as "settings.language.pt-BR" | "settings.language.en")}
            </button>
          ))}
        </div>
      </Card>

      {/* ── 1. FINANCEIRO & ORÇAMENTO (unified card) ── */}
      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t("settings.financeTitle")}</h3>
            <p className="text-sm text-zinc-500">{t("settings.financeDescription")}</p>
          </div>
        </div>

        {/* Moeda Padrão */}
        <div className="space-y-3">
          <label className="text-sm font-semibold block">{t("settings.defaultCurrency")}</label>
          <div className={cn(
            "inline-flex w-full rounded-xl p-1 gap-1",
            settings.dark_mode ? "bg-zinc-800/60" : "bg-zinc-100"
          )}>
            {["BRL", "USD", "EUR"].map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => setSettingsDraft((current) => ({ ...current, default_currency: currency }))}
                className={cn(
                  "flex-1 min-h-10 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200",
                  settingsDraft.default_currency === currency
                    ? "bg-[var(--accent-color)] text-white shadow-sm"
                    : cn(settings.dark_mode ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700")
                )}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className={cn("border-t", settings.dark_mode ? "border-zinc-700" : "border-zinc-100")} />

        {/* Orçamento da Viagem */}
        <div className="space-y-4">
          <label className="text-sm font-semibold block">{t("settings.budgetLimit")}</label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              value={maskCurrency(String(Math.round((budgetDraft !== null ? budgetDraft : (tripBudget?.budget_limit || 0)) * 100)), settingsDraft.language_code)}
              onChange={(e) => {
                const masked = maskCurrency(e.target.value, settingsDraft.language_code);
                const nextLimit = parseCurrencyToNumber(masked);
                setBudgetDraft(nextLimit);
              }}
              placeholder="0,00"
              className={cn(
                "w-full sm:max-w-xs px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
            <button
              onClick={async () => {
                if (budgetDraft === null || savingBudget) return;
                setSavingBudget(true);
                
                // Optimistic update
                setTripBudget({
                  id: tripBudget?.id || "",
                  trip_id: tripId,
                  owner_user_id: budgetOwnerUserId || userId,
                  budget_limit: budgetDraft,
                  currency: budgetCurrency,
                });

                const { error } = await supabase
                  .from("trip_budgets")
                  .upsert({
                    id: tripBudget?.id || undefined,
                    trip_id: tripId,
                    owner_user_id: budgetOwnerUserId || userId,
                    budget_limit: budgetDraft,
                    currency: budgetCurrency,
                  });

                setSavingBudget(false);
                if (error) {
                  toast(getErrorMessage(error), 'error');
                  // Rollback
                  setTripBudget(tripBudget);
                } else {
                  setBudgetDraft(null);
                }
              }}
              disabled={budgetDraft === null || savingBudget}
              className="w-full sm:w-auto shrink-0 bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
            >
              {savingBudget ? t("common.saving") : t("common.confirm")}
            </button>
          </div>
          <div className="px-4 py-3 rounded-xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <p className={cn("text-xs", settings.dark_mode ? "text-zinc-400" : "text-zinc-600")}>
              {budgetOwnerUserId === userId
                ? t("settings.budgetOwnershipIndividual")
                : t("settings.budgetOwnershipShared")}
            </p>
          </div>
        </div>
      </Card>

      {/* ── 2. APARÊNCIA & TEMAS (moved to follow financial section) ── */}
      {trip && (
        <Card className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Palette size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{t("settings.appearanceTitle")}</h3>
              <p className="text-sm text-zinc-500">{t("settings.appearanceDescription")}</p>
            </div>
          </div>

          {/* Display mode: light / dark / system */}
          <div>
            <label className="text-sm font-semibold mb-3 block">{t("settings.displayMode")}</label>
            <div className={cn(
              "inline-flex w-full rounded-xl p-1 gap-1",
              settings.dark_mode ? "bg-zinc-800/60" : "bg-zinc-100"
            )}>
              {([
                { value: "light", icon: Sun, label: t("settings.lightMode") },
                { value: "dark", icon: Moon, label: t("settings.darkMode") },
                { value: "system", icon: Monitor, label: t("settings.systemMode") },
              ] as const).map(({ value, icon: Icon, label }) => {
                const isActive = settingsDraft.theme_preference === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSettingsDraft((current) => ({
                      ...current,
                      theme_preference: value,
                      dark_mode: value === "system"
                        ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
                        : value === "dark",
                    }))}
                    className={cn(
                      "flex-1 min-h-10 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors duration-200 flex items-center justify-center gap-2",
                      isActive
                        ? "bg-[var(--accent-color)] text-white shadow-sm"
                        : cn(settings.dark_mode ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700")
                    )}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className={cn("border-t", settings.dark_mode ? "border-zinc-700" : "border-zinc-100")} />

          {/* Tema da Viagem */}
          <div className="space-y-3">
            <label className="text-sm font-semibold block">{t("settings.tripTheme")}</label>
            <div
              className="flex gap-3 overflow-x-auto scrollbar-hide pt-2 pb-1 -mx-1 px-1"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {THEME_KEYS.filter((theme) => !THEME_PALETTES[theme].darkOnly || settingsDraft.dark_mode).map((theme) => {
                const palette = THEME_PALETTES[theme];
                const isActive = (trip?.theme_palette || 'default') === theme;
                const themeName = t(`settings.theme.${theme}` as TranslationKey);

                return (
                  <button
                    key={theme}
                    type="button"
                    onClick={async () => {
                      if (isActive) return;
                      
                      // Optimistic update
                      setTrip({ ...trip, theme_palette: theme });

                      const { error } = await supabase
                        .from("trips")
                        .update({ theme_palette: theme })
                        .eq("id", tripId);
                      if (error) {
                        toast(getErrorMessage(error), 'error');
                        // Rollback
                        setTrip(trip);
                        return;
                      }
                    }}
                    disabled={isActive}
                    className={cn(
                      "relative flex-shrink-0 w-24 p-3 rounded-2xl border-2 transition-all duration-200 hover:scale-105 disabled:cursor-default",
                      isActive
                        ? "border-[var(--accent-color)] shadow-lg ring-2 ring-offset-2 ring-[var(--accent-color)]/30"
                        : cn(
                            "shadow-sm",
                            settingsDraft.dark_mode
                              ? "border-zinc-700 hover:border-zinc-600"
                              : "border-zinc-200 hover:border-zinc-300"
                          )
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex gap-1 h-7 rounded-lg overflow-hidden">
                        <div
                          className="flex-1"
                          style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkAccent : palette.lightAccent }}
                        />
                        <div
                          className="flex-1"
                          style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkBg : palette.lightBg }}
                        />
                      </div>
                      <p className="text-xs font-semibold text-center truncate">{themeName}</p>
                    </div>
                    {isActive && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--accent-color)] flex items-center justify-center shadow-lg">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* ── 3. CATEGORIAS DE DESPESAS ── */}
      {isAdmin && (
        <Card className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t("settings.expenseCategoriesTitle")}</h3>
            <p className="text-sm text-zinc-500">{t("settings.expenseCategoriesDescription")}</p>
          </div>
        </div>
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const name = (form.get("name") as string).trim();
              const icon = (form.get("icon") as string) || "ShoppingBag";
              if (!name) return;
              const { data, error } = await supabase.from("expense_categories").insert({ name, icon }).select().single();
              if (error) {
                toast(getErrorMessage(error), 'error');
              } else {
                if (data) setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name)));
                (e.target as HTMLFormElement).reset();
              }
            }}
          >
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">{t("settings.categoryName")}</label>
                <input
                  name="name"
                  required
                  placeholder={t("settings.categoryPlaceholder")}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                  )}
                />
              </div>
              <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 self-end">
                <Plus size={16} />
                {t("common.add")}
              </button>
            </div>
            <details className="space-y-2">
              <summary className="cursor-pointer text-xs font-bold uppercase text-zinc-400 px-1 select-none flex items-center gap-1">
                <span>{t("settings.icon")}</span>
              </summary>
              <div className={cn(
                "flex flex-wrap gap-2 p-3 mt-2 rounded-xl border-2 max-h-40 overflow-y-auto",
                settings.dark_mode ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/50"
              )}>
                {ACTIVITY_ICONS.map((iconName) => {
                  const Icon = ACTIVITY_ICON_COMPONENTS[iconName] || Tag;
                  return (
                    <label key={iconName} className="cursor-pointer group">
                      <input type="radio" name="icon" value={iconName} className="hidden peer" defaultChecked={iconName === "ShoppingBag"} />
                      <div className={cn(
                        "p-2 rounded-lg border-2 border-transparent peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)]/5 transition-all",
                        settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                      )}>
                        <Icon size={20} className={cn(settings.dark_mode ? "text-zinc-400 group-hover:text-zinc-200" : "text-zinc-600 group-hover:text-zinc-900")} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </details>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((cat) => {
              const CatIcon = (cat.icon && ACTIVITY_ICON_COMPONENTS[cat.icon]) || Tag;
              const catColor = getDeterministicColor(cat.id);
              const isEditingCat = editingCategoryId === cat.id;

              if (isEditingCat) {
                return (
                  <div
                    key={cat.id}
                    className="sm:col-span-2 p-4 rounded-xl border-2 border-[var(--accent-color)] bg-[var(--accent-color)]/5 space-y-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("settings.categoryName")}</label>
                        <input
                          value={editCategoryName}
                          onChange={(e) => setEditCategoryName(e.target.value)}
                          className={cn(
                            "w-full px-4 py-2 rounded-lg border-2 text-sm focus:border-[var(--accent-color)] transition-all",
                            settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                          )}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("settings.icon")}</label>
                      <div className={cn(
                        "flex flex-wrap gap-2 p-3 rounded-xl border-2 max-h-40 overflow-y-auto",
                        settings.dark_mode ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/50"
                      )}>
                        {ACTIVITY_ICONS.map((iconName) => {
                          const IconComp = ACTIVITY_ICON_COMPONENTS[iconName] || Tag;
                          return (
                            <button
                              key={iconName}
                              type="button"
                              onClick={() => setEditCategoryIcon(iconName)}
                              className={cn(
                                "p-2 rounded-lg border-2 transition-all",
                                editCategoryIcon === iconName
                                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]/5"
                                  : cn("border-transparent", settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50")
                              )}
                            >
                              <IconComp size={20} className={cn(settings.dark_mode ? "text-zinc-400" : "text-zinc-600")} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingCategoryId(null)}
                        className={cn(
                          "px-4 py-2 rounded-xl border-2 text-sm font-bold",
                          settings.dark_mode ? "border-zinc-700 text-zinc-300" : "border-zinc-200 text-zinc-600"
                        )}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={savingCategory}
                        onClick={async () => {
                          if (!editCategoryName.trim() || savingCategory) return;
                          setSavingCategory(true);

                          // Optimistic update
                          setCategories(categories.map(c =>
                            c.id === editingCategoryId ? { ...c, name: editCategoryName.trim(), icon: editCategoryIcon } : c
                          ));

                          const { error } = await supabase
                            .from("expense_categories")
                            .update({ name: editCategoryName.trim(), icon: editCategoryIcon })
                            .eq("id", editingCategoryId);

                          setSavingCategory(false);
                          if (error) {
                            toast(getErrorMessage(error), 'error');
                            setCategories(categories);
                          } else {
                            setEditingCategoryId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold disabled:opacity-50"
                      >
                        {savingCategory ? t("common.saving") : t("expenses.saveChanges")}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={cat.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl border-2",
                    settings.dark_mode ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-100 bg-zinc-50/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                        color: catColor,
                      }}
                    >
                      <CatIcon size={16} />
                    </div>
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingCategoryId(cat.id);
                        setEditCategoryName(cat.name);
                        setEditCategoryIcon(cat.icon || "ShoppingBag");
                      }}
                      className={cn(
                        "text-zinc-400 hover:text-blue-500 transition-colors p-1 rounded-lg",
                        settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                      )}
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: t("settings.deleteCategoryTitle"),
                          message: t("settings.deleteCategoryMessage", { name: cat.name }),
                          variant: 'danger',
                          isDark: settings.dark_mode
                        });
                        if (!confirmed) return;

                        // Optimistic update
                        setCategories(categories.filter(c => c.id !== cat.id));

                        const { error } = await supabase.from("expense_categories").delete().eq("id", cat.id);
                        if (error) {
                          toast(getErrorMessage(error), 'error');
                          // Rollback
                          setCategories(categories);
                        }
                      }}
                      className={cn(
                        "text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg",
                        settings.dark_mode ? "hover:bg-red-950/30" : "hover:bg-red-50"
                      )}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            {categories.length === 0 && (
              <div className={cn(
                "sm:col-span-2 text-center py-8 px-4 rounded-xl border-2 border-dashed",
                settings.dark_mode ? "border-zinc-800" : "border-zinc-200"
              )}>
                <p className="text-sm text-zinc-500">{t("settings.noExpenseCategories")}</p>
                <p className="text-xs text-zinc-400 mt-1">{t("settings.addFirstExpenseCategory")}</p>
              </div>
            )}
          </div>
          </div>
        </Card>
      )}

      {/* ── 3. TIPOS DE ATIVIDADE ── */}
      {isAdmin && (
        <Card className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Plus size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{t("settings.activityTypesTitle")}</h3>
            <p className="text-sm text-zinc-500">{t("settings.activityTypesDescription")}</p>
          </div>
        </div>
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const name = (form.get("name") as string).trim();
              const icon = (form.get("icon") as string) || "Calendar";
              if (!name) return;
              const { data, error } = await supabase.from("itinerary_types").insert({ name, icon }).select().single();
              if (error) {
                toast(getErrorMessage(error), 'error');
              } else {
                if (data) setItineraryTypes([...itineraryTypes, data].sort((a, b) => a.name.localeCompare(b.name)));
                (e.target as HTMLFormElement).reset();
              }
            }}
          >
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">{t("settings.activityTypeName")}</label>
                <input
                  name="name"
                  required
                  placeholder={t("settings.activityTypePlaceholder")}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                  )}
                />
              </div>
              <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 self-end">
                <Plus size={16} />
                {t("common.add")}
              </button>
            </div>
            <details className="space-y-2">
              <summary className="cursor-pointer text-xs font-bold uppercase text-zinc-400 px-1 select-none flex items-center gap-1">
                <span>{t("settings.icon")}</span>
              </summary>
              <div className={cn(
                "flex flex-wrap gap-2 p-3 mt-2 rounded-xl border-2 max-h-40 overflow-y-auto",
                settings.dark_mode ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/50"
              )}>
                {ACTIVITY_ICONS.map((iconName) => {
                  const Icon = ACTIVITY_ICON_COMPONENTS[iconName] || Calendar;
                  return (
                    <label key={iconName} className="cursor-pointer group">
                      <input type="radio" name="icon" value={iconName} className="hidden peer" defaultChecked={iconName === "Calendar"} />
                      <div className={cn(
                        "p-2 rounded-lg border-2 border-transparent peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)]/5 transition-all",
                        settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                      )}>
                        <Icon size={20} className={cn(settings.dark_mode ? "text-zinc-400 group-hover:text-zinc-200" : "text-zinc-600 group-hover:text-zinc-900")} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </details>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {itineraryTypes.map((type) => {
              const Icon = ACTIVITY_ICON_COMPONENTS[type.icon] || Calendar;
              const typeColor = getDeterministicColor(type.id);
              const isEditing = editingTypeId === type.id;

              if (isEditing) {
                return (
                  <div
                    key={type.id}
                    className="sm:col-span-2 p-4 rounded-xl border-2 border-[var(--accent-color)] bg-[var(--accent-color)]/5 space-y-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("settings.activityTypeName")}</label>
                        <input
                          value={editTypeName}
                          onChange={(e) => setEditTypeName(e.target.value)}
                          className={cn(
                            "w-full px-4 py-2 rounded-lg border-2 text-sm focus:border-[var(--accent-color)] transition-all",
                            settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                          )}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("settings.icon")}</label>
                      <div className={cn(
                        "flex flex-wrap gap-2 p-3 rounded-xl border-2 max-h-40 overflow-y-auto",
                        settings.dark_mode ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/50"
                      )}>
                        {ACTIVITY_ICONS.map((iconName) => {
                          const IconComp = ACTIVITY_ICON_COMPONENTS[iconName] || Calendar;
                          return (
                            <button
                              key={iconName}
                              type="button"
                              onClick={() => setEditTypeIcon(iconName)}
                              className={cn(
                                "p-2 rounded-lg border-2 transition-all",
                                editTypeIcon === iconName
                                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]/5"
                                  : cn("border-transparent", settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50")
                              )}
                            >
                              <IconComp size={20} className={cn(settings.dark_mode ? "text-zinc-400" : "text-zinc-600")} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingTypeId(null)}
                        className={cn(
                          "px-4 py-2 rounded-xl border-2 text-sm font-bold",
                          settings.dark_mode ? "border-zinc-700 text-zinc-300" : "border-zinc-200 text-zinc-600"
                        )}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={savingType}
                        onClick={async () => {
                          if (!editTypeName.trim() || savingType) return;
                          setSavingType(true);

                          // Optimistic update
                          setItineraryTypes(itineraryTypes.map(t =>
                            t.id === editingTypeId ? { ...t, name: editTypeName.trim(), icon: editTypeIcon } : t
                          ));

                          const { error } = await supabase
                            .from("itinerary_types")
                            .update({ name: editTypeName.trim(), icon: editTypeIcon })
                            .eq("id", editingTypeId);

                          setSavingType(false);
                          if (error) {
                            toast(getErrorMessage(error), 'error');
                            setItineraryTypes(itineraryTypes);
                          } else {
                            setEditingTypeId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold disabled:opacity-50"
                      >
                        {savingType ? t("common.saving") : t("expenses.saveChanges")}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={type.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl border-2",
                    settings.dark_mode ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-100 bg-zinc-50/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${typeColor} 12%, transparent)`,
                        color: typeColor,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <span className="text-sm font-medium">{type.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingTypeId(type.id);
                        setEditTypeName(type.name);
                        setEditTypeIcon(type.icon || "Calendar");
                      }}
                      className={cn(
                        "text-zinc-400 hover:text-blue-500 transition-colors p-1 rounded-lg",
                        settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                      )}
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: t("settings.deleteActivityTypeTitle"),
                          message: t("settings.deleteActivityTypeMessage", { name: type.name }),
                          variant: 'danger',
                          isDark: settings.dark_mode
                        });
                        if (!confirmed) return;
                        
                        // Optimistic update
                        setItineraryTypes(itineraryTypes.filter(t => t.id !== type.id));

                        const { error } = await supabase.from("itinerary_types").delete().eq("id", type.id);
                        if (error) {
                          toast(getErrorMessage(error), 'error');
                          // Rollback
                          setItineraryTypes(itineraryTypes);
                        }
                      }}
                      className={cn(
                        "text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg",
                        settings.dark_mode ? "hover:bg-red-950/30" : "hover:bg-red-50"
                      )}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            {itineraryTypes.length === 0 && (
              <div className={cn(
                "sm:col-span-2 text-center py-8 px-4 rounded-xl border-2 border-dashed",
                settings.dark_mode ? "border-zinc-800" : "border-zinc-200"
              )}>
                <p className="text-sm text-zinc-500">{t("settings.noActivityTypes")}</p>
              </div>
            )}
          </div>
          </div>
        </Card>
      )}

      </div>

      {/* ── 4. GERENCIAR VIAGEM ── */}
      {canManageTrip && trip && (
        <Card className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{t("settings.manageTripTitle")}</h3>
              <p className="text-sm text-zinc-500">{t("settings.manageTripDescription")}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold block required-indicator">{t("landing.tripName")}</label>
              <input
                value={editTripName}
                onChange={(e) => setEditTripName(e.target.value)}
                placeholder={t("landing.tripName")}
                className={cn(
                  "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold block required-indicator">{t("landing.destination")}</label>
              <input
                value={editTripDestination}
                onChange={(e) => setEditTripDestination(e.target.value)}
                placeholder={t("landing.destination")}
                className={cn(
                  "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                required
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={updatingTrip}
                className={cn(
                  "px-4 py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50",
                  settings.dark_mode
                    ? "border-red-900 text-red-400 hover:bg-red-950/30"
                    : "border-red-200 text-red-600 hover:bg-red-50"
                )}
              >
                <Trash2 size={16} />
                {t("settings.deleteTrip")}
              </button>
              <button
                type="button"
                onClick={handleSaveTripInfo}
                disabled={updatingTrip}
                className="px-6 py-3 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updatingTrip ? t("common.saving") : t("expenses.saveChanges")}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className={cn(
            "w-full px-4 py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50",
            settings.dark_mode
              ? "border-red-900 text-red-400 hover:bg-red-950/30"
              : "border-red-200 text-red-600 hover:bg-red-50"
          )}
        >
          <LogOut size={18} />
          {t("common.signOut")}
        </button>
      </Card>

      {savingSettings && (
        <div className={cn(
          "px-4 py-3 rounded-xl border",
          settings.dark_mode ? "bg-emerald-950/20 border-emerald-900/50" : "bg-green-50 border-green-200"
        )}>
          <p className={cn("text-sm font-medium", settings.dark_mode ? "text-emerald-400" : "text-green-700")}>✅ {t("settings.autoSaving")}</p>
        </div>
      )}

      <div className="pt-4 space-y-3">
        <button
          onClick={navigateToHelp}
          className="w-full px-4 py-4 rounded-2xl border-2 border-[var(--card-border)] bg-[var(--card-bg)] text-zinc-600 dark:text-zinc-400 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-sm"
        >
          <HelpCircle size={18} />
          {t("settings.howToUse")}
        </button>

        <button
          onClick={navigateToAbout}
          className="w-full px-4 py-4 rounded-2xl border-2 border-[var(--card-border)] bg-[var(--card-bg)] text-zinc-600 dark:text-zinc-400 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-sm"
        >
          <Info size={18} />
          {t("about.title")}
        </button>
      </div>
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (updatingTrip) return;
          setIsDeleteModalOpen(false);
          setDeleteConfirmationValue("");
        }}
        title={t("settings.deleteTrip")}
        size="sm"
        isDark={settings.dark_mode}
      >
        <div className="space-y-5">
          <div className={cn(
            "rounded-2xl border px-4 py-4",
            settings.dark_mode ? "border-red-900/60 bg-red-950/20" : "border-red-200 bg-red-50"
          )}>
            <p className={cn("text-sm font-semibold", settings.dark_mode ? "text-red-300" : "text-red-700")}>
              {t("settings.deleteTripWarning")}
            </p>
            <p className={cn("mt-2 text-sm", settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
              {t("settings.deleteTripInstruction")} <span className="font-mono font-semibold">{expectedDeleteConfirmation}</span>.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold block">{t("settings.confirmation")}</label>
            <input
              value={deleteConfirmationValue}
              onChange={(e) => setDeleteConfirmationValue(e.target.value)}
              placeholder={expectedDeleteConfirmation}
              autoFocus
              className={cn(
                "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition-all",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmationValue("");
              }}
              disabled={updatingTrip}
              className={cn(
                "px-4 py-2 rounded-xl font-medium transition-colors",
                settings.dark_mode ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
              )}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleDeleteTrip}
              disabled={!isDeleteConfirmationValid || updatingTrip}
              className="px-4 py-2 rounded-xl font-medium transition-colors shadow-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {updatingTrip ? t("settings.deleting") : t("settings.deleteTrip")}
            </button>
          </div>
        </div>
      </Modal>
      {ConfirmDialogNode}
    </div>
  );
}
