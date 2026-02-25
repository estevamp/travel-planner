import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import type {
  Trip,
  TripMember,
  TripInvite,
  ExpenseCategory,
  ItineraryItem,
  Expense,
  DocumentItem,
  Idea,
  IdeaLink,
  IdeaAsset,
} from "../types";

export function useTripData(tripId: string | undefined, userId: string) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [spouseByUserId, setSpouseByUserId] = useState<Map<string, string | null>>(new Map());

  const loadTrip = useCallback(async (id: string) => {
    setLoading(true);
    const [tripRes, membersRes, itineraryRes, expensesRes, docsRes, ideasRes, categoriesRes] = await Promise.all([
      supabase.from("trips").select("*").eq("id", id).single(),
      supabase.from("trip_members").select("id,trip_id,user_id,role,display_name").eq("trip_id", id),
      supabase.from("itinerary").select("*").eq("trip_id", id).order("start_time", { ascending: true }),
      supabase.from("expenses").select("*").eq("trip_id", id).order("date", { ascending: true }),
      supabase.from("documents").select("*").eq("trip_id", id),
      supabase.from("ideas").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
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

    const me = nextMembers.find((member) => member.user_id === userId);
    if (!me) {
      setTrip(null);
      setInvites([]);
      setLoading(false);
      return;
    }

    if (me.role === "admin") {
      const { data, error } = await supabase.from("trip_invites").select("id,email,token,accepted_at,created_at").eq("trip_id", id).order("created_at", { ascending: false });
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
    loading,
    spouseByUserId,
    setSpouseByUserId,
    reloadTrip: tripId ? () => loadTrip(tripId) : () => {},
  };
}
