import { ThemePalette } from "../types";

export const DOCS_BUCKET = "travel-documents";

export const THEME_PALETTES: Record<
  ThemePalette,
  {
    lightBg: string;
    lightCard: string;
    lightAccent: string;
    lightSidebarBg: string;
    lightSidebarBorder: string;
    lightSidebarText: string;
    lightSidebarHover: string;
    lightSidebarActiveBg: string;
    lightSidebarActiveText: string;
    darkBg: string;
    darkCard: string;
    darkAccent: string;
    darkSidebarBg: string;
    darkSidebarBorder: string;
    darkSidebarText: string;
    darkSidebarHover: string;
    darkSidebarActiveBg: string;
    darkSidebarActiveText: string;
  }
> = {
  // Padrão — azul céu limpo e moderno
  default: {
    lightBg: "#F0F6FF",
    lightCard: "#FFFFFF",
    lightAccent: "#2563EB",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#DBEAFE",
    lightSidebarText: "#1D4ED8",
    lightSidebarHover: "#EFF6FF",
    lightSidebarActiveBg: "#2563EB",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#0F172A",
    darkCard: "#1E293B",
    darkAccent: "#60A5FA",
    darkSidebarBg: "#0F172A",
    darkSidebarBorder: "#1E3A5F",
    darkSidebarText: "#BFDBFE",
    darkSidebarHover: "#1E293B",
    darkSidebarActiveBg: "#60A5FA",
    darkSidebarActiveText: "#0F172A",
  },

  // Oceano — azul profundo e relaxante
  ocean: {
    lightBg: "#F0F7FF",
    lightCard: "#FFFFFF",
    lightAccent: "#0284C7",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#E0F2FE",
    lightSidebarText: "#0369A1",
    lightSidebarHover: "#F0F9FF",
    lightSidebarActiveBg: "#0284C7",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#082F49",
    darkCard: "#0C4A6E",
    darkAccent: "#7DD3FC",
    darkSidebarBg: "#082F49",
    darkSidebarBorder: "#0E7490",
    darkSidebarText: "#E0F2FE",
    darkSidebarHover: "#0C4A6E",
    darkSidebarActiveBg: "#7DD3FC",
    darkSidebarActiveText: "#082F49",
  },

  // Coastal — azul turquesa costeiro
  coastal: {
    lightBg: "#F0F9FF",
    lightCard: "#FFFFFF",
    lightAccent: "#0369A1",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#BAE6FD",
    lightSidebarText: "#0C4A6E",
    lightSidebarHover: "#E0F7FF",
    lightSidebarActiveBg: "#0369A1",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#0F1C2E",
    darkCard: "#162944",
    darkAccent: "#22D3EE",
    darkSidebarBg: "#0F1C2E",
    darkSidebarBorder: "#1E3A5F",
    darkSidebarText: "#BAE6FD",
    darkSidebarHover: "#162944",
    darkSidebarActiveBg: "#22D3EE",
    darkSidebarActiveText: "#0F1C2E",
  },

  // Pôr do Sol — laranja quente e vibrante
  sunset: {
    lightBg: "#FFF7ED",
    lightCard: "#FFFFFF",
    lightAccent: "#C2410C",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#FFEDD5",
    lightSidebarText: "#9A3412",
    lightSidebarHover: "#FFF7ED",
    lightSidebarActiveBg: "#C2410C",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#431407",
    darkCard: "#7C2D12",
    darkAccent: "#FDBA74",
    darkSidebarBg: "#431407",
    darkSidebarBorder: "#9A3412",
    darkSidebarText: "#FFEDD5",
    darkSidebarHover: "#7C2D12",
    darkSidebarActiveBg: "#FDBA74",
    darkSidebarActiveText: "#431407",
  },

  // Lavanda — roxo suave e sofisticado
  lavender: {
    lightBg: "#F5F3FF",
    lightCard: "#FFFFFF",
    lightAccent: "#6D28D9",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#EDE9FE",
    lightSidebarText: "#5B21B6",
    lightSidebarHover: "#F5F3FF",
    lightSidebarActiveBg: "#6D28D9",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#2E1065",
    darkCard: "#4C1D95",
    darkAccent: "#DDD6FE",
    darkSidebarBg: "#2E1065",
    darkSidebarBorder: "#5B21B6",
    darkSidebarText: "#EDE9FE",
    darkSidebarHover: "#4C1D95",
    darkSidebarActiveBg: "#DDD6FE",
    darkSidebarActiveText: "#2E1065",
  },

  // Rosa — rosa vibrante e elegante
  rose: {
    lightBg: "#FFF1F2",
    lightCard: "#FFFFFF",
    lightAccent: "#BE123C",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#FFE4E6",
    lightSidebarText: "#9F1239",
    lightSidebarHover: "#FFF1F2",
    lightSidebarActiveBg: "#BE123C",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#450A0A",
    darkCard: "#881337",
    darkAccent: "#FDA4AF",
    darkSidebarBg: "#450A0A",
    darkSidebarBorder: "#9F1239",
    darkSidebarText: "#FFE4E6",
    darkSidebarHover: "#881337",
    darkSidebarActiveBg: "#FDA4AF",
    darkSidebarActiveText: "#450A0A",
  },

  // Tropical — verde vivo da selva tropical
  tropic: {
    lightBg: "#F0FDF7",
    lightCard: "#FFFFFF",
    lightAccent: "#059669",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#D1FAE5",
    lightSidebarText: "#065F46",
    lightSidebarHover: "#F0FDF7",
    lightSidebarActiveBg: "#059669",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#022C22",
    darkCard: "#064E3B",
    darkAccent: "#34D399",
    darkSidebarBg: "#022C22",
    darkSidebarBorder: "#047857",
    darkSidebarText: "#A7F3D0",
    darkSidebarHover: "#064E3B",
    darkSidebarActiveBg: "#34D399",
    darkSidebarActiveText: "#022C22",
  },

  // Candy 🍬 — rosa chiclete vibrante e divertido
  candy: {
    lightBg: "#FFF0F9",
    lightCard: "#FFFFFF",
    lightAccent: "#DB2777",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#FBCFE8",
    lightSidebarText: "#9D174D",
    lightSidebarHover: "#FDF2F8",
    lightSidebarActiveBg: "#DB2777",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#4A0030",
    darkCard: "#6B1043",
    darkAccent: "#F472B6",
    darkSidebarBg: "#4A0030",
    darkSidebarBorder: "#9D174D",
    darkSidebarText: "#FBCFE8",
    darkSidebarHover: "#6B1043",
    darkSidebarActiveBg: "#F472B6",
    darkSidebarActiveText: "#4A0030",
  },

  // Galaxy 🌌 — índigo profundo estrelado e misterioso
  galaxy: {
    lightBg: "#F5F3FF",
    lightCard: "#FFFFFF",
    lightAccent: "#4F46E5",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#C7D2FE",
    lightSidebarText: "#3730A3",
    lightSidebarHover: "#EEF2FF",
    lightSidebarActiveBg: "#4F46E5",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#13003E",
    darkCard: "#1E0A5C",
    darkAccent: "#A5B4FC",
    darkSidebarBg: "#13003E",
    darkSidebarBorder: "#3730A3",
    darkSidebarText: "#C7D2FE",
    darkSidebarHover: "#1E0A5C",
    darkSidebarActiveBg: "#A5B4FC",
    darkSidebarActiveText: "#13003E",
  },

  // Jade 💎 — jade esmeralda rico e luxuoso
  jade: {
    lightBg: "#F0FDFB",
    lightCard: "#FFFFFF",
    lightAccent: "#0D9488",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#99F6E4",
    lightSidebarText: "#0F766E",
    lightSidebarHover: "#F0FDFA",
    lightSidebarActiveBg: "#0D9488",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#012A22",
    darkCard: "#053A2E",
    darkAccent: "#2DD4BF",
    darkSidebarBg: "#012A22",
    darkSidebarBorder: "#0F766E",
    darkSidebarText: "#99F6E4",
    darkSidebarHover: "#053A2E",
    darkSidebarActiveBg: "#2DD4BF",
    darkSidebarActiveText: "#012A22",
  },

  // Peach 🍑 — pêssego suave e aconchegante
  peach: {
    lightBg: "#FFF8F2",
    lightCard: "#FFFFFF",
    lightAccent: "#EA580C",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#FED7AA",
    lightSidebarText: "#C2410C",
    lightSidebarHover: "#FFF3EC",
    lightSidebarActiveBg: "#EA580C",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#1C0A00",
    darkCard: "#3D1A08",
    darkAccent: "#FB923C",
    darkSidebarBg: "#1C0A00",
    darkSidebarBorder: "#7C2D12",
    darkSidebarText: "#FED7AA",
    darkSidebarHover: "#3D1A08",
    darkSidebarActiveBg: "#FB923C",
    darkSidebarActiveText: "#1C0A00",
  },

  // Explorer 🧭 — Modern Explorer: Cobalt + Solar Orange editorial premium
  explorer: {
    lightBg: "#F5F7FA",
    lightCard: "#FFFFFF",
    lightAccent: "#2E5BFF",
    lightSidebarBg: "#F2F4F7",
    lightSidebarBorder: "#E8ECF4",
    lightSidebarText: "#0040E0",
    lightSidebarHover: "#EAF0FF",
    lightSidebarActiveBg: "#2E5BFF",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#0D1117",
    darkCard: "#161B27",
    darkAccent: "#5A82FF",
    darkSidebarBg: "#0D1117",
    darkSidebarBorder: "#1E2A42",
    darkSidebarText: "#A0B4FF",
    darkSidebarHover: "#161B27",
    darkSidebarActiveBg: "#2E5BFF",
    darkSidebarActiveText: "#FFFFFF",
  },
};

export const ACTIVITY_ICONS = [
  "Calendar",
  "Plane",
  "Bus",
  "Train",
  "Ship",
  "Car",
  "Hotel",
  "Utensils",
  "Coffee",
  "ShoppingBag",
  "Camera",
  "MapPin",
  "Music",
  "Ticket",
  "Umbrella",
  "Mountain",
  "Waves",
  "Palmtree",
  "Wine",
  "Beer",
  "Footprints",
  "Bike",
  "Theater",
  "Landmark",
  "Castle",
  "Church",
  "Stethoscope",
  "Briefcase",
];