import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { DollarSign, Users, Palette, Settings, Trash2, Plus, Moon, Sun, FileText, Info, Briefcase, Calendar } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber } from "../../utils";
import { THEME_PALETTES, ACTIVITY_ICONS } from "../../constants";
import type { Trip, UserSettings } from "../../types";
import { Card } from "../Card";
import { ACTIVITY_ICON_COMPONENTS } from '../../constants/icons';

interface SettingsTabProps {
  // Nenhuma prop necessária — tudo vem do contexto
}

export function SettingsTab() {
  const {
    trip, tripId, currentMember, isAdmin, settings, onSettingsChange,
    members, categories, setCategories, itineraryTypes, setItineraryTypes,
    tripBudget, setTripBudget, budgetOwnerUserId, budgetCurrency, setBudgetCurrency,
    userId, deleteCurrentTrip, navigateToAbout, reloadTripOptions, setTrip
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
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(null);
  
  const settingsAutosaveReadyRef = useRef(false);
  const tripAutosaveReadyRef = useRef(false);

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
      settingsDraft.dark_mode !== settings.dark_mode ||
      settingsDraft.default_currency !== settings.default_currency;
    if (!hasChanges) return;

    const timeout = setTimeout(async () => {
      if (savingSettings) return;
      setSavingSettings(true);
      
      // Optimistic update
      onSettingsChange({ ...settingsDraft });

      const { error } = await supabase
        .from("profiles")
        .update({
          dark_mode: settingsDraft.dark_mode,
          default_currency: settingsDraft.default_currency,
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
    if (!tripId || !trip || !isAdmin || updatingTrip) return;

    const name = editTripName.trim();
    const destination = editTripDestination.trim();
    if (!name || !destination) return;
    
    // Check if name or destination actually changed
    if (name === trip.name && destination === trip.destination) return;

    setUpdatingTrip(true);

    // Optimistic update
    setTrip({ ...trip, name, destination });

    const { error } = await supabase.from("trips").update({
      name,
      destination,
    }).eq("id", tripId);
    
    setUpdatingTrip(false);
    if (error) {
      toast(getErrorMessage(error), 'error');
      // Rollback
      setTrip(trip);
      return;
    }
    await reloadTripOptions();
  };

  return (
    <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Financeiro</h3>
            <p className="text-sm text-zinc-500">Configure suas preferências monetárias</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-sm font-semibold block">Moeda Padrão</label>
          <div className="grid grid-cols-3 gap-3">
            {["BRL", "USD", "EUR"].map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => setSettingsDraft((current) => ({ ...current, default_currency: currency }))}
                className={cn(
                  "px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all duration-200 hover:scale-105",
                  settingsDraft.default_currency === currency
                    ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-white shadow-lg"
                    : cn(
                        "shadow-sm",
                        settings.dark_mode
                          ? "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                          : "border-zinc-200 hover:border-zinc-300"
                      )
                )}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Orçamento da Viagem</h3>
            <p className="text-sm text-zinc-500">Defina um limite de gastos</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="text-sm font-semibold block">Limite de Orçamento</label>
          <div className="flex gap-3">
            <input
              value={maskCurrency(String((budgetDraft !== null ? budgetDraft : (tripBudget?.budget_limit || 0)) * 100))}
              onChange={(e) => {
                const masked = maskCurrency(e.target.value);
                const nextLimit = parseCurrencyToNumber(masked);
                setBudgetDraft(nextLimit);
              }}
              placeholder="0,00"
              className={cn(
                "flex-1 px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
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
              className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
            >
              {savingBudget ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <div className="px-4 py-3 rounded-xl border" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <p className={cn("text-xs", settings.dark_mode ? "text-zinc-400" : "text-zinc-600")}>
              {budgetOwnerUserId === userId
                ? "💡 Orçamento individual nesta viagem"
                : "👥 Orçamento compartilhado com cônjuge nesta viagem"}
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Palette size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Aparência</h3>
            <p className="text-sm text-zinc-500">Modo de exibição global</p>
          </div>
        </div>
        
        <div>
          <label className="text-sm font-semibold mb-3 block">Modo de Exibição</label>
          <button
            type="button"
            onClick={() => setSettingsDraft((current) => ({ ...current, dark_mode: !current.dark_mode }))}
            className={cn(
              "w-full px-6 py-4 rounded-2xl border-2 text-sm font-medium flex items-center justify-between gap-3 transition-all duration-200 hover:scale-[1.02]",
              settingsDraft.dark_mode
                ? "border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-900 text-white shadow-lg"
                : "border-zinc-200 hover:border-zinc-300 shadow-sm"
            )}
            style={!settingsDraft.dark_mode ? {
              background: `linear-gradient(to bottom right, var(--card-bg), var(--card-bg))`
            } : undefined}
          >
            <div className="flex items-center gap-3">
              {settingsDraft.dark_mode ? <Moon size={20} /> : <Sun size={20} />}
              <span className="text-base">{settingsDraft.dark_mode ? "Modo Escuro" : "Modo Claro"}</span>
            </div>
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-bold",
              settingsDraft.dark_mode ? "bg-zinc-700 text-zinc-300" : "bg-zinc-200 text-zinc-700"
            )}>
              {settingsDraft.dark_mode ? "Ativado" : "Desativado"}
            </div>
          </button>
        </div>
      </Card>

      {isAdmin && trip && (
        <Card className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Gerenciar Viagem</h3>
              <p className="text-sm text-zinc-500">Edite ou exclua esta viagem</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold block required-indicator">Nome da Viagem</label>
              <input
                value={editTripName}
                onChange={(e) => setEditTripName(e.target.value)}
                placeholder="Nome da viagem"
                className={cn(
                  "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold block required-indicator">Destino</label>
              <input
                value={editTripDestination}
                onChange={(e) => setEditTripDestination(e.target.value)}
                placeholder="Destino"
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
                onClick={deleteCurrentTrip}
                disabled={updatingTrip}
                className={cn(
                  "px-4 py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50",
                  settings.dark_mode
                    ? "border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-950/40"
                    : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                )}
              >
                <Trash2 size={16} />
                Excluir Viagem
              </button>
              <button
                type="button"
                onClick={handleSaveTripInfo}
                disabled={updatingTrip || (editTripName.trim() === trip.name && editTripDestination.trim() === trip.destination)}
                className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updatingTrip ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-semibold block">Tema da Viagem</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {(["default", "ocean", "forest", "sunset", "lavender", "midnight", "rose",
                   "tropic", "aurora", "coastal", "terra"] as const).map((theme) => {
                  const palette = THEME_PALETTES[theme];
                  const isActive = (trip?.theme_palette || 'default') === theme;
                  const themeNames: Record<string, string> = {
                    default: "Padrão",
                    ocean: "Oceano",
                    forest: "Floresta",
                    sunset: "Pôr do Sol",
                    lavender: "Lavanda",
                    midnight: "Meia-Noite",
                    rose: "Rosa",
                    tropic: "Tropical",   // LAYOUT FIX
                    aurora: "Aurora",     // LAYOUT FIX
                    coastal: "Coastal",   // LAYOUT FIX
                    terra: "Terra",       // LAYOUT FIX
                  };
                  
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={async () => {
                        if (isActive) return; // Don't update if already active
                        
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
                        "relative p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-105 disabled:cursor-default",
                        isActive
                          ? "border-[var(--accent-color)] shadow-lg ring-2 ring-offset-2 ring-[var(--accent-color)]/30"
                          : cn(
                              "shadow-sm",
                              settings.dark_mode
                                ? "border-zinc-700 hover:border-zinc-600"
                                : "border-zinc-200 hover:border-zinc-300"
                            )
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                          <div
                            className="flex-1"
                            style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkSidebarActiveBg : palette.lightSidebarActiveBg }}
                          />
                          <div
                            className="flex-1"
                            style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkAccent : palette.lightAccent }}
                          />
                          <div
                            className="flex-1"
                            style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkBg : palette.lightBg }}
                          />
                        </div>
                        <p className="text-xs font-semibold text-center">{themeNames[theme]}</p>
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
          </div>
        </Card>
      )}

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Categorias de Despesas</h3>
            <p className="text-sm text-zinc-500">Organize suas despesas por categoria</p>
          </div>
        </div>
        <div className="space-y-4">
          <form
            className="flex gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const name = (form.get("name") as string).trim();
              if (!name) return;
              const { data, error } = await supabase.from("expense_categories").insert({ name }).select().single();
              if (error) {
                toast(getErrorMessage(error), 'error');
              } else {
                if (data) setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name)));
                (e.target as HTMLFormElement).reset();
              }
            }}
          >
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Nome da Categoria</label>
              <input
                name="name"
                required
                placeholder="Ex: Alimentação"
                className={cn(
                  "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
              />
            </div>
            <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
              <Plus size={16} />
              Adicionar
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-4 rounded-xl border-2 transition-all group"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--card-border)'
                }}
              >
                <span className="text-sm font-semibold">{cat.name}</span>
                <button
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: 'Excluir categoria?',
                      message: `Excluir categoria "${cat.name}"?`,
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
            ))}
            {categories.length === 0 && (
              <div className={cn(
                "sm:col-span-2 text-center py-8 px-4 rounded-xl border-2 border-dashed",
                settings.dark_mode ? "border-zinc-800" : "border-zinc-200"
              )}>
                <p className="text-sm text-zinc-500">Nenhuma categoria configurada ainda.</p>
                <p className="text-xs text-zinc-400 mt-1">Adicione sua primeira categoria acima!</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Plus size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Tipos de Atividade</h3>
            <p className="text-sm text-zinc-500">Gerencie os tipos de atividades disponíveis</p>
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
                <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Nome do Tipo</label>
                <input
                  name="name"
                  required
                  placeholder="Ex: Voo"
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border-2 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all",
                    settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                  )}
                />
              </div>
              <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-zinc-400 px-1">Ícone</label>
              <div className={cn(
                "flex flex-wrap gap-2 p-3 rounded-xl border-2 max-h-40 overflow-y-auto",
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
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {itineraryTypes.map((type) => {
              const Icon = ACTIVITY_ICON_COMPONENTS[type.icon] || Calendar;
              const isEditing = editingTypeId === type.id;

              if (isEditing) {
                return (
                  <div
                    key={type.id}
                    className="sm:col-span-2 p-4 rounded-xl border-2 border-[var(--accent-color)] bg-[var(--accent-color)]/5 space-y-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Nome do Tipo</label>
                        <input
                          value={editTypeName}
                          onChange={(e) => setEditTypeName(e.target.value)}
                          className={cn(
                            "w-full px-4 py-2 rounded-lg border-2 text-sm focus:border-[var(--accent-color)] transition-all",
                            settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                          )}
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          onClick={async () => {
                            if (!editTypeName.trim() || savingType) return;
                            setSavingType(true);
                            
                            const { error } = await supabase
                              .from("itinerary_types")
                              .update({ name: editTypeName.trim(), icon: editTypeIcon })
                              .eq("id", type.id);

                            if (error) {
                              toast(getErrorMessage(error), 'error');
                            } else {
                              setItineraryTypes(
                                itineraryTypes.map((t) =>
                                  t.id === type.id ? { ...t, name: editTypeName.trim(), icon: editTypeIcon } : t
                                ).sort((a, b) => a.name.localeCompare(b.name))
                              );
                              setEditingTypeId(null);
                            }
                            setSavingType(false);
                          }}
                          disabled={savingType}
                          className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingTypeId(null)}
                          className={cn(
                            "px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all",
                            settings.dark_mode ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          )}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Ícone</label>
                      <div className={cn(
                        "flex flex-wrap gap-2 p-2 rounded-lg border-2 max-h-32 overflow-y-auto",
                        settings.dark_mode ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-100"
                      )}>
                        {ACTIVITY_ICONS.map((iconName) => {
                          const IconComp = ACTIVITY_ICON_COMPONENTS[iconName] || Calendar;
                          return (
                            <button
                              key={iconName}
                              onClick={() => setEditTypeIcon(iconName)}
                              className={cn(
                                "p-2 rounded-lg border-2 transition-all",
                                editTypeIcon === iconName
                                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10"
                                  : cn("border-transparent", settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50")
                              )}
                            >
                              <IconComp size={18} className={editTypeIcon === iconName ? "text-[var(--accent-color)]" : (settings.dark_mode ? "text-zinc-500" : "text-zinc-500")} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-4 rounded-xl border-2 transition-all group"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--card-border)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", settings.dark_mode ? "bg-zinc-800 text-zinc-400" : "bg-zinc-50 text-zinc-600")}>
                      <Icon size={18} />
                    </div>
                    <span className="text-sm font-semibold">{type.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingTypeId(type.id);
                        setEditTypeName(type.name);
                        setEditTypeIcon(type.icon);
                      }}
                      className={cn(
                        "text-zinc-400 hover:text-[var(--accent-color)] transition-colors p-1 rounded-lg",
                        settings.dark_mode ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                      )}
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Excluir tipo?',
                          message: `Excluir tipo de atividade "${type.name}"?`,
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
                <p className="text-sm text-zinc-500">Nenhum tipo de atividade configurado ainda.</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {savingSettings && (
        <div className={cn(
          "px-4 py-3 rounded-xl border",
          settings.dark_mode ? "bg-emerald-950/20 border-emerald-900/50" : "bg-green-50 border-green-200"
        )}>
          <p className={cn("text-sm font-medium", settings.dark_mode ? "text-emerald-400" : "text-green-700")}>✅ Salvando configurações automaticamente...</p>
        </div>
      )}

      <div className="pt-4">
        <button
          onClick={navigateToAbout}
          className="w-full px-4 py-4 rounded-2xl border-2 border-[var(--card-border)] bg-[var(--card-bg)] text-zinc-600 dark:text-zinc-400 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-sm"
        >
          <Info size={18} />
          Sobre o Partiu!
        </button>
      </div>
      {ConfirmDialogNode}
    </motion.div>
  );
}
