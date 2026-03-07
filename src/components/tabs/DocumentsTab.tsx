import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Plus, FileText, Trash2, Eye, Lock, Users, Pencil, Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import { getErrorMessage, resizeImage, cn } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, Visibility, DocumentItem } from "../../types";
import { Card } from "../Card";
import { DocumentViewer } from "../DocumentViewer";
import { Modal } from "../Modal";
import type { QueuedOperation } from "../../hooks/useOfflineQueue";

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
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; path: string } | null>(null);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [isSaving, setIsSaving] = useState(false);

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

  const handleUploadConfirm = async () => {
    if (!pendingFile || !tripId || !currentMember) return;
    setIsSaving(true);
    try {
      const docId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("documents").insert({
        id: docId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        name: pendingFile.file.name,
        url: pendingFile.path,
        description: description.trim() || null,
        visibility: visibility
      });
      if (insertError) throw insertError;

      onTripUpdate((prev) => ({
        ...prev,
        documents: [
          ...prev.documents,
          {
            id: docId,
            trip_id: tripId,
            created_by_member_id: currentMember.id,
            name: pendingFile.file.name,
            url: pendingFile.path,
            description: description.trim() || null,
            visibility: visibility,
            created_at: new Date().toISOString(),
          },
        ],
      }));
      setIsUploadModalOpen(false);
      setPendingFile(null);
      setDescription("");
      setVisibility("private");
      toast("Documento adicionado com sucesso!", "success");
    } catch (error) {
      toast(getErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateDoc = async () => {
    if (!editingDoc) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          description: description.trim() || null,
          visibility: visibility
        })
        .eq("id", editingDoc.id);

      if (error) throw error;

      onTripUpdate((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === editingDoc.id ? { ...d, description: description.trim() || null, visibility } : d
        ),
      }));
      setIsEditModalOpen(false);
      setEditingDoc(null);
      setDescription("");
      setVisibility("private");
      toast("Documento atualizado!", "success");
    } catch (error) {
      toast(getErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVisibility = async (doc: DocumentItem) => {
    const newVisibility = doc.visibility === "public" ? "private" : "public";
    
    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === doc.id ? { ...d, visibility: newVisibility } : d
      ),
    }));

    const { error } = await supabase
      .from("documents")
      .update({ visibility: newVisibility })
      .eq("id", doc.id);

    if (error) {
      toast(getErrorMessage(error), "error");
      // Rollback
      onTripUpdate((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === doc.id ? { ...d, visibility: doc.visibility } : d
        ),
      }));
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
            
            setPendingFile({ file, path });
            setDescription("");
            setVisibility("private");
            setIsUploadModalOpen(true);
          } catch (error) {
            toast(getErrorMessage(error), 'error');
          }
          e.target.value = "";
        }}
      />

      {trip.documents.map((doc) => (
        <Card key={doc.id} className="flex items-center gap-4 group relative">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold truncate text-sm md:text-base">
                {doc.description || doc.name}
              </h4>
              <button
                onClick={() => toggleVisibility(doc)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors shrink-0",
                  doc.visibility === 'public'
                    ? "bg-blue-100 text-blue-700"
                    : "bg-zinc-100 text-zinc-500"
                )}
              >
                {doc.visibility === 'public' ? (
                  <><Users size={10} /> Público</>
                ) : (
                  <><Lock size={10} /> Privado</>
                )}
              </button>
            </div>
            {doc.description && (
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{doc.name}</p>
            )}
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
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                setEditingDoc(doc);
                setDescription(doc.description || "");
                setVisibility(doc.visibility);
                setIsEditModalOpen(true);
              }}
              className="text-zinc-300 hover:text-blue-500 transition-colors p-1.5"
              title="Editar descrição"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => void deleteDocument(doc.id, doc.url, doc.name)}
              className="text-zinc-300 hover:text-red-500 transition-colors p-1.5"
              title="Excluir documento"
            >
              <Trash2 size={14} />
            </button>
          </div>
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

      {/* Modal de Upload/Edição */}
      <Modal
        isOpen={isUploadModalOpen || isEditModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setIsEditModalOpen(false);
          setPendingFile(null);
          setEditingDoc(null);
        }}
        title={isUploadModalOpen ? "Detalhes do Documento" : "Editar Documento"}
        isDark={isDark}
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Passaporte de João, válido até 2030"
              className={cn(
                "w-full px-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-24",
                isDark ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200 text-zinc-900"
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Visibilidade</label>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibility("private")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-medium",
                  visibility === "private"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : isDark ? "border-zinc-700 bg-zinc-800 text-zinc-400" : "border-zinc-100 bg-zinc-50 text-zinc-500"
                )}
              >
                <Lock size={18} />
                Privado 🔒
              </button>
              <button
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-medium",
                  visibility === "public"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : isDark ? "border-zinc-700 bg-zinc-800 text-zinc-400" : "border-zinc-100 bg-zinc-50 text-zinc-500"
                )}
              >
                <Users size={18} />
                Público 👥
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              {visibility === "private"
                ? "Privado = só você e cônjuge."
                : "Público = todos da viagem."}
            </p>
          </div>
          <button
            onClick={isUploadModalOpen ? handleUploadConfirm : handleUpdateDoc}
            disabled={isSaving}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {!isOnline && (
            <p className="text-xs text-amber-600 mt-1">
              📶 Upload de documentos indisponível offline.
            </p>
            )}
            {isSaving ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              isUploadModalOpen ? "Salvar Documento" : "Atualizar Documento"
            )}
          </button>
        </div>
      </Modal>

      {ConfirmDialogNode}
    </motion.div>
  );
}
