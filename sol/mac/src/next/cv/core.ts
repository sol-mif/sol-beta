// The store's core (#1604, docs/port/slices.md "The contract every slice keeps"): the mockup's fake engine
// (mine/look/merge/engine.js, window.CV) ported with its names: D the data, S where the person is, M the moves, load,
// answer, say, and the pure queries more than one slice reads. Only the canvas variant is kept (engine.js VARIANTS.canvas:
// ranked, bring, serious look, peeks measured+); the two comparison modes and the prototype's own renderer are not.
// No slice's own logic lives here: the plane's layout and camera (slice 1) plug in through `hooks`; each slice's moves,
// wires and phrases are their own files under moves/, wire/ and say/, merged by index.ts.
// A slice imports from here (never from ./index.ts), so no file imports itself in a ring.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { useSyncExternalStore } from "react";
import type { Ai, Ask, Cam, Data, Done, Dist, Moves, Piece, Region, Scen, State } from "./types.ts";

export type * from "./types.ts";

// ---------------------------------------------------------------- the store: D, S, and who hears a change

/** D and S are live bindings: read them at the moment, never keep a copy */
export let D: Data = { regions: [], pieces: {}, asks: {}, ais: [] };
export let S: State = fresh();
/** the scenario loaded (fixture only); "" in a real Sol */
export let SCN = "";
/** fixture: the dev page and the tests, filled by load(); live: a real Sol, filled by the wires (wire/*) */
export let MODE: "fixture" | "live" = "live";

let version = 0;
const subs = new Set<() => void>();
/** tell every view the store changed (engine.js render(): the prototype called it after each change) */
export function render(): void { version++; for (const f of [...subs]) { try { f(); } catch { /* one view's trouble is never the store's */ } } }
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** a view's one read of the store: `sel` runs on each change and the view draws what it returns. Views read and press;
 *  they never change D or S themselves */
export function useNext<T>(sel: (d: Data, s: State) => T): T {
  useSyncExternalStore(subscribe, () => version, () => version);
  return sel(D, S);
}
/** a wire or a move changes the store: `f` changes D and S in place, then every view hears it once */
export function change(f: (d: Data, s: State) => void): void { f(D, S); render(); }
/** a wire that fills D from the engine replaces it whole (live), keeping S */
export function setData(d: Data): void { D = d; render(); }

/** the seams the slices plug into (engine.js CV.onLoad, CV.onGoto, CV.onFlash, the plane's settleCam): set by a slice's
 *  moves file at import, never by a view */
export const hooks = {
  /** after a scenario's data is made, before the layout (engine.js CV.onLoad: life.js seeds stickies, diary.js the book) */
  onLoad: [] as ((d: Data, name: string) => void)[],
  /** the plane's first layout by rule (slice 1, plane/layout.ts): fills D.pos and D.zones */
  layout: null as null | (() => void),
  /** the camera after a move (slice 1): Far fits the plane, Middle its region */
  settleCam: null as null | (() => void),
  /** a word on screen for a moment (the shell sets it) */
  flash: null as null | ((words: string) => void),
  /** Find (⌘P) opened (the shell sets it) */
  find: null as null | (() => void),
  /** the working count, if a slice knows better (engine.js CV.working) */
  working: null as null | (() => number),
  /** a slice's keys, asked before the shell's (engine.js onKey): true when it took the key (near's terminal, the diary's
   *  page, the starter's words) */
  keys: [] as ((e: KeyboardEvent) => boolean)[],
  /** how many extra askers' items are open (round 6, people/extra.ts sets it): above() counts them */
  extOpen: null as null | (() => number),
};

// ---------------------------------------------------------------- live: the moves the engine cannot do yet

/** moves whose engine row is "no" (docs/port/map.md): live they answer { ok: false, why: "not yet" } until a wire says
 *  the engine has them (ready). The fixture runs them all */
export const NOT_YET = new Set(["place", "split", "take_back", "withdraw", "headline", "write", "remove_line"]);
const readyNames = new Set<string>();
/** a wire (slice 7's) tells the store the engine answers these moves now */
export function ready(...names: string[]): void { for (const n of names) readyNames.add(n); render(); }
export const isReady = (name: string) => MODE === "fixture" || !NOT_YET.has(name) || readyNames.has(name);
/** set the store's mode: the dev page and tests load a fixture; Next.tsx in a real Sol is live */
export function setMode(m: "fixture" | "live"): void { MODE = m; }

// ---------------------------------------------------------------- scenarios (fixture only: fixture.ts fills SCEN)

export const SCEN: Record<string, Scen> = {};
/** a scenario added from outside (engine.js CV.addScen): runs.js and agent.js added theirs this way */
export function addScen(name: string, s: Scen): void { SCEN[name] = s; }

/** where a person starts (engine.js fresh()) */
export function fresh(): State {
  return {
    dist: "far", region: null, piece: null, pane: "change", beside: null, part: null, keysSide: "main", sel: 0, cam: { x: 0, y: 0, z: 0.3 }, page: null,
    hist: [], fwd: [], marks: {}, recent: [], askHere: null, askLine: null, peek: null, pending: [], pendAt: {}, calm: false, fix: null, follow: null,
    term: {}, doc: {},
    sig: { lastResult: -99, lastCmdEnd: -99, lastScroll: -99, lastKey: -99, lastType: -99, paraStart: null, paraEnd: -99, lastMove: -99, away: false, hold: false, lastSave: -99, lastPane: -99, lastCmdStart: -99, lastAct: -99 },
    c: { moves: 0, presses: 0, answers: 0, order: [], secs: 0, crossings: [], peeks: 0, wrong: 0, demoted: 0, sent: 0, recv: 0, stolen: 0, delayed: 0, tooMuch: 0, mapPath: 0, log: [] },
    lastKind: null, crossFrom: null,
  };
}

/** load a scenario of the fixture (engine.js load): its data, a fresh S at its start, the slices' seeds, the layout */
export function load(name: string): boolean {
  const sc = SCEN[name];
  if (!sc) return false;
  MODE = "fixture";
  SCN = name;
  D = sc.data();
  S = fresh();
  const st = sc.start;
  if (st === "far") S.dist = "far";
  else if (st.region) { S.dist = "middle"; S.region = st.region; }
  else if (st.piece && D.pieces[st.piece]) {
    S.dist = "near"; S.piece = st.piece; S.region = D.pieces[st.piece].region; S.pane = D.pieces[st.piece].kind === "session" ? "change" : "doc";
  }
  for (const fn of hooks.onLoad) { try { fn(D, name); } catch (err) { console.error("next: a seed failed", err); } }
  hooks.layout?.();
  hooks.settleCam?.();
  S.lastKind = kindHere();
  render();
  return true;
}

// ---------------------------------------------------------------- queries (engine.js "helpers"), pure on D and S

export const now = () => performance.now() / 1000;
export const regionOf = (id: string | null | undefined): Region | undefined => (id ? D.regions.find((r) => r.id === id) : undefined);
export const piecesIn = (r: string | null): Piece[] => Object.values(D.pieces).filter((p) => p.region === r);
export const sessions = (): Piece[] => Object.values(D.pieces).filter((p) => p.kind === "session");
export const stickies = (): Piece[] => Object.values(D.pieces).filter((p) => p.kind === "sticky");
/** which of the two old places a piece belongs to: build things or home things */
export const placeOf = (pid: string) => { const k = D.pieces[pid]?.kind; return k === "session" || k === "copies" || k === "arrivals" ? "build" : "home"; };
/** the open asks, ranked; with the fix "fold", one of each run of repeats */
export function open(): Ask[] {
  let a = Object.values(D.asks).filter((x) => !x.answered && !x.withdrawn);
  if (S.fix === "fold") { const seen: Record<string, 1> = {}; a = a.filter((x) => { if (!x.same) return true; if (seen[x.same]) return false; seen[x.same] = 1; return true; }); }
  return a.sort((x, y) => x.rank - y.rank);
}
/** the one count (round 6 · F1): every ask above "From people" on Needs you, the extra askers' (a blocked AI, a move-in
 *  item left for later) and the canvas's. The Needs headline, the Diary's and Far's "N things need you", the sidebar's Diary
 *  row read it; the badge is it plus the people's (people/queue.ts needsCount). One selector, never a per-view sum */
export const above = (): number => open().length + (hooks.extOpen ? hooks.extOpen() : 0);
export const asksOn = (pid: string) => open().filter((a) => a.piece === pid);
export const asksInRegion = (r: string) => open().filter((a) => D.pieces[a.piece]?.region === r);
/** the AIs at work: the top bar's chip and the island's one count (engine.js shell: sessions not waiting) */
export const working = (): number => hooks.working ? hooks.working() : sessions().filter((s) => !s.term?.waiting).length;
/** what kind of place the person is in: the map, code, life or mixed (a crossing is life ↔ code) */
export function kindHere(): string {
  if (S.dist === "far") return "map";
  const r = regionOf(S.region);
  return r ? r.kind : "map";
}
export const lineAsk = (): string | null => S.askLine || S.peek;
/** the pieces at Middle in their order, for ⌘↓ (engine.js piecesShown, canvas: bound and sorted) */
export const piecesShown = () => piecesIn(S.region).filter((p) => !p.inside).map((p) => ({ id: p.id }));
/** a folder's kind is read from what it holds (engine.js zones, K1): build things and life things; arrivals are neither */
export const BUILD_KINDS = new Set(["session", "copies", "starter", "row", "set", "block", "stills"]);
export const LIFE_KINDS = new Set(["doc", "list", "table", "sticky"]);
export function tally(rid: string): { b: number; l: number } {
  let b = 0, l = 0;
  for (const p of piecesIn(rid)) { if (p.inside) continue; if (BUILD_KINDS.has(p.kind)) b++; else if (LIFE_KINDS.has(p.kind)) l++; }
  return { b, l };
}
/** build, life or both by what it holds; an empty folder keeps what it was made as */
export function kindOf(rid: string): "build" | "life" | "both" | null {
  const r = regionOf(rid);
  if (!r) return null;
  const { b, l } = tally(rid);
  if (b && l) return "both"; if (b) return "build"; if (l) return "life";
  return r.kind === "life" ? "life" : r.kind === "mixed" ? "both" : "build";
}
/** the zone a folder sits in: a folder of both goes where it holds most (a tie: Build) */
export function homeOf(rid: string): "build" | "life" {
  const k = kindOf(rid);
  if (k === "build" || k === "life") return k;
  const { b, l } = tally(rid);
  return l > b ? "life" : "build";
}
/** the folders under Build and under Life, in the plane's order (the sidebar's headings, K2) */
export const zoneOrder = (): { build: string[]; life: string[] } => {
  const out = { build: [] as string[], life: [] as string[] };
  for (const r of D.regions) out[homeOf(r.id)].push(r.id);
  return out;
};
/** the crumb as words (engine.js crumbText) */
export function crumbText(): string {
  if (S.dist === "far") return "Far · the map";
  if (S.dist === "needs") return "Needs you";
  const r = regionOf(S.region);
  if (S.dist === "middle") return `Middle · ${r?.name ?? ""}`;
  const p = S.piece ? D.pieces[S.piece] : undefined, b = S.beside ? D.pieces[S.beside] : undefined;
  return `Near · ${r?.name ?? ""} › ${p?.name ?? ""}${b ? "  ‖  " + b.name : ""}`;
}

// ---------------------------------------------------------------- the plane's geometry (engine.js), read by many

/** the view's size: #view's box, else the window less the sidebar and the bar */
export function viewSize(): { w: number; h: number } {
  const v = typeof document !== "undefined" ? document.getElementById("view") : null;
  const iw = typeof innerWidth === "number" ? innerWidth : 1440, ih = typeof innerHeight === "number" ? innerHeight : 900;
  return { w: v && v.clientWidth > 200 ? v.clientWidth : iw - 252, h: v && v.clientHeight > 200 ? v.clientHeight : ih - 48 };
}
export function toScreen(x: number, y: number, cam: Cam = S.cam) { const { w, h } = viewSize(); return { x: (x - cam.x) * cam.z + w / 2, y: (y - cam.y) * cam.z + h / 2 }; }
export function toPlane(sx: number, sy: number, cam: Cam = S.cam) { const { w, h } = viewSize(); return { x: cam.x + (sx - w / 2) / cam.z, y: cam.y + (sy - h / 2) / cam.z }; }
export function rectOn(r: { x: number; y: number; w: number; h: number }, cam: Cam = S.cam) { const a = toScreen(r.x, r.y, cam); return { x: a.x, y: a.y, w: r.w * cam.z, h: r.h * cam.z }; }
/** whether a folder or a piece stands in the view now (engine.js inView): a folder by any part, a piece by its corner */
export function inView(id: string, cam: Cam = S.cam): boolean {
  const q = D.pos?.[id];
  if (!q || S.dist === "near" || S.dist === "needs") return false;
  const { w, h } = viewSize(), r = rectOn(q, cam);
  if (regionOf(id)) return r.x < w && r.x + r.w > 0 && r.y < h && r.y + r.h > 0;
  const cx = r.x + Math.min(r.w, 40) / 2, cy = r.y + Math.min(r.h, 40) / 2;
  return cx >= 0 && cx <= w && cy >= 0 && cy <= h;
}
const camKey = () => (S?.cam ? `${+S.cam.x.toFixed(2)},${+S.cam.y.toFixed(2)},${+S.cam.z.toFixed(4)}` : "");
const camOf = (k: string): Cam => { const [x, y, z] = k.split(",").map(Number); return { x, y, z }; };

// ---------------------------------------------------------------- moving: a spot, history, the tally

/** where the person is, as one string (engine.js snap): history, marks and recent keep these */
export const snap = () => JSON.stringify({ dist: S.dist, region: S.region, piece: S.piece, pane: S.pane, beside: S.beside, part: S.part, page: S.page, cam: camKey() });
export function apply(js: string): void {
  const o = JSON.parse(js);
  if (typeof o.cam === "string" && o.cam) o.cam = camOf(o.cam); else delete o.cam;
  Object.assign(S, o);
}
/** seconds: a keystroke-level estimate (results.md) */
export const COST = { key: 0.3, point: 1.1, orient: 1.2, answer: 2.5, row: 0.35, bring: 0.6 };
/** count a move: its seconds, a crossing between life and code, the recent spots (engine.js track) */
export function track(how: string, before: string, viaKey = true): void {
  S.c.moves++; S.sig.lastMove = now();
  const b = JSON.parse(before), changedView = b.dist !== S.dist || b.region !== S.region || b.piece !== S.piece || b.page !== S.page;
  S.c.secs += (viaKey ? COST.key : COST.point) + (changedView ? COST.orient : 0);
  S.c.log.push(how);
  const k = kindHere();
  if (k === "map") S.sawFar = true;
  if (!S.crossFrom) S.crossFrom = { kind: S.lastKind, steps: 0, far: false };
  S.crossFrom.steps++;
  if (k === "map") S.crossFrom.far = true;
  if (k !== "map" && k !== "mixed") {
    if (S.lastKind && S.lastKind !== "map" && S.lastKind !== "mixed" && k !== S.lastKind) S.c.crossings.push({ from: S.lastKind, to: k, steps: S.crossFrom.steps, far: S.crossFrom.far });
    S.crossFrom = null; S.lastKind = k;
  }
  if (k === "mixed") S.crossFrom = null;
  S.recent = [before, ...S.recent.filter((x) => x !== before)].slice(0, 8);
}
/** a move's answer */
export const done = (ok: boolean, id?: string, undo: () => void = () => {}): Done => ({ ok, id, undo });
export const notYet = (): Done => ({ ok: false, why: "not yet", undo: () => {} });
/** go to a spot: one history step, counted; its undo goes back (engine.js go) */
export function go(spot: Partial<State> & { cam?: Cam | string }, how: string, viaKey = true): Done {
  const sp: Record<string, unknown> = { ...spot };
  if (typeof sp.cam === "string") { if (sp.cam) sp.cam = camOf(sp.cam); else delete sp.cam; }
  const before = snap();
  Object.assign(S, sp);
  if (!("cam" in sp)) hooks.settleCam?.();
  if (snap() === before) return done(false);
  S.hist.push(before); S.fwd = []; S.askHere = null;
  track(how, before, viaKey);
  render();
  return done(true, (S.piece ?? S.region ?? undefined) as string | undefined, () => { apply(before); render(); });
}
/** where a name leads: an ask's piece, an AI's piece, a folder at Middle, a piece at Near (engine.js spotFor) */
export function spotFor(id: string): Partial<State> | null {
  if (D.asks[id]) id = D.asks[id].piece;
  const ai = D.ais.find((a: Ai) => a.name.toLowerCase() === String(id).toLowerCase());
  if (ai) id = ai.piece;
  if (regionOf(id)) return { dist: "middle", region: id, piece: null, beside: null, page: null };
  const p = D.pieces[id];
  if (p) return { dist: "near", region: p.region, piece: id, pane: p.kind === "session" ? "change" : "doc", beside: null, page: null };
  return null;
}
/** the first folder, piece, AI or ask whose words hold these (engine.js findByWords) */
export function findByWords(w: string): string | undefined {
  w = w.toLowerCase().trim();
  const all: [string, string][] = [...D.regions.map((r): [string, string] => [r.id, r.name]), ...Object.values(D.pieces).map((p): [string, string] => [p.id, p.name + " " + (p.copy || "")]),
    ...D.ais.map((a): [string, string] => [a.name, a.name]), ...open().map((a): [string, string] => [a.id, a.text])];
  return all.find(([id, n]) => n.toLowerCase().includes(w) || id.toLowerCase() === w)?.[0];
}

// ---------------------------------------------------------------- answers (engine.js answer, canAnswer, looked)

/** a serious ask is answered with its evidence in front: at Near on its piece, or beside it */
export const looked = (a: Ask) => S.dist === "near" && (S.piece === a.piece || S.beside === a.piece);
export function canAnswer(id: string): boolean {
  const a = D.asks[id];
  if (!a) return false;
  if (a.serious && !looked(a)) return false;
  if (S.askLine === id || S.peek === id) return true;
  if (a.how === "near") return looked(a);
  return typeof document !== "undefined" && !!document.querySelector(`#view [data-ask="${id}"]`);
}
/** answer an ask: yes, or later (it drops a hundred places). Only an ask the person can see is answered */
export function answer(id: string, how: "yes" | "later" = "yes"): boolean {
  const a = D.asks[id];
  if (!a || a.answered || !canAnswer(id)) return false;
  if (how === "later") { a.rank += 100; S.c.presses++; } else { a.answered = true; S.c.answers++; S.c.order.push(a.rank); }
  S.c.secs += COST.answer;
  if (S.askLine === id) S.askLine = null;
  if (S.askHere === id) S.askHere = null;
  if (S.peek === id) S.peek = null;
  render();
  return true;
}

// ---------------------------------------------------------------- the moves every slice shares (engine.js M, the canvas's)

const flash = (t: string) => hooks.flash?.(t);
/** M: these, and each slice's moves merged over them by index.ts (cv/moves/<slice>.ts). Every move answers Done */
export const M: Moves = {
  back() { if (!S.hist.length) return done(false); const before = snap(); S.fwd.push(before); apply(S.hist.pop()!); S.askHere = null; track("back", before); render(); return done(true, undefined, () => { apply(before); render(); }); },
  fwd() { if (!S.fwd.length) return done(false); const before = snap(); S.hist.push(before); apply(S.fwd.pop()!); track("forward", before); render(); return done(true, undefined, () => { apply(before); render(); }); },
  out() {
    if (S.page) return go({ page: null }, "out");
    if (S.dist === "near") return go({ dist: "middle", piece: null, beside: null, part: null }, "out");
    if (S.dist === "middle" || S.dist === "needs") return go({ dist: "far", region: null }, "out");
    return done(false);
  },
  map() { S.c.mapPath++; return go({ dist: "far", region: null, piece: null, beside: null, part: null, page: null }, "map"); },
  dive(target?: string, viaKey = true) {
    if (S.dist === "far") {
      const r = (target && D.pieces[target] ? D.pieces[target].region : target) || D.regions[S.sel % Math.max(1, D.regions.length)]?.id;
      if (!r) return done(false);
      S.sel = 0; return go({ dist: "middle", region: r }, "dive", viaKey);
    }
    if (S.dist === "middle") {
      const ps = piecesShown(), p = target || ps[S.sel % Math.max(1, ps.length)]?.id;
      if (!p || !D.pieces[p]) return done(false);
      S.sel = 0; return go({ dist: "near", piece: p, pane: D.pieces[p].kind === "session" ? "change" : "doc" }, "dive", viaKey);
    }
    return done(false);
  },
  markSet(n: number) { S.marks[n] = snap(); S.c.presses++; flash(`mark ${n} set`); return done(true, String(n), () => { delete S.marks[n]; }); },
  markGo(n: number) { return S.marks[n] ? go(JSON.parse(S.marks[n]), "mark") : done(false); },
  recent(i = 1) { const t = S.recent[i - 1]; return t ? go(JSON.parse(t), "recent") : done(false); },
  goto(id?: string) {
    if (!id) { hooks.find?.(); return done(!!hooks.find); }
    const sp = spotFor(id); return sp ? go(sp, "goto") : done(false);
  },
  /** the next ask: brought to the line where it can be answered in place; a serious one, or one that needs its
   *  evidence, opens its piece at Near (engine.js M.next, canvas) */
  next() {
    S.c.presses++;
    const a = open()[0];
    if (!a) return done(false);
    if (a.how === "inplace" && !(a.serious && S.dist !== "near")) { const was = S.askLine; S.askLine = a.id; S.c.secs += COST.key + COST.bring; render(); return done(true, a.id, () => { S.askLine = was; render(); }); }
    const p = D.pieces[a.piece];
    const r = go({ dist: "near", region: p?.region ?? null, piece: a.piece, pane: p?.kind === "session" ? "change" : "doc", beside: null, page: null }, "next ask");
    S.askHere = a.id; render();
    return { ...r, id: a.id };
  },
  beside() {
    if (S.dist !== "near") return done(false);
    const la = lineAsk(), a = la ? D.asks[la] : undefined;
    if (a && a.serious && !looked(a)) return go({ beside: a.piece }, "look beside");
    if (S.beside) return go({ beside: null }, "pull beside");
    const prev = S.hist.map((h) => JSON.parse(h)).reverse().find((h) => h.piece && h.piece !== S.piece);
    return prev ? go({ beside: prev.piece }, "pull beside") : done(false);
  },
  follow(name?: string) {
    const ais = D.ais;
    if (!ais.length) return done(false);
    const was = S.follow, named = name && ais.find((a) => a.name.toLowerCase() === String(name).toLowerCase());
    S.follow = named ? named.name : ais[(ais.findIndex((a) => a.name === S.follow) + 1) % ais.length].name;
    S.c.presses++; render();
    return done(true, S.follow, () => { S.follow = was; render(); });
  },
  needs() { return go({ dist: "needs" as Dist, piece: null, beside: null, part: null, page: null }, "needs"); },
  undoFix() { const was = S.fix; S.fix = null; render(); return done(true, undefined, () => { S.fix = was; render(); }); },
  tooMuch() { S.c.tooMuch++; S.calm = !S.calm; S.tmStep = S.calm ? 1 : 0; render(); return done(true, undefined, () => { S.calm = !S.calm; render(); }); },
  /** a page over the canvas (the shell's: ais, settings, cowork, social), or back to the canvas with none */
  page(x?: string | null) {
    if (x === "needs") return M.needs();
    const was = S.page; S.page = x || null; render();
    return done(true, S.page ?? undefined, () => { S.page = was; render(); });
  },
};

/** a press on anything that carries data-act="<move>[:<arg>]" (engine.js act): the shell's buttons, the Moves list,
 *  the outline, and any slice's view; the counts press these too */
export function act(s: string): Done {
  const i = s.indexOf(":"), f = i < 0 ? s : s.slice(0, i), arg = i < 0 ? undefined : s.slice(i + 1);
  if (f === "goto") return M.goto(arg);
  if (f === "markSet" || f === "markGo") return M[f](Number(arg));
  if (f === "answer") return arg ? done(answer(arg), arg) : done(false);
  if (f === "later") return arg ? done(answer(arg, "later"), arg) : done(false);
  return M[f] ? M[f](arg) : done(false);
}
