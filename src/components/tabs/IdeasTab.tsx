import React, { useState, useRef, useMemo } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Plus, FilePenLine, Trash2, Lock, MapPin, LinkIcon, Paperclip, CopyPlus, ImagePlus, X } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber } from "../../utils";
import { DOCS_BUCKET } from "../../constants";
import type { Trip, Idea, IdeaLink, IdeaAsset, Visibility } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";

interface IdeasTabProps {
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function IdeasTab({ onOpenModal, onSetActiveTab, onTripUpdate }: IdeasTabProps) {
  const { trip, currentMember, isAdmin, settings } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [copyingIdeaId, setCopyingIdeaId] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const signedUrlCache = useRef<Map<string, string>>(new Map());
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({});
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

    const originalIdea = trip.ideas.find((i) => i.id === ideaId);
    if (!originalIdea) return;
    
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

    const { error } = await supabase
      .from("ideas")
      .update({
        title,
        notes,
        maps_url: mapsUrl,
        visibility: ideaDraft.visibility,
      })
      .eq("id", ideaId);
    
    if (error) {
      toast(getErrorMessage(error), 'error');
      // Rollback
      onTripUpdate((prev) => ({
        ...prev,
        ideas: prev.ideas.map((idea) =>
          idea.id === ideaId ? originalIdea : idea
        ),
      }));
      return;
    }

    setEditingIdeaId(null);
  };

  const getSignedUrl = async (path: string) => {
    if (signedUrlCache.current.has(path)) {
      return signedUrlCache.current.get(path);
    }

    const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) {
      throw error || new Error("Failed to generate signed URL");
    }

    signedUrlCache.current.set(path, data.signedUrl);
    setCachedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
    return data.signedUrl;
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

  const deleteIdea = async (idea: Idea) => {
    const confirmed = await confirm({
      title: 'Remover ideia?',
      message: `Remover a ideia "${idea.title}"? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    // Snapshot for rollback
    const previousIdeas = trip.ideas;
    const previousLinks = trip.idea_links || [];
    const previousAssets = trip.idea_assets || [];

    // Optimistic update: remove idea + its links and assets from state
    const ideaAssets = ideaAssetsByIdeaId.get(idea.id) || [];
    onTripUpdate((prev) => ({
      ...prev,
      ideas: prev.ideas.filter((i) => i.id !== idea.id),
      idea_links: (prev.idea_links || []).filter((l) => l.idea_id !== idea.id),
      idea_assets: (prev.idea_assets || []).filter((a) => a.idea_id !== idea.id),
    }));

    const rollback = () => {
      onTripUpdate((prev) => ({
        ...prev,
        ideas: previousIdeas,
        idea_links: previousLinks,
        idea_assets: previousAssets,
      }));
    };

    // Phase 1: delete assets from Storage
    const paths = ideaAssets.map((a) => a.url);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove(paths);
      if (storageError) {
        toast(getErrorMessage(storageError), 'error');
        rollback();
        return;
      }
    }

    // Phase 2: delete the idea (cascade in DB removes links and assets automatically)
    const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
    if (error) {
      toast(getErrorMessage(error), 'error');
      rollback();
    }
  };

  const convertIdeaToActivity = async (idea: Idea) => {
    if (!trip.id || !currentMember || copyingIdeaId || idea.is_converted) return;
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

    // Optimistic update for both itinerary and ideas
    onTripUpdate((prev) => ({
      ...prev,
      itinerary: [...prev.itinerary, newItineraryItem],
      ideas: prev.ideas.map((i) => (i.id === idea.id ? { ...i, is_converted: true } : i)),
    }));

    const { error: itineraryError } = await supabase.from("itinerary").insert(newItineraryItem);

    if (itineraryError) {
      toast(getErrorMessage(itineraryError), 'error');
      setCopyingIdeaId(null);
      // Rollback would be complex here, but usually Supabase is reliable
      return;
    }

    const { error: ideaError } = await supabase.from("ideas").update({ is_converted: true }).eq("id", idea.id);

    if (ideaError) {
      console.error("Error updating idea status:", ideaError);
    }

    setCopyingIdeaId(null);
    onSetActiveTab("itinerary");
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
            <Card key={idea.id} className="space-y-3">
              {editingIdeaId === idea.id ? (
                <div className="space-y-3">
                  <div className="space-y-3">
                    <input
                      value={ideaDraft.title}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, title: e.target.value }))}
                      placeholder="Titulo"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all"
                    />
                    <textarea
                      value={ideaDraft.notes}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, notes: e.target.value }))}
                      placeholder="Notas"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all h-20"
                    />
                    <input
                      value={ideaDraft.maps_url}
                      onChange={(e) => setIdeaDraft((current) => ({ ...current, maps_url: e.target.value }))}
                      placeholder="URL do Google Maps"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none transition-all"
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
                      className="flex-1 px-4 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold hover:opacity-90 transition-all"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdeaId(null)}
                      className="flex-1 px-4 py-2 rounded-xl border-2 border-zinc-200 text-sm font-bold hover:bg-zinc-50 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold flex items-center gap-2 flex-wrap">
                        <span className="break-words">{idea.title}</span>
                        {idea.is_converted && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            Adicionada ao roteiro
                          </span>
                        )}
                      </p>
                      {idea.notes && <p className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap line-clamp-3">{idea.notes}</p>}
                      {idea.maps_url && (
                        <a href={idea.maps_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 inline-flex items-center gap-1 mt-2 hover:underline">
                          <MapPin size={12} />Google Maps
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {idea.is_converted ? (
                        <button
                          type="button"
                          onClick={() => onSetActiveTab("itinerary")}
                          className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          aria-label="Ver no roteiro"
                          title="Ver no roteiro"
                        >
                          <CopyPlus size={20} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void convertIdeaToActivity(idea)}
                          disabled={copyingIdeaId === idea.id}
                          className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-200 transition-colors disabled:opacity-50"
                          aria-label="Transformar em atividade"
                          title="Transformar em atividade"
                        >
                          {copyingIdeaId === idea.id ? (
                            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CopyPlus size={20} />
                          )}
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditIdea(idea)}
                            className="p-2 text-zinc-400 hover:text-zinc-700"
                            aria-label="Editar ideia"
                          >
                            <FilePenLine size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteIdea(idea)}
                            className="p-2 text-zinc-400 hover:text-red-500"
                            aria-label="Excluir ideia"
                          >
                            <Trash2 size={16} />
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
                              <PhotoThumbnail asset={asset} signedUrl={cachedUrls[asset.url] || null} onUrlLoad={(url) => {
                                signedUrlCache.current.set(asset.url, url);
                                setCachedUrls(prev => ({ ...prev, [asset.url]: url }));
                              }} />
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
