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
  default: {
    lightBg: "#F8F9FA",
    lightCard: "#FFFFFF",
    lightAccent: "#111111",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#E5E7EB",
    lightSidebarText: "#52525B",
    lightSidebarHover: "#F4F4F5",
    lightSidebarActiveBg: "#111111",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#111827",
    darkCard: "#1F2937",
    darkAccent: "#E5E7EB",
    darkSidebarBg: "#111827",
    darkSidebarBorder: "#374151",
    darkSidebarText: "#D1D5DB",
    darkSidebarHover: "#1F2937",
    darkSidebarActiveBg: "#F3F4F6",
    darkSidebarActiveText: "#111827",
  },
  ocean: {
    lightBg: "#EEF6FF",
    lightCard: "#FFFFFF",
    lightAccent: "#0B5FFF",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#D6E4FF",
    lightSidebarText: "#31538A",
    lightSidebarHover: "#EAF2FF",
    lightSidebarActiveBg: "#0B5FFF",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#0B132B",
    darkCard: "#1C2541",
    darkAccent: "#5BC0BE",
    darkSidebarBg: "#0F1A34",
    darkSidebarBorder: "#22365E",
    darkSidebarText: "#C2D5FF",
    darkSidebarHover: "#1A2A4D",
    darkSidebarActiveBg: "#5BC0BE",
    darkSidebarActiveText: "#06212A",
  },
  forest: {
    lightBg: "#EFFAF3",
    lightCard: "#FFFFFF",
    lightAccent: "#116149",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#D5E8DC",
    lightSidebarText: "#2F5A47",
    lightSidebarHover: "#E6F4EB",
    lightSidebarActiveBg: "#116149",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#10251B",
    darkCard: "#1B3A2A",
    darkAccent: "#8FD694",
    darkSidebarBg: "#132D21",
    darkSidebarBorder: "#2B4B3A",
    darkSidebarText: "#CDE7D3",
    darkSidebarHover: "#1E3E2D",
    darkSidebarActiveBg: "#8FD694",
    darkSidebarActiveText: "#10251B",
  },
  sunset: {
    lightBg: "#FFF4EE",
    lightCard: "#FFFFFF",
    lightAccent: "#D9480F",
    lightSidebarBg: "#FFFFFF",
    lightSidebarBorder: "#F3D8CA",
    lightSidebarText: "#7A3B24",
    lightSidebarHover: "#FFE9DE",
    lightSidebarActiveBg: "#D9480F",
    lightSidebarActiveText: "#FFFFFF",
    darkBg: "#2B1A14",
    darkCard: "#3A251D",
    darkAccent: "#FFB37A",
    darkSidebarBg: "#321E17",
    darkSidebarBorder: "#5C382A",
    darkSidebarText: "#FFD9BF",
    darkSidebarHover: "#4A2C21",
    darkSidebarActiveBg: "#FFB37A",
    darkSidebarActiveText: "#2B1A14",
  },
};
