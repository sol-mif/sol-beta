// The window's own chrome (#1615): the Mac app (Tauri, titleBarStyle "Overlay", sol/mac/src-tauri/tauri.conf.json) draws the
// three window buttons over the web view, at x 16, y 24 (trafficLightPosition), about 12px each. The face marks the root
// once, data-chrome="mac", only in that window; next.css keys the sidebar's clear band (and its drag region) on it. A
// browser, Windows and Linux have no overlay title bar, so they carry no mark and nothing changes there.
// Signed: marcocyl04-ux's agent (helper lights), #1615.

export type Chrome = "mac" | "";

/** the mark for a window: "mac" when it is the Tauri app on macOS, else none. `force` is the fixture's (?chrome=mac|none) */
export function chromeOf(tauri: boolean, platform: string, force?: string | null): Chrome {
  if (force === "mac") return "mac";
  if (force === "none") return "";
  return tauri && /mac/i.test(platform) ? "mac" : "";
}

/** set the root's mark, once, at start; read from the window itself. Returns what it set */
export function markChrome(force?: string | null): Chrome {
  if (typeof document === "undefined" || typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const c = chromeOf("__TAURI_INTERNALS__" in window, nav.userAgentData?.platform || nav.platform || nav.userAgent || "", force);
  if (c) document.documentElement.dataset.chrome = c; else delete document.documentElement.dataset.chrome;
  return c;
}
