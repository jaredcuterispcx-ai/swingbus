/** Color scheme: dark unless this device picked light. */
export type Theme = "dark" | "light";

export const THEME_KEY = "swingbus.theme";

/** The browser's own bar color (theme-color) per scheme: --void in globals.css. */
const BAR_COLOR: Record<Theme, string> = { dark: "#000000", light: "#ffffff" };
const BAR_META_ID = "sb-theme-color";

/**
 * Inlined in <head> by the root layout, so the first frame already has this
 * device's scheme. It adds the page's only theme-color meta: React adopts a
 * server-rendered meta with the same attributes and drops it on navigation.
 */
export const THEME_BOOT_SCRIPT = `(function () {
  var t = "dark";
  try { if (localStorage.getItem(${JSON.stringify(THEME_KEY)}) === "light") t = "light"; } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
  var m = document.createElement("meta");
  m.id = ${JSON.stringify(BAR_META_ID)};
  m.name = "theme-color";
  m.content = t === "light" ? ${JSON.stringify(BAR_COLOR.light)} : ${JSON.stringify(BAR_COLOR.dark)};
  document.head.prepend(m);
})();`;

const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  let meta = document.getElementById(BAR_META_ID) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = BAR_META_ID;
    meta.name = "theme-color";
    document.head.prepend(meta);
  }
  meta.content = BAR_COLOR[theme];
  for (const listener of listeners) listener();
}

/** Switches the scheme and remembers it on this device. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked (private mode): the switch still applies to this page.
  }
  paint(theme);
}

function onStorage(e: StorageEvent) {
  if (e.key === THEME_KEY) paint(e.newValue === "light" ? "light" : "dark");
}

/** For useSyncExternalStore; also follows a switch made in another tab. */
export function subscribeTheme(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}
