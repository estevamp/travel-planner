import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { FilePenLine, Trash2, Lock, MapPin, LinkIcon, Paperclip, CalendarPlus, ImagePlus, X, Users } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, Idea, IdeaLink, IdeaAsset, Visibility } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";
import type { QueuedOperation } from "../../hooks/useOfflineQueue";
import { useSignedUrlCache } from "../../hooks/useSignedUrlCache";
import { useOptimisticVisibility } from "../../hooks/useOptimisticVisibility";
import { useUpdateIdea } from "../../hooks/useUpdateIdea";
import { useDeleteIdea } from "../../hooks/useDeleteIdea";

interface IdeasTabProps {
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
}

export function IdeasTab({ onOpenModal, onSetActiveTab, onTripUpdate, isOnline, enqueue }: IdeasTabProps) {
  const { trip, currentMember, isAdmin, settings, members } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { update: updateIdea } = useUpdateIdea({ enqueue, isOnline });
  const { delete: deleteIdea } = useDeleteIdea({ enqueue, isOnline });
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [copyingIdeaId, setCopyingIdeaId] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const { getSignedUrl, cachedUrls, setCachedUrl } = useSignedUrlCache(DOCS_BUCKET);
  const { toggleVisibility } = useOptimisticVisibility<Idea>("ideas", "ideas", onTripUpdate);
  const [ideaDraft, setIdeaDraft] = useState<{
    title: string;
    notes: string;
    maps_url: string;
    visibility: Visibility;
  }>({
    title: "",
    notes: "",
    maps_url: "",
    visibility: "public",
  });
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

  const ideaLinksByIdeaId = useMemo(() => {
    const map = new Map<string, IdeaLink[]>();
    for (const link of trip.idea_links || []) {
      const list = map.get(link.idea_id) || [];
      list.push(link);
      map.set(link.idea_id, list);
    }
    return map;
  }, [trip.idea_links]);

  const ideaAssetsByIdeaId = useMemo(() => {
    const map = new Map<string, IdeaAsset[]>();
    for (const asset of trip.idea_assets || []) {
      const list = map.get(asset.idea_id) || [];
      list.push(asset);
      map.set(asset.idea_id, list);
    }
    return map;
  }, [trip.idea_assets]);

  const startEditIdea = (idea: Idea) => {
    setEditingIdeaId(idea.id);
    setIdeaDraft({
      title: idea.title,
      notes: idea.notes || "",
      maps_url: idea.maps_url || "",
      visibility: idea.visibility,
    });
  };

  const saveIdeaEdit = async (ideaId: string) => {
    if (!editingIdeaId || editingIdeaId !== ideaId) return;
    const title = ideaDraft.title.trim();
    if (!title) return;
    const notes = ideaDraft.notes.trim() || null;
    const mapsUrl = ideaDraft.maps_url.trim() || null;

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      ideas: prev.ideas.map((idea) =>
        idea.id === ideaId
          ? {
              ...idea,
              title,
              notes,
              maps_url: mapsUrl,
              visibility: ideaDraft.visibility,
            }
          : idea
      ),
    }));

    const success = await updateIdea({
      ideaId,
      title,
      notes,
      maps_url: mapsUrl,
      visibility: ideaDraft.visibility,
      tripId: trip.id,
    });

    if (success) {
      setEditingIdeaId(null);
    }
  };

  const openIdeaAsset = async (asset: IdeaAsset) => {
    try {
      const signedUrl = await getSignedUrl(asset.url);
      if (!signedUrl) return;

      // If it's a photo, show in modal
      if (asset.asset_type === "photo") {
        setViewingPhotoUrl(signedUrl);
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  };

  const deleteIdeaHandler = async (idea: Idea) => {
    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      ideas: prev.ideas.filter((i) => i.id !== idea.id),
      idea_links: (prev.idea_links || []).filter((l) => l.idea_id !== idea.id),
      idea_assets: (prev.idea_assets || []).filter((a) => a.idea_id !== idea.id),
    }));
    await deleteIdea({
      ideaId: idea.id,
      title: idea.title,
      tripId: trip.id,
      isDark: settings.dark_mode,
    });
  };

  const convertIdeaToActivity = async (idea: Idea) => {
    if (!trip.id || !currentMember || copyingIdeaId || idea.is_converted) return;

    const confirmed = await confirm({
      title: 'Adicionar ao roteiro?',
      message: `Deseja transformar "${idea.title}" em uma atividade? A ideia será removida desta lista.`,
      variant: 'primary',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    setCopyingIdeaId(idea.id);
    
    const itineraryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Build description from notes and maps URL
    let description = idea.notes || "";
    if (idea.maps_url) {
      description += (description ? "\n\n" : "") + `Google Maps: ${idea.maps_url}`;
    }

    // Add links to description
    const links = ideaLinksByIdeaId.get(idea.id) || [];
    if (links.length > 0) {
      description += (description ? "\n\n" : "") + "Links:\n";
      links.forEach(link => {
        description += `- ${link.label || link.url}: ${link.url}\n`;
      });
    }

    const newItineraryItem = {
      id: itineraryId,
      trip_id: trip.id,
      created_by_member_id: currentMember.id,
      type_id: null,
      title: idea.title,
      description: description.trim(),
      location: "",
      start_time: now,
      end_time: now,
      amount: 0,
      currency: settings.default_currency,
      visibility: idea.visibility,
      photo_url: null,
    };

    // Snapshot for rollback
    const previousItinerary = trip.itinerary;
    const previousIdeas = trip.ideas;

    // Optimistic update: add to itinerary and remove from ideas
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: [...prev.itinerary, newItineraryItem],
      ideas: prev.ideas.filter((i) => i.id !== idea.id),
    }));

    const { error: itineraryError } = await supabase.from("itinerary").insert(newItineraryItem);

    if (itineraryError) {
      toast(getErrorMessage(itineraryError), 'error');
      setCopyingIdeaId(null);
      // Rollback
      onTripUpdate((prev) => ({
        ...prev,
        itinerary: previousItinerary,
        ideas: previousIdeas,
      }));
      return;
    }

    // Delete the idea (cascade in DB removes links and assets automatically)
    const { error: ideaError } = await supabase.from("ideas").delete().eq("id", idea.id);

    if (ideaError) {
      console.error("Error deleting converted idea:", ideaError);
      // We don't rollback the itinerary insert because it succeeded
    }

    setCopyingIdeaId(null);
    onSetActiveTab("itinerary");
    toast("Ideia convertida em atividade!", "success");
  };

  const handleFileUpload = async (ideaId: string, e: React.ChangeEvent<HTMLInputElement>, type: "photo" | "attachment") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${trip.id}/${currentMember?.id}/ideas/${ideaId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(filePath, file);
      if (uploadError) {
        toast(getErrorMessage(uploadError), 'error');
        continue;
      }

      const assetId = crypto.randomUUID();
      const newAsset: IdeaAsset = {
        id: assetId,
        idea_id: ideaId,
        name: file.name,
        url: filePath,
        asset_type: type,
        created_at: new Date().toISOString(),
      };

      // Optimistic update
      onTripUpdate(prev => ({
        ...prev,
        idea_assets: [...(prev.idea_assets || []), newAsset]
      }));

      const { error: dbError } = await supabase.from("idea_assets").insert({
        id: assetId,
        idea_id: ideaId,
        name: file.name,
        url: filePath,
        asset_type: type,
      });

      if (dbError) {
        toast(getErrorMessage(dbError), 'error');
        // Rollback: remove the asset that was just added optimistically
        onTripUpdate((prev) => ({
          ...prev,
          idea_assets: (prev.idea_assets || []).filter((a) => a.id !== assetId),
        }));
      }
    }
    e.target.value = "";
  };

  const handleAddLink = async (ideaId: string) => {
    const url = newLink.url.trim();
    if (!url) return;
    
    const linkId = crypto.randomUUID();
    const linkData: IdeaLink = {
      id: linkId,
      idea_id: ideaId,
      url,
      label: newLink.label.trim() || null,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    onTripUpdate(prev => ({
      ...prev,
      idea_links: [...(prev.idea_links || []), linkData]
    }));

    const { error } = await supabase.from("idea_links").insert({
      id: linkId,
      idea_id: ideaId,
      url,
      label: linkData.label,
    });

    if (error) {
      toast(getErrorMessage(error), 'error');
      // Rollback: remove the ghost link
      onTripUpdate((prev) => ({
        ...prev,
        idea_links: (prev.idea_links || []).filter((l) => l.id !== linkId),
      }));
    } else {
      setNewLink({ label: "", url: "" });
      setShowLinkForm(null);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    const confirmed = await confirm({
      title: 'Excluir link?',
      message: 'Deseja realmente excluir este link?',
      variant: 'danger',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;
    
    const linkToDelete = (trip.idea_links || []).find((l) => l.id === linkId);
    if (!linkToDelete) return;

    // Optimistic update
    onTripUpdate(prev => ({
      ...prev,
      idea_links: (prev.idea_links || []).filter(l => l.id !== linkId)
    }));

    const { error } = await supabase.from("idea_links").delete().eq("id", linkId);
    if (error) {
      toast(getErrorMessage(error), 'error');
      // Rollback: re-insert the link
      onTripUpdate((prev) => ({
        ...prev,
        idea_links: [...(prev.idea_links || []), linkToDelete],
      }));
    }
  };

  const handleDeleteAsset = async (asset: IdeaAsset) => {
    const confirmed = await confirm({
      title: 'Excluir arquivo?',
      message: `Deseja realmente excluir o arquivo "${asset.name}"?`,
      variant: 'danger',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    // Optimistic update
    onTripUpdate(prev => ({
      ...prev,
      idea_assets: (prev.idea_assets || []).filter(a => a.id !== asset.id)
    }));

    const rollback = () => {
      onTripUpdate((prev) => ({
        ...prev,
        idea_assets: [...(prev.idea_assets || []), asset],
      }));
    };

    const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove([asset.url]);
    if (storageError) {
      toast(getErrorMessage(storageError), 'error');
      rollback();
      return;
    }
    const { error: dbError } = await supabase.from("idea_assets").delete().eq("id", asset.id);
    if (dbError) {
      toast(getErrorMessage(dbError), 'error');
      rollback();
    }
  };

  return (
    <motion.div key="ideas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {trip.ideas.length === 0 && (
          <Card className="sm:col-span-2">
            <p className="text-sm text-zinc-500 text-center py-4">Nenhuma ideia cadastrada.</p>
          </Card>
        )}
        {trip.ideas.map((idea) => {
          const links = ideaLinksByIdeaId.get(idea.id) || [];
          const assets = ideaAssetsByIdeaId.get(idea.id) || [];
          const attachments = assets.filter((asset) => asset.asset_type === "attachment");
          const photos = assets.filter((asset) => asset.asset_type === "photo");
          const canManage = currentMember?.id === idea.created_by_member_id || isAdmin;
          
          return (
            <Card key={idea.id} className="space-y-2 p-4">
              {editingIdeaId === idea.id ? (
                <div className="space-y-2">
                  <div className="space-y-2">
                    <input
                      value={ideaDraft.title}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, title: e.target.value }))}
                      placeholder="Titulo"
                      className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 text-base sm:text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all"
                    />
                    <textarea
                      value={ideaDraft.notes}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, notes: e.target.value }))}
                      placeholder="Notas"
                      className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 text-base sm:text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all h-16"
                    />
                    <input
                      value={ideaDraft.maps_url}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, maps_url: e.target.value }))}
                      placeholder="URL do Google Maps"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-base sm:text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all"
                    />
                    
                    <div className="flex flex-wrap gap-2 pt-1">
                      {showLinkForm === idea.id ? (
                        <div className="w-full space-y-2 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                          <input
                            value={newLink.label}
                            onChange={(e) => setNewLink(prev => ({ ...prev, label: e.target.value }))}
                            placeholder="Nome do link (ex: Site oficial)"
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs"
                          />
                          <input
                            value={newLink.url}
                            onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                            placeholder="URL (https://...)"
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAddLink(idea.id)}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold"
                            >
                              Adicionar
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowLinkForm(null)}
                              className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLinkForm(idea.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200 transition-colors"
                        >
                          <LinkIcon size={14} />
                          Link
                        </button>
                      )}
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200 transition-colors cursor-pointer">
                        <ImagePlus size={14} />
                        Foto
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFileUpload(idea.id, e, "photo")} />
                      </label>
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200 transition-colors cursor-pointer">
                        <Paperclip size={14} />
                        Anexo
                        <input type="file" multiple className="hidden" onChange={(e) => void handleFileUpload(idea.id, e, "attachment")} />
                      </label>
                    </div>

                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveIdeaEdit(idea.id)}
                      className="flex-1 px-4 py-1.5 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold hover:opacity-90 transition-all"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdeaId(null)}
                      className="flex-1 px-4 py-1.5 rounded-xl border-2 border-zinc-200 text-sm font-bold hover:bg-zinc-50 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                          <span className="break-words">{idea.title}</span>
                        </p>
                        <button
                          onClick={() => setVisibilitySheet({
                            open: true,
                            itemId: idea.id,
                            currentVisibility: idea.visibility,
                            onConfirm: () => void toggleVisibility(idea),
                          })}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors shrink-0",
                            idea.visibility === 'public'
                              ? "bg-blue-100 text-blue-700"
                              : "bg-zinc-100 text-zinc-500"
                          )}
                        >
                          {idea.visibility === 'public' ? (
                            <><Users size={10} /> Público</>
                          ) : (
                            <><Lock size={10} /> Privado</>
                          )}
                        </button>
                      </div>
                      {editingIdeaId !== idea.id && idea.created_by_member_id && (
                        <span className={cn(
                          "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit",
                          settings.dark_mode
                            ? "bg-zinc-700 text-zinc-300"
                            : "bg-zinc-100 text-zinc-500"
                        )}>
                          👤 {getCreatorName(idea.created_by_member_id)}
                        </span>
                      )}
                      {idea.notes && <p className="text-xs text-zinc-600 mt-0.5 whitespace-pre-wrap line-clamp-2">{idea.notes}</p>}
                      {idea.maps_url && (
                        <a href={idea.maps_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 inline-flex items-center gap-1 mt-1 hover:underline">
                          <MapPin size={10} />Google Maps
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void convertIdeaToActivity(idea)}
                        disabled={copyingIdeaId === idea.id}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-200 transition-colors disabled:opacity-50"
                        aria-label="Transformar em atividade"
                        title="Transformar em atividade"
                      >
                        {copyingIdeaId === idea.id ? (
                          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CalendarPlus size={16} />
                        )}
                      </button>
                      {canManage && (
                        <>
                          {!editingIdeaId && (
                            <button
                              type="button"
                              onClick={() => startEditIdea(idea)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-700"
                              aria-label="Editar ideia"
                            >
                              <FilePenLine size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteIdeaHandler(idea)}
                            className="p-1.5 text-zinc-400 hover:text-red-500"
                            aria-label="Excluir ideia"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Photo Gallery */}
                  {photos.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-zinc-100">
                      <p className="text-xs uppercase font-semibold text-zinc-500">Fotos</p>
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((asset) => (
                          <div key={asset.id} className="relative aspect-square">
                            <button
                              type="button"
                              onClick={() => void openIdeaAsset(asset)}
                              className="w-full h-full rounded-lg border border-zinc-200 overflow-hidden bg-zinc-100 hover:opacity-90 transition-opacity"
                            >
                              <PhotoThumbnail
                                asset={asset}
                                signedUrl={cachedUrls[asset.url] || null}
                                onUrlLoad={(url) => {
                                  setCachedUrl(asset.url, url);
                                }}
                              />
                            </button>
                            {canManage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteAsset(asset);
                                }}
                                className="absolute -top-1 -right-1 p-1 bg-white rounded-full shadow-sm border border-zinc-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Links */}
                  {links.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-zinc-100">
                      <p className="text-xs uppercase font-semibold text-zinc-500">Links</p>
                      <div className="space-y-1">
                        {links.map((link) => (
                          <div key={link.id} className="flex items-center justify-between gap-2">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-sm text-blue-600 break-all hover:underline flex-1"
                            >
                              <span className="inline-flex items-center gap-1">
                                <LinkIcon size={12} className="flex-shrink-0" />
                                <span className="break-all">{link.label || link.url}</span>
                              </span>
                            </a>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteLink(link.id)}
                                className="p-1 text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-zinc-100">
                      <p className="text-xs uppercase font-semibold text-zinc-500">Anexos</p>
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((asset) => (
                          <div key={asset.id} className="relative group/asset">
                            <button
                              type="button"
                              onClick={() => void openIdeaAsset(asset)}
                              className="px-3 py-2 rounded-lg border border-zinc-200 text-xs inline-flex items-center gap-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                            >
                              <Paperclip size={12} />
                              <span className="max-w-[150px] truncate">{asset.name}</span>
                            </button>
                            {canManage && (
                              <button
                                onClick={() => void handleDeleteAsset(asset)}
                                className="absolute -top-2 -right-2 p-1 bg-white rounded-full shadow-sm border border-zinc-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
      
      <FloatingActionButton onClick={onOpenModal} />

      {/* Photo Viewer Modal */}
      {viewingPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setViewingPhotoUrl(null)}
        >
          <button
            onClick={() => setViewingPhotoUrl(null)}
            className={cn(
              "absolute top-4 right-4 p-2 rounded-full shadow-lg transition-colors",
              settings.dark_mode ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-white text-zinc-900 hover:bg-zinc-100"
            )}
          >
            <X size={24} />
          </button>
          <img
            src={viewingPhotoUrl}
            alt="Foto da ideia"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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

// Component to display photo thumbnail
function PhotoThumbnail({ asset, signedUrl, onUrlLoad }: { asset: IdeaAsset; signedUrl: string | null; onUrlLoad: (url: string) => void }) {
  const [loading, setLoading] = React.useState(!signedUrl);

  React.useEffect(() => {
    if (signedUrl) {
      setLoading(false);
      return;
    }

    const loadUrl = async () => {
      setLoading(true);
      const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(asset.url, 3600);
      if (data && !error) {
        onUrlLoad(data.signedUrl);
      }
      setLoading(false);
    };
    void loadUrl();
  }, [asset.url, signedUrl, onUrlLoad]);

  if (loading && !signedUrl) {
    return <div className="w-full h-full flex items-center justify-center bg-zinc-100">
      <div className="w-6 h-6 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!signedUrl) {
    return <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-zinc-400 text-xs">
      Erro
    </div>;
  }

  return (
    <img 
      src={signedUrl} 
      alt={asset.name} 
      className="w-full h-full object-cover"
    />
  );
}
