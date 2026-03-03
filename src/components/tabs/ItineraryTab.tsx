import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import {
  Calendar, FilePenLine, Trash2, CheckCircle2, Circle,
  ChevronDown, ChevronRight, MapPin, Lock, Unlock, Users,
  AlignLeft, Clock,
} from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, fileToDataUrl, resizeImage } from "../../utils";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import type { Trip, ItineraryItem, Visibility } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { ACTIVITY_ICON_COMPONENTS } from "../../constants/icons";
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "agenda" | "timeline";

interface ItineraryTabProps {
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const clean = t.replace("+1", "").slice(0, 5);
  const [h, m] = clean.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function groupByDate(items: ItineraryItem[]): Record<string, ItineraryItem[]> {
  return items.reduce<Record<string, ItineraryItem[]>>((acc, item) => {
    const key = item.start_time ? item.start_time.slice(0, 10) : "sem-data";
    (acc[key] ??= []).push(item);
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

function formatDateKey(dateKey: string): string {
  if (dateKey === "sem-data") return "Sem data definida";
  return new Date(dateKey + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  const grouped = groupByDate(items);
  const keys = sortedDateKeys(grouped);

  if (keys.length === 0) {
    return (
      <div className={cn("text-center py-16 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
        Nenhuma atividade planejada ainda.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {keys.map((dateKey) => {
        const dayItems = [...(grouped[dateKey] ?? [])].sort((a, b) =>
          (a.start_time ?? "").localeCompare(b.start_time ?? "")
        );
        const label = formatDateKey(dateKey);
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
                  {dayItems.length} atividade{dayItems.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Items with left timeline bar */}
            <div
              className={cn("pl-4 space-y-3 border-l-2", isDark ? "border-zinc-700" : "border-zinc-200")}
            >
              {dayItems.map((item) => (
                <div key={item.id} className="relative">
                  {/* Dot on the timeline */}
                  <div
                    className="absolute -left-[21px] top-5 w-3 h-3 rounded-full border-2 flex-shrink-0"
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
  const grouped = groupByDate(items);
  const keys = sortedDateKeys(grouped);
  const [activeKey, setActiveKey] = useState<string>(keys[0] ?? "sem-data");

  if (keys.length === 0) {
    return (
      <div className={cn("text-center py-16 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
        Nenhuma atividade planejada ainda.
      </div>
    );
  }

  const dayItems = [...(grouped[activeKey] ?? [])].sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? "")
  );

  const timedItems = dayItems.filter((i) => i.start_time && !i.is_all_day);
  const allDayItems = dayItems.filter((i) => i.is_all_day || !i.start_time);

  const totalHeight = HOURS.length * 60 * PX_PER_MIN;

  return (
    <div>
      {/* Day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {keys.map((key) => {
          const isActive = key === activeKey;
          const label =
            key === "sem-data"
              ? "Sem data"
              : new Date(key + "T00:00:00").toLocaleDateString("pt-BR", {
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
            Dia todo
          </p>
          {allDayItems.map((item) => renderItem(item))}
        </div>
      )}

      {/* Hourly grid */}
      {timedItems.length === 0 && allDayItems.length === 0 ? (
        <div className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
          Nenhuma atividade neste dia.
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

            {/* Current time indicator (demo: 10h15) */}
            <div
              style={{
                position: "absolute",
                top: (10 * 60 + 15 - 6 * 60) * PX_PER_MIN,
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

            {/* Timed activity blocks */}
            {timedItems.map((item) => {
              const startMin = timeToMin(item.start_time!.slice(11));
              const endMin = item.end_time
                ? timeToMin(item.end_time.slice(11))
                : startMin + 60;
              const durationMin = Math.max(endMin - startMin, 30);
              const top = (startMin - 6 * 60) * PX_PER_MIN;
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
                          {item.start_time?.slice(11, 16)}
                          {item.end_time ? ` – ${item.end_time.slice(11, 16)}` : ""}
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

export function ItineraryTab({ onOpenModal, onTripUpdate }: ItineraryTabProps) {
  const { trip, currentMember, settings, itineraryTypes, members } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();

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

  const getCreatorName = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    return member?.display_name || "Desconhecido";
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
    if (!editingItineraryId || editingItineraryId !== itemId || savingItinerary) return;
    const sourceItem = trip.itinerary.find((entry) => entry.id === itemId);
    if (!sourceItem) return;
    const title = itineraryDraft.title.trim();
    if (!title) return;

    setSavingItinerary(true);

    let start_time: string | null = null;
    let end_time: string | null = null;

    if (itineraryDraft.is_all_day) {
      start_time = itineraryDraft.start_time ? `${itineraryDraft.start_time}T00:00:00` : null;
      end_time = itineraryDraft.end_time ? `${itineraryDraft.end_time}T00:00:00` : null;
    } else {
      start_time = itineraryDraft.start_time || null;
      end_time = itineraryDraft.end_time || null;
    }

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

    const { error } = await supabase
      .from("itinerary")
      .update({
        type_id: itineraryDraft.type_id || null,
        title,
        description: itineraryDraft.description.trim(),
        location: itineraryDraft.location.trim(),
        visibility: itineraryDraft.visibility,
        start_time,
        end_time,
        is_all_day: itineraryDraft.is_all_day,
      })
      .eq("id", itemId);

    if (error) {
      setSavingItinerary(false);
      toast(getErrorMessage(error), "error");
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) => (i.id === itemId ? sourceItem : i)),
      }));
      return;
    }

    setSavingItinerary(false);
    setEditingItineraryId(null);
  };

  const deleteItineraryItem = async (item: ItineraryItem) => {
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.filter((i) => i.id !== item.id),
    }));
    const { error } = await supabase.from("itinerary").delete().eq("id", item.id);
    if (error) {
      toast(getErrorMessage(error), "error");
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: [...prev.itinerary, item],
      }));
    }
  };

  const toggleCompleted = async (item: ItineraryItem) => {
    const nextStatus = !item.is_completed;
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) =>
        i.id === item.id ? { ...i, is_completed: nextStatus } : i
      ),
    }));
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
      {item.photo_url && (
        <img src={item.photo_url} alt={item.title} className="w-full h-40 object-cover" />
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
              <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                      onConfirm: async () => {
                        const next: Visibility =
                          item.visibility === "public" ? "private" : "public";
                        onTripUpdate((prev) => ({
                          ...prev,
                          itinerary: prev.itinerary.map((i) =>
                            i.id === item.id ? { ...i, visibility: next } : i
                          ),
                        }));
                        await supabase
                          .from("itinerary")
                          .update({ visibility: next })
                          .eq("id", item.id);
                      },
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
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
                    <><Users size={10} /> Público</>
                  ) : (
                    <><Lock size={10} /> Privado</>
                  )}
                </button>
                <div className="flex flex-col items-start">
                  {item.start_time && (
                    <span className={cn("text-xs whitespace-nowrap", isDark ? "text-zinc-400" : "text-zinc-400")}>
                      {item.is_all_day
                        ? format(new Date(item.start_time), "dd/MM")
                        : format(new Date(item.start_time), "dd/MM HH:mm")}
                      {item.end_time && !item.is_all_day
                        ? ` - ${format(new Date(item.end_time), "HH:mm")}`
                        : ""}
                      {item.is_all_day && item.end_time
                        ? ` - ${format(new Date(item.end_time), "dd/MM")}`
                        : ""}
                    </span>
                  )}
                  {item.is_all_day && (
                    <span className={cn("text-[10px]", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      Dia todo
                    </span>
                  )}
                </div>
                {item.created_by_member_id && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit",
                      isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-50 text-zinc-400"
                    )}
                  >
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
                if (!file) return;
                try {
                  const dataUrl = await fileToDataUrl(file);
                  const resized = await resizeImage(dataUrl, 1200);
                  const ext = file.name.split(".").pop() || "jpg";
                  const path = `${trip.id}/itinerary/${item.id}.${ext}`;
                  const blob = await (await fetch(resized)).blob();
                  await supabase.storage.from("travel-documents").upload(path, blob, { upsert: true });
                  const { data: urlData } = supabase.storage.from("travel-documents").getPublicUrl(path);
                  const photo = urlData.publicUrl;
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
                const confirmed = await confirm({
                  title: "Remover do itinerário?",
                  message: `Deseja realmente remover "${item.title}" do itinerário?`,
                  variant: "danger",
                  isDark,
                });
                if (!confirmed) return;
                await deleteItineraryItem(item);
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
              Concluídas ({completedActivities.length})
            </button>
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
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