import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import {
  Calendar, FilePenLine, Trash2, CheckCircle2, Circle,
  ChevronDown, ChevronRight, MapPin, Lock, Users,
  AlignLeft, Clock, ImagePlus,
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

type ViewMode = "agenda" | "timeline";

interface ItineraryTabProps {
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const clean = t.replace("+1", "").slice(0, 5);
  const [h, m] = clean.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function getItemTimelineRange(
  item: ItineraryItem,
  activeDate: string
): { startMin: number; endMin: number; isSpanningDay: boolean } {
  const startDate = item.start_time?.slice(0, 10) ?? "";
  const endDate = item.end_time?.slice(0, 10) ?? "";

  // Start time calculation
  let startMin: number;
  if (startDate === activeDate) {
    // Item starts on active day
    startMin = item.start_time ? timeToMin(item.start_time.slice(11)) : 0;
  } else if (startDate < activeDate && endDate >= activeDate) {
    // Item started before, continues through this day - show from start of day (00:00)
    startMin = 0;
  } else {
    startMin = 0;
  }

  // End time calculation
  let endMin: number;
  if (endDate === activeDate) {
    // Item ends on active day
    endMin = item.end_time ? timeToMin(item.end_time.slice(11)) : 24 * 60;
  } else if (endDate > activeDate) {
    // Item continues past this day - show until end of day (23:59)
    endMin = 24 * 60;
  } else {
    endMin = item.end_time ? timeToMin(item.end_time.slice(11)) : 24 * 60;
  }

  const isSpanningDay = startDate !== activeDate || endDate !== activeDate;

  // Clamp to Timeline view range (6am to midnight)
  // But only clamp if the entire item is within the day
  let displayStartMin = startMin;
  let displayEndMin = endMin;

  if (!isSpanningDay) {
    // Only clamp single-day items to the 6am-midnight view
    displayStartMin = Math.max(startMin, 6 * 60);
    displayEndMin = Math.min(endMin, 24 * 60);
  } else {
    // For spanning items, show the full range even if outside 6am-midnight
    // but clamp to 0 and 1440
    displayStartMin = Math.max(startMin, 0);
    displayEndMin = Math.min(endMin, 24 * 60);
  }

  return {
    startMin: displayStartMin,
    endMin: displayEndMin,
    isSpanningDay,
  };
}

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
  return new Date(dateKey + "T00:00:00").toLocaleDateString(locale, {
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

interface TimelineItemLayout {
  itemId: string;
  column: number;
  totalColumns: number;
}

function calculateTimelinePositions(
  items: ItineraryItem[],
  activeDate: string
): Map<string, TimelineItemLayout> {
  const positions = new Map<string, TimelineItemLayout>();

  // For each item, find which column it should be in
  items.forEach((item, itemIndex) => {
    const { startMin: itemStart, endMin: itemEnd } = getItemTimelineRange(item, activeDate);

    // Find all items that overlap with this one
    const overlappingIndices = [itemIndex];
    items.forEach((otherItem, otherIndex) => {
      if (otherIndex === itemIndex) return;
      const { startMin: otherStart, endMin: otherEnd } = getItemTimelineRange(otherItem, activeDate);

      // Check if ranges overlap
      if (itemStart < otherEnd && itemEnd > otherStart) {
        overlappingIndices.push(otherIndex);
      }
    });

    // Sort the overlapping items by start time, then by ID for consistency
    overlappingIndices.sort((a, b) => {
      const aStart = getItemTimelineRange(items[a], activeDate).startMin;
      const bStart = getItemTimelineRange(items[b], activeDate).startMin;
      if (aStart !== bStart) return aStart - bStart;
      return items[a].id.localeCompare(items[b].id);
    });

    const column = overlappingIndices.indexOf(itemIndex);
    const totalColumns = overlappingIndices.length;

    positions.set(item.id, { itemId: item.id, column, totalColumns });
  });

  return positions;
}

// ─── AgendaView ───────────────────────────────────────────────────────────────

interface AgendaViewProps {
  items: ItineraryItem[];
  isDark: boolean;
  onToggleCompleted: (item: ItineraryItem) => void;
  onStartEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  renderItem: (item: ItineraryItem) => React.ReactNode;
}

function AgendaView({ items, isDark, renderItem }: AgendaViewProps) {
  const { language } = useI18n();
  const grouped = groupByDate(items);
  const keys = sortedDateKeys(grouped);

  if (keys.length === 0) {
    return (
      <div className={cn("text-center py-16 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
        {language === "en" ? "No activities planned yet." : "Nenhuma atividade planejada ainda."}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {keys.map((dateKey) => {
        const dayItems = [...(grouped[dateKey] ?? [])].sort((a, b) =>
          (a.start_time ?? "").localeCompare(b.start_time ?? "")
        );
        const label = formatDateKey(dateKey, language);
        const dayNum = dateKey !== "sem-data" ? dateKey.slice(8, 10) : "?";

        return (
          <div key={dateKey}>
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

            {/* Items with left timeline bar */}
            <div
              className={cn(
                "pl-4 space-y-3 border-l-2 sm:grid sm:grid-cols-2 sm:gap-4 sm:pl-0 sm:space-y-0 sm:border-l-0",
                isDark ? "border-zinc-700" : "border-zinc-200"
              )}
            >
              {dayItems.map((item) => (
                <div key={item.id} className="relative">
                  {/* Dot on the timeline */}
                  <div
                    className="absolute -left-[21px] top-5 w-3 h-3 rounded-full border-2 flex-shrink-0 sm:hidden"
                    style={{
                      backgroundColor: item.is_completed
                        ? "#10b981"
                        : "var(--accent-color)",
                      borderColor: isDark ? "#27272a" : "#f9fafb",
                    }}
                  />
                  {renderItem(item)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelineView ─────────────────────────────────────────────────────────────

interface TimelineViewProps {
  items: ItineraryItem[];
  isDark: boolean;
  renderItem: (item: ItineraryItem) => React.ReactNode;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06h–23h
const PX_PER_MIN = 1.2; // pixels per minute

function TimelineView({ items, isDark, renderItem }: TimelineViewProps) {
  const { language } = useI18n();
  const grouped = groupByDate(items);
  const keys = sortedDateKeys(grouped);
  const [activeKey, setActiveKey] = useState<string>(keys[0] ?? "sem-data");

  if (keys.length === 0) {
    return (
      <div className={cn("text-center py-16 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
        {language === "en" ? "No activities planned yet." : "Nenhuma atividade planejada ainda."}
      </div>
    );
  }

  const dayItems = [...(grouped[activeKey] ?? [])].sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? "")
  );

  const timedItems = dayItems.filter((i) => i.start_time && !i.is_all_day);
  const allDayItems = dayItems.filter((i) => i.is_all_day || !i.start_time);

      const totalHeight = HOURS.length * 60 * PX_PER_MIN;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowInRange = nowMin >= 6 * 60 && nowMin < 24 * 60;
    const isToday = activeKey === now.toISOString().slice(0, 10);

  return (
    <div>
      {/* Day tabs — stopPropagation prevents the parent swipe-tabs hook from firing */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-hide"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {keys.map((key) => {
          const isActive = key === activeKey;
          const label =
            key === "sem-data"
              ? (language === "en" ? "No date" : "Sem data")
              : new Date(key + "T00:00:00").toLocaleDateString(language, {
                  day: "2-digit",
                  month: "2-digit",
                });
          return (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0",
                isActive
                  ? "text-white shadow-sm"
                  : isDark
                  ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              )}
              style={isActive ? { backgroundColor: "var(--accent-color)" } : undefined}
            >
              {label}
              <span
                className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                  isActive
                    ? "bg-white/20 text-white"
                    : isDark
                    ? "bg-zinc-700 text-zinc-400"
                    : "bg-zinc-200 text-zinc-500"
                )}
              >
                {(grouped[key] ?? []).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day items */}
      {allDayItems.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className={cn("text-xs font-bold uppercase tracking-wide", isDark ? "text-zinc-500" : "text-zinc-400")}>
            {language === "en" ? "All day" : "Dia todo"}
          </p>
          {allDayItems.map((item) => renderItem(item))}
        </div>
      )}

      {/* Hourly grid */}
      {timedItems.length === 0 && allDayItems.length === 0 ? (
        <div className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
          {language === "en" ? "No activities on this day." : "Nenhuma atividade neste dia."}
        </div>
      ) : (
        <div className="flex gap-0 relative" style={{ height: totalHeight }}>
          {/* Hour axis */}
          <div className="w-10 flex-shrink-0 relative">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ position: "absolute", top: (h - 6) * 60 * PX_PER_MIN - 8 }}
                className={cn("text-[10px] font-semibold w-full text-right pr-2", isDark ? "text-zinc-600" : "text-zinc-400")}
              >
                {String(h).padStart(2, "0")}h
              </div>
            ))}
          </div>

          {/* Grid column */}
          <div className="flex-1 relative ml-2">
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ position: "absolute", top: (h - 6) * 60 * PX_PER_MIN, left: 0, right: 0, height: 1 }}
                className={cn(isDark ? "bg-zinc-800" : "bg-zinc-100")}
              />
            ))}

            {/* Current time indicator — only shown when viewing today */}
            {isToday && nowInRange && (
              <div
                style={{
                  position: "absolute",
                  top: (nowMin - 6 * 60) * PX_PER_MIN,
                  left: 0,
                  right: 0,
                  height: 2,
                  backgroundColor: "#ef4444",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -4,
                    top: -3,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#ef4444",
                  }}
                />
              </div>
            )}

            {/* Timed activity blocks */}
            {timedItems.map((item) => {
              const { startMin, endMin, isSpanningDay } = getItemTimelineRange(item, activeKey);
              const durationMin = Math.max(endMin - startMin, 30);
              const top = Math.max(0, (startMin - 6 * 60) * PX_PER_MIN);
              const height = durationMin * PX_PER_MIN;
              const Icon =
                (item.type?.icon && ACTIVITY_ICON_COMPONENTS[item.type.icon]) ||
                Calendar;

              return (
                <div
                  key={item.id}
                  style={{
                    position: "absolute",
                    top,
                    left: 0,
                    right: 0,
                    height: Math.max(height, 36),
                    backgroundColor: "var(--card-bg)",
                    borderLeft: "3px solid var(--accent-color)",
                    borderRadius: "0 10px 10px 0",
                    overflow: "hidden",
                    padding: "4px 8px",
                    boxShadow: isDark
                      ? "0 1px 4px rgba(0,0,0,0.4)"
                      : "0 1px 4px rgba(0,0,0,0.08)",
                    opacity: item.is_completed ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-1.5 h-full overflow-hidden">
                    <Icon
                      size={12}
                      className={cn("flex-shrink-0", isDark ? "text-zinc-400" : "text-zinc-500")}
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-bold truncate leading-tight",
                          isDark ? "text-zinc-200" : "text-zinc-800"
                        )}
                      >
                        {item.title}
                      </p>
                      {height >= 50 && item.location && (
                        <p className={cn("text-[10px] truncate", isDark ? "text-zinc-500" : "text-zinc-400")}>
                          {item.location}
                        </p>
                      )}
                      {height >= 68 && (
                        <p className={cn("text-[10px]", isDark ? "text-zinc-500" : "text-zinc-400")}>
                          {isSpanningDay ? (
                            <>
                              {item.start_time?.slice(0, 10) === activeKey
                                ? `${item.start_time?.slice(11, 16)} →`
                                : `← ${item.start_time?.slice(11, 16)}`}
                              {item.end_time ? ` ${item.end_time.slice(11, 16)}` : ""}
                              {item.start_time?.slice(0, 10) !== item.end_time?.slice(0, 10) && (
                                <span className="block text-[9px] opacity-75">
                                  {item.end_time?.slice(0, 10) === activeKey ? "ends" : "continues"}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {item.start_time?.slice(11, 16)}
                              {item.end_time ? ` – ${item.end_time.slice(11, 16)}` : ""}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("agenda");

  // Edit state
  const [editingItineraryId, setEditingItineraryId] = useState<string | null>(null);
  const [savingItinerary, setSavingItinerary] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [itineraryDraft, setItineraryDraft] = useState<{
    type_id: string | null;
    title: string;
    description: string;
    location: string;
    visibility: Visibility;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
  }>({
    type_id: null,
    title: "",
    description: "",
    location: "",
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

  // ─── renderItineraryItem (unchanged from original) ─────────────────────────
  const renderItineraryItem = (item: ItineraryItem) => (
    <Card key={item.id} className={cn("group p-0 overflow-hidden transition-opacity", item.is_completed && "opacity-75")}>
      {getItineraryPhotoSrc(item.photo_url) && (
        <img src={getItineraryPhotoSrc(item.photo_url) ?? undefined} alt={item.title} className="w-full h-40 object-cover" />
      )}
      <div className="p-5 flex items-start gap-3">
        <button
          onClick={() => void toggleCompleted(item)}
          className={cn(
            "mt-1 flex-shrink-0 transition-colors",
            item.is_completed ? "text-emerald-500" : "text-zinc-300 hover:text-zinc-400"
          )}
        >
          {item.is_completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-50 text-zinc-600")}>
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
                  disabled={savingItinerary}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent-color)" }}
                >
                  {savingItinerary ? "Salvando…" : "Salvar"}
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
              <p className={cn("font-semibold text-sm", item.is_completed && "line-through")}>
                {item.title}
              </p>
              {item.description && (
                <p className={cn("text-xs mt-0.5", isDark ? "text-zinc-400" : "text-zinc-500")}>
                  {item.description}
                </p>
              )}
              {item.location && (
                <p className={cn("text-xs mt-1 flex items-center gap-1", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  <MapPin size={10} /> {item.location}
                </p>
              )}

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {item.type && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      isDark ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-600"
                    )}
                  >
                    {item.type.name}
                  </span>
                )}
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
                    item.visibility === "public"
                      ? isDark
                        ? "bg-emerald-900/40 text-emerald-400"
                        : "bg-emerald-50 text-emerald-600"
                      : isDark
                      ? "bg-zinc-700 text-zinc-400"
                      : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {item.visibility === "public" ? (
                    <><Users size={10} /> {t("common.public")}</>
                  ) : (
                    <><Lock size={10} /> {t("common.private")}</>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between mt-1.5 gap-2">
                {item.start_time && (
                  <span className={cn("text-xs whitespace-nowrap font-medium", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    {item.is_all_day
                      ? format(new Date(item.start_time + "T00:00:00"), "dd/MM")
                      : format(new Date(item.start_time), "dd/MM HH:mm")}
                    {item.end_time && !item.is_all_day
                      ? ` – ${format(new Date(item.end_time), "HH:mm")}`
                      : ""}
                    {item.is_all_day && item.end_time &&
                    item.end_time.slice(0, 10) !== item.start_time.slice(0, 10)
                      ? ` – ${format(new Date(item.end_time + "T00:00:00"), "dd/MM")}`
                      : ""}
                    {item.is_all_day && !item.end_time ? " · Dia todo" : ""}
                  </span>
                )}
                {item.created_by_member_id && (
                  <span className={cn("text-[10px] ml-auto", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    {getCreatorName(item.created_by_member_id)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {editingItineraryId !== item.id && (
          <div className="flex flex-col items-center gap-1">
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
              onClick={() => startEditItinerary(item)}
              className="p-2 text-zinc-400 hover:text-zinc-700"
            >
              <FilePenLine size={16} />
            </button>
            <button
              onClick={async () => {
                await deleteItineraryItemHandler(item);
              }}
              className="p-2 text-zinc-400 hover:text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    </Card>
  );

  const VIEW_OPTIONS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "agenda", label: "Agenda", icon: <AlignLeft size={14} /> },
    { id: "timeline", label: "Timeline", icon: <Clock size={14} /> },
  ];

  return (
    <motion.div
      key="itinerary"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* ── View switcher ── */}
      <div
        className={cn(
          "flex gap-1 p-1 rounded-xl w-fit",
          isDark ? "bg-zinc-800" : "bg-zinc-100"
        )}
      >
        {VIEW_OPTIONS.map((opt) => {
          const isActive = viewMode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setViewMode(opt.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                isActive
                  ? "text-white shadow-sm"
                  : isDark
                  ? "text-zinc-500 hover:text-zinc-300"
                  : "text-zinc-500 hover:text-zinc-700"
              )}
              style={isActive ? { backgroundColor: "var(--accent-color)" } : undefined}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Content area ── */}
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {viewMode === "agenda" && (
            <motion.div
              key="agenda"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AgendaView
                items={openActivities}
                isDark={isDark}
                onToggleCompleted={toggleCompleted}
                onStartEdit={startEditItinerary}
                onDelete={deleteItineraryItem}
                renderItem={renderItineraryItem}
              />
            </motion.div>
          )}

          {viewMode === "timeline" && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TimelineView
                items={openActivities}
                isDark={isDark}
                renderItem={renderItineraryItem}
              />
            </motion.div>
          )}
        </AnimatePresence>

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
                  {completedActivities.map(renderItineraryItem)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <FloatingActionButton onClick={onOpenModal} />
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
