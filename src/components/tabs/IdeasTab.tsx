import React, { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import {
  FilePenLine, Trash2, Lock, MapPin, LinkIcon, Paperclip, CalendarPlus,
  ImagePlus, X, Users, MoreVertical, Camera,
} from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage } from "../../utils";
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
import { useI18n } from "../../i18n/I18nProvider";

interface IdeasTabProps {
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
}

// Paleta usada para o avatar do autor — mesmo conceito de cor determinística usado em ItineraryTab
const MEMBER_COLORS = [
  "#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6",
  "#06B6D4", "#EF4444", "#14B8A6", "#6366F1", "#D97706",
];

function getMemberColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash << 5) - hash + memberId.charCodeAt(i);
    hash = hash & hash;
  }
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

export function IdeasTab({ onOpenModal, onSetActiveTab, onTripUpdate, isOnline, enqueue }: IdeasTabProps) {
  const { trip, currentMember, isAdmin, settings, members } = useTripContext();
  const { t } = useI18n();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { update: updateIdea, isSubmitting: isUpdatingIdea } = useUpdateIdea({ enqueue, isOnline, onSuccess: undefined });
  const { deleteItem: deleteIdea } = useDeleteIdea({ enqueue, isOnline, onSuccess: undefined });
  const isDark = settings.dark_mode;
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [copyingIdeaId, setCopyingIdeaId] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const { getSignedUrl, cachedUrls, setCachedUrl } = useSignedUrlCache(DOCS_BUCKET);
  const { toggleVisibility } = useOptimisticVisibility<Idea>("ideas", "ideas", onTripUpdate);
  // Menu (⋯) por card — posicionado via fixed para não ser cortado pelo overflow-hidden do Card
  const [itemMenu, setItemMenu] = useState<{ idea: Idea; top: number; right: number } | null>(null);
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
    return member?.display_name || t("ideas.unknownCreator");
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

  // Pré-carrega a URL assinada da foto de capa (primeira foto) de cada ideia
  useEffect(() => {
    const coverPaths = trip.ideas
      .map((idea) => (ideaAssetsByIdeaId.get(idea.id) || []).find((asset) => asset.asset_type === "photo"))
      .filter((asset): asset is IdeaAsset => Boolean(asset))
      .map((asset) => asset.url);

    for (const path of coverPaths) {
      if (cachedUrls[path]) continue;
      void getSignedUrl(path).catch(() => undefined);
    }
  }, [trip.ideas, ideaAssetsByIdeaId, cachedUrls, getSignedUrl]);

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
    const confirmed = await confirm({
      title: t("ideas.deleteTitle"),
      message: t("ideas.deleteMessage", { title: idea.title }),
      variant: "danger",
      isDark: settings.dark_mode,
    });
    if (!confirmed) return;

    // Optimistic update — só executa após confirmação do usuário
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
      skipConfirm: true, // confirmação já foi feita acima
    });
  };

  const convertIdeaToActivity = async (idea: Idea) => {
    if (!trip.id || !currentMember || copyingIdeaId || idea.is_converted) return;

    const confirmed = await confirm({
      title: t("ideas.convertTitle"),
      message: t("ideas.convertMessage", { title: idea.title }),
      variant: 'default',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    setCopyingIdeaId(idea.id);

    const itineraryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Build description from notes and maps URL
    let description = idea.notes || "";
    if (idea.maps_url) {
      description += (description ? "\n\n" : "") + `${t("ideas.googleMapsLabel")}: ${idea.maps_url}`;
    }

    // Add links to description
    const links = ideaLinksByIdeaId.get(idea.id) || [];
    if (links.length > 0) {
      description += (description ? "\n\n" : "") + `${t("ideas.linksSection")}:\n`;
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
    toast(t("ideas.convertedSuccess"), "success");
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
      title: t("ideas.deleteLinkTitle"),
      message: t("ideas.deleteLinkMessage"),
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
      title: t("ideas.deleteAssetTitle"),
      message: t("ideas.deleteAssetMessage", { name: asset.name }),
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

  const fieldLabelClass = cn("block text-xs font-semibold mb-1.5", isDark ? "text-zinc-400" : "text-zinc-600");
  const fieldIconClass = cn("absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none", isDark ? "text-zinc-500" : "text-zinc-400");
  const fieldInputClass = cn(
    "w-full pl-10 pr-3 py-3 rounded-2xl border text-[15px] transition-all",
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)]",
    isDark
      ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"
  );
  const fieldTextareaClass = cn(
    "w-full px-3.5 py-3 rounded-2xl border text-[15px] transition-all resize-none",
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:border-[var(--accent-color)]",
    isDark
      ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400"
  );

  return (
    <motion.div key="ideas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6 pb-28">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {trip.ideas.length === 0 && (
          <Card className="sm:col-span-2">
            <p className="text-sm text-zinc-500 text-center py-4">{t("ideas.empty")}</p>
          </Card>
        )}
        {trip.ideas.map((idea) => {
          const links = ideaLinksByIdeaId.get(idea.id) || [];
          const assets = ideaAssetsByIdeaId.get(idea.id) || [];
          const attachments = assets.filter((asset) => asset.asset_type === "attachment");
          const photos = assets.filter((asset) => asset.asset_type === "photo");
          const coverPhoto = photos[0] ?? null;
          const extraPhotos = photos.slice(1);
          const coverSrc = coverPhoto ? cachedUrls[coverPhoto.url] || null : null;
          const canManage = currentMember?.id === idea.created_by_member_id || isAdmin;
          const isEditingThis = editingIdeaId === idea.id;

          return (
            <Card
              key={idea.id}
              onClick={isEditingThis ? undefined : () => startEditIdea(idea)}
              className={cn("group p-0 overflow-hidden transition-opacity", !isEditingThis && "cursor-pointer")}
            >
              {/* Foto de capa — mesmo conceito de banner com overlay usado em ItineraryTab */}
              {coverPhoto && (
                <div className="relative h-32 w-full">
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={idea.title}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className={cn("absolute inset-0 flex items-center justify-center", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                      <div className="w-6 h-6 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!isEditingThis ? (
                    <>
                      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 px-4 py-3">
                        <p className="text-white font-bold text-base leading-tight drop-shadow-sm break-words">
                          {idea.title}
                        </p>
                        {idea.maps_url && (
                          <a
                            href={idea.maps_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-white/85 text-xs mt-0.5 inline-flex items-center gap-1 drop-shadow-sm hover:underline"
                          >
                            <MapPin size={10} className="flex-shrink-0" />{t("ideas.googleMapsLabel")}
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white backdrop-blur-sm cursor-pointer hover:bg-black/70 transition-colors"
                        title={t("ideas.addPhoto")}
                      >
                        <Camera size={15} />
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFileUpload(idea.id, e, "photo")} />
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteAsset(coverPhoto);
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-red-600/80 transition-colors"
                        title={t("ideas.removePhoto")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {isEditingThis ? (
                    <div className="space-y-4">
                      <div>
                        <label className={fieldLabelClass}>{t("ideas.nameLabel")}</label>
                        <div className="relative">
                          <FilePenLine size={16} className={fieldIconClass} />
                          <input
                            value={ideaDraft.title}
                            onChange={(e) => setIdeaDraft((current) => ({ ...current, title: e.target.value }))}
                            placeholder={t("ideas.titlePlaceholder")}
                            className={fieldInputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelClass}>{t("ideas.notesLabel")}</label>
                        <textarea
                          value={ideaDraft.notes}
                          onChange={(e) => setIdeaDraft((current) => ({ ...current, notes: e.target.value }))}
                          placeholder={t("dashboard.notes")}
                          rows={3}
                          className={fieldTextareaClass}
                        />
                      </div>

                      <div>
                        <label className={fieldLabelClass}>{t("ideas.googleMapsLabel")}</label>
                        <div className="relative">
                          <MapPin size={16} className={fieldIconClass} />
                          <input
                            value={ideaDraft.maps_url}
                            onChange={(e) => setIdeaDraft((current) => ({ ...current, maps_url: e.target.value }))}
                            placeholder={t("ideas.googleMapsPlaceholder")}
                            className={fieldInputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelClass}>{t("ideas.visibilityLabel")}</label>
                        <div
                          className={cn(
                            "grid grid-cols-2 gap-1 rounded-2xl border p-1",
                            isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
                          )}
                        >
                          {(["public", "private"] as const).map((visibility) => {
                            const active = ideaDraft.visibility === visibility;
                            const Icon = visibility === "public" ? Users : Lock;
                            return (
                              <button
                                key={visibility}
                                type="button"
                                onClick={() => setIdeaDraft((current) => ({ ...current, visibility }))}
                                className={cn(
                                  "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors",
                                  active
                                    ? isDark
                                      ? "bg-zinc-700 text-white"
                                      : "bg-white text-zinc-900 shadow-sm"
                                    : isDark
                                    ? "text-zinc-400 hover:text-zinc-200"
                                    : "text-zinc-500 hover:text-zinc-700"
                                )}
                                aria-pressed={active}
                              >
                                <Icon size={13} />
                                {visibility === "public" ? t("common.public") : t("common.private")}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sem foto de capa ainda — dropzone no mesmo estilo do "Adicionar foto" de ItineraryTab */}
                      {!coverPhoto && (
                        <label className={cn(
                          "flex flex-col items-center justify-center gap-1.5 w-full py-6 rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
                          isDark
                            ? "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-800"
                            : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100"
                        )}>
                          <ImagePlus size={20} />
                          <span className="text-xs font-medium">{t("ideas.addPhoto")}</span>
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFileUpload(idea.id, e, "photo")} />
                        </label>
                      )}

                      {/* Fotos extras — mesmo botão de remoção sobreposto (overlay) usado na capa */}
                      {extraPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {extraPhotos.map((asset) => (
                            <div key={asset.id} className="relative aspect-square">
                              <button
                                type="button"
                                onClick={() => void openIdeaAsset(asset)}
                                className="w-full h-full rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 hover:opacity-90 transition-opacity"
                              >
                                <PhotoThumbnail
                                  asset={asset}
                                  signedUrl={cachedUrls[asset.url] || null}
                                  onUrlLoad={(url) => setCachedUrl(asset.url, url)}
                                />
                              </button>
                              <button
                                onClick={() => void handleDeleteAsset(asset)}
                                className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-red-600/80 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <label className={fieldLabelClass}>{t("ideas.linksSection")}</label>
                        <div className="space-y-2">
                          {links.map((link) => (
                            <div
                              key={link.id}
                              className={cn(
                                "flex items-center justify-between gap-2 px-3 py-2 rounded-xl border",
                                isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50"
                              )}
                            >
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 min-w-0 text-sm text-blue-500 hover:underline inline-flex items-center gap-1.5"
                              >
                                <LinkIcon size={12} className="flex-shrink-0" />
                                <span className="truncate">{link.label || link.url}</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLink(link.id)}
                                className="p-1 text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                          {showLinkForm === idea.id ? (
                            <div className={cn("space-y-2 p-3 rounded-xl border", isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-zinc-50")}>
                              <input
                                value={newLink.label}
                                onChange={(e) => setNewLink(prev => ({ ...prev, label: e.target.value }))}
                                placeholder={t("ideas.linkNamePlaceholder")}
                                className={cn(
                                  "w-full px-3 py-1.5 rounded-lg border text-xs",
                                  isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500" : "border-zinc-200 bg-white"
                                )}
                              />
                              <input
                                value={newLink.url}
                                onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                                placeholder={t("ideas.linkUrlPlaceholder")}
                                className={cn(
                                  "w-full px-3 py-1.5 rounded-lg border text-xs",
                                  isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500" : "border-zinc-200 bg-white"
                                )}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleAddLink(idea.id)}
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-bold"
                                >
                                  {t("common.add")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowLinkForm(null)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg border text-xs font-bold",
                                    isDark ? "border-zinc-700 text-zinc-300" : "border-zinc-200"
                                  )}
                                >
                                  {t("common.cancel")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowLinkForm(idea.id)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                              )}
                            >
                              <LinkIcon size={14} />
                              {t("ideas.link")}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelClass}>{t("ideas.attachmentsSection")}</label>
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((asset) => (
                            <div key={asset.id} className="relative">
                              <button
                                type="button"
                                onClick={() => void openIdeaAsset(asset)}
                                className={cn(
                                  "px-3 py-2 rounded-lg border text-xs inline-flex items-center gap-1 transition-colors",
                                  isDark ? "border-zinc-700 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-200 hover:bg-zinc-50"
                                )}
                              >
                                <Paperclip size={12} />
                                <span className="max-w-[150px] truncate">{asset.name}</span>
                              </button>
                              <button
                                onClick={() => void handleDeleteAsset(asset)}
                                className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-red-600/80 transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          <label className={cn(
                            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                            isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          )}>
                            <Paperclip size={14} />
                            {t("ideas.attachment")}
                            <input type="file" multiple className="hidden" onChange={(e) => void handleFileUpload(idea.id, e, "attachment")} />
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void convertIdeaToActivity(idea)}
                        disabled={copyingIdeaId === idea.id}
                        className={cn(
                          "flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 text-sm font-bold transition-colors disabled:opacity-50",
                          isDark
                            ? "border-emerald-900 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/70"
                            : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        )}
                      >
                        {copyingIdeaId === idea.id ? (
                          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CalendarPlus size={16} />
                        )}
                        {t("ideas.convertAction")}
                      </button>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setEditingIdeaId(null)}
                          className={cn(
                            "flex-1 py-3 rounded-2xl border text-sm font-bold transition-colors",
                            isDark ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                          )}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          onClick={() => void saveIdeaEdit(idea.id)}
                          disabled={isUpdatingIdea}
                          className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition-shadow"
                          style={{ backgroundColor: "var(--accent-color)", boxShadow: "0 8px 20px -8px var(--accent-color)" }}
                        >
                          {isUpdatingIdea ? t("ideas.saving") : t("expenses.saveChanges")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {!coverPhoto && (
                        <p className="font-semibold text-sm break-words">{idea.title}</p>
                      )}
                      {idea.notes && (
                        <p className={cn("text-xs mt-0.5 whitespace-pre-wrap line-clamp-2", isDark ? "text-zinc-400" : "text-zinc-600")}>
                          {idea.notes}
                        </p>
                      )}
                      {!coverPhoto && idea.maps_url && (
                        <a
                          href={idea.maps_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-blue-500 inline-flex items-center gap-1 mt-1 hover:underline"
                        >
                          <MapPin size={10} />{t("ideas.googleMapsLabel")}
                        </a>
                      )}

                      {/* "Público" é o padrão — só sinaliza quando privada, como em ItineraryTab */}
                      {idea.visibility === "private" && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setVisibilitySheet({
                                open: true,
                                itemId: idea.id,
                                currentVisibility: idea.visibility,
                                onConfirm: () => void toggleVisibility(idea),
                              });
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors",
                              isDark ? "bg-zinc-700 text-zinc-400 hover:bg-zinc-600" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                            )}
                          >
                            <Lock size={10} /> {t("common.private")}
                          </button>
                        </div>
                      )}

                      {extraPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {extraPhotos.map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openIdeaAsset(asset);
                              }}
                              className="relative aspect-square rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 hover:opacity-90 transition-opacity"
                            >
                              <PhotoThumbnail
                                asset={asset}
                                signedUrl={cachedUrls[asset.url] || null}
                                onUrlLoad={(url) => setCachedUrl(asset.url, url)}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {links.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {links.map((link) => (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block text-xs text-blue-500 hover:underline"
                            >
                              <span className="inline-flex items-center gap-1">
                                <LinkIcon size={11} className="flex-shrink-0" />
                                <span className="truncate">{link.label || link.url}</span>
                              </span>
                            </a>
                          ))}
                        </div>
                      )}

                      {attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {attachments.map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openIdeaAsset(asset);
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg border text-[11px] inline-flex items-center gap-1 transition-colors",
                                isDark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                              )}
                            >
                              <Paperclip size={11} />
                              <span className="max-w-[120px] truncate">{asset.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isEditingThis && (
                  <div className="self-stretch flex flex-col items-center justify-between gap-1">
                    {canManage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setItemMenu((cur) =>
                            cur?.idea.id === idea.id
                              ? null
                              : { idea, top: rect.bottom + 4, right: window.innerWidth - rect.right }
                          );
                        }}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                        )}
                        aria-label={t("common.options")}
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                    {idea.created_by_member_id && members.length > 1 && (() => {
                      const creatorName = getCreatorName(idea.created_by_member_id);
                      return (
                        <span
                          title={creatorName}
                          aria-label={creatorName}
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: getMemberColor(idea.created_by_member_id) }}
                        >
                          {(creatorName.trim()[0] ?? "?").toUpperCase()}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <FloatingActionButton onClick={onOpenModal} />

      {/* Menu de opções do card (Editar / Visibilidade / Excluir) */}
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
                startEditIdea(itemMenu.idea);
                setItemMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <FilePenLine size={15} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = itemMenu.idea;
                setItemMenu(null);
                setVisibilitySheet({
                  open: true,
                  itemId: target.id,
                  currentVisibility: target.visibility,
                  onConfirm: () => void toggleVisibility(target),
                });
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isDark ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {itemMenu.idea.visibility === "public" ? (
                <><Lock size={15} /> {t("ideas.makePrivate")}</>
              ) : (
                <><Users size={15} /> {t("ideas.makePublic")}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = itemMenu.idea;
                setItemMenu(null);
                void deleteIdeaHandler(target);
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
            alt={t("ideas.photoAlt")}
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
  const { t } = useI18n();
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
      {t("common.unexpectedError")}
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
