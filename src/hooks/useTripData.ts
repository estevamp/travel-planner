import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type {
  Trip,
  TripMember,
  TripInvite,
  ExpenseCategory,
  ItineraryItem,
  ItineraryType,
  Expense,
  DocumentItem,
  Idea,
  IdeaLink,
  IdeaAsset,
} from "../types";

const MEMBERS_SELECT = "id,trip_id,user_id,role,display_name,spouse_member_id,status,guest_email";

/** Verifica no banco se o usuário atual é superuser. */
async function checkIsSuperuser(uid: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_superuser")
    .eq("user_id", uid)
    .single();
  return data?.is_superuser === true;
}

export function useTripData(tripId: string | undefined, userId: string) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [itineraryTypes, setItineraryTypes] = useState<ItineraryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [spouseByUserId, setSpouseByUserId] = useState<Map<string, string | null>>(new Map());

  const { toast } = useToast();

  const categoriesRef = useRef<ExpenseCategory[]>([]);
  const itineraryTypesRef = useRef<ItineraryType[]>([]);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { itineraryTypesRef.current = itineraryTypes; }, [itineraryTypes]);

  const loadTrip = useCallback(async (id: string) => {
    setLoading(true);

    const [
      tripRes,
      membersRes,
      itineraryRes,
      expensesRes,
      docsRes,
      ideasRes,
      categoriesRes,
      itineraryTypesRes,
    ] = await Promise.all([
      supabase.from("trips").select("*").eq("id", id).single(),
      supabase.from("trip_members").select(MEMBERS_SELECT).eq("trip_id", id),
      supabase.from("itinerary").select("*").eq("trip_id", id).order("start_time", { ascending: true }),
      supabase.from("expenses").select("*").eq("trip_id", id).order("date", { ascending: true }),
      supabase.from("documents").select("*").eq("trip_id", id),
      supabase.from("ideas").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
      supabase.from("expense_categories").select("*").order("name", { ascending: true }),
      supabase.from("itinerary_types").select("*").order("name", { ascending: true }),
    ]);

    const firstError =
      tripRes.error || membersRes.error || itineraryRes.error ||
      expensesRes.error || docsRes.error || ideasRes.error ||
      categoriesRes.error || itineraryTypesRes.error;

    if (firstError || !tripRes.data) {
      console.error('[useTripData] Falha ao carregar viagem:', firstError);
      setLoadError(getErrorMessage(firstError) || 'Não foi possível carregar a viagem.');
      setTrip(null);
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoadError(null);

    const nextMembers = (membersRes.data || []) as TripMember[];
    setMembers(nextMembers);

    // Carregar perfis para mapa de cônjuges
    const userIds = nextMembers
      .map((m) => m.user_id)
      .filter((uid): uid is string => uid != null);

    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("user_id,spouse_user_id")
        .in("user_id", userIds);

      if (profileError) {
        console.error('[useTripData] Falha ao carregar profiles:', profileError);
        setSpouseByUserId(new Map());
      } else {
        const entries = new Map<string, string | null>();
        (profileRows || []).forEach((row) =>
          entries.set(row.user_id as string, (row.spouse_user_id as string | null) || null)
        );
        setSpouseByUserId(entries);
      }
    } else {
      setSpouseByUserId(new Map());
    }

    // Verificar se o usuário é membro da viagem
    const me = nextMembers.find((m) => m.user_id === userId);

    if (!me) {
      // Não é membro — checar se é superuser antes de bloquear
      const isSuperuser = await checkIsSuperuser(userId);
      if (!isSuperuser) {
        setNotAuthorized(true);
        setTrip(null);
        setInvites([]);
        setLoading(false);
        return;
      }
      // Superuser: segue sem membership (invites ficam vazios — sem acesso de admin)
      setNotAuthorized(false);
      setInvites([]);
    } else {
      setNotAuthorized(false);

      // Apenas admins reais veem os convites
      if (me.role === "admin") {
        const { data, error } = await supabase
          .from("trip_invites")
          .select("id,email,token,accepted_at,created_at")
          .eq("trip_id", id)
          .order("created_at", { ascending: false });

        setInvites(error ? [] : ((data || []) as TripInvite[]));
      } else {
        setInvites([]);
      }
    }

    // Carregar links e assets de ideias
    const ideaIds = (ideasRes.data || []).map((idea) => idea.id as string);
    let ideaLinksData: IdeaLink[] = [];
    let ideaAssetsData: IdeaAsset[] = [];

    if (ideaIds.length > 0) {
      const [ideaLinksRes, ideaAssetsRes] = await Promise.all([
        supabase.from("idea_links").select("*").in("idea_id", ideaIds),
        supabase.from("idea_assets").select("*").in("idea_id", ideaIds),
      ]);

      if (ideaLinksRes.error || ideaAssetsRes.error) {
        console.error('[useTripData] Falha ao carregar assets de ideias:', ideaLinksRes.error || ideaAssetsRes.error);
        toast('Alguns anexos de ideias não puderam ser carregados.', 'info');
      } else {
        ideaLinksData = (ideaLinksRes.data || []) as IdeaLink[];
        ideaAssetsData = (ideaAssetsRes.data || []) as IdeaAsset[];
      }
    }

    const nextCategories = (categoriesRes.data || []) as ExpenseCategory[];
    const categoryMap = new Map(nextCategories.map((c) => [c.id, c]));

    const nextItineraryTypes = (itineraryTypesRes.data || []) as ItineraryType[];
    const itineraryTypeMap = new Map(nextItineraryTypes.map((t) => [t.id, t]));

    setTrip({
      ...(tripRes.data as Omit<Trip, "itinerary" | "expenses" | "documents" | "ideas" | "idea_links" | "idea_assets">),
      itinerary: (itineraryRes.data || []).map((item) => ({
        ...item,
        amount: Number(item.amount) || 0,
        type: item.type_id ? (itineraryTypeMap.get(item.type_id) ?? null) : null,
      })) as ItineraryItem[],
      expenses: (expensesRes.data || []).map((item) => ({
        ...item,
        amount: Number(item.amount) || 0,
        category: item.category_id ? (categoryMap.get(item.category_id) ?? null) : null,
      })) as Expense[],
      documents: (docsRes.data || []) as DocumentItem[],
      ideas: (ideasRes.data || []).map((item) => ({
        ...item,
        estimated_amount: Number(item.estimated_amount) || 0,
      })) as Idea[],
      idea_links: ideaLinksData,
      idea_assets: ideaAssetsData,
    });

    setCategories(nextCategories);
    setItineraryTypes(nextItineraryTypes);
    setLoading(false);
  }, [userId, toast]);

  const reloadItinerary = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("itinerary")
      .select("*")
      .eq("trip_id", id)
      .order("start_time", { ascending: true });

    if (error || !data) return;

    const typeMap = new Map(itineraryTypesRef.current.map((t) => [t.id, t]));

    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        itinerary: data.map((item) => ({
          ...item,
          amount: Number(item.amount) || 0,
          type: item.type_id ? (typeMap.get(item.type_id) ?? null) : null,
        })) as ItineraryItem[],
      };
    });
  }, []);

  const reloadExpenses = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", id)
      .order("date", { ascending: true });

    if (error || !data) return;

    const catMap = new Map(categoriesRef.current.map((c) => [c.id, c]));

    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        expenses: data.map((item) => ({
          ...item,
          amount: Number(item.amount) || 0,
          category: item.category_id ? (catMap.get(item.category_id) ?? null) : null,
        })) as Expense[],
      };
    });
  }, []);

  const reloadDocuments = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("trip_id", id);

    if (error || !data) return;

    setTrip((prev) => {
      if (!prev) return prev;
      return { ...prev, documents: data as DocumentItem[] };
    });
  }, []);

  const reloadIdeas = useCallback(async (id: string) => {
    const { data: ideasData, error: ideasError } = await supabase
      .from("ideas")
      .select("*")
      .eq("trip_id", id)
      .order("created_at", { ascending: false });

    if (ideasError || !ideasData) return;

    const ideaIds = ideasData.map((idea) => idea.id as string);
    let ideaLinksData: IdeaLink[] = [];
    let ideaAssetsData: IdeaAsset[] = [];

    if (ideaIds.length > 0) {
      const [linksRes, assetsRes] = await Promise.all([
        supabase.from("idea_links").select("*").in("idea_id", ideaIds),
        supabase.from("idea_assets").select("*").in("idea_id", ideaIds),
      ]);
      if (!linksRes.error && linksRes.data) ideaLinksData = linksRes.data as IdeaLink[];
      if (!assetsRes.error && assetsRes.data) ideaAssetsData = assetsRes.data as IdeaAsset[];
    }

    setTrip((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ideas: ideasData.map((item) => ({
          ...item,
          estimated_amount: Number(item.estimated_amount) || 0,
        })) as Idea[],
        idea_links: ideaLinksData,
        idea_assets: ideaAssetsData,
      };
    });
  }, []);

  const reloadMembers = useCallback(async (id: string) => {
    const { data: membersData, error: membersError } = await supabase
      .from("trip_members")
      .select(MEMBERS_SELECT)
      .eq("trip_id", id);

    if (membersError || !membersData) return;

    const nextMembers = membersData as TripMember[];
    setMembers(nextMembers);

    // Atualizar mapa de cônjuges
    const userIds = nextMembers
      .map((m) => m.user_id)
      .filter((uid): uid is string => uid != null);

    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id,spouse_user_id")
        .in("user_id", userIds);

      if (profileRows) {
        const entries = new Map<string, string | null>();
        profileRows.forEach((row) =>
          entries.set(row.user_id as string, (row.spouse_user_id as string | null) || null)
        );
        setSpouseByUserId(entries);
      }
    }

    // Apenas admins reais veem os convites
    const me = nextMembers.find((m) => m.user_id === userId);
    if (me?.role === "admin") {
      const { data: invitesData } = await supabase
        .from("trip_invites")
        .select("id,email,token,accepted_at,created_at")
        .eq("trip_id", id)
        .order("created_at", { ascending: false });

      setInvites((invitesData || []) as TripInvite[]);
    }
  }, [userId]);

  useEffect(() => {
    if (!tripId) return;
    void loadTrip(tripId);
  }, [tripId, loadTrip]);

  return {
    trip,
    setTrip,
    members,
    invites,
    categories,
    setCategories,
    itineraryTypes,
    setItineraryTypes,
    loading,
    loadError,
    notAuthorized,
    spouseByUserId,
    setSpouseByUserId,
    reloadTrip:      tripId ? () => loadTrip(tripId)      : () => {},
    reloadItinerary: tripId ? () => reloadItinerary(tripId) : () => {},
    reloadExpenses:  tripId ? () => reloadExpenses(tripId)  : () => {},
    reloadDocuments: tripId ? () => reloadDocuments(tripId) : () => {},
    reloadIdeas:     tripId ? () => reloadIdeas(tripId)     : () => {},
    reloadMembers:   tripId ? () => reloadMembers(tripId)   : () => {},
  };
}