import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AnimatePresence } from "motion/react";
import { supabase } from "../../supabase";
import { 
  Trip, 
  TripSummary, 
  TripMember, 
  TripInvite, 
  UserSettings, 
  TripBudget,
  ItineraryItem,
  Expense,
  Idea,
  IdeaLink,
  IdeaAsset,
  Visibility,
  ItineraryType
} from "../../types";
import { getErrorMessage, fileToDataUrl } from "../../utils";
import { getThemeStyles } from "../../utils/theme";
import { DOCS_BUCKET } from "../../constants";
import { TripSidebar } from "./TripSidebar";
import { TripHeader } from "./TripHeader";
import { TripMobileNav } from "./TripMobileNav";
import { ItineraryTab } from "./tabs/ItineraryTab";
import { ExpensesTab } from "./tabs/ExpensesTab";
import { IdeasTab } from "./tabs/IdeasTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { PeopleTab } from "./tabs/PeopleTab";
import { SettingsTab } from "./tabs/SettingsTab";

export function TripDashboard({ session, settings, onSettingsChange }: { session: Session; settings: UserSettings; onSettingsChange: (next: UserSettings) => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
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
    category: string;
    amount: string;
    visibility: Visibility;
  }>({
    description: "",
    category: "",
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

  const expensesTotal = useMemo(
    () => (trip ? trip.expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0) : 0),
    [trip],
  );
  const budgetLimit = Math.max(0, Number(tripBudget?.budget_limit) || 0);
  const budgetProgress = budgetLimit > 0 ? Math.min((expensesTotal / budgetLimit) * 100, 100) : 0;
  const budgetRemaining = budgetLimit - expensesTotal;
  const isOverBudget = budgetLimit > 0 && expensesTotal > budgetLimit;

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
    const [tripRes, membersRes, itineraryRes, expensesRes, docsRes, ideasRes] = await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase.from("trip_members").select("id,trip_id,user_id,role,display_name").eq("trip_id", tripId),
      supabase.from("itinerary").select("*").eq("trip_id", tripId).order("start_time", { ascending: true }),
      supabase.from("expenses").select("*").eq("trip_id", tripId).order("date", { ascending: true }),
      supabase.from("documents").select("*").eq("trip_id", tripId),
      supabase.from("ideas").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    ]);

    if (tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error || ideasRes.error || !tripRes.data) {
      console.error(tripRes.error || membersRes.error || itineraryRes.error || expensesRes.error || docsRes.error || ideasRes.error);
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

    setTrip({
      ...(tripRes.data as Omit<Trip, "itinerary" | "expenses" | "documents" | "ideas" | "idea_links" | "idea_assets">),
      itinerary: (itineraryRes.data || []).map((item) => ({ ...item, amount: Number(item.amount) || 0 })) as ItineraryItem[],
      expenses: (expensesRes.data || []).map((item) => ({ ...item, amount: Number(item.amount) || 0 })) as Expense[],
      documents: (docsRes.data || []) as any[],
      ideas: (ideasRes.data || []).map((item) => ({ ...item, estimated_amount: Number(item.estimated_amount) || 0 })) as Idea[],
      idea_links: ideaLinksData,
      idea_assets: ideaAssetsData,
    });

    setLoading(false);
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

    setTripBudget({ ...(data as TripBudget), budget_limit: Number((data as TripBudget).budget_limit) || 0 });
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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem nao encontrada ou sem permissao.</div>;

  return (
    <div className="min-h-screen flex" style={themedStyles}>
      <TripSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tripOptions={tripOptions}
        currentTripId={id || ""}
        navigate={navigate}
        creatingTripFromSidebar={creatingTripFromSidebar}
        createTripFromSidebar={createTripFromSidebar}
      />

      <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-10">
        <TripHeader trip={trip} isAdmin={isAdmin} />

        <AnimatePresence mode="wait">
          {activeTab === "itinerary" && (
            <ItineraryTab
              trip={trip}
              currentMember={currentMember}
              settings={settings}
              editingItineraryId={editingItineraryId}
              setEditingItineraryId={setEditingItineraryId}
              itineraryDraft={itineraryDraft}
              setItineraryDraft={setItineraryDraft}
              savingItinerary={savingItinerary}
              photoInputRefs={photoInputRefs}
              fileToDataUrl={fileToDataUrl}
            />
          )}

          {activeTab === "expenses" && (
            <ExpensesTab
              trip={trip}
              currentMember={currentMember}
              settings={settings}
              editingExpenseId={editingExpenseId}
              setEditingExpenseId={setEditingExpenseId}
              expenseDraft={expenseDraft}
              setExpenseDraft={setExpenseDraft}
              savingExpense={savingExpense}
              expensesTotal={expensesTotal}
              budgetLimit={budgetLimit}
              budgetProgress={budgetProgress}
              budgetRemaining={budgetRemaining}
              isOverBudget={isOverBudget}
            />
          )}

          {activeTab === "ideas" && (
            <IdeasTab
              trip={trip}
              currentMember={currentMember}
              isAdmin={isAdmin}
              settings={settings}
              ideaLinksDraft={ideaLinksDraft}
              setIdeaLinksDraft={setIdeaLinksDraft}
              ideaAttachmentInputRef={ideaAttachmentInputRef}
              ideaPhotoInputRef={ideaPhotoInputRef}
              editingIdeaId={editingIdeaId}
              setEditingIdeaId={setEditingIdeaId}
              ideaDraft={ideaDraft}
              setIdeaDraft={setIdeaDraft}
              ideaLinksByIdeaId={ideaLinksByIdeaId}
              ideaAssetsByIdeaId={ideaAssetsByIdeaId}
            />
          )}

          {activeTab === "documents" && (
            <DocumentsTab
              trip={trip}
              currentMember={currentMember}
              documentInputRef={documentInputRef}
            />
          )}

          {activeTab === "people" && (
            <PeopleTab
              currentMember={currentMember}
              isAdmin={isAdmin}
              members={members}
              invites={invites}
              spouseByUserId={spouseByUserId}
              memberByUserId={memberByUserId}
              selfSpouseUserId={selfSpouseUserId}
              setSelfSpouseUserId={setSelfSpouseUserId}
              setGlobalSpouse={setGlobalSpouse}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              generatedLink={generatedLink}
              setGeneratedLink={setGeneratedLink}
              tripId={id || ""}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              settingsDraft={settingsDraft}
              setSettingsDraft={setSettingsDraft}
              tripBudget={tripBudget}
              setTripBudget={setTripBudget}
              budgetOwnerUserId={budgetOwnerUserId}
              session={session}
              currentMember={currentMember}
              members={members}
              selfSpouseUserId={selfSpouseUserId}
              setSelfSpouseUserId={setSelfSpouseUserId}
              isAdmin={isAdmin}
              trip={trip}
              editTripName={editTripName}
              setEditTripName={setEditTripName}
              editTripDestination={editTripDestination}
              setEditTripDestination={setEditTripDestination}
              deleteCurrentTrip={deleteCurrentTrip}
              updatingTrip={updatingTrip}
              savingSettings={savingSettings}
              tripId={id || ""}
            />
          )}
        </AnimatePresence>
      </main>

      <TripMobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
