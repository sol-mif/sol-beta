// What of Sol's face is being changed right now (issue #15). One small store per page
// (the main window, a popped-out one), on the page's one link to the engine (socket.ts), so it lives on when the part under work breaks and
// whichever mode is showing: Life or Work, hot or bundled.
//
// Fed by three things. The engine's `changing` events (engine/src/changing.ts): an edit's start tapes its site, a mutate
// or an undo that went through peels the sites its commit touched, the turn's end peels whatever is left. Vite's HMR
// (hot.ts): an update that lands makes its sites shimmer once, a compile error goes to the taped site whose file it
// names. The boundaries (Site.tsx): a part that throws mid-change shows broken until the next update mends it; the
// window it broke in tells the engine (face.broken, face.mended), which takes a recent face edit back if it stays broken.
// (The pings this store once kept are the one notification's moments now, #845: notify/moments.ts.)
//
// Cleared on launch and on reconnect (the engine has no memory of what was taped); a broken part stays broken, that
// is this page's own state. Part of the fence: the seat never edits this file (home/CLAUDE.md).
import { useSyncExternalStore } from "react";
import { siteOf, type SiteName } from "./sites";
import { LANES, seatEnds, seatName, type RGB } from "./creature/ring";
import { CREATURE, FUNCTIONAL } from "./creature/palette";
import { link } from "./socket";
import { ENGINE } from "./engine";   // the one pick (fenced), the same engine useEngine and the away page dial
import * as moments from "./notify/moments";   // the one notification (#845): the window's moments, fed from this link

export type State = "taped" | "landing" | "broken" | "peeling";
export type Entry = {
  site: SiteName; seat: string; sessionId?: string; since: number; files: string[]; state: State;
  line: string;          // the corner's words (empty: the default for the state)
  error?: string;        // a compile error or a render error, its first line
  landAt?: number;       // a shimmer started then (an update landed)
  peelAt?: number;       // the tape comes off from then, cell by cell
  colours: [RGB, RGB];   // the stripes: the seat's slice, or a helper's lane colour
  transient?: boolean;   // a shimmer without tape (a change landed that no seat announced)
};
export type Snapshot = {
  sites: ReadonlyMap<SiteName, Entry>;
  note: string;                // the last thing with no site to go to (a compile error, a page error): the engine drawer
  gen: number;                 // goes up with every HMR update that landed: a broken part tries again
  up: boolean;
};

export const LAND_MS = 1400, PEEL_MS = 900;
const ZERO: Snapshot = { sites: new Map(), note: "", gen: 0, up: false };
let snap: Snapshot = ZERO;
const subs = new Set<() => void>();
function set(patch: Partial<Snapshot>) { snap = { ...snap, ...patch }; for (const f of subs) f(); }
const withSite = (e: Entry | null, site: SiteName) => { const m = new Map(snap.sites); if (e) m.set(site, e); else m.delete(site); return m; };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const current = () => snap;
export function useRenovation(): Snapshot { return useSyncExternalStore(subscribe, current, current); }
// read-only, for a look from outside (the tests of issue #15, the devtools): what is taped, broken, pinged
if (typeof window !== "undefined") (window as unknown as { __solRenovation?: { current: () => Snapshot } }).__solRenovation = { current };

// the stripes' colours: the first session at work wears its seat's gradient ends (home candy/heart, work sun/orange),
// every other one a lane colour of its own (ring.ts LANES)
function coloursFor(seat: string, sessionId?: string): [RGB, RGB] {
  for (const e of snap.sites.values()) if (!e.transient && e.sessionId === sessionId && e.seat === seat) return e.colours;
  const others = new Set([...snap.sites.values()].filter((e) => !e.transient).map((e) => `${e.seat}:${e.sessionId}`));
  if (others.size === 0) {
    return seatEnds(seatName(seat));
  }
  const c = LANES[(others.size - 1) % LANES.length];
  return [c, c];
}
const base = (f: string) => f.split("/").pop() ?? f;
const first = (s: string, n = 96) => { const t = (s.split("\n").find((x) => x.trim()) ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// ---- timers: a landing settles, a peel ends, the store forgets ----
const timers = new Map<SiteName, number>();
function later(site: SiteName, ms: number, fn: () => void) {
  window.clearTimeout(timers.get(site));
  timers.set(site, window.setTimeout(() => { timers.delete(site); fn(); }, Math.max(0, ms)));
}
function peel(site: SiteName, line?: string) {
  const e = snap.sites.get(site);
  if (!e || e.state === "broken") return;   // a broken part keeps its tape until it is mended
  const now = performance.now();
  const at = Math.max(now, (e.landAt ?? 0) + LAND_MS);   // a shimmer still playing finishes first
  set({ sites: withSite({ ...e, state: "peeling", peelAt: at, line: line ?? e.line }, site) });
  later(site, at - now + PEEL_MS, () => {
    const x = snap.sites.get(site);
    if (x?.state === "peeling") set({ sites: withSite(null, site) });
  });
}
function tape(site: SiteName, seat: string, sessionId: string | undefined, file: string | undefined, line: string) {
  const e = snap.sites.get(site);
  const files = e ? [...new Set([...e.files, ...(file ? [file] : [])])] : file ? [file] : [];
  if (e && !e.transient) {
    set({ sites: withSite({ ...e, files, line: line || (e.state === "peeling" ? "" : e.line), state: e.state === "peeling" ? "taped" : e.state, peelAt: undefined }, site) });
    window.clearTimeout(timers.get(site));
    return;
  }
  set({ sites: withSite({ site, seat, sessionId, since: Date.now(), files, state: "taped", line, colours: coloursFor(seat, sessionId) }, site) });
}

// ---- the engine's events ----
export function feed(m: any) {
  if (!m || typeof m.type !== "string") return;
  if (m.type !== "changing") return;
  const seat = String(m.seat ?? "claude"), sessionId = m.sessionId ? String(m.sessionId) : undefined, line = String(m.line ?? "");
  if (m.kind === "edit") {
    const site = siteOf(String(m.file ?? ""));
    if (!site) return;
    if (!m.done) tape(site, seat, sessionId, String(m.file), line);
    return;
  }
  if (m.kind === "mutate" || m.kind === "undo") {
    if (!m.done) return;
    if (!m.ok) return;   // refused: the tape stays, the seat goes on
    const files: string[] = Array.isArray(m.files) ? m.files.map(String) : [];
    const sites = new Set(files.map(siteOf).filter((s): s is SiteName => !!s));
    // undo is a forward change: what it touches is taped now, shimmers when Vite lands it, then peels
    if (m.kind === "undo") for (const s of sites) if (!snap.sites.has(s) || snap.sites.get(s)!.transient) tape(s, seat, sessionId, undefined, line);
    for (const s of sites) peel(s, line);
    return;
  }
  if (m.kind === "turn") {
    for (const e of snap.sites.values()) {
      if (e.transient || e.state === "peeling" || e.state === "broken") continue;
      if (e.sessionId !== sessionId) continue;
      peel(e.site, e.files.length ? "changed, not kept" : "");
    }
  }
}

// ---- Vite's side (hot.ts) ----
export function landed(paths: string[]) {
  const now = performance.now();
  const sites = new Set(paths.map(siteOf).filter((s): s is SiteName => !!s));
  const next = new Map(snap.sites);
  for (const s of sites) {
    const e = next.get(s);
    if (e) next.set(s, { ...e, state: e.state === "broken" || e.state === "peeling" ? e.state : "landing", landAt: now, error: e.state === "broken" ? e.error : undefined });
    else next.set(s, { site: s, seat: "", since: Date.now(), files: [], state: "landing", line: "", landAt: now, colours: [CREATURE.sun, CREATURE.orange], transient: true });
    later(s, LAND_MS, () => {
      const x = snap.sites.get(s);
      if (!x) return;
      if (x.transient) set({ sites: withSite(null, s) });
      else if (x.state === "landing") set({ sites: withSite({ ...x, state: "taped" }, s) });
    });
  }
  set({ sites: next });
  // a broken part tries again once React Refresh has swapped the new code in (it runs a beat after vite:afterUpdate;
  // tried at once, the part would rerun its old, throwing self and stay broken)
  window.setTimeout(() => set({ gen: snap.gen + 1 }), 150);
}
export function compileError(file: string, message: string) {
  const site = file ? siteOf(file) : null;
  const e = site ? snap.sites.get(site) : undefined;
  if (site && e && !e.transient) set({ sites: withSite({ ...e, error: first(message) }, site) });
  else set({ note: `${file ? base(file) + ": " : ""}${first(message)}` });
}
export function pageError(message: string) { set({ note: first(message) }); }

// ---- the boundaries (Site.tsx) ----
// a part that breaks in one window is news for the others too: told over a
// BroadcastChannel, and Tauri's event for webviews that do not share one; a window never re-tells what it heard
const PARTS = "sol-renovation";
let partCh: BroadcastChannel | null = null;
function tell(m: { kind: "broke" | "mended"; site: SiteName; message?: string; from: string }) {
  try { partCh?.postMessage(m); } catch { /* none */ }
  if ((window as any).__TAURI_INTERNALS__) import("@tauri-apps/api/event").then((ev) => ev.emit(PARTS, m)).catch(() => {});
}
const ME = Math.random().toString(36).slice(2);
function heard(m: any) {
  if (!m || m.from === ME || typeof m.site !== "string") return;
  if (m.kind === "broke") broke(m.site, String(m.message ?? ""), true);
  else if (m.kind === "mended") mended(m.site, true);
}
// returns its own undoing (the channel closed, the Tauri listener removed, even if it was still being set up)
function listenParts(): () => void {
  try { partCh = new BroadcastChannel(PARTS); partCh.onmessage = (e) => heard(e.data); } catch { /* none */ }
  let off: (() => void) | null = null, gone = false;
  if ((window as any).__TAURI_INTERNALS__) import("@tauri-apps/api/event").then((ev) => ev.listen(PARTS, (e) => heard(e.payload))).then((f) => { if (gone) f(); else off = f; }).catch(() => {});
  return () => { gone = true; partCh?.close(); partCh = null; off?.(); };
}
// the parts that broke in this window (not heard from another): this window is the one that tells the engine
const mine = new Set<SiteName>();
export function broke(site: SiteName, message: string, told = false) {
  if (!told) { tell({ kind: "broke", site, message, from: ME }); mine.add(site); send({ type: "face.broken", site, error: first(message) }); }
  const e = snap.sites.get(site);
  window.clearTimeout(timers.get(site));
  set({
    sites: withSite(e ? { ...e, state: "broken", error: first(message), transient: false, peelAt: undefined }
      : { site, seat: "", since: Date.now(), files: [], state: "broken", line: "", error: first(message), colours: [FUNCTIONAL.red.strong, FUNCTIONAL.red.soft] }, site),
  });
}
export function mended(site: SiteName, told = false) {
  if (!told) tell({ kind: "mended", site, from: ME });
  const e = snap.sites.get(site);
  if (e?.state !== "broken") return;
  if (mine.delete(site)) send({ type: "face.mended", site });
  if (!e.seat) { set({ sites: withSite(null, site) }); return; }   // nobody announced it: nothing left to peel
  set({ sites: withSite({ ...e, state: "taped", error: undefined, landAt: performance.now() }, site) });
}

// a full reload is coming (vite:beforeFullReload): the page says so for a breath when it is back
const RELOADED = "sol.reloaded";
export function reloading() { try { sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* private */ } }
function welcomeBack() {
  let at = 0;
  try { at = Number(sessionStorage.getItem(RELOADED)) || 0; sessionStorage.removeItem(RELOADED); } catch { /* private */ }
  if (!at || Date.now() - at > 15_000) return;
  const now = performance.now();
  snap = { ...snap, sites: withSite({ site: "face", seat: "", since: Date.now(), files: [], state: "landing", line: "whole face reloaded", landAt: now, colours: [CREATURE.sun, CREATURE.orange], transient: true }, "face") };
  later("face", LAND_MS + 600, () => set({ sites: withSite(null, "face") }));
}

// ---- the window's moments (#845) ----
// a conversation opened in the main window: its moments are seen (notify/moments.ts sends seen { id })
export function seenSession(sessionId?: string) { if (FACE === "window") moments.seenSession(sessionId); }
// ---- the socket ----
// the page's one link to the engine (socket.ts), shared with useEngine: one socket per window
const wire = typeof window === "undefined" || typeof WebSocket === "undefined" ? null : link(ENGINE);
// true when it left: false while the socket is down (nothing is queued), so a press can say it did not go
function send(o: object): boolean { return wire?.send(o) ?? false; }
export const wireSend = send;
// Which face this page is: moments go by it (engine/src/notify.ts).
export const FACE: "window" | "phone" = typeof location === "undefined" ? "window" : location.pathname.includes("away") ? "phone" : "window";
// The creature (creature/state.ts) listens here: this page's link, and the engine's creature/engine messages.
type WireEvent = { link: boolean } | { msg: any };
const wireSubs = new Set<(e: WireEvent) => void>();
let linked = false;
// the engine's standing word since this link opened (engine phase, creature state), the newest of each type:
// a listener that comes late (the app is loaded after the socket opens, main.tsx) hears it too, not only the link
const standing = new Map<string, any>();
const STANDING = new Set(["engine", "creature.state"]);
export function onWire(f: (e: WireEvent) => void) {
  wireSubs.add(f); f({ link: linked });
  if (linked) for (const msg of standing.values()) f({ msg });
  return () => { wireSubs.delete(f); };
}
const tellWire = (e: WireEvent) => {
  if ("link" in e) { linked = e.link; standing.clear(); }
  else if (STANDING.has(e.msg?.type)) standing.set(e.msg.type, e.msg);
  for (const f of wireSubs) f(e);
};
let started = false;
// start() wires this page; stop() unwires it all (its listeners on the link, the part listeners), for a hot reload of
// this module (import.meta.hot.dispose below) or a page going away. The link itself stays: other hooks share it.
let stop: () => void = () => {};
export function start() {
  if (started || !wire) return;
  started = true;
  if (FACE === "window") moments.wireMoments(send);
  welcomeBack();
  const unParts = listenParts();
  const onError = (e: ErrorEvent) => pageError(e.message || "an error on the page");
  const onReject = (e: PromiseRejectionEvent) => pageError(String((e.reason as Error)?.message ?? e.reason ?? "a promise failed"));
  const offLink = wire.onLink((up) => {
    if (!up) { if (snap.up) { set({ up: false }); tellWire({ link: false }); } return; }
    // what was taped before is unknown now; a broken part stays
    const kept = new Map([...snap.sites].filter(([, e]) => e.state === "broken" || e.transient));
    set({ up: true, sites: kept });
    if (FACE === "window") moments.relinked();
    send({ type: "hello", face: FACE });
    tellWire({ link: true });
    for (const site of mine) send({ type: "face.broken", site, error: snap.sites.get(site)?.error ?? "" });   // a new engine knows nothing of it
  });
  const offMsg = wire.on((m) => {
    const t = typeof m?.type === "string" ? m.type : "";
    if (t.startsWith("creature.") || t === "engine") { tellWire({ msg: m }); return; }
    if (FACE === "window" && (t === "moment" || t === "moment.gone")) moments.feed(m);   // the window's moments (#845)
    if (t === "changing") feed(m);   // the rest is useEngine's
  });
  stop = () => {
    started = false;
    offLink(); offMsg();
    unParts();
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
}
// this module hot-reloaded (it is in the fence, so only by hand): the old copy lets go of everything before the new starts
if (import.meta.hot) import.meta.hot.dispose(() => stop());
