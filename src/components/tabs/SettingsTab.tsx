import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { DollarSign, Users, Palette, Settings, Trash2, Plus, Moon, Sun, FileText } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, maskCurrency, parseCurrencyToNumber } from "../../utils";
import { THEME_PALETTES } from "../../constants";
import type { Trip, TripMember, UserSettings, ExpenseCategory, TripBudget } from "../../types";
import { Card } from "../Card";

interface SettingsTabProps {
  trip: Trip;
  tripId: string;
  currentMember: TripMember | null;
  isAdmin: boolean;
  settings: UserSettings;
  members: TripMember[];
  categories: ExpenseCategory[];
  tripBudget: TripBudget | null;
  budgetOwnerUserId: string;
  budgetCurrency: string;
  userId: string;
  onSettingsChange: (next: UserSettings) => void;
  onSetCategories: (categories: ExpenseCategory[]) => void;
  onSetTripBudget: (budget: TripBudget | null) => void;
  onSetTrip: (trip: Trip) => void;
  onDeleteTrip: () => void;
  onReloadTripOptions: () => void;
}

export function SettingsTab({
  trip,
  tripId,
  currentMember,
  isAdmin,
  settings,
  members,
  categories,
  tripBudget,
  budgetOwnerUserId,
  budgetCurrency,
  userId,
  onSettingsChange,
  onSetCategories,
  onSetTripBudget,
  onSetTrip,
  onDeleteTrip,
  onReloadTripOptions,
}: SettingsTabProps) {
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [selfSpouseUserId, setSelfSpouseUserId] = useState(settings.spouse_user_id || "");
  const [editTripName, setEditTripName] = useState(trip.name || "");
  const [editTripDestination, setEditTripDestination] = useState(trip.destination || "");
  const [updatingTrip, setUpdatingTrip] = useState(false);
  
  const settingsAutosaveReadyRef = useRef(false);
  const spouseAutosaveReadyRef = useRef(false);
  const tripAutosaveReadyRef = useRef(false);

  // Sync settings draft when settings change
  useEffect(() => {
    setSettingsDraft(settings);
    settingsAutosaveReadyRef.current = false;
  }, [settings]);

  // Sync spouse when settings change
  useEffect(() => {
    setSelfSpouseUserId(settings.spouse_user_id || "");
    spouseAutosaveReadyRef.current = false;
  }, [settings.spouse_user_id]);

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
      const { error } = await supabase
        .from("profiles")
        .update({
          dark_mode: settingsDraft.dark_mode,
          default_currency: settingsDraft.default_currency,
        })
        .eq("user_id", userId);
      setSavingSettings(false);
      if (error) {
        alert(getErrorMessage(error));
        return;
      }
      onSettingsChange({ ...settingsDraft });
    }, 500);

    return () => clearTimeout(timeout);
  }, [settingsDraft, settings, userId, onSettingsChange, savingSettings]);

  // Autosave spouse
  useEffect(() => {
    if (!currentMember) return;
    if (!spouseAutosaveReadyRef.current) {
      spouseAutosaveReadyRef.current = true;
      return;
    }
    if ((settings.spouse_user_id || "") === selfSpouseUserId) return;

    const timeout = setTimeout(async () => {
      await setGlobalSpouse(selfSpouseUserId || null);
    }, 500);

    return () => clearTimeout(timeout);
  }, [selfSpouseUserId, settings.spouse_user_id, currentMember]);

  // Autosave trip name and destination only
  useEffect(() => {
    if (!tripId || !trip || !isAdmin) return;
    if (!tripAutosaveReadyRef.current) {
      tripAutosaveReadyRef.current = true;
      return;
    }

    const name = editTripName.trim();
    const destination = editTripDestination.trim();
    if (!name || !destination) return;
    
    // Check if name or destination actually changed
    if (name === trip.name && destination === trip.destination) return;

    const timeout = setTimeout(async () => {
      if (updatingTrip) return;
      setUpdatingTrip(true);
      const { error } = await supabase.from("trips").update({
        name,
        destination,
      }).eq("id", tripId);
      setUpdatingTrip(false);
      if (error) {
        alert(getErrorMessage(error));
        return;
      }
      await onReloadTripOptions();
    }, 500);

    return () => clearTimeout(timeout);
  }, [tripId, trip.name, trip.destination, isAdmin, editTripName, editTripDestination, updatingTrip, onReloadTripOptions]);

  const setGlobalSpouse = async (spouseUserId: string | null) => {
    const { error } = await supabase.rpc("set_global_spouse", {
      p_spouse_user_id: spouseUserId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    onSettingsChange({ ...settings, spouse_user_id: spouseUserId });
    setSelfSpouseUserId(spouseUserId || "");
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
                    : "border-zinc-200 hover:border-zinc-300 shadow-sm"
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
          <input
            value={maskCurrency(String((tripBudget?.budget_limit || 0) * 100))}
            onChange={(e) => {
              const masked = maskCurrency(e.target.value);
              onSetTripBudget({
                id: tripBudget?.id || "",
                trip_id: tripId,
                owner_user_id: budgetOwnerUserId || userId,
                budget_limit: parseCurrencyToNumber(masked),
                currency: budgetCurrency,
              });
            }}
            placeholder="0,00"
            className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
          />
          <div className="px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-xs text-zinc-600">
              {budgetOwnerUserId === userId
                ? "💡 Orçamento individual nesta viagem"
                : "👥 Orçamento compartilhado com cônjuge nesta viagem"}
            </p>
          </div>
        </div>
      </Card>

      {currentMember && (
        <Card className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Cônjuge</h3>
              <p className="text-sm text-zinc-500">Configuração global para todas as viagens</p>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-semibold block">Selecione seu cônjuge</label>
            <select
              value={selfSpouseUserId}
              onChange={(e) => setSelfSpouseUserId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
            >
              <option value="">Sem cônjuge</option>
              {members.filter((m) => m.user_id !== currentMember.user_id).map((m) => (
                <option key={m.id} value={m.user_id}>{m.display_name || m.user_id}</option>
              ))}
            </select>
            <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-700 font-medium">✨ Salvamento automático ativado</p>
            </div>
          </div>
        </Card>
      )}

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
                : "border-zinc-200 bg-gradient-to-br from-white to-zinc-50 hover:border-zinc-300 shadow-sm"
            )}
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
              <label className="text-sm font-semibold block">Nome da Viagem</label>
              <input
                value={editTripName}
                onChange={(e) => setEditTripName(e.target.value)}
                placeholder="Nome da viagem"
                className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold block">Destino</label>
              <input
                value={editTripDestination}
                onChange={(e) => setEditTripDestination(e.target.value)}
                placeholder="Destino"
                className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                required
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-semibold block">Tema da Viagem</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["default", "ocean", "forest", "sunset", "lavender", "midnight", "rose"] as const).map((theme) => {
                  const palette = THEME_PALETTES[theme];
                  const isActive = (trip?.theme_palette || 'default') === theme;
                  const themeNames: Record<string, string> = {
                    default: "Padrão",
                    ocean: "Oceano",
                    forest: "Floresta",
                    sunset: "Pôr do Sol",
                    lavender: "Lavanda",
                    midnight: "Meia-Noite",
                    rose: "Rosa"
                  };
                  
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={async () => {
                        if (isActive) return; // Don't update if already active
                        const { error } = await supabase
                          .from("trips")
                          .update({ theme_palette: theme })
                          .eq("id", tripId);
                        if (error) {
                          alert(getErrorMessage(error));
                          return;
                        }
                        onSetTrip({ ...trip, theme_palette: theme });
                      }}
                      disabled={isActive}
                      className={cn(
                        "relative p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-105 disabled:cursor-default",
                        isActive
                          ? "border-[var(--accent-color)] shadow-lg ring-2 ring-offset-2 ring-[var(--accent-color)]/30"
                          : "border-zinc-200 hover:border-zinc-300 shadow-sm"
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
            {updatingTrip && (
              <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700 font-medium">💾 Salvando alterações automaticamente...</p>
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={onDeleteTrip}
                disabled={updatingTrip}
                className="w-full px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-all disabled:opacity-50"
              >
                <Trash2 size={16} />
                Excluir Viagem Permanentemente
              </button>
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
                alert(getErrorMessage(error));
              } else {
                if (data) onSetCategories([...categories, data as ExpenseCategory].sort((a, b) => a.name.localeCompare(b.name)));
                (e.target as HTMLFormElement).reset();
              }
            }}
          >
            <input
              name="name"
              required
              placeholder="Nova categoria"
              className="flex-1 px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
            />
            <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
              <Plus size={16} />
              Adicionar
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-4 rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-white to-zinc-50 hover:border-zinc-300 transition-all group">
                <span className="text-sm font-semibold">{cat.name}</span>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Excluir categoria "${cat.name}"?`)) return;
                    const { error } = await supabase.from("expense_categories").delete().eq("id", cat.id);
                    if (error) alert(getErrorMessage(error));
                  }}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="sm:col-span-2 text-center py-8 px-4 rounded-xl border-2 border-dashed border-zinc-200">
                <p className="text-sm text-zinc-500">Nenhuma categoria configurada ainda.</p>
                <p className="text-xs text-zinc-400 mt-1">Adicione sua primeira categoria acima!</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {savingSettings && (
        <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <p className="text-sm text-green-700 font-medium">✅ Salvando configurações automaticamente...</p>
        </div>
      )}
    </motion.div>
  );
}
