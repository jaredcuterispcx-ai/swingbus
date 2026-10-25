"use client";

import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";

const serverTheme = (): Theme => "dark";

/** Header switch between dark (the default) and light. CSS picks the icon, so it's right from the first frame. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      className="sb-icon-btn"
      aria-label={label}
      title={label}
      onClick={() => setTheme(currentTheme() === "light" ? "dark" : "light")}
    >
      <SunIcon size={20} className="sb-dark-only" />
      <MoonIcon size={20} className="sb-light-only" />
    </button>
  );
}
