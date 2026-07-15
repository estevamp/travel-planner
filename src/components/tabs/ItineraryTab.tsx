import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import {
  Calendar, FilePenLine, Trash2, CheckCircle2, Circle,
  ChevronDown, ChevronRight, MapPin, Lock, Users,
  Clock, ImagePlus, MoreVertical, ExternalLink,
} from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, resizeImage } from "../../utils";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import type { Trip, ItineraryItem, Visibility } from "../../types";
import { DOCS_BUCKET } from "../../constants";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { ACTIVITY_ICON_COMPONENTS } from "../../constants/icons";
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";
import type { QueuedOperation } from "../../hooks/useOfflineQueue";
import { useOptimisticVisibility } from "../../hooks/useOptimisticVisibility";
import { useUpdateItinerary } from "../../hooks/useUpdateItinerary";
import { useDeleteItinerary } from "../../hooks/useDeleteItinerary";
import { useI18n } from "../../i18n/I18nProvider";
import { useSignedUrlCache } from "../../hooks/useSignedUrlCache";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItineraryTabProps {
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(items: ItineraryItem[]): Record<string, ItineraryItem[]> {
  return items.reduce<Record<string, ItineraryItem[]>>((acc, item) => {
    if (!item.start_time) {
      (acc["sem-data"] ??= []).push(item);
      return acc;
    }

    const startDate = item.start_time.slice(0, 10);
    (acc[startDate] ??= []).push(item);

    // If the item spans multiple days, also add it to the end date
    if (item.end_time) {
      const endDate = item.end_time.slice(0, 10);
      if (endDate !== startDate) {
        (acc[endDate] ??= []).push(item);
      }
    }

    return acc;
  }, {});
}

function sortedDateKeys(grouped: Record<string, ItineraryItem[]>): string[] {
  return Object.keys(grouped).sort((a, b) => {
    if (a === "sem-data") return 1;
    if (b === "sem-data") return -1;
    return a.localeCompare(b);
  });
}

function formatDateKey(dateKey: string, locale: string): string {
  if (dateKey === "sem-data") return locale === "en" ? "No date set" : "Sem data definida";
  const date = new Date(dateKey + "T00:00:00");
  if (isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isDirectImageSrc(value: string) {
  return value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:");
}

// Color palette for different activity types (using HSL for consistent saturation/lightness)
const TYPE_COLORS = [
  "#3B82F6", // blue
  "#EC4899", // pink
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#EF4444", // red
  "#14B8A6", // teal
  "#6366F1", // indigo
  "#D97706", // orange
];

function getActivityTypeColor(typeId: string | null | undefined): string {
  if (!typeId) return "#9CA3AF"; // gray for no type
  // Generate a deterministic index from the typeId
  let hash = 0;
  for (let i = 0; i < typeId.length; i++) {
    const char = typeId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % TYPE_COLORS.length;
  return TYPE_COLORS[index];
}

// ─── AgendaView ───────────────────────────────────────────────────────────────

interface AgendaViewProps {
  items: ItineraryItem[];
  isDark: boolean;
  renderItem: (item: ItineraryItem, dateKey?: string) => React.ReactNode;
}

function AgendaView({ items, isDark, renderItem }: AgendaViewProps) {
  const { language } = useI18n();
  const grouped = groupByDate(items);
  const keys = sortedDateKeys(grouped);
  const keysSignature = keys.join("|");

  // Dia atualmente visível no scroll — destaca o chip correspondente
  const [visibleDay, setVisibleDay] = useState<string | null>(null);

  useEffect(() => {
    if (keys.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleDay((entry.target as HTMLElement).dataset.dateKey ?? null);
          }
        }
      },
      // Faixa de detecção logo abaixo do header compacto + chips
      { rootMargin: "-120px 0px -60% 0px" }
    );
    keys.forEach((key) => {
      const el = document.getElementById(`agenda-day-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature]);

  if (keys.length === 0) {
    return (
      <div className={cn("text-center py-16 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
        {language === "en" ? "No activities planned yet." : "Nenhuma atividade planejada ainda."}
      </div>
    );
  }

  const chipLabel = (key: string): string => {
    if (key === "sem-data") return language === "en" ? "No date" : "Sem data";
    const d = new Date(key + "T00:00:00");
    if (isNaN(d.getTime())) return key;
    const weekday = d.toLocaleDateString(language, { weekday: "short" }).replace(".", "");
    return `${weekday} ${key.slice(8, 10)}`;
  };

  // Rótulo da coluna de horário à esquerda do card (mobile)
  const timeLabel = (item: ItineraryItem, dateKey: string): string => {
    if (item.is_all_day) return language === "en" ? "All day" : "Dia todo";
    if (!item.start_time) return "—";
    if (item.start_time.slice(0, 10) < dateKey) {
      // Continuação de dia anterior: mostra o horário em que termina neste dia
      return item.end_time && item.end_time.slice(0, 10) === dateKey
        ? item.end_time.slice(11, 16)
        : "—";
    }
    return item.start_time.slice(11, 16);
  };

  const activeChip = visibleDay ?? keys[0];

  return (
    <div className="space-y-8">
      {/* Chips de navegação por dia — sticky abaixo do header compacto */}
      {keys.length > 1 && (
        <div className="sticky top-12 md:top-0 z-30 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-[var(--bg-color)]/90 backdrop-blur-md">
          <div
            className="flex gap-1.5 overflow-x-auto scrollbar-hide"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {keys.map((key) => {
              const isActive = key === activeChip;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setVisibleDay(key);
                    document
                      .getElementById(`agenda-day-${key}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap capitalize transition-all flex-shrink-0",
                    isActive
                      ? "text-white shadow-sm"
                      : isDark
                      ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  )}
                  style={isActive ? { backgroundColor: "var(--accent-color)" } : undefined}
                >
                  {chipLabel(key)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {keys.map((dateKey) => {
        const dayItems = [...(grouped[dateKey] ?? [])].sort((a, b) =>
          (a.start_time ?? "").localeCompare(b.start_time ?? "")
        );
        const label = formatDateKey(dateKey, language);
        const dayNum = dateKey !== "sem-data" ? dateKey.slice(8, 10) : "?";

        return (
          <div
            key={dateKey}
            id={`agenda-day-${dateKey}`}
            data-date-key={dateKey}
            className="scroll-mt-28 md:scroll-mt-4"
          >
            {/* Day header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: "var(--accent-color)" }}
              >
                {dayNum}
              </div>
              <div>
                <p className={cn("text-sm font-bold capitalize", isDark ? "text-zinc-200" : "text-zinc-700")}>
                  {label}
                </p>
                <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  {language === "en"
                    ? `${dayItems.length} activit${dayItems.length !== 1 ? "ies" : "y"}`
                    : `${dayItems.length} atividade${dayItems.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Itens com coluna de horário à esquerda (mobile) */}
            <div className="relative">
              {/* Trilho vertical conectando as atividades do dia */}
              <div
                className={cn(
                  "absolute left-[54px] top-3 bottom-3 w-[2px] rounded-full sm:hidden",
                  isDark ? "bg-zinc-800" : "bg-zinc-200"
                )}
              />
              <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
                {dayItems.map((item) => (
                  <div key={item.id} className="relative flex sm:block">
                    <div className="w-12 flex-shrink-0 pt-[18px] pr-1 text-right sm:hidden">
                      <span
                        className={cn(
                          "block text-[11px] font-bold tabular-nums leading-tight",
                          isDark ? "text-zinc-400" : "text-zinc-500"
                        )}
                      >
                        {timeLabel(item, dateKey)}
                      </span>
                    </div>
                    {/* Nó no trilho, colorido pela categoria da atividade */}
                    <div
                      className="absolute left-[50px] top-[19px] w-[10px] h-[10px] rounded-full border-2 sm:hidden"
                      style={{
                        backgroundColor: item.is_completed
                          ? "#10b981"
                          : getActivityTypeColor(item.type_id),
                        borderColor: "var(--bg-color)",
                      }}
                    />
                    <div className="flex-1 min-w-0 pl-5 sm:pl-0">{renderItem(item, dateKey)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function ItineraryTab({ onOpenModal, onTripUpdate, isOnline, enqueue }: ItineraryTabProps) {
  const { trip, tripId, currentMember, settings, itineraryTypes, members } = useTripContext();
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { getSignedUrl, cachedUrls, setCachedUrl } = useSignedUrlCache(DOCS_BUCKET);
  const { toggleVisibility } = useOptimisticVisibility<ItineraryItem>(
    "itinerary",
    "itinerary",
    onTripUpdate
  );

  // Custom hooks para UPDATE e DELETE
  const { update: updateItinerary, isSubmitting: isUpdatingItinerary } = useUpdateItinerary({
    enqueue,
    isOnline,
    onSuccess: undefined,
  });
  const { deleteItem: deleteItineraryItem, isSubmitting: isDeletingItinerary } = useDeleteItinerary({
    enqueue,
    isOnline,
    onSuccess: undefined,
  });

  // Overflow menu (⋯) por card — posicionado via fixed para não ser cortado pelo overflow-hidden do Card
  const [itemMenu, setItemMenu] = useState<{ item: ItineraryItem; top: number; right: number } | null>(null);

  // Onboarding guiado: destaca o FAB acima do balão de dica
  const isGuidedTrip = settings.onboarding_status === "active" && settings.onboarding_trip_id === tripId;

  // Edit state
  const [editingItineraryId, setEditingItineraryId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [itineraryDraft, setItineraryDraft] = useState<{
    type_id: string | null;
    title: string;
    description: string;
    location: string;
    url: string;
    visibility: Visibility;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
  }>({
    type_id: null,
    title: "",
    description: "",
    location: "",
    url: "",
    visibility: "public",
    start_time: "",
    end_time: "",
    is_all_day: false,
  });

  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [visibilitySheet, setVisibilitySheet] = useState<{
    open: boolean;
    itemId: string | null;
    currentVisibility: Visibility;
    onConfirm: (() => void) | null;
  }>({ open: false, itemId: null, currentVisibility: "public", onConfirm: null });

  const isDark = settings.dark_mode;

  useEffect(() => {
    const privatePhotoPaths = trip.itinerary
      .map((item) => item.photo_url)
      .filter((photoUrl): photoUrl is string => Boolean(photoUrl) && !isDirectImageSrc(photoUrl));

    for (const photoPath of privatePhotoPaths) {
      if (cachedUrls[photoPath]) continue;
      void getSignedUrl(photoPath).catch(() => undefined);
    }
  }, [trip.itinerary, cachedUrls, getSignedUrl]);

  const getCreatorName = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    return member?.display_name || t("ideas.unknownCreator");
  };

  const getItineraryPhotoSrc = (photoUrl: string | null | undefined) => {
    if (!photoUrl) return null;
    if (isDirectImageSrc(photoUrl)) return photoUrl;
    return cachedUrls[photoUrl] || null;
  };

  const removeItineraryPhoto = async (item: ItineraryItem) => {
    if (!item.photo_url) return;
    const previousPhotoUrl = item.photo_url;

    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) =>
        i.id === item.id ? { ...i, photo_url: null } : i
      ),
    }));

    try {
      if (!isDirectImageSrc(previousPhotoUrl)) {
        await supabase.storage.from(DOCS_BUCKET).remove([previousPhotoUrl]);
      }

      const { error } = await supabase
        .from("itinerary")
        .update({ photo_url: null })
        .eq("id", item.id);
      if (error) throw error;

      toast("Foto removida!", "success");
    } catch (err) {
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) =>
          i.id === item.id ? { ...i, photo_url: previousPhotoUrl } : i
        ),
      }));
      toast(getErrorMessage(err), "error");
    }
  };

  const startEditItinerary = (item: ItineraryItem) => {
    setEditingItineraryId(item.id);
    const isAllDay = item.is_all_day || false;
    setItineraryDraft({
      type_id: item.type_id || null,
      title: item.title,
      description: item.description || "",
      location: item.location || "",
      url: item.url || "",
      visibility: item.visibility,
      start_time: item.start_time
        ? isAllDay
          ? item.start_time.split("T")[0]
          : item.start_time.slice(0, 16)
        : "",
      end_time: item.end_time
        ? isAllDay
          ? item.end_time.split("T")[0]
          : item.end_time.slice(0, 16)
        : "",
      is_all_day: isAllDay,
    });
  };

  const saveItineraryEdit = async (itemId: string) => {
    if (!editingItineraryId || editingItineraryId !== itemId || isUpdatingItinerary) return;
    const sourceItem = trip.itinerary.find((entry) => entry.id === itemId);
    if (!sourceItem) return;
    const title = itineraryDraft.title.trim();
    if (!title) return;

    let start_time: string | null = null;
    let end_time: string | null = null;

    if (itineraryDraft.is_all_day) {
      start_time = itineraryDraft.start_time ? `${itineraryDraft.start_time}T00:00:00` : null;
      end_time = itineraryDraft.end_time ? `${itineraryDraft.end_time}T00:00:00` : null;
    } else {
      start_time = itineraryDraft.start_time || null;
      end_time = itineraryDraft.end_time || null;
    }

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((item) =>
        item.id === itemId
          ? {
              ...item,
              type_id: itineraryDraft.type_id || null,
              type: itineraryTypes.find((t) => t.id === itineraryDraft.type_id) || null,
              title,
              description: itineraryDraft.description.trim(),
              location: itineraryDraft.location.trim(),
              url: itineraryDraft.url.trim(),
              visibility: itineraryDraft.visibility,
              start_time,
              end_time,
              is_all_day: itineraryDraft.is_all_day,
            }
          : item
      ),
    }));

    const success = await updateItinerary({
      itemId,
      type_id: itineraryDraft.type_id || null,
      title,
      description: itineraryDraft.description.trim(),
      location: itineraryDraft.location.trim(),
      url: itineraryDraft.url.trim(),
      visibility: itineraryDraft.visibility,
      start_time,
      end_time,
      is_all_day: itineraryDraft.is_all_day,
      tripId: trip.id,
    });

    if (success) {
      setEditingItineraryId(null);
    } else {
      // Rollback on error
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) => (i.id === itemId ? sourceItem : i)),
      }));
    }
  };

  const deleteItineraryItemHandler = async (item: ItineraryItem) => {
    const confirmed = await confirm({
      title: t("itinerary.deleteTitle"),
      message: t("itinerary.deleteMessage", { title: item.title }),
      variant: "danger",
      isDark: settings.dark_mode,
    });
    if (!confirmed) return;
  
    // Optimistic update — só executa após confirmação do usuário
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.filter((i) => i.id !== item.id),
    }));
  
    await deleteItineraryItem({
      itemId: item.id,
      title: item.title,
      tripId: trip.id,
      isDark: settings.dark_mode,
      skipConfirm: true, // confirmação já foi feita acima
    });
  };

  const toggleCompleted = async (item: ItineraryItem) => {
    const nextStatus = !item.is_completed;
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) =>
        i.id === item.id ? { ...i, is_completed: nextStatus } : i
      ),
    }));

    if (!isOnline) {
      enqueue({
        id: item.id,
        tripId: trip.id,
        type: "update",
        table: "itinerary",
        payload: { id: item.id, is_completed: nextStatus },
      });
      return; // optimistic update já aplicou na UI
    }    
    const { error } = await supabase
      .from("itinerary")
      .update({ is_completed: nextStatus })
      .eq("id", item.id);
    if (error) {
      toast(getErrorMessage(error), "error");
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) =>
          i.id === item.id ? { ...i, is_completed: !nextStatus } : i
        ),
      }));
    }
  };

  const openActivities = trip.itinerary.filter((item) => !item.is_completed);
  const completedActivities = trip.itinerary.filter((item) => item.is_completed);

  // ─── renderItineraryItem ────────────────────────────────────────────────────
  const renderItineraryItem = (item: ItineraryItem, dateKey?: string) => {
    // Item que começou em um dia anterior (ex.: voo que cruza a meia-noite) é
    // renderizado como card compacto de "continuação" no dia de chegada,
    // em vez de repetir o card completo e parecer duplicado.
    const isContinuation =
      Boolean(dateKey) &&
      dateKey !== "sem-data" &&
      Boolean(item.start_time) &&
      (item.start_time as string).slice(0, 10) < (dateKey as string) &&
      editingItineraryId !== item.id;

    if (isContinuation) {
      const Icon = (item.type?.icon && ACTIVITY_ICON_COMPONENTS[item.type.icon]) || Calendar;
      const endDate = item.end_time?.slice(0, 10);
      const badgeLabel = item.is_all_day
        ? endDate === dateKey
          ? t("itinerary.lastDay")
          : t("itinerary.continues")
        : endDate === dateKey && item.end_time
        ? t("itinerary.endsAt", { time: item.end_time.slice(11, 16) })
        : t("itinerary.continues");

      return (
        <div key={`${item.id}-continuation`}>
          <Card className={cn("p-0 overflow-hidden", item.is_completed && "opacity-75")}>
            <div className="px-4 py-3 flex items-center gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-50 text-zinc-400"
                )}
              >
                <Icon size={16} />
              </div>
              <p
                className={cn(
                  "flex-1 min-w-0 truncate text-sm font-medium",
                  isDark ? "text-zinc-400" : "text-zinc-500",
                  item.is_completed && "line-through"
                )}
              >
                {item.title}
              </p>
              <span
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-color) 12%, transparent)",
                  color: "var(--accent-color)",
                }}
              >
                <Clock size={10} />
                {badgeLabel}
              </span>
            </div>
          </Card>
        </div>
      );
    }

    const photoSrc = getItineraryPhotoSrc(item.photo_url);
    const isEditingThis = editingItineraryId === item.id;
    // Com foto, título e local ficam sobrepostos na imagem em vez de repetidos no corpo
    const hasPhotoOverlay = Boolean(photoSrc) && !isEditingThis;

    return (
    <div key={item.id}>
      <Card
        id={`itinerary-item-${item.id}`}
        className={cn("group p-0 overflow-hidden transition-opacity", item.is_completed && "opacity-75")}
      >
      {photoSrc && (
        <div className="relative h-44 w-full">
          <img
            src={photoSrc}
            alt={item.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {hasPhotoOverlay && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-4 py-3">
                <p
                  className={cn(
                    "text-white font-bold text-base leading-tight drop-shadow-sm",
                    item.is_completed && "line-through"
                  )}
                >
                  {item.title}
                </p>
                {item.location && (
                  <p className="text-white/85 text-xs mt-0.5 flex items-center gap-1 drop-shadow-sm">
                    <MapPin size={10} className="flex-shrink-0" />
                    <span className="truncate">{item.location}</span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div className="p-5 flex items-start gap-3">
        <button
          onClick={() => void toggleCompleted(item)}
          title={item.is_completed ? t("itinerary.markNotCompleted") : t("itinerary.markCompleted")}
          aria-label={item.is_completed ? t("itinerary.markNotCompleted") : t("itinerary.markCompleted")}
          aria-pressed={item.is_completed}
          className={cn(
            "group/check mt-0.5 -m-1.5 p-1.5 flex-shrink-0 rounded-full transition-colors",
            item.is_completed ? "text-emerald-500" : "text-zinc-300 hover:text-emerald-400"
          )}
        >
          {item.is_completed ? (
            <CheckCircle2 size={20} />
          ) : (
            <>
              {/* No hover, o círculo vira um check — antecipa a ação de concluir */}
              <Circle size={20} className="group-hover/check:hidden" />
              <CheckCircle2 size={20} className="hidden group-hover/check:block" />
            </>
          )}
        </button>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${getActivityTypeColor(item.type_id)} 12%, transparent)`,
            color: getActivityTypeColor(item.type_id),
          }}
        >
          {(() => {
            const Icon = (item.type?.icon && ACTIVITY_ICON_COMPONENTS[item.type.icon]) || Calendar;
            return <Icon size={20} />;
          })()}
        </div>
        <div className="flex-1 min-w-0">
          {editingItineraryId === item.id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={itineraryDraft.type_id || ""}
                  onChange={(e) =>
                    setItineraryDraft((cur) => ({ ...cur, type_id: e.target.value || null }))
                  }
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                >
                  <option value="">Sem tipo</option>
                  {itineraryTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={itineraryDraft.title}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, title: e.target.value }))}
                placeholder="Titulo"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <input
                value={itineraryDraft.location}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, location: e.target.value }))}
                placeholder="Local"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <input
                value={itineraryDraft.url}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, url: e.target.value }))}
                placeholder="URL"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <div
                className={cn(
                  "grid grid-cols-2 gap-1 rounded-xl border p-1",
                  isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
                )}
              >
                {(["public", "private"] as const).map((visibility) => {
                  const active = itineraryDraft.visibility === visibility;
                  const Icon = visibility === "public" ? Users : Lock;
                  return (
                    <button
                      key={visibility}
                      type="button"
                      onClick={() => setItineraryDraft((cur) => ({ ...cur, visibility }))}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                        active
                          ? isDark
                            ? "bg-zinc-700 text-white"
                            : "bg-white text-zinc-900 shadow-sm"
                          : isDark
                          ? "text-zinc-400 hover:text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                      aria-pressed={active}
                    >
                      <Icon size={13} />
                      {visibility === "public" ? t("common.public") : t("common.private")}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={itineraryDraft.is_all_day}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setItineraryDraft((cur) => {
                      let newStartTime = cur.start_time;
                      let newEndTime = cur.end_time;
                      if (isChecked) {
                        if (newStartTime && newStartTime.includes("T"))
                          newStartTime = newStartTime.split("T")[0];
                        if (newEndTime && newEndTime.includes("T"))
                          newEndTime = newEndTime.split("T")[0];
                      } else {
                        if (newStartTime && !newStartTime.includes("T"))
                          newStartTime = `${newStartTime}T00:00`;
                        if (newEndTime && !newEndTime.includes("T"))
                          newEndTime = `${newEndTime}T00:00`;
                      }
                      return { ...cur, is_all_day: isChecked, start_time: newStartTime, end_time: newEndTime };
                    });
                  }}
                />
                Dia todo
              </label>
              <input
                type={itineraryDraft.is_all_day ? "date" : "datetime-local"}
                value={itineraryDraft.start_time}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, start_time: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <input
                type={itineraryDraft.is_all_day ? "date" : "datetime-local"}
                value={itineraryDraft.end_time}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, end_time: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <textarea
                value={itineraryDraft.description}
                onChange={(e) => setItineraryDraft((cur) => ({ ...cur, description: e.target.value }))}
                placeholder="Notas"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm resize-none"
              />

            <div className="flex items-center gap-2 flex-wrap">
              <label className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer w-fit transition-colors",
                item.photo_url
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : isDark
                    ? "border-zinc-600 bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
              )}>
                <ImagePlus size={15} />
                <span className="text-xs font-medium">
                  {item.photo_url ? "Trocar foto" : "Adicionar foto"}
                </span>
                {item.photo_url && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !currentMember) return;
                    try {
                      const resized = await resizeImage(file, 1200);
                      const ext = file.name.split(".").pop() || "jpg";
                      const path = `${trip.id}/${currentMember.id}/itinerary/${item.id}.${ext}`;
                      const blob = await (await fetch(resized)).blob();
                      await supabase.storage.from(DOCS_BUCKET).upload(path, blob, { upsert: true });
                      const { data: signedData, error: signedUrlError } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600);
                      if (signedUrlError || !signedData?.signedUrl) throw signedUrlError || new Error("Falha ao gerar URL da foto");
                      const photo = path;
                      setCachedUrl(path, signedData.signedUrl);
                      onTripUpdate((prev) => ({
                        ...prev,
                        itinerary: prev.itinerary.map((i) =>
                          i.id === item.id ? { ...i, photo_url: photo } : i
                        ),
                      }));
                      await supabase.from("itinerary").update({ photo_url: photo }).eq("id", item.id);
                      toast("Foto adicionada!", "success");
                    } catch (err) {
                      toast(getErrorMessage(err), "error");
                    }
                    e.target.value = "";
                  }}
                />
              </label>

              {item.photo_url && (
                <button
                  type="button"
                  onClick={() => void removeItineraryPhoto(item)}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-xs font-medium transition-colors",
                    isDark
                      ? "border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-950/60"
                      : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  )}
                >
                  Remover foto
                </button>
              )}
            </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void saveItineraryEdit(item.id)}
                  disabled={isUpdatingItinerary}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent-color)" }}
                >
                  {isUpdatingItinerary ? "Salvando…" : "Salvar"}
                </button>
                <button
                  onClick={() => setEditingItineraryId(null)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold",
                    isDark ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-600"
                  )}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              {!hasPhotoOverlay && (
                <p className={cn("font-semibold text-sm", item.is_completed && "line-through")}>
                  {item.title}
                </p>
              )}
              {item.description && (
                <p className={cn("text-xs mt-0.5", isDark ? "text-zinc-400" : "text-zinc-500")}>
                  {item.description}
                </p>
              )}
              {item.location && !hasPhotoOverlay && (
                <p className={cn("text-xs mt-1 flex items-center gap-1", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  <MapPin size={10} /> {item.location}
                </p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors max-w-full",
                    isDark
                      ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  )}
                >
                  <ExternalLink size={11} className="flex-shrink-0" />
                  <span className="truncate">
                    {(() => {
                      try {
                        return new URL(item.url).hostname.replace(/^www\./, "");
                      } catch {
                        return t("itinerary.openLink");
                      }
                    })()}
                  </span>
                </a>
              )}

              {/* "Público" é o padrão — só sinaliza quando privada; tornar pública fica no menu ⋯.
                  O tipo da atividade é comunicado pelo ícone colorido, sem chip. */}
              {item.visibility === "private" && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <button
                    onClick={() =>
                      setVisibilitySheet({
                        open: true,
                        itemId: item.id,
                        currentVisibility: item.visibility,
                        onConfirm: () => void toggleVisibility(item),
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors",
                      isDark
                        ? "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    )}
                  >
                    <Lock size={10} /> {t("common.private")}
                  </button>
                </div>
              )}

              {item.start_time && (
                <div className="mt-1.5">
                  <span className={cn("text-xs whitespace-nowrap font-medium", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    {(() => {
                      try {
                        const start = item.is_all_day
                          ? new Date(item.start_time + "T00:00:00")
                          : new Date(item.start_time);
                        
                        if (isNaN(start.getTime())) return "";

                        let res = format(start, item.is_all_day ? "dd/MM" : "dd/MM HH:mm");

                        if (item.end_time) {
                          const end = item.is_all_day
                            ? new Date(item.end_time + "T00:00:00")
                            : new Date(item.end_time);
                          
                          if (!isNaN(end.getTime())) {
                            const startDay = item.start_time.slice(0, 10);
                            const endDay = item.end_time.slice(0, 10);
                            if (!item.is_all_day) {
                              if (endDay !== startDay) {
                                const dayDiff = Math.round(
                                  (new Date(endDay + "T00:00:00").getTime() -
                                    new Date(startDay + "T00:00:00").getTime()) / 86400000
                                );
                                res += ` → ${format(end, "HH:mm")} (+${dayDiff})`;
                              } else {
                                res += ` – ${format(end, "HH:mm")}`;
                              }
                            } else if (endDay !== startDay) {
                              res += ` – ${format(end, "dd/MM")}`;
                            }
                          }
                        }
                        return res;
                      } catch (e) {
                        return "";
                      }
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        {editingItineraryId !== item.id && (
          <div className="self-stretch flex flex-col items-center justify-between gap-1">
            {/* Photo upload */}
            <input
              ref={(el) => { photoInputRefs.current[item.id] = el; }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !currentMember) return;
                try {
                  const resized = await resizeImage(file, 1200);
                  const ext = file.name.split(".").pop() || "jpg";
                  const path = `${trip.id}/${currentMember.id}/itinerary/${item.id}.${ext}`;
                  const blob = await (await fetch(resized)).blob();
                  await supabase.storage.from(DOCS_BUCKET).upload(path, blob, { upsert: true });
                  const { data: signedData, error: signedUrlError } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600);
                  if (signedUrlError || !signedData?.signedUrl) throw signedUrlError || new Error("Falha ao gerar URL da foto");
                  const photo = path;
                  setCachedUrl(path, signedData.signedUrl);
                  onTripUpdate((prev) => ({
                    ...prev,
                    itinerary: prev.itinerary.map((i) =>
                      i.id === item.id ? { ...i, photo_url: photo } : i
                    ),
                  }));
                  await supabase.from("itinerary").update({ photo_url: photo }).eq("id", item.id);
                } catch (err) {
                  toast(getErrorMessage(err), "error");
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setItemMenu((cur) =>
                  cur?.item.id === item.id
                    ? null
                    : { item, top: rect.bottom + 4, right: window.innerWidth - rect.right }
                );
              }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isDark
                  ? "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              )}
              aria-label={t("common.options")}
            >
              <MoreVertical size={16} />
            </button>
            {/* Autor como mini-avatar no canto inferior direito; irrelevante quando só há um participante */}
            {item.created_by_member_id && members.length > 1 && (() => {
              const creatorName = getCreatorName(item.created_by_member_id);
              return (
                <span
                  title={creatorName}
                  aria-label={creatorName}
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  // Cor determinística por membro (mesmo hash usado para categorias)
                  style={{ backgroundColor: getActivityTypeColor(item.created_by_member_id) }}
                >
                  {(creatorName.trim()[0] ?? "?").toUpperCase()}
                </span>
              );
            })()}
          </div>
        )}
        </div>
      </Card>
    </div>
    );
  };

  return (
    <motion.div
      key="itinerary"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-28"
    >
      {/* ── Content area ── */}
      <div className="space-y-4">
        <AgendaView
          items={openActivities}
          isDark={isDark}
          renderItem={renderItineraryItem}
        />

        {/* Completed section */}
        {completedActivities.length > 0 && (
          <div className="pt-4">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className={cn(
                "flex items-center gap-2 text-sm font-bold transition-colors mb-4",
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              {showCompleted ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {t("itinerary.completed")} ({completedActivities.length})
            </button>
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-hidden"
                >
                  {completedActivities.map((item) => renderItineraryItem(item))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <FloatingActionButton
        onClick={onOpenModal}
        className={isGuidedTrip ? "z-[75] ring-4 ring-white shadow-[0_8px_22px_rgba(0,0,0,.35)]" : undefined}
      />

      {/* Overflow menu do card (Editar / Excluir) */}
      {itemMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setItemMenu(null)} />
          <div
            className={cn(
              "fixed z-50 w-40 rounded-xl border shadow-lg py-1 overflow-hidden",
              isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"
            )}
            style={{ top: itemMenu.top, right: itemMenu.right }}
          >
            <button
              type="button"
              onClick={() => {
                startEditItinerary(itemMenu.item);
                setItemMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <FilePenLine size={15} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = itemMenu.item;
                setItemMenu(null);
                setVisibilitySheet({
                  open: true,
                  itemId: target.id,
                  currentVisibility: target.visibility,
                  onConfirm: () => void toggleVisibility(target),
                });
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {itemMenu.item.visibility === "public" ? (
                <><Lock size={15} /> {t("itinerary.makePrivate")}</>
              ) : (
                <><Users size={15} /> {t("itinerary.makePublic")}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = itemMenu.item;
                setItemMenu(null);
                void deleteItineraryItemHandler(target);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-red-400 hover:bg-red-950/40" : "text-red-600 hover:bg-red-50"
              )}
            >
              <Trash2 size={15} />
              {t("common.delete")}
            </button>
          </div>
        </>
      )}

      {ConfirmDialogNode}

      <VisibilityBottomSheet
        isOpen={visibilitySheet.open}
        currentVisibility={visibilitySheet.currentVisibility}
        onConfirm={() => visibilitySheet.onConfirm?.()}
        onClose={() => setVisibilitySheet((prev) => ({ ...prev, open: false }))}
        isDark={isDark}
      />
    </motion.div>
  );
}
