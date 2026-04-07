import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTripData } from '../hooks/useTripData';
import { useTripBudget } from '../hooks/useTripBudget';
import { useTripList } from '../hooks/useTripList';
import { useRealtimeTrip } from '../hooks/useRealtimeTrip';
import { useToast } from '../hooks/useToast';
import { getThemeStyles } from '../utils/theme';
import { useI18n } from '../i18n/I18nProvider';
import type {
  Trip, TripMember, TripInvite, ExpenseCategory,
  ItineraryType, TripBudget, UserSettings
} from '../types';

export interface TripContextValue {
  // ── Dados da viagem (useTripData) ──────────────────────────────
  trip: Trip;
  setTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  members: TripMember[];
  invites: TripInvite[];
  categories: ExpenseCategory[];
  setCategories: React.Dispatch<React.SetStateAction<ExpenseCategory[]>>;
  itineraryTypes: ItineraryType[];
  setItineraryTypes: React.Dispatch<React.SetStateAction<ItineraryType[]>>;
  spouseByUserId: Map<string, string | null>;
  setSpouseByUserId: React.Dispatch<React.SetStateAction<Map<string, string | null>>>;
  reloadTrip: () => void;
  reloadItinerary?: () => void;
  reloadExpenses?: () => void;
  reloadDocuments?: () => void;
  reloadIdeas?: () => void;
  reloadMembers?: () => void;

  // ── Budget (useTripBudget) ─────────────────────────────────────
  tripBudget: TripBudget | null;
  setTripBudget: React.Dispatch<React.SetStateAction<TripBudget | null>>;
  budgetOwnerUserId: string;
  budgetCurrency: string;
  setBudgetCurrency: React.Dispatch<React.SetStateAction<string>>;
  reloadBudget: () => void;

  // ── Derivados ─────────────────────────────────────────────────
  currentMember: TripMember | null;
  isAdmin: boolean;
  tripId: string;
  userId: string;

  // ── Preferências do usuário ───────────────────────────────────
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;

  // ── Ações com efeitos colaterais ──────────────────────────────
  deleteCurrentTrip: () => Promise<boolean>;
  navigateToAbout: () => void;
  reloadTripOptions: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

interface TripProviderProps {
  tripId: string;
  userId: string;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
  children: React.ReactNode;
  onTripDeleted: () => void;
}

export function TripProvider({
  tripId,
  userId,
  settings,
  onSettingsChange,
  children,
  onTripDeleted
}: TripProviderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  const {
    trip, setTrip, members, invites, categories, setCategories,
    itineraryTypes, setItineraryTypes, loading, loadError, notAuthorized,
    spouseByUserId, setSpouseByUserId, reloadTrip,
    reloadItinerary, reloadExpenses, reloadDocuments, reloadIdeas, reloadMembers,
  } = useTripData(tripId, userId);

  const {
    tripBudget, setTripBudget, budgetOwnerUserId, budgetCurrency, setBudgetCurrency, reloadBudget
  } = useTripBudget(tripId, userId);

  const { reloadTripOptions } = useTripList();

  useRealtimeTrip(tripId, {
    onItineraryChange: reloadItinerary,
    onExpensesChange: reloadExpenses,
    onDocumentsChange: reloadDocuments,
    onIdeasChange: reloadIdeas,
    onMembersChange: reloadMembers,
    onBudgetChange: reloadBudget,
    onGlobalCatalogChange: reloadTrip,
  });

  const currentMember = useMemo(() => 
    members.find((m) => m.user_id === userId) || null, 
    [members, userId]
  );

  const isAdmin = currentMember?.role === "admin";

  useEffect(() => {
    if (notAuthorized) {
      toast(t("trip.noAccess"), 'error');
      onTripDeleted();
    }
  }, [notAuthorized, toast, onTripDeleted, t]);

  const deleteCurrentTrip = async () => {
    if (!trip || !isAdmin) return false;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      toast(t("trip.sessionExpiredDelete"), 'error');
      return false;
    }

    const response = await fetch('/api/delete-trip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tripId }),
    });

    if (!response.ok) {
      let errorMessage = t("trip.deleteError");
      try {
        const payload = await response.json();
        errorMessage = payload?.error || payload?.details || errorMessage;
      } catch {
        // Ignore JSON parsing errors and keep fallback message.
      }
      toast(errorMessage, 'error');
      return false;
    }

    toast(t("trip.deletedSuccess"), 'success');
    reloadTripOptions();
    onTripDeleted();
    return true;
  };

  const navigateToAbout = () => navigate('/about');

  const themedStyles = useMemo(() => {
    const effectivePalette = trip?.theme_palette && trip.theme_palette !== 'default'
      ? trip.theme_palette
      : settings.theme_palette;
    return getThemeStyles({ ...settings, theme_palette: effectivePalette });
  }, [settings, trip?.theme_palette]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)]" style={themedStyles}>
        <div className="flex flex-col items-center gap-3 text-[var(--accent-color)]">
          <div className="h-10 w-10 rounded-full border-4 border-current border-t-transparent animate-spin" />
          <p className="text-sm font-medium tracking-wide">
            {t("common.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-[var(--bg-color)]" style={themedStyles}>
        <p className="text-red-500 font-semibold text-center">{loadError}</p>
        <button
          onClick={() => reloadTrip()}
          className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 transition-colors"
        >
          {t("common.retry")}
        </button>
        <button
          onClick={() => onTripDeleted()}
          className="text-sm text-zinc-500 hover:underline"
        >
          {t("trip.backToTrips")}
        </button>
      </div>
    );
  }

  if (!trip) return null;

  const value: TripContextValue = {
    trip,
    setTrip,
    members,
    invites,
    categories,
    setCategories,
    itineraryTypes,
    setItineraryTypes,
    spouseByUserId,
    setSpouseByUserId,
    reloadTrip,
    reloadItinerary,
    reloadExpenses,
    reloadDocuments,
    reloadIdeas,
    reloadMembers,
    tripBudget,
    setTripBudget,
    budgetOwnerUserId,
    budgetCurrency,
    setBudgetCurrency,
    reloadBudget,
    currentMember,
    isAdmin,
    tripId,
    userId,
    settings,
    onSettingsChange,
    deleteCurrentTrip,
    navigateToAbout,
    reloadTripOptions,
  };

  return (
    <TripContext.Provider value={value}>
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) {
    throw new Error('useTripContext deve ser usado dentro de TripProvider');
  }
  return ctx;
}
