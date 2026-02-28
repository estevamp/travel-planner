import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Plus, FileText, Trash2, Eye } from "lucide-react";
import { supabase } from "../../supabase";
import { getErrorMessage, resizeImage } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip } from "../../types";
import { Card } from "../Card";
import { DocumentViewer } from "../DocumentViewer";

interface DocumentsTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function DocumentsTab({ onTripUpdate }: DocumentsTabProps) {
  const { trip, currentMember, tripId, settings } = useTripContext();
  const isDark = settings.dark_mode;
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const signedUrlCache = useRef<Map<string, string>>(new Map());
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; url: string } | null>(null);

  const getSignedUrl = async (path: string) => {
    if (signedUrlCache.current.has(path)) {
      return signedUrlCache.current.get(path);
    }

    const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) {
      throw error || new Error("Failed to generate signed URL");
    }

    signedUrlCache.current.set(path, data.signedUrl);
    return data.signedUrl;
  };

  const deleteDocument = async (docId: string, docUrl: string, docName: string) => {
    const docToDelete = trip.documents.find((d) => d.id === docId);
    if (!docToDelete) return;

    const confirmed = await confirm({
      title: 'Excluir documento?',
      message: `Deseja realmente excluir o documento "${docName}"?`,
      variant: 'danger',
      isDark
    });
    if (!confirmed) return;

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      documents: prev.documents.filter((d) => d.id !== docId),
    }));

    const rollback = () => {
      onTripUpdate((prev) => ({
        ...prev,
        documents: [...prev.documents, docToDelete],
      }));
    };

    const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove([docUrl]);
    if (storageError) {
      toast(getErrorMessage(storageError), 'error');
      rollback();
      return;
    }
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) {
      toast(getErrorMessage(error), 'error');
      rollback();
    }
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
            let fileToUpload: File | Blob = file;
            if (file.type.startsWith("image/")) {
              try {
                const resizedDataUrl = await resizeImage(file);
                const response = await fetch(resizedDataUrl);
                fileToUpload = await response.blob();
              } catch (err) {
                console.error("Error resizing document image:", err);
              }
            }

            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${tripId}/${currentMember.id}/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, fileToUpload, { contentType: file.type || undefined, upsert: false });
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
            toast(getErrorMessage(error), 'error');
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
                  try {
                    const signedUrl = await getSignedUrl(doc.url);
                    if (signedUrl) {
                      setSelectedDoc({ name: doc.name, url: signedUrl });
                    }
                  } catch (error) {
                    toast(getErrorMessage(error), 'error');
                  }
                }}
                className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
              >
                <Eye size={12} />
                Visualizar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const signedUrl = await getSignedUrl(doc.url);
                    if (signedUrl) {
                      window.open(signedUrl, "_blank", "noopener,noreferrer");
                    }
                  } catch (error) {
                    toast(getErrorMessage(error), 'error');
                  }
                }}
                className="text-xs text-zinc-500 hover:underline"
              >
                Abrir original
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void deleteDocument(doc.id, doc.url, doc.name)}
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
          isDark={isDark}
        />
      )}
      {ConfirmDialogNode}
    </motion.div>
  );
}
