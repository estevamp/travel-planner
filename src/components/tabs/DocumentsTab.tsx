import React, { useRef } from "react";
import { motion } from "motion/react";
import { Plus, FileText, Trash2 } from "lucide-react";
import { supabase } from "../../supabase";
import { getErrorMessage } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, TripMember } from "../../types";
import { Card } from "../Card";

interface DocumentsTabProps {
  trip: Trip;
  currentMember: TripMember | null;
  tripId: string;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function DocumentsTab({ trip, currentMember, tripId, onTripUpdate }: DocumentsTabProps) {
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const deleteDocument = async (docId: string, docUrl: string) => {
    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      documents: prev.documents.filter((d) => d.id !== docId),
    }));

    const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove([docUrl]);
    if (storageError) {
      alert(getErrorMessage(storageError));
      return;
    }
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) alert(getErrorMessage(error));
  };

  return (
    <motion.div key="documents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 bg-transparent cursor-pointer" onClick={() => documentInputRef.current?.click()}>
        <Plus className="text-zinc-300 mb-2" size={32} />
        <p className="text-sm font-medium text-zinc-400">Adicionar Documento</p>
        <p className="text-xs text-zinc-300 mt-1">Privado</p>
      </Card>
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !tripId || !currentMember) return;
          try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${tripId}/${currentMember.id}/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
            if (uploadError) throw uploadError;
            const { error: insertError } = await supabase.from("documents").insert({ id: crypto.randomUUID(), trip_id: tripId, created_by_member_id: currentMember.id, name: file.name, url: path });
            if (insertError) throw insertError;
          } catch (error) {
            alert(getErrorMessage(error));
          }
          e.target.value = "";
        }}
      />

      {trip.documents.map((doc) => (
        <Card key={doc.id} className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center"><FileText size={24} /></div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold truncate">{doc.name}</h4>
            <button
              type="button"
              onClick={async () => {
                const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.url, 60);
                if (error || !data) {
                  alert(getErrorMessage(error));
                  return;
                }
                window.open(data.signedUrl, "_blank", "noopener,noreferrer");
              }}
              className="text-xs text-zinc-500"
            >
              Abrir documento
            </button>
          </div>
          <button
            type="button"
            onClick={() => void deleteDocument(doc.id, doc.url)}
            className="text-zinc-300 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        </Card>
      ))}
    </motion.div>
  );
}
