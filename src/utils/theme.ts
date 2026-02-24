import React from "react";
import { UserSettings } from "../types";
import { THEME_PALETTES } from "../constants";

export function getThemeStyles(settings: UserSettings): React.CSSProperties {
  const palette = THEME_PALETTES[settings.theme_palette] || THEME_PALETTES.default;
  if (settings.dark_mode) {
    return {
      backgroundColor: palette.darkBg,
      color: "#F3F4F6",
      ["--card-bg" as string]: palette.darkCard,
      ["--card-border" as string]: "#374151",
      ["--accent-color" as string]: palette.darkAccent,
      ["--sidebar-bg" as string]: palette.darkSidebarBg,
      ["--sidebar-border" as string]: palette.darkSidebarBorder,
      ["--sidebar-text" as string]: palette.darkSidebarText,
      ["--sidebar-hover" as string]: palette.darkSidebarHover,
      ["--sidebar-active-bg" as string]: palette.darkSidebarActiveBg,
      ["--sidebar-active-text" as string]: palette.darkSidebarActiveText,
    };
  }

  return {
    backgroundColor: palette.lightBg,
    color: "#111827",
    ["--card-bg" as string]: palette.lightCard,
    ["--card-border" as string]: "#E5E7EB",
    ["--accent-color" as string]: palette.lightAccent,
    ["--sidebar-bg" as string]: palette.lightSidebarBg,
    ["--sidebar-border" as string]: palette.lightSidebarBorder,
    ["--sidebar-text" as string]: palette.lightSidebarText,
    ["--sidebar-hover" as string]: palette.lightSidebarHover,
    ["--sidebar-active-bg" as string]: palette.lightSidebarActiveBg,
    ["--sidebar-active-text" as string]: palette.lightSidebarActiveText,
  };
}
