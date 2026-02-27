import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { Plane, Bus, Hotel, Calendar, FilePenLine, Trash2, Lock, Plus, Train, Ship, Car, Utensils, Coffee, ShoppingBag, Camera, MapPin, Music, Ticket, Umbrella, Mountain, Waves, Palmtree, Wine, Beer, Footprints, Bike, Theater, Landmark, Castle, Church, Stethoscope, Briefcase, CheckCircle2, Circle, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, fileToDataUrl, resizeImage } from "../../utils";
import type { Trip, ItineraryItem, TripMember, UserSettings, Visibility, ItineraryType } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";

interface ItineraryTabProps {
  trip: Trip;
  currentMember: TripMember | null;
  settings: UserSettings;
  itineraryTypes: ItineraryType[];
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

const ICON_COMPONENTS: Record<string, any> = {
  Plane, Bus, Train, Ship, Car, Hotel, Utensils, Coffee, ShoppingBag, Camera, MapPin, Music, Ticket, Umbrella, Mountain, Waves, Palmtree, Wine, Beer, Footprints, Bike, Theater, Landmark, Castle, Church, Stethoscope, Briefcase, Calendar
};

export function ItineraryTab({ trip, currentMember, settings, itineraryTypes, onOpenModal, onTripUpdate }: ItineraryTabProps) {
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
      alert(getErrorMessage(error));
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
      alert(getErrorMessage(error));
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
      alert(getErrorMessage(error));
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
            const Icon = (item.type?.icon && ICON_COMPONENTS[item.type.icon]) || Calendar;
            return <Icon size={20} />;
          })()}
        </div>
        <div className="flex-1 min-w-0">
          {editingItineraryId === item.id ? (
            <div className="space-y-2">
              <select
                value={itineraryDraft.type_id || ""}
                onChange={(e) => setItineraryDraft((current) => ({ ...current, type_id: e.target.value || null }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              >
                <option value="">Sem tipo</option>
                {itineraryTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
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
                  onChange={(e) => setItineraryDraft((current) => ({ ...current, is_all_day: e.target.checked }))}
                />
                Dia todo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">
                    {itineraryDraft.is_all_day ? "Data de Início" : "Início"}
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
                    {itineraryDraft.is_all_day ? "Data de Fim" : "Fim"}
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
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={itineraryDraft.visibility === "private"}
                  onChange={(e) => setItineraryDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                />
                Marcar como privado (você + cônjuge)
              </label>
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
                      if (!window.confirm("Remover foto?")) return;
                      
                      // Optimistic update
                      onTripUpdate((prev) => ({
                        ...prev,
                        itinerary: prev.itinerary.map((i) =>
                          i.id === item.id ? { ...i, photo_url: null } : i
                        ),
                      }));

                      const { error } = await supabase.from("itinerary").update({ photo_url: null }).eq("id", item.id);
                      if (error) {
                        alert(getErrorMessage(error));
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
                <div className="flex items-center gap-2">
                  <h4 className={cn("font-bold truncate", item.is_completed && "line-through text-zinc-400")}>{item.title}</h4>
                  {item.visibility === "private" && (
                    <span className="text-orange-600" title="Privado">
                      <Lock size={14} />
                    </span>
                  )}
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
                alert(getErrorMessage(error));
              }
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => startEditItinerary(item)}
            className="p-2 text-zinc-400 hover:text-zinc-700"
          >
            <FilePenLine size={16} />
          </button>
          <button
            onClick={async () => {
              const confirmed = window.confirm(`Remover "${item.title}" do itinerário?`);
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
    </motion.div>
  );
}
