import React, { useState, useRef } from "react";
import { motion } from "motion/react";
import { format } from "date-fns";
import { Plane, Bus, Hotel, Calendar, FilePenLine, Trash2, Lock, Plus } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, fileToDataUrl } from "../../utils";
import type { Trip, ItineraryItem, TripMember, UserSettings, Visibility, ItineraryType } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";

interface ItineraryTabProps {
  trip: Trip;
  currentMember: TripMember | null;
  settings: UserSettings;
  onOpenModal: () => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function ItineraryTab({ trip, currentMember, settings, onOpenModal, onTripUpdate }: ItineraryTabProps) {
  const [editingItineraryId, setEditingItineraryId] = useState<string | null>(null);
  const [savingItinerary, setSavingItinerary] = useState(false);
  const [itineraryDraft, setItineraryDraft] = useState<{
    type: ItineraryType;
    title: string;
    description: string;
    location: string;
    amount: string;
    visibility: Visibility;
  }>({
    type: "activity",
    title: "",
    description: "",
    location: "",
    amount: "0",
    visibility: "public",
  });
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const findLegacyItineraryExpenseId = async (item: Pick<ItineraryItem, "trip_id" | "created_by_member_id" | "title">) => {
    const { data, error } = await supabase
      .from("expenses")
      .select("id")
      .eq("trip_id", item.trip_id)
      .eq("created_by_member_id", item.created_by_member_id)
      .eq("description", item.title)
      .is("itinerary_item_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return null;
    }

    return data?.[0]?.id || null;
  };

  const upsertItineraryExpense = async (itemId: string, sourceItem: ItineraryItem, nextData: { title: string; amount: number; visibility: Visibility }) => {
    const { data: linkedData, error: linkedError } = await supabase
      .from("expenses")
      .select("id")
      .eq("trip_id", sourceItem.trip_id)
      .eq("itinerary_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (linkedError) console.error(linkedError);

    const linkedExpenseId = linkedData?.[0]?.id || null;
    const legacyExpenseId = linkedExpenseId ? null : await findLegacyItineraryExpenseId(sourceItem);
    const targetExpenseId = linkedExpenseId || legacyExpenseId;

    if (targetExpenseId) {
      const { error: updateError } = await supabase
        .from("expenses")
        .update({
          description: nextData.title,
          amount: nextData.amount,
          visibility: nextData.visibility,
          itinerary_item_id: itemId,
        })
        .eq("id", targetExpenseId);
      if (updateError) console.error(updateError);
      return;
    }

    const { error: insertError } = await supabase.from("expenses").insert({
      id: crypto.randomUUID(),
      trip_id: sourceItem.trip_id,
      created_by_member_id: sourceItem.created_by_member_id,
      itinerary_item_id: itemId,
      description: nextData.title,
      amount: nextData.amount,
      currency: settings.default_currency,
      visibility: nextData.visibility,
      date: new Date().toISOString().split("T")[0],
    });
    if (insertError) console.error(insertError);
  };

  const removeItineraryExpense = async (itemId: string, sourceItem: ItineraryItem) => {
    const { error: linkedDeleteError } = await supabase
      .from("expenses")
      .delete()
      .eq("trip_id", sourceItem.trip_id)
      .eq("itinerary_item_id", itemId);
    if (linkedDeleteError) console.error(linkedDeleteError);

    const legacyExpenseId = await findLegacyItineraryExpenseId(sourceItem);
    if (!legacyExpenseId) return;

    const { error: legacyDeleteError } = await supabase.from("expenses").delete().eq("id", legacyExpenseId);
    if (legacyDeleteError) console.error(legacyDeleteError);
  };

  const startEditItinerary = (item: ItineraryItem) => {
    setEditingItineraryId(item.id);
    setItineraryDraft({
      type: item.type,
      title: item.title,
      description: item.description || "",
      location: item.location || "",
      amount: maskCurrency(String((item.amount || 0) * 100)),
      visibility: item.visibility,
    });
  };

  const saveItineraryEdit = async (itemId: string) => {
    if (!editingItineraryId || editingItineraryId !== itemId || savingItinerary) return;
    const sourceItem = trip.itinerary.find((entry) => entry.id === itemId);
    if (!sourceItem) return;
    const title = itineraryDraft.title.trim();
    if (!title) return;
    const nextAmount = parseCurrencyToNumber(itineraryDraft.amount) || 0;

    setSavingItinerary(true);
    const { error } = await supabase
      .from("itinerary")
      .update({
        type: itineraryDraft.type,
        title,
        description: itineraryDraft.description.trim(),
        location: itineraryDraft.location.trim(),
        amount: nextAmount,
        visibility: itineraryDraft.visibility,
      })
      .eq("id", itemId);

    if (error) {
      setSavingItinerary(false);
      alert(getErrorMessage(error));
      return;
    }

    onTripUpdate((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((item) =>
        item.id === itemId
          ? {
              ...item,
              type: itineraryDraft.type,
              title,
              description: itineraryDraft.description.trim(),
              location: itineraryDraft.location.trim(),
              amount: nextAmount,
              visibility: itineraryDraft.visibility,
            }
          : item
      ),
    }));

    if (nextAmount > 0) {
      await upsertItineraryExpense(itemId, sourceItem, {
        title,
        amount: nextAmount,
        visibility: itineraryDraft.visibility,
      });
    } else {
      await removeItineraryExpense(itemId, sourceItem);
    }

    setSavingItinerary(false);
    setEditingItineraryId(null);
  };

  const deleteItineraryItem = async (item: ItineraryItem) => {
    const { error } = await supabase.from("itinerary").delete().eq("id", item.id);
    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    await removeItineraryExpense(item.id, item);
  };

  return (
    <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {trip.itinerary.map((item) => (
            <Card key={item.id} className="group p-0 overflow-hidden">
              {item.photo_url && <img src={item.photo_url} alt={item.title} className="w-full h-40 object-cover" />}
              <div className="p-5 flex items-start gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.type === "flight" && "bg-blue-50 text-blue-600", item.type === "bus" && "bg-orange-50 text-orange-600", item.type === "hotel" && "bg-purple-50 text-purple-600", item.type === "activity" && "bg-emerald-50 text-emerald-600")}>
                  {item.type === "flight" && <Plane size={20} />}
                  {item.type === "bus" && <Bus size={20} />}
                  {item.type === "hotel" && <Hotel size={20} />}
                  {item.type === "activity" && <Calendar size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  {editingItineraryId === item.id ? (
                    <div className="space-y-2">
                      <select
                        value={itineraryDraft.type}
                        onChange={(e) => setItineraryDraft((current) => ({ ...current, type: e.target.value as ItineraryType }))}
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                      >
                        <option value="activity">Atividade</option>
                        <option value="flight">Voo</option>
                        <option value="bus">Onibus</option>
                        <option value="hotel">Hospedagem</option>
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
                      <input
                        value={itineraryDraft.amount}
                        onChange={(e) => setItineraryDraft((current) => ({ ...current, amount: maskCurrency(e.target.value) }))}
                        placeholder="Valor"
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                      />
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
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className="font-bold truncate">{item.title}</h4>
                        <span className="text-xs text-zinc-400 whitespace-nowrap">{format(new Date(item.start_time), "dd/MM HH:mm")}</span>
                      </div>
                      <p className="text-sm text-zinc-500 line-clamp-2">{item.description}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-zinc-500">
                        <span className="truncate max-w-[150px]">{item.location || "Sem local"}</span>
                        <span className="font-medium">{formatCurrency(item.amount, settings.default_currency)}</span>
                        {item.visibility === "private" && 
                        <span className="inline-flex items-center gap-1 text-orange-600" title="Privado">
                          <Lock size={12} />
                        </span>}
                      </div>
                    </>
                  )}
                  <button onClick={() => photoInputRefs.current[item.id]?.click()} className="text-[10px] font-bold uppercase text-zinc-400 mt-3">{item.photo_url ? "Trocar foto" : "Add foto"}</button>
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
                        const photo = await fileToDataUrl(file);
                        const { error } = await supabase.from("itinerary").update({ photo_url: photo }).eq("id", item.id);
                        if (error) throw error;
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
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-zinc-700"
                  >
                    <FilePenLine size={16} />
                  </button>
                  <button
                    onClick={async () => {
                      const confirmed = window.confirm(`Remover "${item.title}" do itinerário?`);
                      if (!confirmed) return;
                      await deleteItineraryItem(item);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      
      <FloatingActionButton onClick={onOpenModal} />
    </motion.div>
  );
}
