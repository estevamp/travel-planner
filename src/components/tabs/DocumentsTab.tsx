import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { Plus, FileText, Trash2, Eye } from "lucide-react";
import { supabase } from "../../supabase";
import { getErrorMessage } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, TripMember } from "../../types";
import { Card } from "../Card";
import { DocumentViewer } from "../DocumentViewer";

interface DocumentsTabProps {
  trip: Trip;
  currentMember: TripMember | null;
  tripId: string;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function DocumentsTab({ trip, currentMember, tripId, onTripUpdate }: DocumentsTabProps) {
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; url: string } | null>(null);

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
        accept=".pdf,image/png,image/jpeg,image/jpg,text/plain,.doc,.docx"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !tripId || !currentMember) return;
          try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${tripId}/${currentMember.id}/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
            if (uploadError) throw uploadError;
            const docId = crypto.randomUUID();
            const { error: insertError } = await supabase.from("documents").insert({ id: docId, trip_id: tripId, created_by_member_id: currentMember.id, name: file.name, url: path });
            if (insertError) throw insertError;

            // Optimistic update
            onTripUpdate((prev) => ({
              ...prev,
              documents: [
                ...prev.documents,
                {
                  id: docId,
                  trip_id: tripId,
                  created_by_member_id: currentMember.id,
                  name: file.name,
                  url: path,
                  created_at: new Date().toISOString(),
                },
              ],
            }));
          } catch (error) {
            alert(getErrorMessage(error));
          }
          e.target.value = "";
        }}
      />

      {trip.documents.map((doc) => (
        <Card key={doc.id} className="flex items-center gap-4 group">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold truncate text-sm md:text-base">{doc.name}</h4>
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={async () => {
                  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.url, 3600);
                  if (error || !data) {
                    alert(getErrorMessage(error));
                    return;
                  }
                  setSelectedDoc({ name: doc.name, url: data.signedUrl });
                }}
                className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
              >
                <Eye size={12} />
                Visualizar
              </button>
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
                className="text-xs text-zinc-500 hover:underline"
              >
                Abrir original
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void deleteDocument(doc.id, doc.url)}
            className="text-zinc-300 hover:text-red-500 transition-colors p-2"
            title="Excluir documento"
          >
            <Trash2 size={16} />
          </button>
        </Card>
      ))}

      {selectedDoc && (
        <DocumentViewer
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
          docName={selectedDoc.name}
          docUrl={selectedDoc.url}
        />
      )}
    </motion.div>
  );
}
