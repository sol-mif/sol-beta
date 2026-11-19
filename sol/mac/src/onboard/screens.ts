// The screens, as this window sees them (#1088), taken without asking: how many, their sizes, which is the main one, where
// they sit. In Sol.app from Tauri's monitor list; in a browser from the Window Management API only when it was already
// allowed (never a prompt here), else the one screen the page knows. Written to the record as `machine.screens`.
export type Screen = { id: string; w: number; h: number; scale: number; main: boolean; x: number; y: number };

const inSol = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function readScreens(): Promise<Screen[]> {
  if (inSol) {
    try {
      const w = await import("@tauri-apps/api/window");
      const [all, main] = await Promise.all([w.availableMonitors(), w.primaryMonitor()]);
      if (all.length) return all.map((m, i) => ({ id: m.name ?? `screen ${i + 1}`, w: Math.round(m.size.width / m.scaleFactor), h: Math.round(m.size.height / m.scaleFactor),
        scale: m.scaleFactor, main: !!main && m.name === main.name && m.position.x === main.position.x, x: Math.round(m.position.x / m.scaleFactor), y: Math.round(m.position.y / m.scaleFactor) }));
    } catch { /* fall to the page's own */ }
  }
  try {
    const p = await (navigator as any).permissions?.query?.({ name: "window-management" });
    const get = (window as any).getScreenDetails;
    if (p?.state === "granted" && get) {
      const d = await get.call(window);
      return d.screens.map((s: any, i: number) => ({ id: s.label || `screen ${i + 1}`, w: s.width, h: s.height, scale: s.devicePixelRatio ?? 1, main: !!s.isPrimary, x: s.left, y: s.top }));
    }
  } catch { /* not offered here */ }
  const s = window.screen;
  return [{ id: "this screen", w: s.width, h: s.height, scale: window.devicePixelRatio || 1, main: true, x: 0, y: 0 }];
}

/** one line for a person: "2 screens · 3024×1964 main, 2560×1440" */
export const screensLine = (s: Screen[]) => `${s.length} screen${s.length === 1 ? "" : "s"} · ${s.map((x) => `${x.w}×${x.h}${x.main && s.length > 1 ? " main" : ""}`).join(", ")}`;
