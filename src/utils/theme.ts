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
      ["--card-border" as string]: palette.darkSidebarBorder, // LAYOUT FIX: usa border do tema
      ["--accent-color" as string]: palette.darkAccent,
      ["--card-shadow" as string]: "0 2px 8px 0 rgba(0,0,0,0.4), 0 0 0 1px " + palette.darkSidebarBorder,
      ["--input-border" as string]: palette.darkSidebarBorder,
      ["--input-focus-ring" as string]: palette.darkAccent + "33",
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
    ["--card-border" as string]: palette.lightSidebarBorder, // LAYOUT FIX: usa border do tema
    ["--accent-color" as string]: palette.lightAccent,
    ["--card-shadow" as string]: "0 1px 4px 0 rgba(0,0,0,0.07), 0 0 0 1px " + palette.lightSidebarBorder,
    ["--input-border" as string]: palette.lightSidebarBorder,
    ["--input-focus-ring" as string]: palette.lightAccent + "33", // 20% opacity
    ["--sidebar-bg" as string]: palette.lightSidebarBg,
    ["--sidebar-border" as string]: palette.lightSidebarBorder,
    ["--sidebar-text" as string]: palette.lightSidebarText,
    ["--sidebar-hover" as string]: palette.lightSidebarHover,
    ["--sidebar-active-bg" as string]: palette.lightSidebarActiveBg,
    ["--sidebar-active-text" as string]: palette.lightSidebarActiveText,
  };
}
