import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Bus, Calendar, DollarSign, FilePenLine, FileText, Hotel, LayoutDashboard, Lightbulb, Link as LinkIcon, Lock, LogOut, MapPin, Moon, Palette, Paperclip, Plane, Plus, Settings, Shield, Sun, Trash2, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { supabase } from "./supabase";
import {
  cn,
  getErrorMessage,
  formatCurrency,
  fileToDataUrl,
  maskCurrency,
  parseCurrencyToNumber,
} from "./utils";
import { getThemeStyles } from "./utils/theme";
import { DOCS_BUCKET, THEME_PALETTES } from "./constants";
import type {
  UserSettings,
  TripBudget,
  ItineraryItem,
  Expense,
  ExpenseCategory,
  DocumentItem,
  Idea,
  IdeaLink,
  IdeaAsset,
  TripMember,
  TripInvite,
  Trip,
  TripSummary,
  ItineraryType,
  Visibility,
} from "./types";
import { Card } from "./components/Card";
import { SidebarItem } from "./components/SidebarItem";
import { AuthLanding } from "./components/AuthLanding";
import { LandingPage } from "./components/LandingPage";
import { InvitePage } from "./components/InvitePage";
import { ProtectedRoute } from "./components/ProtectedRoute";

const DEFAULT_SETTINGS: UserSettings = {
  theme_palette: "default",
  dark_mode: false,
  default_currency: "BRL",
  spouse_user_id: null,
};

function TripDashboard({ session, settings, onSettingsChange }: { session: Session; settings: UserSettings; onSettingsChange: (next: UserSettings) => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [activeTab, setActiveTab] = useState<"itinerary" | "expenses" | "ideas" | "documents" | "people" | "settings">("itinerary");
  const [loading, setLoading] = useState(true);
  const [updatingTrip, setUpdatingTrip] = useState(false);
  const [editTripName, setEditTripName] = useState("");
  const [editTripDestination, setEditTripDestination] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selfSpouseUserId, setSelfSpouseUserId] = useState("");
  const [editingItineraryId, setEditingItineraryId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingItinerary, setSavingItinerary] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingTripFromSidebar, setCreatingTripFromSidebar] = useState(false);
  const [tripBudget, setTripBudget] = useState<TripBudget | null>(null);
  const [budgetOwnerUserId, setBudgetOwnerUserId] = useState<string>("");
  const [spouseByUserId, setSpouseByUserId] = useState<Map<string, string | null>>(new Map());
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(settings);
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
  const [expenseDraft, setExpenseDraft] = useState<{
    description: string;
    category_id: string;
    amount: string;
    visibility: Visibility;
  }>({
    description: "",
    category_id: "",
    amount: "0",
    visibility: "public",
  });
  const [ideaLinksDraft, setIdeaLinksDraft] = useState<string[]>([""]);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [ideaDraft, setIdeaDraft] = useState<{
    title: string;
    maps_url: string;
    estimated_amount: string;
    visibility: Visibility;
  }>({
    title: "",
    maps_url: "",
    estimated_amount: "0",
    visibility: "public",
  });
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const ideaAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const ideaPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const settingsAutosaveReadyRef = useRef(false);
  const spouseAutosaveReadyRef = useRef(false);
  const budgetAutosaveReadyRef = useRef(false);
  const tripAutosaveReadyRef = useRef(false);

  const currentMember = useMemo(() => members.find((member) => member.user_id === session.user.id) || null, [members, session.user.id]);
  const isAdmin = currentMember?.role === "admin";
  const memberByUserId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const themedStyles = useMemo(() => getThemeStyles(settings), [settings]);
  const ideaLinksByIdeaId = useMemo(() => {
    const map = new Map<string, IdeaLink[]>();
    for (const link of trip?.idea_links || []) {
      const list = map.get(link.idea_id) || [];
      list.push(link);
      map.set(link.idea_id, list);
    }
    return map;
  }, [trip?.idea_links]);
  const ideaAssetsByIdeaId = useMemo(() => {
    const map = new Map<string, IdeaAsset[]>();
    for (const asset of trip?.idea_assets || []) {
      const list = map.get(asset.idea_id) || [];
      list.push(asset);
      map.set(asset.idea_id, list);
    }
    return map;
  }, [trip?.idea_assets]);

  const loadTripOptions = async () => {
    const { data, error } = await supabase.from("trips").select("id,name,destination,created_at").order("created_at", { ascending: false });
    if (error) {
      setTripOptions([]);
      return;
    }
    setTripOptions((data || []) as TripSummary[]);
  };

  const createTripFromSidebar = async () => {
    if (creatingTripFromSidebar) return;
    const name = window.prompt("Nome da viagem:");
    if (!name?.trim()) return;
    const destination = window.prompt("Destino da viagem:");
    if (!destination?.trim()) return;

    setCreatingTripFromSidebar(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc("create_trip_with_admin", {
      p_name: name.trim(),
      p_destination: destination.trim(),
      p_start: now,
      p_end: now,
    });
    setCreatingTripFromSidebar(false);

    if (error || !data) {
      alert(getErrorMessage(error));
      return;
    }

    await loadTripOptions();
    navigate(`/trip/${data}`);
  };

  const loadTrip = async (tripId: string) => {
    setLoading(true);
    const [tripRes, membersRes, itineraryRes, expensesRes, docsRes, ideasRes, categoriesRes] = await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase.from("trip_members").select("id,trip_id,user_id,role,display_name").eq("trip_id", tripId),
      supabase.from("itinerary").select("*").eq("trip_id", tripId).order("start_time", { ascending: true }),
      supabase.from("expenses").select("*").eq("trip_id", tripId).order("date", { ascending: true }),
      supabase.from("documents").select("*").eq("trip_id", tripId),
      supabase.from("ideas").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
      supabase.from("expense_categories").select("*").order("name", { ascending: true }),
    ]);

    if (tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error || ideasRes.error || categoriesRes.error || !tripRes.data) {
      console.error(tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error || ideasRes.error || categoriesRes.error);
      setTrip(null);
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    const nextMembers = (membersRes.data || []) as TripMember[];
    setMembers(nextMembers);
    const userIds = nextMembers.map((member) => member.user_id);
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase.from("profiles").select("user_id,spouse_user_id").in("user_id", userIds);
      if (profileError) {
        console.error(profileError);
        setSpouseByUserId(new Map());
      } else {
        const entries = new Map<string, string | null>();
        (profileRows || []).forEach((row) => entries.set(row.user_id as string, (row.spouse_user_id as string | null) || null));
        setSpouseByUserId(entries);
      }
    } else {
      setSpouseByUserId(new Map());
    }

    const me = nextMembers.find((member) => member.user_id === session.user.id);
    if (!me) {
      setTrip(null);
      setInvites([]);
      setLoading(false);
      return;
    }

    if (me.role === "admin") {
      const { data, error } = await supabase.from("trip_invites").select("id,email,token,accepted_at,created_at").eq("trip_id", tripId).order("created_at", { ascending: false });
      if (error) {
        setInvites([]);
      } else {
        setInvites((data || []) as TripInvite[]);
      }
    } else {
      setInvites([]);
    }

    const ideaIds = (ideasRes.data || []).map((idea) => idea.id as string);
    let ideaLinksData: IdeaLink[] = [];
    let ideaAssetsData: IdeaAsset[] = [];
    if (ideaIds.length > 0) {
      const [ideaLinksRes, ideaAssetsRes] = await Promise.all([
        supabase.from("idea_links").select("*").in("idea_id", ideaIds),
        supabase.from("idea_assets").select("*").in("idea_id", ideaIds),
      ]);
      if (ideaLinksRes.error || ideaAssetsRes.error) {
        console.error(ideaLinksRes.error || ideaAssetsRes.error);
        setTrip(null);
        setMembers([]);
        setInvites([]);
        setLoading(false);
        return;
      }
      ideaLinksData = (ideaLinksRes.data || []) as IdeaLink[];
      ideaAssetsData = (ideaAssetsRes.data || []) as IdeaAsset[];
    }

    const nextCategories = (categoriesRes.data || []) as ExpenseCategory[];
    const categoryMap = new Map(nextCategories.map(c => [c.id, c]));

    setTrip({
      ...(tripRes.data as Omit<Trip, "itinerary" | "expenses" | "documents" | "ideas" | "idea_links" | "idea_assets">),
      itinerary: (itineraryRes.data || []).map((item) => ({ ...item, amount: Number(item.amount) || 0 })) as ItineraryItem[],
      expenses: (expensesRes.data || []).map((item) => ({
        ...item,
        amount: Number(item.amount) || 0,
        category: item.category_id ? categoryMap.get(item.category_id) : null
      })) as Expense[],
      documents: (docsRes.data || []) as DocumentItem[],
      ideas: (ideasRes.data || []).map((item) => ({ ...item, estimated_amount: Number(item.estimated_amount) || 0 })) as Idea[],
      idea_links: ideaLinksData,
      idea_assets: ideaAssetsData,
    });

    setCategories(nextCategories);
    setLoading(false);
  };

  useEffect(() => {
    void loadTripOptions();
  }, []);

  useEffect(() => {
    if (!id) return;
    void loadTrip(id);
    void loadTripBudget(id);
    const channel = supabase
      .channel(`trip-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_links" }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_assets" }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${id}` }, () => void loadTrip(id))
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_budgets", filter: `trip_id=eq.${id}` }, () => void loadTripBudget(id))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    setEditTripName(trip?.name || "");
    setEditTripDestination(trip?.destination || "");
  }, [trip?.id, trip?.name, trip?.destination]);

  useEffect(() => {
    setSelfSpouseUserId(settings.spouse_user_id || "");
    spouseAutosaveReadyRef.current = false;
  }, [settings.spouse_user_id]);

  useEffect(() => {
    setSettingsDraft(settings);
    settingsAutosaveReadyRef.current = false;
  }, [settings]);

  useEffect(() => {
    if (!settingsAutosaveReadyRef.current) {
      settingsAutosaveReadyRef.current = true;
      return;
    }
    const hasChanges =
      settingsDraft.theme_palette !== settings.theme_palette ||
      settingsDraft.dark_mode !== settings.dark_mode ||
      settingsDraft.default_currency !== settings.default_currency;
    if (!hasChanges) return;

    const timeout = setTimeout(async () => {
      if (savingSettings) return;
      setSavingSettings(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          theme_palette: settingsDraft.theme_palette,
          dark_mode: settingsDraft.dark_mode,
          default_currency: settingsDraft.default_currency,
        })
        .eq("user_id", session.user.id);
      setSavingSettings(false);
      if (error) {
        alert(getErrorMessage(error));
        return;
      }
      onSettingsChange({ ...settingsDraft });
    }, 500);

    return () => clearTimeout(timeout);
  }, [settingsDraft, settings.theme_palette, settings.dark_mode, settings.default_currency, session.user.id, onSettingsChange, savingSettings]);

  useEffect(() => {
    if (!currentMember) return;
    if (!spouseAutosaveReadyRef.current) {
      spouseAutosaveReadyRef.current = true;
      return;
    }
    if ((settings.spouse_user_id || "") === selfSpouseUserId) return;

    const timeout = setTimeout(async () => {
      await setGlobalSpouse(selfSpouseUserId || null);
      if (id) await loadTripBudget(id);
    }, 500);

    return () => clearTimeout(timeout);
  }, [selfSpouseUserId, settings.spouse_user_id, currentMember, id]);

  useEffect(() => {
    if (!id || !tripBudget) return;
    if (!budgetAutosaveReadyRef.current) {
      budgetAutosaveReadyRef.current = true;
      return;
    }

    const timeout = setTimeout(async () => {
      await saveTripBudget();
    }, 500);

    return () => clearTimeout(timeout);
  }, [tripBudget?.budget_limit, id]);

  useEffect(() => {
    if (!id || !trip || !isAdmin) return;
    if (!tripAutosaveReadyRef.current) {
      tripAutosaveReadyRef.current = true;
      return;
    }

    const name = editTripName.trim();
    const destination = editTripDestination.trim();
    if (!name || !destination) return;
    if (name === trip.name && destination === trip.destination) return;

    const timeout = setTimeout(async () => {
      if (updatingTrip) return;
      setUpdatingTrip(true);
      const { error } = await supabase.from("trips").update({ name, destination }).eq("id", id);
      setUpdatingTrip(false);
      if (error) {
        alert(getErrorMessage(error));
        return;
      }
      await Promise.all([loadTrip(id), loadTripOptions()]);
    }, 500);

    return () => clearTimeout(timeout);
  }, [id, trip, isAdmin, editTripName, editTripDestination, updatingTrip]);

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

  const createItinerary = async (form: FormData) => {
    if (!id || !currentMember) return;
    const itineraryId = crypto.randomUUID();
    const title = ((form.get("title") as string) || "").trim() || "Item do itinerário";
    const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
    const visibility: Visibility = form.get("is_private") === "on" ? "private" : "public";
    const now = new Date().toISOString();

    const { error } = await supabase.from("itinerary").insert({
      id: itineraryId,
      trip_id: id,
      created_by_member_id: currentMember.id,
      type: form.get("type") as ItineraryType,
      title,
      description: (form.get("description") as string) || "",
      location: (form.get("location") as string) || "",
      start_time: now,
      end_time: now,
      amount,
      visibility,
      photo_url: null,
    });

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    if (amount > 0) {
      const { error: expError } = await supabase.from("expenses").insert({
        id: crypto.randomUUID(),
        trip_id: id,
        created_by_member_id: currentMember.id,
        itinerary_item_id: itineraryId,
        description: title,
        amount,
        currency: settings.default_currency,
        visibility,
        date: new Date().toISOString().split("T")[0],
      });
      if (expError) console.error(expError);
    }
  };

  const createExpense = async (form: FormData) => {
    if (!id || !currentMember) return;
    const visibility: Visibility = form.get("is_private") === "on" ? "private" : "public";
    const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
    const { error } = await supabase.from("expenses").insert({
      id: crypto.randomUUID(),
      trip_id: id,
      created_by_member_id: currentMember.id,
      description: (form.get("description") as string) || "Despesa",
      amount,
      currency: settings.default_currency,
      category_id: (form.get("category_id") as string) || null,
      visibility,
      date: new Date().toISOString().split("T")[0],
    });
    if (error) alert(getErrorMessage(error));
  };

  const createIdea = async (form: FormData) => {
    if (!id || !currentMember) return;
    const title = ((form.get("title") as string) || "").trim();
    if (!title) return;
    const visibility: Visibility = form.get("is_private") === "on" ? "private" : "public";
    const estimatedAmountRaw = (form.get("estimated_amount") as string) || "";
    const estimatedAmount = estimatedAmountRaw ? Math.max(0, parseFloat(estimatedAmountRaw) || 0) : 0;
    const mapsUrl = ((form.get("maps_url") as string) || "").trim() || null;
    const links = ideaLinksDraft.map((link) => link.trim()).filter(Boolean);
    const attachmentFiles = Array.from((ideaAttachmentInputRef.current?.files || []) as FileList);
    const photoFiles = Array.from((ideaPhotoInputRef.current?.files || []) as FileList);
    const ideaId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    let ideaInserted = false;

    try {
      const newIdea: Idea = {
        id: ideaId,
        trip_id: id,
        created_by_member_id: currentMember.id,
        title,
        maps_url: mapsUrl,
        estimated_amount: estimatedAmount,
        visibility,
        created_at: new Date().toISOString(),
      };

      const { error: ideaError } = await supabase.from("ideas").insert(newIdea);
      if (ideaError) throw ideaError;
      ideaInserted = true;

      // Update local state immediately
      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ideas: [newIdea, ...prev.ideas],
        };
      });

      if (links.length > 0) {
        const { error: linksError } = await supabase.from("idea_links").insert(
          links.map((url) => ({
            id: crypto.randomUUID(),
            idea_id: ideaId,
            label: null,
            url,
          })),
        );
        if (linksError) throw linksError;
      }

      const nextAssets: Array<{ id: string; idea_id: string; name: string; url: string; asset_type: "attachment" | "photo" }> = [];
      const allFiles: Array<{ file: File; type: "attachment" | "photo" }> = [
        ...attachmentFiles.map((file) => ({ file, type: "attachment" as const })),
        ...photoFiles.map((file) => ({ file, type: "photo" as const })),
      ];
      for (const item of allFiles) {
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `ideas/${id}/${currentMember.id}/${ideaId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, item.file, { contentType: item.file.type || undefined, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        nextAssets.push({ id: crypto.randomUUID(), idea_id: ideaId, name: item.file.name, url: path, asset_type: item.type });
      }
      if (nextAssets.length > 0) {
        const { error: assetsError } = await supabase.from("idea_assets").insert(nextAssets);
        if (assetsError) throw assetsError;
      }

      setIdeaLinksDraft([""]);
      if (ideaAttachmentInputRef.current) ideaAttachmentInputRef.current.value = "";
      if (ideaPhotoInputRef.current) ideaPhotoInputRef.current.value = "";
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(DOCS_BUCKET).remove(uploadedPaths);
        if (cleanupError) console.error(cleanupError);
      }
      if (ideaInserted) {
        const { error: cleanupIdeaError } = await supabase.from("ideas").delete().eq("id", ideaId);
        if (cleanupIdeaError) console.error(cleanupIdeaError);
      }
      alert(getErrorMessage(error));
    }
  };

  const startEditIdea = (idea: Idea) => {
    setEditingIdeaId(idea.id);
    setIdeaDraft({
      title: idea.title,
      maps_url: idea.maps_url || "",
      estimated_amount: String(idea.estimated_amount || 0),
      visibility: idea.visibility,
    });
  };

  const saveIdeaEdit = async (ideaId: string) => {
    if (!editingIdeaId || editingIdeaId !== ideaId) return;
    const title = ideaDraft.title.trim();
    if (!title) return;
    const estimatedAmount = ideaDraft.estimated_amount ? Math.max(0, parseFloat(ideaDraft.estimated_amount) || 0) : 0;
    const mapsUrl = ideaDraft.maps_url.trim() || null;
    
    const { error } = await supabase
      .from("ideas")
      .update({
        title,
        maps_url: mapsUrl,
        estimated_amount: estimatedAmount,
        visibility: ideaDraft.visibility,
      })
      .eq("id", ideaId);
    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    // Update local state immediately
    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ideas: prev.ideas.map((idea) =>
          idea.id === ideaId
            ? {
                ...idea,
                title,
                maps_url: mapsUrl,
                estimated_amount: estimatedAmount,
                visibility: ideaDraft.visibility,
              }
            : idea
        ),
      };
    });

    setEditingIdeaId(null);
  };

  const openIdeaAsset = async (asset: IdeaAsset) => {
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(asset.url, 60);
    if (error || !data) {
      alert(getErrorMessage(error));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deleteIdea = async (idea: Idea) => {
    const assets = ideaAssetsByIdeaId.get(idea.id) || [];
    const paths = assets.map((asset) => asset.url);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove(paths);
      if (storageError) {
        alert(getErrorMessage(storageError));
        return;
      }
    }
    const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
    if (error) alert(getErrorMessage(error));
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
    if (!id || !editingItineraryId || editingItineraryId !== itemId || savingItinerary) return;
    const sourceItem = trip?.itinerary.find((entry) => entry.id === itemId);
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

    // Update local state immediately to reflect changes
    setTrip((prev) => {
      if (!prev) return prev;
      return {
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
      };
    });

    if (nextAmount > 0) {
      await upsertItineraryExpense(itemId, sourceItem, {
        title,
        amount: nextAmount,
        visibility: itineraryDraft.visibility,
      });
      
      // Update local expense state immediately
      setTrip((prev) => {
        if (!prev) return prev;
        const linkedExpense = prev.expenses.find((exp) => exp.itinerary_item_id === itemId);
        
        if (linkedExpense) {
          // Update existing linked expense
          return {
            ...prev,
            expenses: prev.expenses.map((exp) =>
              exp.id === linkedExpense.id
                ? {
                    ...exp,
                    description: title,
                    amount: nextAmount,
                    visibility: itineraryDraft.visibility,
                  }
                : exp
            ),
          };
        } else {
          // Check for legacy expense (same title, same creator, no itinerary_item_id)
          const legacyExpense = prev.expenses.find(
            (exp) =>
              exp.created_by_member_id === sourceItem.created_by_member_id &&
              exp.description === sourceItem.title &&
              !exp.itinerary_item_id
          );
          
          if (legacyExpense) {
            // Update legacy expense
            return {
              ...prev,
              expenses: prev.expenses.map((exp) =>
                exp.id === legacyExpense.id
                  ? {
                      ...exp,
                      description: title,
                      amount: nextAmount,
                      visibility: itineraryDraft.visibility,
                      itinerary_item_id: itemId,
                    }
                  : exp
              ),
            };
          } else {
            // Add new expense to local state
            return {
              ...prev,
              expenses: [
                ...prev.expenses,
                {
                  id: crypto.randomUUID(),
                  trip_id: sourceItem.trip_id,
                  created_by_member_id: sourceItem.created_by_member_id,
                  itinerary_item_id: itemId,
                  description: title,
                  amount: nextAmount,
                  currency: settings.default_currency,
                  visibility: itineraryDraft.visibility,
                  date: new Date().toISOString().split("T")[0],
                  category_id: null,
                  category: null,
                },
              ].sort((a, b) => a.date.localeCompare(b.date)),
            };
          }
        }
      });
    } else {
      await removeItineraryExpense(itemId, sourceItem);
      
      // Remove expense from local state immediately
      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          expenses: prev.expenses.filter(
            (exp) =>
              exp.itinerary_item_id !== itemId &&
              !(
                exp.created_by_member_id === sourceItem.created_by_member_id &&
                exp.description === sourceItem.title &&
                !exp.itinerary_item_id
              )
          ),
        };
      });
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

  const startEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setExpenseDraft({
      description: expense.description,
      category_id: expense.category_id || "",
      amount: maskCurrency(String((expense.amount || 0) * 100)),
      visibility: expense.visibility,
    });
  };

  const saveExpenseEdit = async (expenseId: string) => {
    if (!id || !editingExpenseId || editingExpenseId !== expenseId || savingExpense) return;
    const description = expenseDraft.description.trim();
    if (!description) return;

    setSavingExpense(true);
    const { error } = await supabase
      .from("expenses")
      .update({
        description,
        category_id: expenseDraft.category_id || null,
        amount: parseCurrencyToNumber(expenseDraft.amount) || 0,
        visibility: expenseDraft.visibility,
      })
      .eq("id", expenseId);
    setSavingExpense(false);

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    setEditingExpenseId(null);
  };

  const createInvite = async () => {
    if (!id) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    const firstTry = await supabase.rpc("create_trip_invite", { p_trip_id: id, p_email: email });
    let inviteToken = firstTry.data as string | null;
    let inviteError = firstTry.error;

    if (!inviteToken && inviteError?.code === "PGRST202") {
      const secondTry = await supabase.rpc("create_trip_invite", { trip_id: id, email });
      inviteToken = secondTry.data as string | null;
      inviteError = secondTry.error;
    }

    if (!inviteToken || inviteError) {
      if (inviteError?.code === "PGRST202") {
        alert('RPC create_trip_invite nao encontrada no Supabase. Execute o schema SQL atualizado (supabase/schema.sql) no projeto remoto.');
        return;
      }
      alert(getErrorMessage(inviteError));
      return;
    }

    const link = `${window.location.origin}/invite/${inviteToken}`;
    setGeneratedLink(link);
    setInviteEmail("");
    await navigator.clipboard.writeText(link);
    await loadTrip(id);
    alert("Link copiado.");
  };

  const setGlobalSpouse = async (spouseUserId: string | null) => {
    const { error } = await supabase.rpc("set_global_spouse", {
      p_spouse_user_id: spouseUserId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    onSettingsChange({ ...settings, spouse_user_id: spouseUserId });
    setSelfSpouseUserId(spouseUserId || "");
    setSpouseByUserId((current) => {
      const next = new Map(current);
      next.set(session.user.id, spouseUserId || null);
      return next;
    });
  };

  const loadTripBudget = async (tripId: string) => {
    const ownerRes = await supabase.rpc("budget_owner_user_id", { p_trip_id: tripId, p_user_id: session.user.id });
    const owner = (ownerRes.data as string | null) || session.user.id;
    if (ownerRes.error) {
      console.error(ownerRes.error);
      setBudgetOwnerUserId(session.user.id);
      setTripBudget(null);
      return;
    }
    setBudgetOwnerUserId(owner);

    const { data, error } = await supabase
      .from("trip_budgets")
      .select("id,trip_id,owner_user_id,budget_limit")
      .eq("trip_id", tripId)
      .eq("owner_user_id", owner)
      .maybeSingle();

    if (error) {
      console.error(error);
      setTripBudget(null);
      return;
    }

    if (!data) {
      setTripBudget(null);
      return;
    }

    const budget = data as TripBudget;
    setTripBudget({ ...budget, budget_limit: Number(budget.budget_limit) || 0 });
    setSettingsDraft((prev) => ({ ...prev, budget_limit_masked: maskCurrency(String((Number(budget.budget_limit) || 0) * 100)) }));
  };

  const saveTripBudget = async () => {
    if (!id) return;
    const safeBudget = Math.max(0, Number((tripBudget?.budget_limit ?? 0)) || 0);
    setSavingSettings(true);
    const { data, error } = await supabase.rpc("upsert_trip_budget", {
      p_trip_id: id,
      p_budget_limit: safeBudget,
    });
    setSavingSettings(false);

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    if (data) {
      const budget = data as TripBudget;
      setTripBudget({ ...budget, budget_limit: Number(budget.budget_limit) || 0 });
      setBudgetOwnerUserId(budget.owner_user_id);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    if (!id) return;
    const { error } = await supabase.rpc("cancel_trip_invite", {
      p_trip_id: id,
      p_invite_id: inviteId,
    });
    if (error) {
      alert(getErrorMessage(error));
      return;
    }
    await loadTrip(id);
  };

  const deleteCurrentTrip = async () => {
    if (!id || !trip || !isAdmin || updatingTrip) return;
    const confirmed = window.confirm(`Excluir a viagem "${trip.name}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

    setUpdatingTrip(true);
    const { error } = await supabase.from("trips").delete().eq("id", id);
    setUpdatingTrip(false);

    if (error) {
      alert(getErrorMessage(error));
      return;
    }

    await loadTripOptions();
    navigate("/");
  };

  const expensesTotal = useMemo(
    () => (trip ? trip.expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0) : 0),
    [trip],
  );
  const budgetLimit = Math.max(0, Number(tripBudget?.budget_limit) || 0);
  const budgetProgress = budgetLimit > 0 ? Math.min((expensesTotal / budgetLimit) * 100, 100) : 0;
  const budgetRemaining = budgetLimit - expensesTotal;
  const isOverBudget = budgetLimit > 0 && expensesTotal > budgetLimit;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem nao encontrada ou sem permissao.</div>;

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-x-hidden" style={themedStyles}>
      <aside className="w-64 border-r p-6 hidden md:flex flex-col flex-shrink-0 gap-8 bg-[var(--sidebar-bg)] border-[var(--sidebar-border)] text-[var(--sidebar-text)]">
        <button type="button" onClick={() => setActiveTab("itinerary")} className="flex items-center gap-2 px-2 text-left">
          <Plane size={18} />
          <span className="font-bold text-xl">Voyage</span>
        </button>
        <nav className="space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Itinerário" active={activeTab === "itinerary"} onClick={() => setActiveTab("itinerary")} />
          <SidebarItem icon={DollarSign} label="Despesas" active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")} />
          <SidebarItem icon={Lightbulb} label="Ideias" active={activeTab === "ideas"} onClick={() => setActiveTab("ideas")} />
          <SidebarItem icon={FileText} label="Documentos" active={activeTab === "documents"} onClick={() => setActiveTab("documents")} />
          <SidebarItem icon={Users} label="Pessoas" active={activeTab === "people"} onClick={() => setActiveTab("people")} />
          <SidebarItem icon={Settings} label="Configurações" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </nav>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs uppercase font-bold opacity-70 mb-2 px-1">Minhas viagens</p>
          <div className="space-y-2 overflow-y-auto pr-1">
            {tripOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => navigate(`/trip/${option.id}`)}
                className={cn("w-full text-left rounded-xl border px-3 py-2", option.id === id ? "bg-[var(--sidebar-hover)] border-[var(--sidebar-active-bg)]" : "border-[var(--sidebar-border)] hover:bg-[var(--sidebar-hover)]")}
              >
                <p className="text-sm font-semibold truncate">{option.name}</p>
                <p className="text-xs opacity-80 truncate">{option.destination || "Sem destino"}</p>
              </button>
            ))}
            {tripOptions.length === 0 && <p className="text-xs opacity-70 px-1">Nenhuma viagem.</p>}
          </div>
          <button
            type="button"
            onClick={() => void createTripFromSidebar()}
            disabled={creatingTripFromSidebar}
            className="mt-3 w-full px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center justify-center gap-2 text-sm hover:bg-[var(--sidebar-hover)] disabled:opacity-60"
          >
            <Plus size={14} />
            {creatingTripFromSidebar ? "Criando..." : "Adicionar viagem"}
          </button>
        </div>
        <button onClick={() => void supabase.auth.signOut()} className="px-3 py-2 rounded-xl border border-[var(--sidebar-border)] text-[var(--sidebar-text)] flex items-center gap-2 justify-center hover:bg-[var(--sidebar-hover)]"><LogOut size={16} />Sair</button>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-4 pb-24 md:p-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div className="min-w-0">
            <h2 className="text-3xl md:text-4xl font-bold truncate bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/70 bg-clip-text text-transparent">{trip.name}</h2>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm md:text-base">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <MapPin size={14} className="text-white" />
              </div>
              <span className="truncate font-medium">{trip.destination}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="px-4 py-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-xs font-bold uppercase flex items-center gap-2 shadow-lg">
                <Shield size={14} />
                Admin
              </div>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "itinerary" && (
            <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {trip.itinerary.map((item) => (
                    <Card key={item.id} className="group p-0 overflow-hidden">
                      {item.photo_url && <img src={item.photo_url} alt={item.title} className="w-full h-40 object-cover" />}
                      <div className="p-5 flex items-start gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.type === "flight" && "bg-blue-50 text-blue-600", item.type === "bus" && "bg-orange-50 text-orange-600", item.type === "hotel" && "bg-purple-50 text-purple-600", item.type === "activity" && "bg-emerald-50 text-emerald-600")}>{item.type === "flight" && <Plane size={20} />}{item.type === "bus" && <Bus size={20} />}{item.type === "hotel" && <Hotel size={20} />}{item.type === "activity" && <Calendar size={20} />}</div>
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

                <Card>
                  <h3 className="font-bold mb-4">Adicionar ao itinerário</h3>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await createItinerary(new FormData(e.currentTarget));
                      (e.target as HTMLFormElement).reset();
                    }}
                  >
                    <select name="type" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"><option value="activity">Atividade</option><option value="flight">Voo</option><option value="bus">Onibus</option><option value="hotel">Hospedagem</option></select>
                    <input name="title" required placeholder="Titulo" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="location" placeholder="Local" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input
                      name="amount"
                      placeholder="Valor (opcional)"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                      onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
                    />
                    <textarea name="description" placeholder="Notas" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm h-20" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_private" />Marcar como privado</label>
                    <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-2 rounded-xl text-sm font-bold">Adicionar</button>
                  </form>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === "expenses" && (
            <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card>
                <h3 className="font-bold mb-4">Adicionar despesa</h3>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await createExpense(new FormData(e.currentTarget));
                    (e.target as HTMLFormElement).reset();
                  }}
                >
                  <input name="description" required placeholder="Descricao" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                  <select name="category_id" className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm">
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    name="amount"
                    required
                    placeholder="Valor"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                    onChange={(e) => (e.target.value = maskCurrency(e.target.value))}
                  />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_private" />Marcar como privado</label>
                  <button className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold">Adicionar</button>
                </form>
              </Card>

              {/* Desktop table view */}
              <Card className="p-0 overflow-hidden hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-zinc-50"><th className="px-4 py-3 text-xs uppercase">Descricao</th><th className="px-4 py-3 text-xs uppercase">Categoria</th><th className="px-4 py-3 text-xs uppercase">Valor</th><th className="px-4 py-3 text-xs uppercase">Visib.</th><th className="px-4 py-3 text-xs uppercase text-right">Acao</th></tr></thead>
                  <tbody className="divide-y divide-zinc-100">
                    {trip.expenses.map((exp) => (
                      <tr key={exp.id}>
                        {editingExpenseId === exp.id ? (
                          <>
                            <td className="px-4 py-3 space-y-2">
                              <input
                                value={expenseDraft.description}
                                onChange={(e) => setExpenseDraft((current) => ({ ...current, description: e.target.value }))}
                                placeholder="Descricao"
                                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                              />
                              <p className="text-xs text-zinc-400">{exp.date}</p>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={expenseDraft.category_id}
                                onChange={(e) => setExpenseDraft((current) => ({ ...current, category_id: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                              >
                                <option value="">Sem categoria</option>
                                {categories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={expenseDraft.amount}
                                onChange={(e) => setExpenseDraft((current) => ({ ...current, amount: maskCurrency(e.target.value) }))}
                                placeholder="Valor"
                                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <label className="flex items-center gap-2 text-xs uppercase">
                                <input
                                  type="checkbox"
                                  checked={expenseDraft.visibility === "private"}
                                  onChange={(e) => setExpenseDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                                />
                                {expenseDraft.visibility}
                              </label>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={savingExpense}
                                  onClick={() => void saveExpenseEdit(exp.id)}
                                  className="px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-xs font-bold"
                                >
                                  {savingExpense ? "Salvando..." : "Salvar"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingExpense}
                                  onClick={() => setEditingExpenseId(null)}
                                  className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3"><p className="font-medium">{exp.description}</p><p className="text-xs text-zinc-400">{exp.date}</p></td>
                            <td className="px-4 py-3 text-xs uppercase">
                              {exp.category ? (
                                <span className="flex items-center gap-1" style={{ color: exp.category.color || 'inherit' }}>
                                  {exp.category.name}
                                </span>
                              ) : (
                                <span className="text-zinc-400">Geral</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-bold">{formatCurrency(exp.amount, exp.currency || settings.default_currency)}</td>
                            <td className="px-4 py-3 text-xs uppercase">
                              {exp.visibility === "private" ? (
                                <span className="inline-flex items-center gap-1 text-orange-600" title="Privado">
                                  <Lock size={12} />
                                </span>
                              ) : (
                                <span>Publico</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button type="button" onClick={() => startEditExpense(exp)} className="text-zinc-400 hover:text-zinc-700">
                                  <FilePenLine size={16} />
                                </button>
                                <button
                                  onClick={async () => {
                                    const confirmed = window.confirm(`Remover a despesa "${exp.description}"?`);
                                    if (!confirmed) return;
                                    const { error } = await supabase.from("expenses").delete().eq("id", exp.id);
                                    if (error) alert(getErrorMessage(error));
                                  }}
                                  className="text-zinc-400 hover:text-red-500"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {trip.expenses.length === 0 && (
                  <Card>
                    <p className="text-sm text-zinc-500 text-center">Nenhuma despesa cadastrada.</p>
                  </Card>
                )}
                {trip.expenses.map((exp) => (
                  <Card key={exp.id} className="space-y-3">
                    {editingExpenseId === exp.id ? (
                      <>
                        <div className="space-y-3">
                          <input
                            value={expenseDraft.description}
                            onChange={(e) => setExpenseDraft((current) => ({ ...current, description: e.target.value }))}
                            placeholder="Descricao"
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                          />
                          <select
                            value={expenseDraft.category_id}
                            onChange={(e) => setExpenseDraft((current) => ({ ...current, category_id: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                          >
                            <option value="">Sem categoria</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          <input
                            value={expenseDraft.amount}
                            onChange={(e) => setExpenseDraft((current) => ({ ...current, amount: maskCurrency(e.target.value) }))}
                            placeholder="Valor"
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={expenseDraft.visibility === "private"}
                              onChange={(e) => setExpenseDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                            />
                            Marcar como privado
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingExpense}
                            onClick={() => void saveExpenseEdit(exp.id)}
                            className="flex-1 px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold"
                          >
                            {savingExpense ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            disabled={savingExpense}
                            onClick={() => setEditingExpenseId(null)}
                            className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm font-bold"
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold truncate">{exp.description}</h4>
                              {exp.visibility === "private" && (
                                <Lock size={14} className="text-orange-600 flex-shrink-0" title="Privado" />
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 mb-2">{exp.date}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              {exp.category ? (
                                <span className="inline-flex items-center gap-1 text-xs uppercase" style={{ color: exp.category.color || 'inherit' }}>
                                  {exp.category.name}
                                </span>
                              ) : (
                                <span className="text-xs uppercase text-zinc-400">Geral</span>
                              )}
                              <span className="font-bold text-base">{formatCurrency(exp.amount, exp.currency || settings.default_currency)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditExpense(exp)}
                              className="p-2 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:bg-zinc-300 transition-colors"
                              aria-label="Editar despesa"
                            >
                              <FilePenLine size={20} />
                            </button>
                            <button
                              onClick={async () => {
                                const confirmed = window.confirm(`Remover a despesa "${exp.description}"?`);
                                if (!confirmed) return;
                                const { error } = await supabase.from("expenses").delete().eq("id", exp.id);
                                if (error) alert(getErrorMessage(error));
                              }}
                              className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 transition-colors"
                              aria-label="Excluir despesa"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </Card>
                ))}
              </div>

              <Card className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-bold text-zinc-400">Total de despesas</p>
                  <p className="text-sm text-zinc-500">Soma das despesas visiveis para voce.</p>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(expensesTotal, settings.default_currency)}</p>
              </Card>

              <Card className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Orçamento da viagem</p>
                  {budgetLimit > 0 && <p className={cn("text-sm font-semibold", isOverBudget ? "text-red-600" : "text-emerald-600")}>{Math.round(budgetProgress)}%</p>}
                </div>
                {budgetLimit <= 0 ? (
                  <p className="text-sm text-zinc-500">Defina um limite em Configurações para acompanhar o orçamento.</p>
                ) : (
                  <>
                    <div className="w-full h-3 rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isOverBudget ? "bg-red-500" : "bg-emerald-500")}
                        style={{ width: `${budgetProgress}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <p><span className="text-zinc-500">Total:</span> {formatCurrency(expensesTotal, settings.default_currency)}</p>
                      <p><span className="text-zinc-500">Limite:</span> {formatCurrency(budgetLimit, settings.default_currency)}</p>
                      <p>
                        <span className="text-zinc-500">{isOverBudget ? "Excesso:" : "Restante:"}</span>{" "}
                        <span className={isOverBudget ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                          {formatCurrency(Math.abs(budgetRemaining), settings.default_currency)}
                        </span>
                      </p>
                    </div>
                  </>
                )}
              </Card>
            </motion.div>
          )}
          {activeTab === "ideas" && (
            <motion.div key="ideas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card>
                <h3 className="font-bold mb-4">Adicionar ideia</h3>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await createIdea(new FormData(e.currentTarget));
                    (e.target as HTMLFormElement).reset();
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input name="title" required placeholder="Titulo" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="maps_url" placeholder="URL do Google Maps" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <input name="estimated_amount" type="number" min="0" step="0.01" placeholder="Valor estimado (opcional)" className="px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_private" />Marcar como privado</label>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">URLs</p>
                    {ideaLinksDraft.map((value, index) => (
                      <div key={`idea-link-${index}`} className="flex items-center gap-2">
                        <input
                          value={value}
                          onChange={(e) => setIdeaLinksDraft((current) => current.map((entry, i) => (i === index ? e.target.value : entry)))}
                          placeholder="https://..."
                          className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                        />
                        {ideaLinksDraft.length > 1 && (
                          <button type="button" className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold" onClick={() => setIdeaLinksDraft((current) => current.filter((_, i) => i !== index))}>
                            Remover
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => setIdeaLinksDraft((current) => [...current, ""])} className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold">
                      Adicionar URL
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-500">Anexos</span>
                      <input ref={ideaAttachmentInputRef} type="file" multiple className="block w-full text-sm" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-500">Fotos</span>
                      <input ref={ideaPhotoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple className="block w-full text-sm" />
                    </label>
                  </div>
                  <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold">Salvar ideia</button>
                </form>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {trip.ideas.length === 0 && <Card className="sm:col-span-2"><p className="text-sm text-zinc-500 text-center py-4">Nenhuma ideia cadastrada.</p></Card>}
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
                              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                            />
                            <input
                              value={ideaDraft.maps_url}
                              onChange={(e) => setIdeaDraft((current) => ({ ...current, maps_url: e.target.value }))}
                              placeholder="URL do Google Maps"
                              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                            />
                            <input
                              value={ideaDraft.estimated_amount}
                              onChange={(e) => setIdeaDraft((current) => ({ ...current, estimated_amount: e.target.value }))}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Valor estimado (opcional)"
                              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                            />
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={ideaDraft.visibility === "private"}
                                onChange={(e) => setIdeaDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                              />
                              <Lock size={14} />
                              <span>Marcar como privado</span>
                            </label>
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
                                {idea.visibility === "private" && <Lock size={14} className="text-orange-600 flex-shrink-0" title="Privado" />}
                              </p>
                              <p className="text-sm text-zinc-500 mt-1">Estimado: {formatCurrency(idea.estimated_amount, settings.default_currency)}</p>
                              {idea.maps_url && (
                                <a href={idea.maps_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 inline-flex items-center gap-1 mt-2 hover:underline">
                                  <MapPin size={12} />Google Maps
                                </a>
                              )}
                            </div>
                            {canManage && (
                              <div className="flex flex-col gap-2 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEditIdea(idea)}
                                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition-colors"
                                  aria-label="Editar ideia"
                                >
                                  <FilePenLine size={20} />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const confirmed = window.confirm(`Remover a ideia "${idea.title}"?`);
                                    if (!confirmed) return;
                                    await deleteIdea(idea);
                                  }}
                                  className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 transition-colors"
                                  aria-label="Excluir ideia"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </div>
                            )}
                          </div>

                          {links.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-zinc-100">
                              <p className="text-xs uppercase font-semibold text-zinc-500">URLs</p>
                              <div className="space-y-1">
                                {links.map((link) => (
                                  <a
                                    key={link.id}
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-sm text-blue-600 break-all hover:underline"
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <LinkIcon size={12} className="flex-shrink-0" />
                                      <span className="break-all">{link.label || link.url}</span>
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {attachments.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-zinc-100">
                              <p className="text-xs uppercase font-semibold text-zinc-500">Anexos</p>
                              <div className="flex flex-wrap gap-2">
                                {attachments.map((asset) => (
                                  <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => void openIdeaAsset(asset)}
                                    className="px-3 py-2 rounded-lg border border-zinc-200 text-xs inline-flex items-center gap-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                  >
                                    <Paperclip size={12} />
                                    <span className="max-w-[150px] truncate">{asset.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {photos.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-zinc-100">
                              <p className="text-xs uppercase font-semibold text-zinc-500">Fotos</p>
                              <div className="flex flex-wrap gap-2">
                                {photos.map((asset) => (
                                  <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => void openIdeaAsset(asset)}
                                    className="px-3 py-2 rounded-lg border border-zinc-200 text-xs hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                                  >
                                    <span className="max-w-[150px] truncate">{asset.name}</span>
                                  </button>
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
            </motion.div>
          )}
          {activeTab === "documents" && (
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
                  if (!file || !id || !currentMember) return;
                  try {
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                    const path = `${id}/${currentMember.id}/${crypto.randomUUID()}-${safeName}`;
                    const { error: uploadError } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
                    if (uploadError) throw uploadError;
                    const { error: insertError } = await supabase.from("documents").insert({ id: crypto.randomUUID(), trip_id: id, created_by_member_id: currentMember.id, name: file.name, url: path });
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
                    onClick={async () => {
                      const { error: storageError } = await supabase.storage.from(DOCS_BUCKET).remove([doc.url]);
                      if (storageError) {
                        alert(getErrorMessage(storageError));
                        return;
                      }
                      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
                      if (error) alert(getErrorMessage(error));
                    }}
                    className="text-zinc-300 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </Card>
              ))}
            </motion.div>
          )}

          {activeTab === "people" && (
            <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {currentMember && (
                <Card>
                  <h3 className="font-bold mb-4">Seu conjuge (global)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={selfSpouseUserId}
                      onChange={(e) => setSelfSpouseUserId(e.target.value)}
                      className="md:col-span-2 px-4 py-2 rounded-xl border border-zinc-200 text-sm"
                    >
                      <option value="">Sem conjuge</option>
                      {members
                        .filter((m) => m.user_id !== currentMember.user_id)
                        .map((m) => <option key={m.id} value={m.user_id}>{m.display_name || m.user_id}</option>)}
                    </select>
                    <button
                      onClick={async () => {
                        await setGlobalSpouse(selfSpouseUserId || null);
                      }}
                      className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold"
                    >
                      Salvar
                    </button>
                  </div>
                </Card>
              )}

              {isAdmin && (
                <Card>
                  <h3 className="font-bold mb-4">Convidar pessoa</h3>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="email@exemplo.com" className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm" />
                    <button onClick={createInvite} className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"><UserPlus size={16} />Gerar convite</button>
                  </div>
                  {generatedLink && <div className="mt-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs break-all">{generatedLink}</div>}
                </Card>
              )}

              <Card className="p-0 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-zinc-50"><th className="px-4 py-3 text-xs uppercase">Pessoa</th><th className="px-4 py-3 text-xs uppercase">Papel</th><th className="px-4 py-3 text-xs uppercase">Conjuge</th>{isAdmin && <th className="px-4 py-3 text-xs uppercase text-right">Acao</th>}</tr></thead>
                  <tbody className="divide-y divide-zinc-100">
                    {members.map((member) => {
                      const spouseUserId = spouseByUserId.get(member.user_id) || null;
                      const spouse = spouseUserId ? memberByUserId.get(spouseUserId) : null;
                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-3">{member.display_name || member.user_id}</td>
                          <td className="px-4 py-3 text-xs uppercase">{member.role}</td>
                          <td className="px-4 py-3">{spouse?.display_name || "-"}</td>
                          {isAdmin && <td className="px-4 py-3 text-right">-</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {isAdmin && (
                <Card>
                  <h3 className="font-bold mb-4">Convites</h3>
                  <div className="space-y-2">
                    {invites.length === 0 && <p className="text-sm text-zinc-500">Nenhum convite gerado.</p>}
                    {invites.map((invite) => (
                      <div key={invite.id} className="p-3 rounded-xl border border-zinc-200 text-sm flex items-center justify-between gap-2">
                        <span>{invite.email}</span>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-xs font-bold uppercase", invite.accepted_at ? "text-emerald-600" : "text-orange-600")}>{invite.accepted_at ? "Aceito" : "Pendente"}</span>
                          {!invite.accepted_at && (
                            <button
                              type="button"
                              onClick={() => void cancelInvite(invite.id)}
                              className="text-xs text-red-500"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Card className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <DollarSign size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Financeiro</h3>
                    <p className="text-sm text-zinc-500">Configure suas preferências monetárias</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold block">Moeda Padrão</label>
                  <div className="grid grid-cols-3 gap-3">
                    {["BRL", "USD", "EUR"].map((currency) => (
                      <button
                        key={currency}
                        type="button"
                        onClick={() => setSettingsDraft((current) => ({ ...current, default_currency: currency }))}
                        className={cn(
                          "px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all duration-200 hover:scale-105",
                          settingsDraft.default_currency === currency
                            ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-white shadow-lg"
                            : "border-zinc-200 hover:border-zinc-300 shadow-sm"
                        )}
                      >
                        {currency}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                    <DollarSign size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Orçamento da Viagem</h3>
                    <p className="text-sm text-zinc-500">Defina um limite de gastos</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-semibold block">Limite de Orçamento</label>
                  <input
                    value={settingsDraft.budget_limit_masked || ""}
                    onChange={(e) => {
                      const masked = maskCurrency(e.target.value);
                      setSettingsDraft((prev) => ({ ...prev, budget_limit_masked: masked }));
                      setTripBudget((current) => ({
                        id: current?.id || "",
                        trip_id: id || "",
                        owner_user_id: budgetOwnerUserId || session.user.id,
                        budget_limit: parseCurrencyToNumber(masked),
                      }));
                    }}
                    placeholder="0,00"
                    className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                  />
                  <div className="px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200">
                    <p className="text-xs text-zinc-600">
                      {budgetOwnerUserId === session.user.id
                        ? "💡 Orçamento individual nesta viagem"
                        : "👥 Orçamento compartilhado com cônjuge nesta viagem"}
                    </p>
                  </div>
                </div>
              </Card>

              {currentMember && (
                <Card className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                      <Users size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Cônjuge</h3>
                      <p className="text-sm text-zinc-500">Configuração global para todas as viagens</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-semibold block">Selecione seu cônjuge</label>
                    <select
                      value={selfSpouseUserId}
                      onChange={(e) => setSelfSpouseUserId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                    >
                      <option value="">Sem cônjuge</option>
                      {members.filter((m) => m.user_id !== currentMember.user_id).map((m) => (
                        <option key={m.id} value={m.user_id}>{m.display_name || m.user_id}</option>
                      ))}
                    </select>
                    <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-700 font-medium">✨ Salvamento automático ativado</p>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Palette size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Aparência</h3>
                    <p className="text-sm text-zinc-500">Personalize o visual do aplicativo</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold mb-3 block">Modo de Exibição</label>
                    <button
                      type="button"
                      onClick={() => setSettingsDraft((current) => ({ ...current, dark_mode: !current.dark_mode }))}
                      className={cn(
                        "w-full px-6 py-4 rounded-2xl border-2 text-sm font-medium flex items-center justify-between gap-3 transition-all duration-200 hover:scale-[1.02]",
                        settingsDraft.dark_mode
                          ? "border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-900 text-white shadow-lg"
                          : "border-zinc-200 bg-gradient-to-br from-white to-zinc-50 hover:border-zinc-300 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {settingsDraft.dark_mode ? <Moon size={20} /> : <Sun size={20} />}
                        <span className="text-base">{settingsDraft.dark_mode ? "Modo Escuro" : "Modo Claro"}</span>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        settingsDraft.dark_mode ? "bg-zinc-700 text-zinc-300" : "bg-zinc-200 text-zinc-700"
                      )}>
                        {settingsDraft.dark_mode ? "Ativado" : "Desativado"}
                      </div>
                    </button>
                  </div>

                  <div>
                    <label className="text-sm font-semibold mb-3 block">Tema de Cores</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(["default", "ocean", "forest", "sunset", "lavender", "midnight", "rose"] as const).map((theme) => {
                        const palette = THEME_PALETTES[theme];
                        const isActive = settingsDraft.theme_palette === theme;
                        const themeNames: Record<string, string> = {
                          default: "Padrão",
                          ocean: "Oceano",
                          forest: "Floresta",
                          sunset: "Pôr do Sol",
                          lavender: "Lavanda",
                          midnight: "Meia-Noite",
                          rose: "Rosa"
                        };
                        
                        return (
                          <button
                            key={theme}
                            type="button"
                            onClick={() => setSettingsDraft((current) => ({ ...current, theme_palette: theme }))}
                            className={cn(
                              "relative p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-105",
                              isActive
                                ? "border-[var(--accent-color)] shadow-lg ring-2 ring-offset-2 ring-[var(--accent-color)]/30"
                                : "border-zinc-200 hover:border-zinc-300 shadow-sm"
                            )}
                          >
                            <div className="space-y-2">
                              <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                                <div
                                  className="flex-1"
                                  style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkSidebarActiveBg : palette.lightSidebarActiveBg }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkAccent : palette.lightAccent }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ backgroundColor: settingsDraft.dark_mode ? palette.darkBg : palette.lightBg }}
                                />
                              </div>
                              <p className="text-xs font-semibold text-center">{themeNames[theme]}</p>
                            </div>
                            {isActive && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--accent-color)] flex items-center justify-center shadow-lg">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>

              {isAdmin && trip && (
                <Card className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                      <Settings size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Gerenciar Viagem</h3>
                      <p className="text-sm text-zinc-500">Edite ou exclua esta viagem</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold block">Nome da Viagem</label>
                      <input
                        value={editTripName}
                        onChange={(e) => setEditTripName(e.target.value)}
                        placeholder="Nome da viagem"
                        className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold block">Destino</label>
                      <input
                        value={editTripDestination}
                        onChange={(e) => setEditTripDestination(e.target.value)}
                        placeholder="Destino"
                        className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                        required
                      />
                    </div>
                    {updatingTrip && (
                      <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                        <p className="text-xs text-blue-700 font-medium">💾 Salvando alterações automaticamente...</p>
                      </div>
                    )}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={deleteCurrentTrip}
                        disabled={updatingTrip}
                        className="w-full px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-all disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        Excluir Viagem Permanentemente
                      </button>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <FileText size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Categorias de Despesas</h3>
                    <p className="text-sm text-zinc-500">Organize suas despesas por categoria</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <form
                    className="flex gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      const name = (form.get("name") as string).trim();
                      if (!name) return;
                      const { data, error } = await supabase.from("expense_categories").insert({ name }).select().single();
                      if (error) {
                        alert(getErrorMessage(error));
                      } else {
                        if (data) setCategories(prev => [...prev, data as ExpenseCategory].sort((a, b) => a.name.localeCompare(b.name)));
                        (e.target as HTMLFormElement).reset();
                      }
                    }}
                  >
                    <input
                      name="name"
                      required
                      placeholder="Nova categoria"
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-zinc-200 text-sm focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                    />
                    <button className="bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] px-6 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
                      <Plus size={16} />
                      Adicionar
                    </button>
                  </form>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categories.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between p-4 rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-white to-zinc-50 hover:border-zinc-300 transition-all group">
                        <span className="text-sm font-semibold">{cat.name}</span>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Excluir categoria "${cat.name}"?`)) return;
                            const { error } = await supabase.from("expense_categories").delete().eq("id", cat.id);
                            if (error) alert(getErrorMessage(error));
                          }}
                          className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <div className="sm:col-span-2 text-center py-8 px-4 rounded-xl border-2 border-dashed border-zinc-200">
                        <p className="text-sm text-zinc-500">Nenhuma categoria configurada ainda.</p>
                        <p className="text-xs text-zinc-400 mt-1">Adicione sua primeira categoria acima!</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {savingSettings && (
                <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                  <p className="text-sm text-green-700 font-medium">✅ Salvando configurações automaticamente...</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]/95 text-[var(--sidebar-text)]">
        <div className="grid grid-cols-6">
          <button type="button" onClick={() => setActiveTab("itinerary")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "itinerary" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <LayoutDashboard size={16} />
            <span className="text-[11px] font-medium">Itinerário</span>
          </button>
          <button type="button" onClick={() => setActiveTab("expenses")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "expenses" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <DollarSign size={16} />
            <span className="text-[11px] font-medium">Despesas</span>
          </button>
          <button type="button" onClick={() => setActiveTab("ideas")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "ideas" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Lightbulb size={16} />
            <span className="text-[11px] font-medium">Ideias</span>
          </button>
          <button type="button" onClick={() => setActiveTab("documents")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "documents" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <FileText size={16} />
            <span className="text-[11px] font-medium">Docs</span>
          </button>
          <button type="button" onClick={() => setActiveTab("people")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "people" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Users size={16} />
            <span className="text-[11px] font-medium">Pessoas</span>
          </button>
          <button type="button" onClick={() => setActiveTab("settings")} className={cn("flex flex-col items-center justify-center gap-1 py-2", activeTab === "settings" ? "text-[var(--sidebar-active-bg)] font-semibold" : "text-[var(--sidebar-text)]")}>
            <Settings size={16} />
            <span className="text-[11px] font-medium">Config</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const loadUserSettings = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_palette,dark_mode,default_currency,spouse_user_id")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      setUserSettings(DEFAULT_SETTINGS);
      return;
    }

    setUserSettings({
      theme_palette: (data.theme_palette as any) || DEFAULT_SETTINGS.theme_palette,
      dark_mode: Boolean(data.dark_mode),
      default_currency: (data.default_currency as string) || DEFAULT_SETTINGS.default_currency,
      spouse_user_id: (data.spouse_user_id as string | null) || null,
    });
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session) {
        await supabase.rpc("sync_my_profile");
        await loadUserSettings(data.session.user.id);
      } else {
        setUserSettings(DEFAULT_SETTINGS);
      }
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void supabase.rpc("sync_my_profile");
        void loadUserSettings(nextSession.user.id);
      } else {
        setUserSettings(DEFAULT_SETTINGS);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center">Carregando sessao...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <LandingPage session={session} settings={userSettings} /> : <AuthLanding />} />
        <Route
          path="/trip/:id"
          element={
            <ProtectedRoute session={session}>
              {<TripDashboard session={session as Session} settings={userSettings} onSettingsChange={setUserSettings} />}
            </ProtectedRoute>
          }
        />
        <Route path="/invite/:token" element={<InvitePage session={session} />} />
      </Routes>
    </BrowserRouter>
  );
}
