// Is Sol on Marco's screen (#845)? The gate of the one notification: visible, not focused ("I may be using it and just
// waiting"). Visible: the main window is not minimized, not hidden, not under a full-screen app or on another space, and
// the display is awake. Tauri's isVisible says shown, not seen, so the Mac's word is NSWindow's occlusionState: the Rust
// side (lib.rs occlusion_check) reads it twice a second and emits `sol-occluded` (payload: true while covered) when it
// turns: a space change, a full-screen app, another window over it, the screen asleep. Until a rebuilt Sol.app sends it, the face falls back to the page's own
// visibilityState and the window's minimized; a WebKit page goes "hidden" when minimized or on another space, so the
// fallback misses only a window covered by another app's window.

export type Seen = { page: boolean; minimized: boolean; occluded: boolean | null };
/** the gate, from what the window knows: occluded wins when the Mac has said it */
export const visibleOf = (s: Seen): boolean => s.page && !s.minimized && s.occluded !== true;

/** watches the window and calls `changed` with the gate whenever it may have turned; `onLink` (renovation's onWire, given
 *  by the caller so this file stays free of the socket) says it again on every new link; returns its undoing */
export function watchVisible(changed: (visible: boolean) => void, onLink?: (f: (e: { link: boolean } | { msg: unknown }) => void) => () => void): () => void {
  const s: Seen = { page: document.visibilityState === "visible", minimized: false, occluded: null };
  let was: boolean | null = null;
  const tell = () => { const v = visibleOf(s); if (v !== was) { was = v; changed(v); } };
  const tauri = !!(window as any).__TAURI_INTERNALS__;
  let win: { isMinimized: () => Promise<boolean> } | null = null;
  const ask = () => {
    s.page = document.visibilityState === "visible";
    if (!win) { tell(); return; }
    win.isMinimized().then((m) => { s.minimized = !!m; tell(); }, () => tell());
  };
  const offs: (() => void)[] = [];
  let gone = false;
  if (tauri) {
    import("@tauri-apps/api/window").then((w) => { if (!gone) { win = w.getCurrentWindow(); ask(); } }).catch(() => {});
    import("@tauri-apps/api/event").then((ev) => ev.listen<boolean>("sol-occluded", (e) => { s.occluded = !!e.payload; ask(); }))
      .then((f) => { if (gone) f(); else offs.push(f); }).catch(() => {});
  }
  const on = () => ask();
  document.addEventListener("visibilitychange", on);
  window.addEventListener("focus", on);
  window.addEventListener("blur", on);
  window.addEventListener("resize", on);   // a minimize or a restore resizes on some Macs before visibility turns
  const t = window.setInterval(ask, 5000);
  // a new socket starts as no face to the engine: the gate is said again on every link
  if (onLink) offs.push(onLink((e) => { if ("link" in e && e.link) { was = null; ask(); } }));
  ask();
  return () => {
    gone = true;
    document.removeEventListener("visibilitychange", on);
    window.removeEventListener("focus", on); window.removeEventListener("blur", on); window.removeEventListener("resize", on);
    window.clearInterval(t);
    offs.forEach((f) => f());
  };
}
