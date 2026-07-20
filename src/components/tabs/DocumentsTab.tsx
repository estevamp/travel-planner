import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Plus, FileText, Trash2, Eye, Lock, Users, Pencil, Loader2, MoreVertical } from "lucide-react";
import { supabase } from "../../supabase";
import { getErrorMessage, resizeImage, cn } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, Visibility, DocumentItem } from "../../types";
import { Card } from "../Card";
import { DocumentViewer } from "../DocumentViewer";
import { Modal } from "../Modal";
import { FloatingActionButton } from "../FloatingActionButton";
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";
import type { QueuedOperation } from "../../hooks/useOfflineQueue";
import { useSignedUrlCache } from "../../hooks/useSignedUrlCache";
import { useOptimisticVisibility } from "../../hooks/useOptimisticVisibility";
import { useI18n } from "../../i18n/I18nProvider";

interface DocumentsTabProps {
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
}

export interface DocumentsTabHandle {
  openAdd: () => void;
}

export const DocumentsTab = forwardRef<DocumentsTabHandle, DocumentsTabProps>(function DocumentsTab({ onTripUpdate, isOnline }, ref) {
  const { trip, currentMember, tripId, settings } = useTripContext();
  const isDark = settings.dark_mode;
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const { getSignedUrl } = useSignedUrlCache(DOCS_BUCKET);
  const { toggleVisibility } = useOptimisticVisibility<DocumentItem>(
    "documents",
    "documents",
    onTripUpdate
  );
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; url: string } | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; path: string } | null>(null);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [isSaving, setIsSaving] = useState(false);
  // Menu (⋯) por card — mesmo padrão usado em IdeasTab/ExpensesTab
  const [itemMenu, setItemMenu] = useState<{ doc: DocumentItem; top: number; right: number } | null>(null);
  const [visibilitySheet, setVisibilitySheet] = useState<{
    open: boolean;
    currentVisibility: Visibility;
    onConfirm: (() => void) | null;
  }>({ open: false, currentVisibility: "private", onConfirm: null });

  useImperativeHandle(ref, () => ({
    openAdd: () => documentInputRef.current?.click(),
  }));

  const deleteDocument = async (docId: string, docUrl: string, docName: string) => {
    const docToDelete = trip.documents.find((d) => d.id === docId);
    if (!docToDelete) return;

    const confirmed = await confirm({
      title: t("documents.deleteTitle"),
      message: t("documents.deleteMessage", { name: docName }),
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
      toast(t("documents.addedSuccess"), "success");
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
      toast(t("documents.updatedSuccess"), "success");
    } catch (error) {
      toast(getErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        className={cn(
          "flex flex-col items-center justify-center py-12 border-2 border-dashed bg-transparent cursor-pointer transition-colors",
          isDark ? "border-zinc-700 hover:border-zinc-500" : "border-zinc-200 hover:border-zinc-300"
        )}
        onClick={() => documentInputRef.current?.click()}
      >
        <Plus className={cn("mb-2", isDark ? "text-zinc-600" : "text-zinc-300")} size={32} />
        <p className={cn("text-sm font-medium", isDark ? "text-zinc-500" : "text-zinc-400")}>{t("documents.addDocument")}</p>
        <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-300")}>{t("common.private")}</p>
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

      <div className="space-y-3">
        {trip.documents.map((doc) => (
          <Card key={doc.id} className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
              <FileText size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold truncate text-sm md:text-base">
                {doc.description || doc.name}
              </h4>
              {doc.description && (
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{doc.name}</p>
              )}
              {/* "Público" é o padrão — só sinaliza quando privado, como nas demais abas */}
              {doc.visibility === "private" && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      isDark ? "bg-zinc-700 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    <Lock size={10} /> {t("common.private")}
                  </span>
                </div>
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
                  {t("documents.view")}
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
                  {t("documents.openOriginal")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setItemMenu((cur) =>
                  cur?.doc.id === doc.id ? null : { doc, top: rect.bottom + 4, right: window.innerWidth - rect.right }
                );
              }}
              className={cn(
                "p-1.5 rounded-lg transition-colors shrink-0",
                isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              )}
              aria-label={t("common.options")}
            >
              <MoreVertical size={18} />
            </button>
          </Card>
        ))}
      </div>

      {/* Menu de opções do card (Editar / Visibilidade / Excluir) — mesmo padrão de IdeasTab */}
      {itemMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setItemMenu(null)} />
          <div
            className={cn(
              "fixed z-50 w-44 rounded-xl border shadow-lg py-1 overflow-hidden",
              isDark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"
            )}
            style={{ top: itemMenu.top, right: itemMenu.right }}
          >
            <button
              type="button"
              onClick={() => {
                const doc = itemMenu.doc;
                setItemMenu(null);
                setEditingDoc(doc);
                setDescription(doc.description || "");
                setVisibility(doc.visibility);
                setIsEditModalOpen(true);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <Pencil size={15} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                const doc = itemMenu.doc;
                setItemMenu(null);
                setVisibilitySheet({
                  open: true,
                  currentVisibility: doc.visibility,
                  onConfirm: () => void toggleVisibility(doc),
                });
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {itemMenu.doc.visibility === "public" ? (
                <><Lock size={15} /> {t("documents.makePrivate")}</>
              ) : (
                <><Users size={15} /> {t("documents.makePublic")}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const doc = itemMenu.doc;
                setItemMenu(null);
                void deleteDocument(doc.id, doc.url, doc.name);
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

      <VisibilityBottomSheet
        isOpen={visibilitySheet.open}
        currentVisibility={visibilitySheet.currentVisibility}
        onConfirm={() => visibilitySheet.onConfirm?.()}
        onClose={() => setVisibilitySheet((prev) => ({ ...prev, open: false }))}
        isDark={isDark}
      />

      <FloatingActionButton onClick={() => documentInputRef.current?.click()} hideOnMobile />

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
        title={isUploadModalOpen ? t("documents.modalDetailsTitle") : t("documents.modalEditTitle")}
        isDark={isDark}
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">{t("documents.descriptionOptional")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("documents.descriptionPlaceholder")}
              className={cn(
                "w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all resize-none h-24",
                "focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)]",
                isDark ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200 text-zinc-900"
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t("documents.visibility")}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibility("private")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-medium",
                  visibility === "private"
                    ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                    : isDark ? "border-zinc-700 bg-zinc-800 text-zinc-400" : "border-zinc-100 bg-zinc-50 text-zinc-500"
                )}
              >
                <Lock size={18} />
                {t("documents.visibilityPrivate")}
              </button>
              <button
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-medium",
                  visibility === "public"
                    ? "border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                    : isDark ? "border-zinc-700 bg-zinc-800 text-zinc-400" : "border-zinc-100 bg-zinc-50 text-zinc-500"
                )}
              >
                <Users size={18} />
                {t("documents.visibilityPublic")}
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              {visibility === "private"
                ? t("documents.visibilityPrivateHint")
                : t("documents.visibilityPublicHint")}
            </p>
          </div>
          <button
            onClick={isUploadModalOpen ? handleUploadConfirm : handleUpdateDoc}
            disabled={isSaving}
            className="w-full py-4 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: "var(--accent-color)", boxShadow: "0 8px 20px -8px var(--accent-color)" }}
          >
            {!isOnline && (
            <p className="text-xs text-amber-600 mt-1">
              📶 {t("documents.offlineUploadUnavailable")}
            </p>
            )}
            {isSaving ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              isUploadModalOpen ? t("documents.saveDocument") : t("documents.updateDocument")
            )}
          </button>
        </div>
      </Modal>

      {ConfirmDialogNode}
    </div>
  );
});
