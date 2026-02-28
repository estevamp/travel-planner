export interface ItineraryType {
  id: string;
  name: string;
  icon: string;
  created_at: string;
}

export type Visibility = "public" | "private";
export type ThemePalette =
  | "default"
  | "ocean"
  | "coastal"
  | "sunset"
  | "lavender"
  | "rose"
  | "tropic"
  | "candy"
  | "galaxy"
  | "jade"
  | "peach";

export interface UserSettings {
  theme_palette: ThemePalette;
  dark_mode: boolean;
  default_currency: string;
  spouse_user_id: string | null;
  budget_limit_masked?: string;
}

export interface TripBudget {
  id: string;
  trip_id: string;
  owner_user_id: string;
  budget_limit: number;
  currency: string;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  type_id: string | null;
  type?: ItineraryType | null;
  title: string;
  description: string;
  location: string;
  start_time: string | null;
  end_time: string | null;
  is_all_day?: boolean;
  amount: number;
  currency: string;
  visibility: Visibility;
  photo_url?: string | null;
  is_completed?: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  itinerary_item_id?: string | null;
  description: string;
  amount: number;
  currency: string;
  category_id?: string | null;
  category?: ExpenseCategory | null;
  date: string;
  visibility: Visibility;
  is_confirmed: boolean;
}

export interface DocumentItem {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  name: string;
  url: string;
}

export interface Idea {
  id: string;
  trip_id: string;
  created_by_member_id: string;
  title: string;
  notes: string | null;
  maps_url: string | null;
  estimated_amount: number;
  currency: string;
  visibility: Visibility;
  is_converted: boolean;
  created_at: string;
}

export interface IdeaLink {
  id: string;
  idea_id: string;
  label: string | null;
  url: string;
  created_at: string;
}

export interface IdeaAsset {
  id: string;
  idea_id: string;
  name: string;
  url: string;
  asset_type: "attachment" | "photo";
  created_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: "admin" | "member";
  display_name: string | null;
}

export interface TripInvite {
  id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  theme_palette: ThemePalette;
  start_date: string;
  end_date: string;
  itinerary: ItineraryItem[];
  expenses: Expense[];
  documents: DocumentItem[];
  ideas: Idea[];
  idea_links: IdeaLink[];
  idea_assets: IdeaAsset[];
}

export interface TripSummary {
  id: string;
  name: string;
  destination: string;
  created_at: string;
}

// Export splitting types
export * from './splitting';
