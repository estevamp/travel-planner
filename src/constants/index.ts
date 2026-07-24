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
    darkOnly?: boolean;
  }
> = {
  // Padrão — azul céu limpo e moderno
  // Dark: navy-slate neutro com leve tom azul, superfícies elevadas e acento vívido
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
    darkBg: "#0F1729",
    darkCard: "#232E4A",
    darkAccent: "#7AABFF",
    darkSidebarBg: "#131C31",
    darkSidebarBorder: "#2A3654",
    darkSidebarText: "#CBDAF5",
    darkSidebarHover: "#232E46",
    darkSidebarActiveBg: "#3B82F6",
    darkSidebarActiveText: "#FFFFFF",
  },

  // Pôr do Sol — laranja quente e vibrante
  // Dark: neutro quase-preto com tom quente, cartão elevado e âmbar legível
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
    darkBg: "#1A1310",
    darkCard: "#332419",
    darkAccent: "#FDA663",
    darkSidebarBg: "#1F1712",
    darkSidebarBorder: "#3D2C1F",
    darkSidebarText: "#F6D6B8",
    darkSidebarHover: "#33261C",
    darkSidebarActiveBg: "#F97316",
    darkSidebarActiveText: "#1A1310",
  },

  // Tropical — verde vivo da selva tropical
  // Dark: neutro escuro com tom verde, superfícies elevadas e esmeralda brilhante
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
    darkBg: "#0C1A14",
    darkCard: "#1C3024",
    darkAccent: "#3DDC9A",
    darkSidebarBg: "#101F18",
    darkSidebarBorder: "#24473A",
    darkSidebarText: "#B6EBD3",
    darkSidebarHover: "#1B3128",
    darkSidebarActiveBg: "#10B981",
    darkSidebarActiveText: "#06120C",
  },

  // Lavanda — roxo suave e sofisticado
  // Dark: neutro escuro com tom violeta, cartão elevado e lavanda vívida
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
    darkBg: "#15111F",
    darkCard: "#2A2140",
    darkAccent: "#B39BFA",
    darkSidebarBg: "#191426",
    darkSidebarBorder: "#362B52",
    darkSidebarText: "#DED6FB",
    darkSidebarHover: "#2A2140",
    darkSidebarActiveBg: "#8B5CF6",
    darkSidebarActiveText: "#FFFFFF",
  },

  // Grafite — tons de cinza neutros, disponível apenas no modo escuro
  graphite: {
    lightBg: "#F0F1F5",
    lightCard: "#FFFFFF",
    lightAccent: "#4E576A",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#E0E4EB",
    lightSidebarText: "#373F4E",
    lightSidebarHover: "#F0F1F5",
    lightSidebarActiveBg: "#4E576A",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#0A0E15",
    darkCard: "#212631",
    darkAccent: "#667085",
    darkSidebarBg: "#212631",
    darkSidebarBorder: "#373F4E",
    darkSidebarText: "#F0F1F5",
    darkSidebarHover: "#373F4E",
    darkSidebarActiveBg: "#4E576A",
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