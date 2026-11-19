// One Jelly, several windows onto it (#1090): this window's half of the windows' record. One module store on the
// window's one socket (socket.ts), as cross/store.ts is: with `screens.two` on, the window says which it is
// (`?screen=<win>`, else main), its role and its screen, and hears every change as screens.state. A session opened
// for this window (pressed in an anchor) is opened with the event Build already hears (sol:open-work).
import { useSyncExternalStore } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";
import { screensOn, subScreens } from "./flag";
import { watchDisplays, displaysNow, nativeOff } from "./native";
import { NONE, HOME, winOf, roleAsked, drawnOn, liveWins, type Role, type Screen, type ScreensState, type Lay, type Win } from "./model";

export const ME = typeof location === "undefined" ? HOME : winOf(location.search);
const ASKED = typeof location === "undefined" ? undefined : roleAsked(location.search);

/** the moment something crossed into or out of this window: the seam draws its drop for it */
export type Crossing = { key: number; block: string; title?: string; into: boolean; at: number };
/** a block carried toward the seam on another window (Peek.tsx's Carry), as that window says it; over 0: gone */
export type Carry = { block: string; title: string; w: number; h: number; y: number; over: number; from: string; kind?: string };
/** what stays on every window: how many sessions wait on you, how many run (Build's side tells it, ScreenMap draws it) */
export type Facts = { waits: number; runs: number };
/** a block the session made on the other window that Jev thinks belongs here (0.45 to 0.7, or late): its ghost */
export type Offer = { block: string; title: string; kind: string; until: number };
/** what another window points at (its bar's attachments), shown above this window's box */
export type Pointed = { from: string; on: { id: string; title: string }[] };
/** an arrangement Jev offers (0.45 to 0.7): the map draws its roles dashed; a press takes it */
export type ArrangeOffer = { to: string; roles: Record<string, Role>; block: string | null; from: string; until: number; recall?: string };
type Local = { arrange: ArrangeOffer | null; pointed: Pointed | null; s: ScreensState; crossing: Crossing | null; refused: string | null; carry: Carry | null; facts: Facts; offer: Offer | null; follow: "ghost" | "act" | null };
let local: Local = { arrange: null, pointed: null, s: NONE, crossing: null, refused: null, carry: null, facts: { waits: 0, runs: 0 }, offer: null, follow: null };
const subs = new Set<() => void>();
const set = (p: Partial<Local>) => { local = { ...local, ...p }; subs.forEach((f) => f()); };
export const screensState = () => local.s;
const get = () => local;
/** told on every change of the record (the window shares re-read through it) */
export const subRecord = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useScreens = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, get);

/** the screen this window stands on, as the browser knows it (the window's own rect on the desktop) */
export function myScreen(): Screen | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window.outerWidth || window.innerWidth, h = window.outerHeight || window.innerHeight;
  return w > 0 && h > 0 ? { x: window.screenX || 0, y: window.screenY || 0, w, h } : undefined;
}

const wire = typeof window === "undefined" || typeof WebSocket === "undefined" ? null : link(ENGINE);
const send = (o: object) => wire?.send(o) ?? false;
let titles: Record<string, string> = {};
/** the blocks' titles as the stage knows them, so a crossing can say what crossed */
export const tellTitles = (t: Record<string, string>) => { titles = { ...titles, ...t }; };
let key = 0;
let carryGone: number | undefined;
// the blocks that crossed into this window lately: the stage knows them from the start (no birth wash, no flight)
const crossedIn = new Map<string, number>();
/** this block came here from another window in the last 4 s */
export const crossed = (id: string) => { const t = crossedIn.get(id); return t !== undefined && Date.now() - t < 4000; };
// a popped block's window or a popped session (?block=, ?work=) is not a window of Jelly: it never says hello
const A_WINDOW = typeof location === "undefined" || !/[?&](block|work)=/.test(location.search);
const hello = () => A_WINDOW && send({ type: "screens.hello", win: ME, ...(ASKED ? { role: ASKED } : {}), ...(myScreen() ? { screen: myScreen() } : {}) });
if (wire) {
  wire.onLink((up) => { if (up && screensOn()) hello(); });
  // Sol.app: the main window starts the shell's watch of the displays and says hello again when they change
  const native = () => { if (ME !== HOME || !A_WINDOW) return; if (screensOn()) watchDisplays(() => hello()); else nativeOff(); };
  native(); subScreens(native);
  wire.on((m) => {
    if (m?.type === "screens.state") {
      const was = local.s, s: ScreensState = { ...NONE, ...m, windows: Array.isArray(m.windows) ? m.windows : [] };
      // what crossed: a block drawn here now and not before, or the other way (by the record, so a gone window's fold too)
      let crossing = local.crossing;
      const ids = new Set([...Object.keys(was.where), ...Object.keys(s.where)]);
      for (const id of ids) {
        const a = drawnOn(was, id) === ME, b = drawnOn(s, id) === ME;
        if (a !== b && was.windows.length) { crossing = { key: ++key, block: id, title: titles[id], into: b, at: Date.now() }; if (b) crossedIn.set(id, Date.now()); }
      }
      set({ s, crossing, refused: m.refused ? String(m.refused) : null });
    }
    if (m?.type === "screens.carry" && m.from !== ME && screensOn()) {
      const c = m as Carry;
      window.clearTimeout(carryGone); if (c.over > 0) carryGone = window.setTimeout(() => set({ carry: null }), 1500);   // its window went mid-carry: the peek goes
      set({ carry: c.over > 0 ? { block: String(c.block), title: String(c.title ?? ""), w: +c.w || 0, h: +c.h || 0, y: +c.y || 0, over: +c.over || 0, from: String(c.from), ...(typeof c.kind === "string" ? { kind: c.kind } : {}) } : null });
    }
    if (m?.type === "screens.offer" && m.to === ME && screensOn() && typeof m.block === "string") set({ offer: { block: m.block, title: String(m.title ?? ""), kind: String(m.kind ?? ""), until: Number(m.until) || Date.now() + 8000 } });
    if (m?.type === "screens.at" && m.from !== ME && typeof m.block === "string" && typeof m.y === "number") heardAt.set(m.block, { y: m.y, t: Date.now() });
    if (m?.type === "screens.kept" && screensOn() && typeof m.project === "string" && typeof m.session === "string") {
      const k = asked && asked.project === m.project && asked.session === m.session ? asked.k : null;
      asked = null;
      if (m.pick === "act" && m.kinds && typeof m.kinds === "object") keptKinds = { session: m.session, kinds: Object.fromEntries(Object.entries(m.kinds).filter(([, w]) => typeof w === "string")) as Record<string, string> };
      else if (m.pick === "ghost" && k) offerKept(m.project, k, Object.keys(k.where ?? {}));
    }
    // say where moved a block for this window's words: the crossing is this window's, so ⌘Z takes it back
    if (m?.type === "screens.said" && screensOn()) crossedAt = Date.now();
    if (m?.type === "screens.followed") set({ follow: m.pick === "act" ? "act" : m.pick === "ghost" ? "ghost" : null });
    if (m?.type === "screens.pointed" && m.from !== ME && screensOn()) set({ pointed: Array.isArray(m.on) && m.on.length ? { from: String(m.from), on: m.on } : null });
    if (m?.type === "screens.arrangeOffer" && screensOn()) set({ arrange: m.to ? { to: String(m.to), roles: m.roles ?? {}, block: m.block ?? null, from: String(m.from ?? ""), until: Number(m.until) || Date.now() + 8000 } : null });
    if (m?.type === "screens.jellyAt" && screensOn()) { const away = typeof m.win === "string" && m.win !== ME; if (away) document.documentElement.dataset.jellyAway = "1"; else delete document.documentElement.dataset.jellyAway; }
    if (m?.type === "screens.openHere" && typeof m.session === "string" && screensOn()) window.dispatchEvent(new CustomEvent("sol:open-here", { detail: m.session }));
    if (m?.type === "screens.opened" && m.win === ME && typeof m.session === "string" && screensOn()) {
      window.dispatchEvent(new CustomEvent("sol:open-work", { detail: m.session }));
    }
  });
  subScreens(() => { if (screensOn()) hello(); else { set({ s: NONE }); delete document.documentElement.dataset.jellyAway; } });
  // ⌘Z for a crossing: registered when the face loads, before any stage's own ⌘Z, and it stops the key when it acts
  window.addEventListener("keydown", (ev) => {
    if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey || ev.key.toLowerCase() !== "z") return;
    // a field keeps its own ⌘Z, but for the talk's box while it is empty: the keyboard always rests there (design NOW 06:19 #2d)
    const field = (ev.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]:not([contenteditable=false])") as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
    if (field) {
      const empty = "value" in field ? !field.value : !(field.textContent ?? "").trim();
      if (!(field.closest(".hc-barbox") && empty)) return;
    }
    if (screensOn() && undoCrossing()) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  // anything done after the crossing is what ⌘Z takes back first: a key (not a modifier alone, not ⌘Z itself) or a
  // press on a stage ends the crossing's turn, and the stage's own undo (or the field's) has the key again
  window.addEventListener("keydown", (ev) => {
    if (["Meta", "Control", "Alt", "Shift"].includes(ev.key)) return;
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "z") return;
    crossedAt = 0;
  }, true);
  window.addEventListener("pointerdown", (ev) => { if ((ev.target as HTMLElement | null)?.closest?.(".st-stage")) crossedAt = 0; }, true);
  // the window moved to another screen: say so (a browser has no event; checked when the pointer comes back)
  let last = JSON.stringify(myScreen());
  window.addEventListener("focus", () => { const n = JSON.stringify(myScreen()); if (n !== last && screensOn()) { last = n; hello(); } });
}

/** this window's entry in the record, if it has said hello */
export const meIn = (s: ScreensState): Win | undefined => s.windows.find((w) => w.win === ME);
/** this window's role: null with the switch off or before the engine answers */
export function roleNow(s: ScreensState): Role | null {
  if (!screensOn()) return null;
  // one window alone always shows everything: the other screen gone, the anchor is whole again until it comes back
  if (liveWins(s, ME).length < 2) return meIn(s) ? "whole" : null;
  return meIn(s)?.role ?? null;
}
export const useRole = (): Role | null => { const l = useScreens(); return roleNow(l.s); };
/** more than one window is live: the seams draw, a throw has somewhere to land */
export const many = (s: ScreensState) => liveWins(s, ME).length > 1;

let crossedAt = 0;   // when this window last made a crossing (a throw, a pull, a trade, a gather, the talk)
/** ⌘Z: the last crossing taken back, when it was this window's and within 8 s; false otherwise (the stage's own ⌘Z) */
/** what to do as well when this crossing is taken back (say where: the words go back in the box); one crossing's only */
let undoHook: (() => void) | null = null;
export const onUndoThis = (f: () => void) => { undoHook = f; };
export function undoCrossing(): boolean {
  if (Date.now() - crossedAt > 8000) return false;
  crossedAt = 0;
  const ok = send({ type: "screens.undo" });
  const h = undoHook; undoHook = null;
  if (ok) h?.();
  return ok;
}
export const put = (block: string, win: string | null) => { crossedAt = Date.now(); undoHook = null; return send({ type: "screens.put", block, win }); };
export const setRole = (role: Role, win = ME) => send({ type: "screens.role", win, role });
export const swap = (a: string, b: string) => { crossedAt = Date.now(); return send({ type: "screens.swap", a, b }); };
export const gather = (win = ME, blocks: string[] = []) => { crossedAt = Date.now(); return send({ type: "screens.gather", win, blocks }); };
export const openOn = (session: string) => send({ type: "screens.open", session, from: ME });
export const layOwn = (session: string, places: Lay[]) => send({ type: "screens.lay", win: ME, session, places });
export const talkTo = (win: string) => { crossedAt = Date.now(); return send({ type: "screens.talk", to: win }); };
export const askWhere = (a: { block: string; title: string; kind: string; ask: string; here: string[]; there: string[] }) => send({ type: "screens.where", ...a });
export const askFollow = (a: { seconds: number; presses: number; blocks: string[] }) => send({ type: "screens.follow", ...a });
export const forgetOffer = () => set({ offer: null });
export const forgetFollow = () => set({ follow: null });
/** this window points at blocks (its bar): told to the others when this window does not hold the talk */
export function pointFar(on: { id: string; title: string }[]) {
  const role = roleNow(local.s);
  if (!many(local.s) || role === "whole" || role === "stage") return;
  send({ type: "screens.point", on });
}
/** let go of what another window points at (the chip pressed): that window's pointing is cleared too */
export const letGoFar = () => { set({ pointed: null }); send({ type: "screens.point", on: [] }); };
/** once per message the person sends (Build tells it): Jev may arrange the windows for the job */
export function saidThis(ask: string, block: string | undefined, here: string[], there: string[], open: { id: string; title: string }[] = []) {
  const role = roleNow(local.s);
  if (!many(local.s) || !(role === "whole" || role === "stage")) return;
  // `open`: the session's open blocks, for say where ("the plan to the big one": Jev names one by its title)
  send({ type: "screens.arrange", ask: ask.slice(-300), ...(block ? { block } : {}), here, there, open: open.slice(0, 8) });
}
export const takeArrange = () => {
  const a = local.arrange; set({ arrange: null });
  if (!a) return;
  crossedAt = Date.now();
  if (a.recall) send({ type: "screens.recall", project: a.recall });
  else send({ type: "screens.arrangeTake", to: a.to, from: a.from, ...(a.block ? { block: a.block } : {}) });
};
/** as you left it (design list #5): a project's arrangement is kept as it changes; opening that project again with two
 *  windows live offers it back on the map, dashed, when it differs from how the windows stand now. Never moves alone */
type Kept = { roles: Record<string, Role>; where: Record<string, string>; session?: string };
let lastKept = "";
/** the kinds this session's new blocks open by (design JEV 3, Jev said act): kind → window; one session at a time */
let keptKinds: { session: string; kinds: Record<string, string> } | null = null;
let asked: { project: string; session: string; k: Kept } | null = null;
export const keptKindFor = (session: string, kind: string): string | null =>
  keptKinds && keptKinds.session === session && Object.prototype.hasOwnProperty.call(keptKinds.kinds, kind) ? keptKinds.kinds[kind] : null;
export function keepProject(project: string, blocks: string[], session = "", kinds: Record<string, string> = {}) {
  if (!project || !many(local.s)) return;
  if (local.arrange?.recall === project && Date.now() < local.arrange.until) return;   // its offer is out: keep it as it was until taken or gone
  const sig = JSON.stringify([project, local.s.where, local.s.windows.filter((w) => w.live).map((w) => [w.win, w.role])]);
  if (sig === lastKept) return;
  lastKept = sig;
  send({ type: "screens.keep", project, blocks, ...(session ? { session, kinds } : {}) });
}
/** a session of a project opened with two windows live. The same session as last time: nothing (the record already puts
 *  each block where it was left, from the first frame). Another session of it: Jev is asked once (design JEV 3); its
 *  answer comes back as screens.kept: act, new blocks open where their kind lived; ghost, the arrangement offered */
export function projectOpened(project: string, blocks: string[], session = "", now: { title: string; kind: string }[] = []) {
  if (!project || !many(local.s)) return;
  const has = (o: unknown, key: string) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key);
  const k = has(local.s.kept, project) ? (local.s.kept as Record<string, Kept>)[project] : undefined;
  if (!k || !k.roles || typeof k.roles !== "object" || !k.where || typeof k.where !== "object") return;
  if (session && typeof k.session === "string") {
    if (k.session === session) return;
    keptKinds = null;
    asked = { project, session, k: { roles: { ...k.roles }, where: { ...k.where } } };   // as it was when asked: a keep meanwhile overwrites the record's
    send({ type: "screens.keptAsk", project, session, blocks: now.slice(0, 6) });
    return;
  }
  offerKept(project, k, blocks);
}
function offerKept(project: string, k: Kept, blocks: string[]) {
  const has = (o: unknown, key: string) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key);
  const live = local.s.windows.filter((w) => w.live);
  const rolesDiffer = live.some((w) => has(k.roles, w.win) && k.roles[w.win] !== w.role);
  const whereDiffers = blocks.some((b) => (has(k.where, b) ? k.where[b] : null) !== (has(local.s.where, b) ? local.s.where[b] : null));
  if (!rolesDiffer && !whereDiffers) return;
  set({ arrange: { to: "as you left it", roles: k.roles, block: null, from: ME, until: Date.now() + 8000, recall: project } });
}
export const forgetArrange = () => set({ arrange: null });
/** the jelly is on this window (a block here waits on the person): told to the others, whose own jelly then hides */
export const tellJelly = (here: boolean) => send({ type: "screens.jelly", here });
/** the session Build shows in this window (Home tells it): the seam's watches follow it */
let sessionNow: string | null = null;
const sessionSubs = new Set<() => void>();
export const tellSession = (id: string | null) => { if (id !== sessionNow) { sessionNow = id; sessionSubs.forEach((f) => f()); } };
export const useSessionNow = () => useSyncExternalStore((f) => { sessionSubs.add(f); return () => { sessionSubs.delete(f); }; }, () => sessionNow);
export const keepFor = (project: string, blocks: string[]) => send({ type: "screens.keep", project, blocks });
export const recallFor = (project: string) => send({ type: "screens.recall", project });
/** the session another live window shows (the record's open): what an anchor that takes a stage opens */
export function sessionElsewhere(s: ScreensState = local.s): string | null {
  const others = s.windows.filter((w) => w.live && w.win !== ME);
  // the window with the talk first: its session is the one being worked
  const talk = others.find((w) => w.role === "whole" || w.role === "stage");
  if (talk && Object.prototype.hasOwnProperty.call(s.open, talk.win)) return s.open[talk.win];
  const live = new Set(others.map((w) => w.win));
  return Object.entries(s.open).find(([w]) => live.has(w))?.[1] ?? null;
}
/** the session this window shows, told to the record (the window with the talk tells it) */
export const tellShowing = (session: string) => send({ type: "screens.showing", session });

/** a block drawn here changed: its height on this window (0..1), told to the others; and what the others told */
const heardAt = new Map<string, { y: number; t: number }>();
export const tellAt = (block: string, y: number) => send({ type: "screens.at", block, y });
/** the height another window said a block of its own changed at, in the last second */
export const changedAt = (block: string): number | null => { const a = heardAt.get(block); return a && Date.now() - a.t < 1000 ? a.y : null; };
/** this window's carry, told to the others (the engine relays it and keeps nothing) */
export const carrying = (c: Omit<Carry, "from">) => send({ type: "screens.carry", ...c });
/** the facts Build's side counts, told once they change */
export function tellFacts(f: Facts) { if (f.waits !== local.facts.waits || f.runs !== local.facts.runs) set({ facts: f }); }

/** the person's screens as onboarding found them (part 1: ~/.sol/record/me.json machine.screens, its copy in this
 *  window's storage `sol.record.machine.screens`): how many, the main one and another. The one place it is read */
export type RecordScreens = { screens?: number; main?: Screen; other?: Screen };
export function record(): RecordScreens {
  try {
    // the record first (onboarding found them); in Sol.app without it, the shell's own reading
    const raw = JSON.parse(localStorage.getItem("sol.record.machine.screens") ?? "null") ?? (displaysNow().length ? displaysNow() : null);
    if (!Array.isArray(raw) || !raw.length) return {};
    const rect = (d: { x?: number; y?: number; w?: number; h?: number }): Screen | undefined =>
      [d.x, d.y, d.w, d.h].every((v) => typeof v === "number" && Number.isFinite(v)) && d.w! > 0 && d.h! > 0 ? { x: d.x!, y: d.y!, w: d.w!, h: d.h! } : undefined;
    const main = raw.find((d) => d?.main) ?? raw[0];
    const other = raw.find((d) => d !== main);
    return { screens: raw.length, main: rect(main), other: other ? rect(other) : undefined };
  } catch { return {}; }
}
