import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { Calendar, FilePenLine, Trash2, Plus, CheckCircle2, Circle, ChevronDown, ChevronRight, MapPin, Lock, Unlock, Users } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, fileToDataUrl, resizeImage } from "../../utils";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import type { Trip, ItineraryItem, Visibility } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { ACTIVITY_ICON_COMPONENTS } from '../../constants/icons';
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";

interface ItineraryTabProps {
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function ItineraryTab({ onOpenModal, onTripUpdate }: ItineraryTabProps) {
  const { trip, currentMember, settings, itineraryTypes, members } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
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
  }>({ open: false, itemId: null, currentVisibility: 'public', onConfirm: null });
  const getCreatorName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
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

    // Prepare start/end times based on all_day flag
    let start_time: string | null = null;
    let end_time: string | null = null;

    if (itineraryDraft.is_all_day) {
      // For all-day events, convert dates to full timestamps
      start_time = itineraryDraft.start_time ? `${itineraryDraft.start_time}T00:00:00` : null;
      end_time = itineraryDraft.end_time ? `${itineraryDraft.end_time}T00:00:00` : null;
    } else {
      // For regular events, use datetime-local values
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
              type: itineraryTypes.find(t => t.id === itineraryDraft.type_id) || null,
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
      toast(getErrorMessage(error), 'error');
      // Rollback to the original sourceItem
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
    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.filter((i) => i.id !== item.id),
    }));

    const { error } = await supabase.from("itinerary").delete().eq("id", item.id);
    if (error) {
      toast(getErrorMessage(error), 'error');
      // Rollback
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: [...prev.itinerary, item],
      }));
      return;
    }
  };

  const toggleCompleted = async (item: ItineraryItem) => {
    const nextStatus = !item.is_completed;

    // Optimistic update
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
      toast(getErrorMessage(error), 'error');
      // Rollback
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) =>
          i.id === item.id ? { ...i, is_completed: !nextStatus } : i
        ),
      }));
    }
  };

  const openActivities = trip.itinerary.filter(item => !item.is_completed);
  const completedActivities = trip.itinerary.filter(item => item.is_completed);

  const renderItineraryItem = (item: ItineraryItem) => (
    <Card key={item.id} className={cn("group p-0 overflow-hidden transition-opacity", item.is_completed && "opacity-75")}>
      {item.photo_url && <img src={item.photo_url} alt={item.title} className="w-full h-40 object-cover" />}
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
                  onChange={(e) => setItineraryDraft((current) => ({ ...current, type_id: e.target.value || null }))}
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                >
                  <option value="">Sem tipo</option>
                  {itineraryTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <input
                value={itineraryDraft.title}
                onChange={(e) => setItineraryDraft((current) => ({ ...current, title: e.target.value }))}
                placeholder="Titulo"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <input
                value={itineraryDraft.location}
                onChange={(e) => setItineraryDraft((current) => ({ ...current, location: e.target.value }))}
                placeholder="Local"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={itineraryDraft.is_all_day}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setItineraryDraft((current) => {
                      let newStartTime = current.start_time;
                      let newEndTime = current.end_time;

                      if (isChecked) {
                        // When checking "All day", if there's a date, keep it and set time to 00:00
                        // datetime-local format is YYYY-MM-DDTHH:mm
                        if (newStartTime && newStartTime.includes("T")) {
                          newStartTime = newStartTime.split("T")[0];
                        }
                        if (newEndTime && newEndTime.includes("T")) {
                          newEndTime = newEndTime.split("T")[0];
                        }
                      } else {
                        // When unchecking "All day", convert date-only to datetime-local format
                        if (newStartTime && !newStartTime.includes("T")) {
                          newStartTime = `${newStartTime}T00:00`;
                        }
                        if (newEndTime && !newEndTime.includes("T")) {
                          newEndTime = `${newEndTime}T00:00`;
                        }
                      }

                      return {
                        ...current,
                        is_all_day: isChecked,
                        start_time: newStartTime,
                        end_time: newEndTime,
                      };
                    });
                  }}
                />
                Dia todo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">
                    Início
                  </label>
                  {itineraryDraft.is_all_day ? (
                    <input
                      type="date"
                      value={itineraryDraft.start_time}
                      onChange={(e) => setItineraryDraft((current) => ({ ...current, start_time: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm appearance-none"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={itineraryDraft.start_time}
                      onChange={(e) => setItineraryDraft((current) => ({ ...current, start_time: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm appearance-none"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">
                    Fim
                  </label>
                  {itineraryDraft.is_all_day ? (
                    <input
                      type="date"
                      value={itineraryDraft.end_time}
                      onChange={(e) => setItineraryDraft((current) => ({ ...current, end_time: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm appearance-none"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={itineraryDraft.end_time}
                      onChange={(e) => setItineraryDraft((current) => ({ ...current, end_time: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm appearance-none"
                    />
                  )}
                </div>
              </div>
              <textarea
                value={itineraryDraft.description}
                onChange={(e) => setItineraryDraft((current) => ({ ...current, description: e.target.value }))}
                placeholder="Notas"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm h-20"
              />
              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => photoInputRefs.current[item.id]?.click()}
                  className="text-[10px] font-bold uppercase text-zinc-400 text-left"
                >
                  {item.photo_url ? "Trocar foto" : "Adicionar foto"}
                </button>
                {item.photo_url && (
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Remover foto?',
                        message: 'Deseja realmente remover a foto desta atividade?',
                        variant: 'danger',
                        isDark: settings.dark_mode
                      });
                      if (!confirmed) return;
                      
                      // Optimistic update
                      onTripUpdate((prev) => ({
                        ...prev,
                        itinerary: prev.itinerary.map((i) =>
                          i.id === item.id ? { ...i, photo_url: null } : i
                        ),
                      }));

                      const { error } = await supabase.from("itinerary").update({ photo_url: null }).eq("id", item.id);
                      if (error) {
                        toast(getErrorMessage(error), 'error');
                        // Rollback if needed (optional, but good practice)
                        onTripUpdate((prev) => ({
                          ...prev,
                          itinerary: prev.itinerary.map((i) =>
                            i.id === item.id ? { ...i, photo_url: item.photo_url } : i
                          ),
                        }));
                      }
                    }}
                    className="text-[10px] font-bold uppercase text-red-400 text-left"
                  >
                    Remover foto
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingItinerary}
                  onClick={() => void saveItineraryEdit(item.id)}
                  className="px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-xs font-bold"
                >
                  {savingItinerary ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  disabled={savingItinerary}
                  onClick={() => setEditingItineraryId(null)}
                  className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={cn("font-bold truncate", item.is_completed && "line-through text-zinc-400")}>{item.title}</h4>
                  <button
                    onClick={() => setVisibilitySheet({
                      open: true,
                      itemId: item.id,
                      currentVisibility: item.visibility,
                      onConfirm: async () => {
                        const nextVisibility = item.visibility === 'public' ? 'private' : 'public';
                        // Optimistic update
                        onTripUpdate((prev) => ({
                          ...prev,
                          itinerary: prev.itinerary.map((i) =>
                            i.id === item.id ? { ...i, visibility: nextVisibility } : i
                          ),
                        }));

                        const { error } = await supabase
                          .from("itinerary")
                          .update({ visibility: nextVisibility })
                          .eq("id", item.id);

                        if (error) {
                          toast(getErrorMessage(error), 'error');
                          // Rollback
                          onTripUpdate((prev) => ({
                            ...prev,
                            itinerary: prev.itinerary.map((i) =>
                              i.id === item.id ? { ...i, visibility: item.visibility } : i
                            ),
                          }));
                        }
                      }
                    })}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors shrink-0",
                      item.visibility === 'public'
                        ? "bg-blue-100 text-blue-700"
                        : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    {item.visibility === 'public' ? (
                      <><Users size={10} /> Público</>
                    ) : (
                      <><Lock size={10} /> Privado</>
                    )}
                  </button>
                </div>
                <div className="flex flex-col items-start">
                  {item.start_time && (
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {item.is_all_day 
                        ? format(new Date(item.start_time), "dd/MM") 
                        : format(new Date(item.start_time), "dd/MM HH:mm")}
                      {item.end_time && !item.is_all_day && ` - ${format(new Date(item.end_time), "HH:mm")}`}
                      {item.is_all_day && item.end_time && ` - ${format(new Date(item.end_time), "dd/MM")}`}
                    </span>
                  )}
                  {item.is_all_day && (
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                      Dia todo
                    </span>
                  )}
                  {item.end_time && item.start_time && !item.is_all_day && format(new Date(item.start_time), "dd/MM") !== format(new Date(item.end_time), "dd/MM") && (
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                      até {format(new Date(item.end_time), "dd/MM")}
                    </span>
                  )}
                </div>
                {editingItineraryId !== item.id && item.created_by_member_id && (
                  <span className={cn(
                    "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit",
                    settings.dark_mode
                      ? "bg-zinc-700 text-zinc-300"
                      : "bg-zinc-100 text-zinc-500"
                  )}>
                    👤 {getCreatorName(item.created_by_member_id)}
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-500 line-clamp-2">{item.description}</p>
              {item.location && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-zinc-500">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Ver no Google Maps"
                  >
                    <MapPin size={12} />
                    <span className="truncate max-w-[150px]">{item.location}</span>
                  </a>
                </div>
              )}
              {!item.location && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-zinc-500">
                  <span className="truncate max-w-[150px]">Sem local</span>
                </div>
              )}
            </>
          )}
          <input
            ref={(el) => {
              photoInputRefs.current[item.id] = el;
            }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const photo = await resizeImage(file);
                
                // Optimistic update
                onTripUpdate((prev) => ({
                  ...prev,
                  itinerary: prev.itinerary.map((i) =>
                    i.id === item.id ? { ...i, photo_url: photo } : i
                  ),
                }));

                const { error } = await supabase.from("itinerary").update({ photo_url: photo }).eq("id", item.id);
                if (error) {
                  // Rollback on error
                  onTripUpdate((prev) => ({
                    ...prev,
                    itinerary: prev.itinerary.map((i) =>
                      i.id === item.id ? { ...i, photo_url: item.photo_url } : i
                    ),
                  }));
                  throw error;
                }
              } catch (error) {
                toast(getErrorMessage(error), 'error');
              }
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          {!editingItineraryId && (
            <button
              type="button"
              onClick={() => startEditItinerary(item)}
              className="p-2 text-zinc-400 hover:text-zinc-700"
            >
              <FilePenLine size={16} />
            </button>
          )}
          <button
            onClick={async () => {
              const confirmed = await confirm({
                title: 'Remover do itinerário?',
                message: `Deseja realmente remover "${item.title}" do itinerário?`,
                variant: 'danger',
                isDark: settings.dark_mode
              });
              if (!confirmed) return;
              await deleteItineraryItem(item);
            }}
            className="p-2 text-zinc-400 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </Card>
  );

  return (
    <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {openActivities.map(renderItineraryItem)}

          {completedActivities.length > 0 && (
            <div className="pt-4">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-600 transition-colors mb-4"
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
      </div>
      
      <FloatingActionButton onClick={onOpenModal} />
      {ConfirmDialogNode}

      <VisibilityBottomSheet
        isOpen={visibilitySheet.open}
        currentVisibility={visibilitySheet.currentVisibility}
        onConfirm={() => visibilitySheet.onConfirm?.()}
        onClose={() => setVisibilitySheet(prev => ({ ...prev, open: false }))}
        isDark={settings.dark_mode}
      />
    </motion.div>
  );
}
