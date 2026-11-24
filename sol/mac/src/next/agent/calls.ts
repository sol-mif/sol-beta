// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The AI's call path (mine/look/merge/agent.js, ported as it is): call(ai, name, args) runs the gate (do / draft / ask, or
// refused for a person-only act), then the move by the function's name, then one ledger row {t, who, fn, args, gate} that
// keeps the change it made as paths, so each row is undone alone. Drafts wait in arrivals until pressed; an ask that was
// said yes to runs its move as the person's. Also: since(), the headline with its proof, Dev's night (ai-night) and the
// maps of count 13 (one set of moves). Fixture only for now: live, the ledger is slice 7's next.call (map.md "the gate and
// the ledger": no), so moves/ais.ts answers "not yet" there.
// What other slices own is reached by name, never imported: M.<move> for their moves (a missing one is a row with
// `missing`, as the mockup did), and hooks.put / hooks.diary / hooks.learner when they set them (docs/port/requests/ais.md).
// Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { D, S, M, hooks, now, open, findByWords, regionOf, piecesIn, asksOn, asksInRegion, render, subscribe, snap, go, SCN } from "../cv/core.ts";
import type { Ask, Data, Piece, Pos } from "../cv/core.ts";
import { FN, FN_NAMES, fnByName, SPEC } from "./functions.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const J = (x: unknown) => JSON.stringify(x);
/** JSON with object keys sorted: two worlds compare equal whatever order their keys were written in */
export const K = (x: unknown) => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(J(x)));
const has = (n: string) => typeof M[n] === "function";
/** the seams other slices may fill (requests/ais.md): the plane's put, the diary, the learner's queue */
type Seams = { put?: (id: string, spot: Pos & { region?: string }, by: string) => unknown; touch?: (id: string) => void;
  diary?: { fromRow(r: Row): void; claim(seq0: number, r: Row): void; book(): { seq: number }; since(t: number): unknown; headline(): Head | null; byId(id: string): Any; note(x: Any): void };
  learner?: { queue: string[] } };
const seams = () => hooks as unknown as Seams;
const localLearner = { queue: [] as string[] };
const learner = () => seams().learner ?? localLearner;

// ---------------------------------------------------------------- the person-only acts: an AI that calls one is refused

const CAMERA = ["pan", "zoom", "enter", "leave", "in", "out", "jump", "goto", "dive", "map", "back", "fwd", "recent", "markGo", "markSet", "door", "drawer", "pane", "next", "follow"];
export const REFUSE: Record<string, string> = {
  camera: "Moving the camera is yours; I can point at it instead.",
  answer: "Accepting or refusing a change is yours; I can ask.",
  serious: "A serious ask is yours to answer.",
  setting: "Settings are yours, including how far I may go; I can offer a change.",
  project: "Keeping or removing a project is yours; I can propose it.",
  placed: "That piece is where you put it; I can propose a spot.",
  words: "Your words in the diary are yours; I can write a line of my own.",
};
export const PERSON_ONLY: Record<string, string> = {
  answer: "answer", accept: "answer", refuse: "answer", keep: "answer", applyFix: "setting", undoFix: "setting", offer_answer: "setting",
  set: "setting", setting: "setting", reach: "setting", tooMuch: "setting", remove_region: "project", keep_region: "project", remove: "project",
};
for (const n of CAMERA) PERSON_ONLY[n] = "camera";
PERSON_ONLY.flip = "camera"; PERSON_ONLY.pause_diary = "setting"; PERSON_ONLY.to_sticky = "words";
for (const n of ["see_groups", "see_social", "open_group", "open_friend", "first_time", "see_as_friend", "next_wait"]) PERSON_ONLY[n] = "camera";
PERSON_ONLY.see_seats = "camera"; PERSON_ONLY.sign_in = PERSON_ONLY.remind_later = "setting";   // slice 6b (agent.js round 6; docs/port/requests/seats.md)
PERSON_ONLY.answer_wait = PERSON_ONLY.answer_card = "answer"; PERSON_ONLY.pick_face = PERSON_ONLY.make_close = PERSON_ONLY.make_link = "setting"; PERSON_ONLY.leave_group = "project";
/* the port's one addition: the shell's page over the canvas (S.page) moves what the person sees, as people.js's pages did */
PERSON_ONLY.page = "camera";
/* the join's (#1615): the other slices' own moves. Choosing, the diary chip, a zone chip, a split job's part and the
   Settings panel's looking move what the person sees; a touch makes a piece the person's; a Settings change and the way
   back to the old Sol are theirs */
for (const n of ["choose", "toDiary", "toEdge", "openPart", "closePart", "stOpen", "stClose", "stFind", "stSel", "stHover", "stPoint", "stWorked"]) PERSON_ONLY[n] = "camera";
PERSON_ONLY.touch = "placed";
for (const n of ["stPick", "stTry", "stKeep", "stLeave", "stUndo", "stAsk", "stPreview", "stReplay", "stPlace", "stWay", "stAct", "oldSol"]) PERSON_ONLY[n] = "setting";
/* slice 12 (agent.js round 6): opening Your own pieces moves what the person sees; using a piece or setting one aside is theirs (an AI may propose one) */
PERSON_ONLY.see_pieces = "camera"; for (const n of ["use_piece", "piece_state", "set_pieces_aside"]) PERSON_ONLY[n] = "setting";
/* BR1 pieces by hand (#1615): folding, resizing and taking a piece off the canvas arrange it the person's way (an AI places, or proposes a spot) */
for (const n of ["fold", "resize", "offCanvas"]) PERSON_ONLY[n] = "placed";
/* BR1 (#1615): keeping a suggested setup is the person's; the tab row's moves move what they see (an AI asks through the engine's three verbs) */
for (const n of ["wsPreview", "wsSkip", "wsKeep", "wsDiscard", "wsUndo", "tabOffer", "tabUndo", "tabUndoGone"]) PERSON_ONLY[n] = "setting";
for (const n of ["tabNew", "tabOpen", "tabFront", "tabClose", "tabDrop"]) PERSON_ONLY[n] = "camera";   // tabNew: the tab row's ＋ (Look 1 A3)
export function refusal(name: string, args: Any): string | null {
  if (PERSON_ONLY[name]) return REFUSE[PERSON_ONLY[name]];
  if (name === "remove_line") { const l = seams().diary?.byId(args?.line); if (l && l.mine) return REFUSE.words; }
  if (name === "ask" && args && args.answer) return REFUSE.answer;
  return null;
}

// ---------------------------------------------------------------- the world an AI can change: D and the learner's offers

type World = { D: Data; Lq: string[] };
const world = (): World => ({ D, Lq: learner().queue });
export const snapW = (): World => clone(world());
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
export type Change = { path: string[]; kind: "set"; before: unknown; after: unknown } | { path: string[]; kind: "bag"; added: string[]; removed: string[] };
/** a change is a path set from before to after; an array is a bag (what a row added or removed), so two rows that each
 *  push into the same list can still be undone one without the other */
export function diff(b: unknown, a: unknown, path: string[] = [], out: Change[] = []): Change[] {
  if (isObj(b) && isObj(a)) { for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) diff(b[k], a[k], path.concat(k), out); return out; }
  if (Array.isArray(b) && Array.isArray(a)) {
    const bs = b.map((x) => K(x)), as = a.map((x) => K(x)), rest = [...bs], added: string[] = [];
    for (const x of as) { const i = rest.indexOf(x); if (i >= 0) rest.splice(i, 1); else added.push(x); }
    if (added.length || rest.length) out.push({ path, kind: "bag", added, removed: rest });
    return out;
  }
  if (K(b) !== K(a)) out.push({ path, kind: "set", before: clone(b), after: clone(a) });
  return out;
}
export function at(path: string[]): Any { let o: Any = world(); for (const k of path) { if (o == null) return undefined; o = o[k]; } return o; }
function put(path: string[], v: unknown): void {
  if (path[0] === "Lq" && path.length === 1) return;
  let o: Any = world();
  for (const k of path.slice(0, -1)) { if (o[k] == null) o[k] = {}; o = o[k]; }
  const k = path[path.length - 1];
  if (v === undefined) delete o[k]; else o[k] = clone(v);
}
/** dir "undo" turns after into before; "redo" the other way. Dry first: if anything changed since, nothing is touched */
export function applyChanges(ch: Change[], dir: "undo" | "redo"): { ok: boolean; path?: string[] } {
  const from = dir === "undo" ? "after" : "before", to = dir === "undo" ? "before" : "after";
  for (const c of ch) {
    if (c.kind === "set") { if (K(at(c.path)) !== K(c[from])) return { ok: false, path: c.path }; }
    else {
      const arr = at(c.path); if (!Array.isArray(arr)) return { ok: false, path: c.path };
      const bag = arr.map((x) => K(x));
      for (const x of dir === "undo" ? c.added : c.removed) { const i = bag.indexOf(x); if (i < 0) return { ok: false, path: c.path }; bag.splice(i, 1); }
    }
  }
  for (const c of ch) {
    if (c.kind === "set") put(c.path, c[to]);
    else {
      const arr = at(c.path) as unknown[], take = dir === "undo" ? c.added : c.removed, give = dir === "undo" ? c.removed : c.added;
      for (const x of take) { const i = arr.findIndex((y) => K(y) === x); arr.splice(i, 1); }
      for (const x of give) arr.push(JSON.parse(x));
    }
  }
  tidy();
  return { ok: true };
}
/** an ask that left (undone or withdrawn) leaves nothing pointing at it */
function tidy(): void {
  const live = (id: string) => !!D.asks[id] && !D.asks[id].answered;
  S.pending = S.pending.filter(live);
  if (S.peek && !live(S.peek)) S.peek = null;
  if (S.askLine && !live(S.askLine)) S.askLine = null;
}

// ---------------------------------------------------------------- the ledger: one row per call, bound to the canvas it was made on

export type Row = { id: string; t: number; who: string; fn: string; args: Any; gate: string; ok: boolean; missing: string | null; line: string | null;
  value: Any; changes: Change[]; undone: boolean; via?: string };
type Res = { ok?: boolean; value?: Any; line?: string | null; missing?: string } | null | undefined;
let H: Row[] = [], owner: Data | null = null, seq = 0;
export const hist = (): Row[] => { if (owner !== D) { H = []; owner = D; } return H; };
/** the clock: live by default; the night sets its own minutes */
let clock: number | null = null;
const base = Date.UTC(2026, 10, 17, 0, 0) / 1000 / 60;   // the evening before the canvas's Wednesday
export const T = (hm: string) => { const [h, m] = hm.split(":").map(Number); return (base + (h < 12 ? 24 * 60 : 0) + h * 60 + m) * 60000; };
const tNow = () => (clock != null ? clock : Date.now());
export const hm = (t: number) => { const d = new Date(t); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };

// ---------------------------------------------------------------- the gate, per function, as functions.json says

/** the one voice: ui.html's own name for the AI that speaks for all of them */
export const VOICE = "Your AI";
const aiOf = (n: string) => (D.ais || []).find((a) => a.name.toLowerCase() === String(n).toLowerCase()) || null;
/** how far an AI may go and its limit: the AI's own settings (person-only to change); D.aiSet over the default
 *  (runs.js setOf; its AI_SET table is the runs' slice's, read through D.aiSet when it fills it) */
const setOf = (n: string): { reach: string; limit: number; spent: number } => ({ reach: "asks first", limit: 10, spent: 0, ...((D.aiSet as Any)?.[n] || {}) });
const startGate = (a: Any) => {
  const st = setOf(a.ai || VOICE);
  const over = a.cost != null && a.cost > st.limit - st.spent;
  return over ? "ask" : st.reach === "goes ahead" ? "do" : "draft";
};
const rank3 = (g: string) => (({ do: 0, draft: 1, ask: 2 }) as Record<string, number>)[g];
/** a run, or a part inside a split job (runs.js find) */
export function find(id: string | null | undefined): { p: Piece; parent: Piece | null } | null {
  if (!id) return null;
  if (D.pieces[id]) return { p: D.pieces[id], parent: null };
  for (const q of Object.values(D.pieces)) for (const x of (q.parts || []) as Piece[]) if (x && x.id === id) return { p: x, parent: q };
  return null;
}
export const partsOf = (pid: string): string[] => {
  const p = D.pieces[pid]; if (!p) return [];
  const ids = Array.isArray(p.parts) ? p.parts.map((x: Any) => (typeof x === "string" ? x : x.id)) : [];
  return ids.length ? ids : Object.values(D.pieces).filter((q) => q.parent === pid).map((q) => q.id);
};
export const GATE: Record<string, (a: Any, ai: string) => string> = {
  look: () => "do", read: () => "do", needs: () => "do", since: () => "do", find: () => "do",
  make: (a) => (a.asked ? "do" : "draft"),
  place: (a, ai) => { const pos = (D.pos || {})[a.piece] as Any; return pos && pos.by === "ai" && pos.ai === ai && !pos.touched ? "do" : "draft"; },
  group: () => "ask",
  split: (a, ai) => { const p = D.pieces[a.piece] || ({} as Piece); return p.by === ai || p.madeBy === ai ? "do" : "draft"; },
  attach: () => "draft",
  start: (a) => startGate(a),
  split_run: (a) => (a.parts || []).map((p: Any) => startGate(p)).reduce((g: string, x: string) => (rank3(x) > rank3(g) ? x : g), "do"),
  pass: () => "do", redirect: () => "do", pause: () => "do", resume: () => "do",
  stop: (a) => (partsOf(a.run).length ? "ask" : "do"),
  check: (a) => { const p = D.pieces[a.run] || ({} as Piece), r = (regionOf(p.region) || {}) as Any, rule = r.check || "never"; return rule === "always" || (rule === "code" && r.kind === "code") ? "do" : "draft"; },
  take_back: () => "ask",
  ask: () => "do", withdraw: () => "do", tell: () => "do", headline: () => "do",
  offer: () => "draft", point: () => "do", beside: () => "draft",
  /* the diary is the AI's own zone; Life is the person's (P13), so a sticky waits unless asked, and dropping one asks */
  write: () => "do", remove_line: () => "do",
  sticky: () => "do", run_sticky: () => "do", finish: () => "draft", drop: () => "ask", due: () => "do",
};

// ---------------------------------------------------------------- rank is computed, never claimed

const TIER: Record<string, number> = { serious: 1, money: 2, holds: 3, due: 4, other: 6 };
function rankFor(a: Any): number {
  const t = a.serious ? "serious" : a.reaches in TIER ? a.reaches : a.due ? "due" : "other";
  const same = Object.values(D.asks).filter((x) => !x.answered && Math.floor(x.rank) === TIER[t]).length;
  return TIER[t] + 0.5 + same * 0.01;
}
function newAsk(ai: string, a: Any, extra: Any = {}): string {
  const id = "ai" + ++seq + "-" + Date.now().toString(36).slice(-3);
  /* a part of a split job is not a piece of its own: the ask sits on its parent, named for the part */
  const f = !D.pieces[a.piece] ? find(a.piece) : null;
  if (f && f.parent) extra = { part: a.piece, ...extra };
  const piece = f && f.parent ? f.parent.id : D.pieces[a.piece] ? a.piece : Object.keys(D.pieces)[0];
  D.asks[id] = { id, rank: rankFor(a), piece, kind: a.kind || ((D.pieces[piece] || ({} as Piece)).kind === "session" ? "code" : "life"),
    source: a.source || `${ai} · ${a.what || "asks"}`, text: a.words, how: "inplace", answered: false, by: ai,
    serious: !!a.serious, reaches: a.reaches || null, due: a.due || null, yes: a.yes || null, ...extra } as Ask;
  if (!batch) { S.pending.push(id); S.pendAt[id] = now(); }   // it peeks only at a measured pause (the engine's rule); a night's asks wait in the list
  return id;
}

// ---------------------------------------------------------------- drafts: land in arrivals, nothing changes until pressed

export const TODAY = 7;
function newDraft(ai: string, fn: string, args: Any, what: string): string {
  const id = "dr" + ++seq;
  const drafts = (D.drafts ||= {}) as Any;
  const pid = args.session || args.piece || args.run || args.parent || null, p = pid && D.pieces[pid], rid = p ? p.region : args.region;
  const arr = Object.values(D.pieces).find((q) => q.kind === "arrivals" && q.region === rid);
  drafts[id] = { id, ai, fn, args: clone(args), what, region: rid || null, arrivals: arr ? arr.id : null, pressed: false };
  if (arr) (arr.items as Any[]).push({ day: TODAY, ai, what, draft: id, accepted: false });
  return id;
}

// ---------------------------------------------------------------- the moves each function runs (by the contract's names)

const missing = new Set<string>();
function move(name: string, ...a: Any[]): Res {
  if (!has(name)) { missing.add("M." + name); return { missing: "M." + name }; }
  const r = M[name](...a) as Any;
  return { ok: !r || r.ok !== false, value: r, line: (r && r.why) || null };
}
export function readOf(target: string): Any {
  const ask = D.asks[target], p = D.pieces[target], r = regionOf(target), ai = aiOf(target);
  if (ask) return { ask: clone(ask) };
  if (p) return { piece: clone(p), pos: clone((D.pos || {})[target]), asks: asksOn(target).map((x) => x.id), parts: partsOf(target) };
  if (r) return { region: clone(r), pieces: piecesIn(target).map((x) => x.id), asks: asksInRegion(target).map((x) => x.id) };
  if (ai) return { ai: clone(ai) };
  return null;
}
/** a measured pause (engine.js wrongMoment, nearTyping on the canvas) */
const wrongMoment = (sig: Any, t: number) => t - sig.lastResult < 5 || t - sig.lastScroll < 5 || (sig.paraStart != null && t - sig.lastType < 8);
export const RUN: Record<string, (a: Any, ai: string) => Res | Any> = {
  look: () => ({ band: S.band || S.dist, region: S.region, piece: S.piece, beside: S.beside, cam: clone(S.cam),
    pause: !wrongMoment(S.sig, now()) && !(S.dist === "near" && S.sig.paraStart != null) }),
  read: (a) => readOf(a.target),
  needs: () => open().map((x) => ({ id: x.id, text: x.text, rank: x.rank })),
  since: (a) => since(a.time),
  find: (a) => { const id = findByWords(a.words || ""); return id ? [id] : []; },
  make: (a) => move("make", a.kind, a.title, a.region, a.near),
  place: (a) => { const put = seams().put; if (!put) { missing.add("plane.put"); return { missing: "plane.put" }; } return { ok: true, value: put(a.piece, a.near, "ai") }; },
  split: (a) => move("split", a.piece, a.parts),
  start: (a, ai) => move("start", { ai: a.ai, words: a.words, region: a.region, given: a.given, reach: "goes ahead", by: ai === "person" ? "person" : "ai" }),
  split_run: (a) => move("split_run", a.parent, a.parts),
  pass: (a) => move("pass", a.run, a.to),
  redirect: (a) => move("redirect", a.run, a.words),
  pause: (a) => move("pause", a.run), resume: (a) => move("resume", a.run), stop: (a) => move("stop", a.run),
  check: (a) => move("check", a.run, a.checker),
  attach: (a) => move("attach", a.session, a.block),
  group: (a, ai) => move("group", a.pieces, null, { confirmed: ai === "person" }),   // the evidence is the engine's to find, never the AI's word
  take_back: (a) => move("take_back", a.run),
  ask: (a, ai) => ({ ok: true, value: newAsk(ai, a) }),
  withdraw: (a, ai) => {
    const x = D.asks[a.ask];
    if (!x || x.by !== ai || x.answered) return { ok: false, line: "That ask is not mine to take back." };
    x.answered = true; x.withdrawn = true; tell(ai, `I took back my ask: ${x.text}`); return { ok: true };
  },
  tell: (a, ai) => ({ ok: true, value: tell(ai, a.words, a.proof, a.piece) }),
  headline: (a, ai) => { const hs = (D.headlines ||= []) as Any[]; hs.push({ ai, outcome: a.outcome, proof: clone(a.proof), t: tNow() }); return { ok: true }; },
  offer: (a) => { learner().queue.push(a.take); return { ok: true }; },
  point: (a, ai) => { const rs = (D.rings ||= {}) as Any; rs[a.target] = { by: ai, words: a.words, t: tNow() }; return { ok: true }; },
  /* the line a write makes is the call's own diary line (fromRow), so the call itself only says yes */
  write: (a) => (a.words ? { ok: true } : { ok: false, line: "Nothing to write." }),
  remove_line: (a, ai) => { const l = seams().diary?.byId(a.line); if (!l || l.removed || l.who !== ai) return { ok: false, line: "That line is not mine to remove." }; l.removed = true; return { ok: true }; },
  sticky: (a) => move("sticky", a.region, a.words), run_sticky: (a) => move("run_sticky", a.id), finish: (a) => move("finish", a.id), drop: (a) => move("drop", a.id), due: (a) => move("due", a.id, a.when),
};
/** a told line: about a piece (then it also shows in that region's arrivals) or about the whole canvas */
function tell(ai: string, words: string, proof?: unknown, piece?: string): number {
  const p = piece ? D.pieces[piece] || find(piece)?.parent : undefined;
  const told = (D.told ||= []) as Any[];
  told.push({ ai, words, proof: clone(proof) || null, piece: p ? p.id : null, region: p ? p.region : null, t: tNow() });
  return told.length;
}

/** a draft or an ask that was said yes to runs its move as the person's act, one row of its own */
const PRESSED: Record<string, string | null> = { start: "start", split_run: "split_run", make: "make", place: "place", split: "split", check: "check", attach: "attach",
  group: "group", stop: "stop", take_back: "take_back", beside: null, offer: null, sticky: "sticky", finish: "finish", drop: "drop", due: "due" };
function runAsPerson(fn: string, args: Any, via: string): Row {
  const before = snapW(); let r: Res;
  if (fn === "beside") r = { ok: go({ beside: args.piece }, "look beside").ok };
  else { const f = PRESSED[fn]; r = f && RUN[f] ? RUN[f](args, "person") : { ok: false }; }
  return row("person", fn, args, "yes", before, r, { via });
}

// ---------------------------------------------------------------- call: gate, move, one row

let calls = 0;
function row(who: string, fn: string, args: Any, gate: string, before: World, res: Res | Any, x: Partial<Row> = {}): Row {
  const after = snapW();
  const r: Row = { id: "h" + ++seq, t: tNow(), who, fn, args: clone(args) || {}, gate, ok: !res || (res.ok !== false && !res.missing),
    missing: (res && res.missing) || null, line: (res && res.line) || null, value: valueOf(res), changes: diff(before, after), undone: false, ...x };
  hist().push(r);
  return r;
}
/** what a call gives back: a move's return (an id, or a piece's id), or a read's data */
function valueOf(res: Any): Any {
  if (!res) return null;
  if (typeof res !== "object" || Array.isArray(res) || (!("ok" in res) && !("missing" in res))) return res;
  const v = res.value;
  return v == null ? null : typeof v === "string" || typeof v === "number" ? v : v.id || v;
}
export function call(ai: string, name: string, args: Any = {}): Row {
  calls++;
  const who = String(ai), d = seams().diary;
  const no = refusal(name, args);
  if (no || !fnByName(name)) {
    const r = row(who, name, args, "refused", snapW(), { ok: false, line: no || `There is no function called ${name}.` });
    d?.fromRow(r);
    return r;
  }
  const gate = GATE[name](args, who), before = snapW(), seq0 = d ? d.book().seq : 0;
  let res: Res | Any;
  if (gate === "do") res = RUN[name](args, who);
  else if (gate === "draft") res = DRAFT[name] ? DRAFT[name](args, who) : { ok: true, value: newDraft(who, name, args, args.what || draftWords(name, args)) };
  else if (ASK[name] && has(name)) res = ASK[name](args, who);
  else {
    const words = args.ask || askWords(name, args);
    res = { ok: true, value: newAsk(who, { piece: args.parent || args.run || (args.pieces || [])[0], words, reaches: args.reaches || (name === "take_back" ? "holds" : "other"),
      source: `${who} · ${name.replace("_", " ")}`, serious: name === "take_back" }, { pending: { fn: name, args: clone(args) }, evidence: args.evidence || null }) };
  }
  const r = row(who, name, args, gate, before, res);
  d?.claim(seq0, r);   // one diary line per call: the move's own line if it wrote one
  if (!batch) render();
  return r;
}
/** where a move already has a waiting form, the gate uses it */
const DRAFT: Record<string, (a: Any, ai: string) => Res> = {
  attach: (a) => move("attach", a.session, a.block),
  start: (a) => move("start", { ai: a.ai, words: a.words, region: a.region, given: a.given, reach: "asks first", by: "ai" }),
  make: (a, ai) => move("make", a.kind, a.title, a.region, { by: "ai", ai }),
  offer: (a) => RUN.offer(a, "") as Res,
};
const ASK: Record<string, (a: Any, ai: string) => Res> = {
  group: (a) => move("group", a.pieces, null),
  stop: (a) => move("stop", a.run),
  take_back: (a) => move("take_back", a.run),
  start: (a, ai) => RUN.start(a, ai) as Res,
};
const draftWords = (fn: string, a: Any) => (({ attach: `${(a.block && a.block.kind) || "a page"}: ${(a.block && a.block.title) || ""}`, start: `a starter card: ${a.words || ""}`,
  make: `${a.kind || "a piece"}: ${a.title || ""}`, place: "a spot for a piece", split: "a split", check: "a check before you see it", beside: "look beside", offer: a.take }) as Record<string, string>)[fn] || fn;
const askWords = (fn: string, a: Any) => (({ group: `Group these? ${a.evidence || ""}`, take_back: "Take back everything this run changed?", stop: "Stop this job and every part of it?",
  start: `${a.ai} would go over its limit: start anyway?`, split_run: "Start these parts?" }) as Record<string, string>)[fn] || fn;

/** the person's word on an ask with a pending move: settled on the next change (answer() always renders) */
export function settle(): void {
  if (!D || !D.asks) return;
  for (const a of Object.values(D.asks) as Any[]) if (a.pending && a.answered && !a.withdrawn && !a.ran) { a.ran = true; runAsPerson(a.pending.fn, a.pending.args, a.id); }
}
subscribe(settle);

/** a press on a draft (from arrivals): its move runs, as the person's */
export function press(id: string): Row | null {
  const d = (D.drafts as Any)?.[id];
  if (!d || d.pressed) return null;
  d.pressed = true;
  const arr = d.arrivals && D.pieces[d.arrivals];
  if (arr) { const it = (arr.items as Any[]).find((x) => x.draft === id); if (it) it.accepted = true; }
  seams().diary?.note({ who: "person", kind: "decided", key: "press:" + id, what: `You kept ${d.what}.`, region: d.region });
  if (d.fn === "offer") { render(); return null; }
  const r = runAsPerson(d.fn, d.args, id); render(); return r;
}

/** undo one row alone; redo it; each is the person's */
export function undo(id: string): { ok: boolean; line?: string; on?: string | null } {
  const r = hist().find((x) => x.id === id);
  if (!r) return { ok: false, line: "No such step." };
  if (r.undone) return { ok: false, line: "Already undone." };
  const res = applyChanges(r.changes, "undo");
  if (!res.ok) {
    const on = after(r);
    return { ok: false, line: on ? `At ${hm(on.t)} ${line(on).replace(/ \((an ask|waits in arrivals)\)$/, "")}, which builds on this; undo that first.` : "Something else changed the same thing since; undo that first.", on: on && on.id };
  }
  r.undone = true; if (!batch) render(); return { ok: true };
}
/** the latest live row after r that touches what r touched (a path on the same branch) */
function after(r: Row): Row | null {
  const all = hist(), i = all.indexOf(r), pre = (a: string[], b: string[]) => a.length <= b.length && a.every((k, j) => k === b[j]);
  return all.slice(i + 1).reverse().find((x) => !x.undone && x.changes.some((c) => r.changes.some((d) => pre(c.path, d.path) || pre(d.path, c.path)))) || null;
}
export function redo(id: string): { ok: boolean; path?: string[] } {
  const r = hist().find((x) => x.id === id);
  if (!r || !r.undone) return { ok: false };
  const res = applyChanges(r.changes, "redo"); if (res.ok) r.undone = false;
  if (!batch) render(); return res;
}

// ---------------------------------------------------------------- since(t): the ledger read in order, one line each

export function line(r: Row): string {
  const a = r.args || {};
  if (r.gate === "refused") return `${r.who} was refused: ${r.line}`;
  const w = ({ start: `started ${a.words || ""}`, split_run: `split the job into ${(a.parts || []).length} parts (${(a.parts || []).map((p: Any) => p.ai).join(", ")})`, ask: `asked: ${a.words}`,
    attach: `attached ${(a.block && a.block.title) || "a block"}`, group: `offered a group: ${a.evidence || ""}`, tell: `said: ${a.words}`, headline: `offered the headline: ${a.outcome}`,
    point: `pointed at ${a.target}`, look: "looked where you are", read: `read ${a.target}`, offer: `offered: ${a.take}` } as Record<string, string>)[r.fn] || r.fn;
  return `${r.who} ${w}${r.gate === "draft" ? " (waits in arrivals)" : r.gate === "ask" ? " (an ask)" : ""}`;
}
/** the short form a proof names a step by */
export function brief(r: Row): string {
  const a = r.args || {};
  return ({ start: "started it", split_run: `split it ${(a.parts || []).length} ways (${(a.parts || []).map((p: Any) => p.ai).join(", ")})`, ask: "asked you",
    attach: "attached a page", group: "offered a group", tell: "told you", point: "pointed at it", make: "made a piece", place: "placed it", check: "checked it" } as Record<string, string>)[r.fn] || r.fn;
}
export type Line = { id: string; t: number; at: string; who: string; fn: string; gate: string; line: string; brief: string };
export function rows(t = 0): Line[] {
  return hist().filter((r) => r.t >= t && !r.undone).map((r) => ({ id: r.id, t: r.t, at: hm(r.t), who: r.who, fn: r.fn, gate: r.gate, line: line(r), brief: brief(r) }));
}
/** since(t): read from the diary when it is there; without it, the ledger */
export function since(t = 0): Any { const d = seams().diary; return d ? d.since(t) : rows(t); }

// ---------------------------------------------------------------- the headline: the best real one, with its proof

export type Head = { text: string; proof: Any; ai: string; at: string };
/** real: its proof still stands (its rows not undone, its piece there) */
function real(p: Any): boolean {
  if (!p) return false;
  const all = hist();
  const rowsOk = (p.rows || []).every((id: string) => { const r = all.find((x) => x.id === id); return !!r && !r.undone && r.ok; });
  const pieceOk = !p.piece || !!D.pieces[p.piece];
  return rowsOk && pieceOk && !!((p.rows || []).length || p.piece);
}
export function headline(): Head | null {
  const d = seams().diary;
  if (d) return d.headline();
  const hs = D.headlines as Any[] | undefined;
  if (!hs || !hs.length) return null;
  const best = hs.filter((h) => real(h.proof)).sort((a, b) => b.t - a.t)[0];
  return best ? { text: best.outcome, proof: best.proof, ai: best.ai, at: hm(best.t) } : null;
}

let batch = false;

// ---------------------------------------------------------------- ai-night: the one voice runs Dev's night through call() only

/** Dev arranged the canvas by hand last evening: every piece not under the region the night works in is his (by
 *  "person"); what sits under it stays the rule's. Needs the plane's layout (D.pos) and its put (slice 1) */
export function handPlaced(): number {
  const put = seams().put, R = D.pos && D.pos.api;
  if (!put || !R || !D.pos) return 0;
  let n = 0;
  for (const r of D.regions) {
    const q = D.pos[r.id]; if (!q) continue;
    const under = r.id !== "api" && q.y >= R.y + R.h - 1 && q.x < R.x + R.w && R.x < q.x + q.w; if (under) continue;
    for (const p of Object.values(D.pieces)) if (p.region === r.id && !p.parent && D.pos[p.id]) { put(p.id, { ...D.pos[p.id], region: r.id }, "person"); seams().touch?.(p.id); n++; }
  }
  return n;
}
let nightDue = false;
/** the scenario's seed (moves/ais.ts adds it to hooks.onLoad): the night runs once the plane is laid out */
export function seedNight(_d: Data, name: string): void {
  if (name !== "ai-night") return;
  nightDue = true;
  queueMicrotask(() => { if (nightDue && SCN === "ai-night") { handPlaced(); night(); } });
}
/** the night, call by call; returns the rows it made */
export function night(): Row[] {
  nightDue = false;
  const c = (t: string, n: string, a: Any) => { clock = T(t); return call(VOICE, n, a); };
  const out: Row[] = [];
  batch = true;
  try {
    out.push(c("23:05", "look", {}));
    out.push(c("23:06", "read", { target: "s-Ada" }));
    const st = c("23:10", "start", { ai: VOICE, words: "make login keep the session across restarts", region: "api" }); out.push(st);
    const parent = (st.ok && typeof st.value === "string" && D.pieces[st.value] && st.value) || newestSession(st) || null;
    const sp = c("23:12", "split_run", { parent, parts: [{ ai: "Ada", words: "keep the session in the store" }, { ai: "Kai", words: "the login tests" },
      { ai: "Lu", words: "the sign-in page remembers you" }, { ai: "Pia", words: "the docs for staying signed in" }] }); out.push(sp);
    const parts = parent ? partsOf(parent) : [], part = (i: number) => parts[i] || parent || "s-Ada";
    const a1 = c("23:40", "ask", { piece: part(1), words: "Kai: the login tests need the staging database. Allow?", kind: "code", reaches: "holds", source: "Kai · permission", yes: "Allow" }); out.push(a1);
    const a2 = c("01:15", "ask", { piece: part(3), words: "Pia: publishing the docs preview spends $3 of build minutes. Allow?", kind: "code", reaches: "money", source: "Pia · cost", yes: "Allow, $3" }); out.push(a2);
    out.push(c("02:30", "pan", { dx: -400, dy: 0 }));   // refused: the camera is the person's
    out.push(c("02:31", "point", { target: parent || "s-Ada", words: "The login job, in four parts." }));
    out.push(c("04:50", "attach", { session: parent || "s-Ada", block: { kind: "page", title: "Staying signed in: what changed and why" } }));
    out.push(c("05:10", "group", { pieces: [parent || "s-Ada", "s-Ada"], evidence: "both edit session.ts in api" }));
    out.push(c("06:20", "tell", { piece: parent || "s-Ada", words: "I split the login job four ways and left your places as you had them." }));
    const asked = new Set([a1, a2].filter((r) => r.ok).map((r) => (D.asks[r.value] || ({} as Ask)).part).filter(Boolean)).size;
    out.push(c("06:30", "headline", { outcome: `Your login job ran overnight in ${parts.length === 4 ? "four" : parts.length} parts; ${asked === 2 ? "two" : asked} of them ask you one thing each.`,
      proof: { rows: [sp.id, a1.id, a2.id], piece: parent } }));
  } finally { batch = false; clock = null; }
  render();
  return out;
}
/** a start may return the new piece or not: the newest session piece the start row added */
function newestSession(r: Row): string | null {
  if (!r || !r.changes) return null;
  const p = r.changes.find((c) => c.kind === "set" && c.path[0] === "D" && c.path[1] === "pieces" && c.path.length === 3 && c.before === undefined && (c.after as Any)?.kind === "session");
  return p ? p.path[2] : null;
}

// ---------------------------------------------------------------- count 13's maps: one set of moves

/** each person move: the function an AI uses for the same end (the AI then proposes when the move is the person's alone) */
export const MOVE_FN: Record<string, string> = {
  back: "point", fwd: "point", out: "point", map: "look", dive: "read", markSet: "look", markGo: "point", recent: "point", goto: "point",
  next: "needs", beside: "beside", follow: "read", needs: "needs", undoFix: "offer", offer: "offer", talk: "redirect", pane: "read", door: "point", drawer: "point",
  tooMuch: "offer", applyFix: "offer", pan: "point", zoom: "look", enter: "read", leave: "point", in: "read", jump: "point",
  start: "start", split_run: "split_run", pass: "pass", redirect: "redirect", pause: "pause", resume: "resume", stop: "stop", check: "check",
  take_back: "take_back", accept: "check", attach: "attach", group: "group", split: "split", make: "make", place: "place", put: "place", move: "place",
  write: "write", remove_line: "remove_line", pause_diary: "offer", flip: "since", to_sticky: "sticky",
  sticky: "sticky", run_sticky: "run_sticky", finish: "finish", drop: "drop", due: "due",
  see_groups: "look", see_social: "look", open_group: "read", open_friend: "read", first_time: "read", see_as_friend: "read", next_wait: "needs",
  answer_wait: "check", answer_card: "check", pick_face: "offer", make_close: "offer", make_link: "offer", leave_group: "offer",
  /* the port's: the shell's page (as people.js's pages: the AI looks), and the AI's own two marks the store gives as moves */
  page: "look", headline: "headline", point: "point",
  /* the join's (#1615): the moves the other slices added under their own names */
  answer: "check", ask: "ask", withdraw: "withdraw", tell: "tell", choose: "look", toDiary: "since", toEdge: "point", land: "place", touch: "place",
  newFolder: "make", openPart: "read", closePart: "point", closeStarter: "start",
  stOpen: "look", stClose: "look", stFind: "look", stSel: "look", stHover: "look", stWorked: "look", stPoint: "point", stPick: "offer", stTry: "offer", stKeep: "offer",
  stLeave: "offer", stUndo: "offer", stAsk: "offer", stPreview: "offer", stReplay: "offer", stPlace: "offer", stWay: "offer", stAct: "offer", oldSol: "offer",
  see_pieces: "look", propose_piece: "offer", use_piece: "offer", piece_state: "offer", set_pieces_aside: "offer",   /* slice 12 (agent.js round 6) */
  see_seats: "look", sign_in: "offer", remind_later: "offer",   // slice 6b (agent.js round 6)
  fold: "place", resize: "place", offCanvas: "place", nest: "place",   // BR1 pieces by hand; a folder in a folder (#1615)
  wsPreview: "offer", wsSkip: "offer", wsKeep: "offer", wsDiscard: "offer", wsUndo: "offer",   // BR1 carry (#1615): a setup Sol suggests is the person's to keep
  tabNew: "start", tabOpen: "read", tabFront: "point", tabClose: "point", tabDrop: "place", tabOffer: "offer", tabUndo: "offer", tabUndoGone: "offer",   // BR1 tabs (#1615): an AI has the engine's open_piece, take_to_tab, put_back
};
/** each function: the person's moves that do or meet the same */
export const FN_MOVE: Record<string, string[]> = {
  look: ["map", "zoom"], read: ["enter", "dive"], needs: ["needs", "next"], since: ["map"], find: ["jump", "goto"],
  make: ["make"], place: ["place", "put", "move"], group: ["group"], split: ["split"], attach: ["attach"],
  start: ["start"], split_run: ["split_run"], pass: ["pass"], redirect: ["redirect", "talk"], pause: ["pause"], resume: ["resume"], stop: ["stop"],
  check: ["check"], take_back: ["take_back"], ask: ["next"], withdraw: ["next"], tell: ["talk", "write"], headline: ["map"], offer: ["offer"], point: ["jump", "goto"], beside: ["beside"],
  write: ["write"], remove_line: ["remove_line"], sticky: ["sticky", "to_sticky"], run_sticky: ["run_sticky"], finish: ["finish"], drop: ["drop"], due: ["due"],
};

/** the whole world set back to a snapshot (count 14's replay only) */
export function restore(w: World): void {
  for (const k of Object.keys(D)) delete (D as Any)[k];
  Object.assign(D, clone(w.D));
  const q = learner().queue; q.splice(0, q.length, ...clone(w.Lq));
}
export function applyTo(w: Any, ch: Change[]): void {
  const get = (p: string[]) => p.reduce((o: Any, k) => (o == null ? o : o[k]), w);
  for (const c of ch) {
    if (c.kind === "set") {
      let o = w; for (const k of c.path.slice(0, -1)) { if (o[k] == null) o[k] = {}; o = o[k]; }
      const k = c.path[c.path.length - 1];
      if (c.before === undefined) delete o[k]; else o[k] = clone(c.before);
    } else {
      const arr = get(c.path) as unknown[];
      for (const x of c.added) { const i = arr.findIndex((y) => K(y) === x); arr.splice(i, 1); }
      for (const x of c.removed) arr.push(JSON.parse(x));
    }
  }
}

/** the agent, as the mockup's CV.agent (and the counts' handle: hooks.agent on the dev page) */
export const agent = {
  call, undo, redo, press, since, rows, brief, line, headline, settle, read: readOf, partsOf, night, handPlaced, find,
  get calls() { return calls; }, get H() { return hist(); }, get missing() { return [...missing]; }, get clock() { return clock; }, set clock(t: number | null) { clock = t; },
  get batch() { return batch; }, set batch(x: boolean) { batch = x; }, T, hm, VOICE,
  // count 13 and 14's reach inside (agent.js's closure, read by the ported counts)
  FN, FN_NAMES, SPEC, GATE, RUN, PERSON_ONLY, REFUSE, MOVE_FN, FN_MOVE, snapW, K, diff, at, applyChanges, restore, applyTo, hist, snap,
  get nightDue() { return nightDue; }, set nightDue(x: boolean) { nightDue = x; },
  learner,
};
export type Agent = typeof agent;
