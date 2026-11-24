// owned by slice 10 (the island), docs/port/slices.md "Night 2"
// The island's state and its acts (round 4, I1–I4, as round 9 passed it; merge/desk.js, ported as it is, without its
// drawing). One `isl` holds what desk.js's `desk` held: whether the island is on (the desk view on the dev page, or the
// native island in a real Sol), whether the window is open, the ask the island holds, the person's words while it listens,
// the line it says for a moment after an answer, the reward, the chip's order. The views (Island.tsx, Glance.tsx,
// desk.tsx, Order.tsx) read it through useNext and press the acts here or M.island_*.
//   I1 voice(words, from)   the pill, the island's talk and the mic: open, close, yes and later are the island's own
//                            words; the rest go to the talk's one voice (cv/say/index.ts), which records the move called
//   I2 the carry             an ask that may wait sits on the island while the window is closed; opening carries it to
//                            the ask line, closing carries it back; an ask from the line stays on the line (before())
//   I3 yes later keep handOff from the island write one diary line `via: "island"`; the reward is written once, after it shows
//   I4 working()             the chip, the sidebar and the island read one count (hooks.working)
// Live (a real Sol) the diary's line from the island waits for `next.diary.write {via}` (slice 7): noteFrom writes none
// and says so in `isl.notYet`. Signed: marcocyl04-ux's agent, port slice 10 (#1615).
import { D, MODE, S, M, answer, canAnswer, hooks, lineAsk, looked, open, render, sessions, subscribe, type Ask, type Done } from "../cv/core.ts";
import { reason, yesWords } from "../needs/rank.ts";
import { cap, didWords, glanceOrder as order, opensIsland as opens, orderIds as ids, step, whyOf as why, type Card } from "./rules.ts";

export type Heard = { from: string; words: string; fn: string | null; args: string; done: Done | null };
export type Reward = { id: string; ai: string; name: string; at: string; region: string | null; piece: string; shownAt: number | null };
export type Given = { id: number; piece: string; ai: string; name: string; at: string; run: string | null };
export type Fly = { id: string; dir: "in" | "out"; from: { left: number; top: number; width: number; height: number }; n: number };

/** desk.js's `desk`: the island's whole state */
export const isl = {
  on: false, open: true, cols: 12, ask: null as string | null, carried: null as string | null, passed: new Set<string>(),
  listening: false, said: "", after: null as string | null, afterN: 0, reward: null as Reward | null, given: null as Given | null,
  order: false, still: false, counting: false, seq: 0, last: null as Heard | null, calls: [] as Heard[], fly: null as Fly | null,
  /** a real Sol: the island is a window of its own (bridge.ts), and the window's open is the main window's visibility */
  native: false,
  /** what the island could not do live, last: the diary line from the island waits for slice 7 */
  notYet: null as string | null,
};
/** the desk view's DOM (desk.tsx sets these on the dev page): the window's frame laid out, the desk built and taken away */
export const deskDom = { attach: () => {}, detach: () => {}, layout: () => {}, rect: (_q: string): Fly["from"] | null => null };

// ---------------------------------------------------------------- one count (I4)

/** round 9: a done session is not working, nor one that waits */
export const working = (): number => sessions().filter((s) => s.state !== "done" && s.state !== "idle" && !s.term?.waiting).length;
hooks.working = working;

// ---------------------------------------------------------------- the asks

export const rungOf = (a: Ask) => reason(D, a).rung;
export const opensIsland = (a: Ask) => opens(rungOf(a));
export const live = (id: string | null | undefined): Ask | null => { const a = id ? D.asks[id] : null; return a && !a.answered && !a.withdrawn ? a : null; };
export function regionOfAsk(a: Ask): string | null {
  const p = D.pieces[a.piece];
  if (p) return p.region;
  const k = a.part || a.piece;
  for (const q of Object.values(D.pieces)) if ((q.parts || []).some((x) => x.id === k)) return q.region;
  return null;
}
export const shown = () => isl.on && !isl.open;
export const quiet = () => isl.counting;
/** the ask the island holds: the one carried there, else the first that may open it by itself and was not passed */
export function islandAsk(): string | null {
  if (!shown()) return null;
  if (live(isl.ask)) return isl.ask;
  isl.ask = null;
  if (!isl.after && !isl.reward) { const a = open().find((x) => opensIsland(x) && !isl.passed.has(x.id)); if (a) isl.ask = a.id; }
  return isl.ask;
}
export const glanceOrder = (): { cards: Card[]; quiet: string[] } => (D ? order(D.regions, open(), regionOfAsk, rungOf) : { cards: [], quiet: [] });
export const orderIds = () => ids(glanceOrder());
export function whyOf(c: Card): [string, boolean] {
  const here = c.ask === islandAsk() ? "island" : isl.on && isl.open && c.ask === lineAsk() ? "window" : null;
  return why(c, rungOf(D.asks[c.ask]), here);
}
export { cap, step };

// ---------------------------------------------------------------- one voice (I1)

type Voice = ((words: string, from?: string) => Heard | null) & { heard?: Heard[] };
const base = (): Voice | null => (hooks as unknown as { voice?: Voice }).voice ?? null;
const mine = (h: Heard): Heard => { const b = base(); if (b?.heard) { b.heard.push(h); if (b.heard.length > 50) b.heard.shift(); } return h; };
function askHere(): string | null { return shown() ? islandAsk() : lineAsk(); }
/** the words said to the pill, the island or the mic; the move they called, as the talk records it */
export function voice(words: string, from: "pill" | "island" | string = "pill"): Heard | null {
  const t = String(words || "").trim();
  if (!t) return null;
  isl.said = t;
  const l = t.toLowerCase().replace(/[.!]$/, "");
  const one = (fn: string, args: unknown[] | null, d: Done | null) => mine({ from, words: t, fn, args: args ? JSON.stringify(args) : "", done: d });
  let h: Heard | null;
  if (isl.on && /^(open|open it|open the window)$/.test(l)) { setOpen(true); h = one("open", null, { ok: true, undo: () => setOpen(false) }); }
  else if (isl.on && /^(close|close it|close the window|hide the window)$/.test(l)) { setOpen(false); h = one("close", null, { ok: true, undo: () => setOpen(true) }); }
  else if (shown() && /^(yes|allow|allow it|ok|do it|keep it)$/.test(l) && askHere()) { const id = askHere()!; const ok = yes(id, from === "island" ? "island" : null); h = one("answer", [id], { ok, id, undo: () => {} }); }
  else if (shown() && /^(later|not now)$/.test(l) && askHere()) { const id = askHere()!; const ok = later(id, from === "island" ? "island" : null); h = one("answer", [id, "later"], { ok, id, undo: () => {} }); }
  else { const b = base(); h = b ? b(t, from) : null; }   // the talk's one voice: yes and later on the line, then the chain
  isl.last = h;
  if (h) isl.calls.push(h);
  render();
  return h;
}
/** the island heard its words: "Heard: fn" stays a moment (its own animation, Island.tsx), then the island goes back */
export function heardGone(t: string): void { if (!quiet() && isl.listening && isl.said === t) { isl.listening = false; isl.said = ""; render(); } }
export function listen(on?: boolean): void { isl.listening = on === undefined ? !isl.listening : !!on; if (!isl.listening) isl.said = ""; render(); }

// ---------------------------------------------------------------- answers from outside (I3)

type DiaryNote = { note(o: Record<string, unknown>): string | null; hm(t: number): string; now(): number; lines(k: number): { via?: string | null; who: string; key?: string | null; what: string }[] };
export const diary = (): DiaryNote | undefined => (hooks as unknown as { diary?: DiaryNote }).diary;
/** one diary line, marked from where it was answered. Live, the engine's diary (next.diary.write, slice 7) is not there yet */
function noteFrom(via: string | null, o: Record<string, unknown>): string | null {
  if (!via) return null;
  if (MODE === "live") { isl.notYet = "the diary line from the island: next.diary.write {via} is slice 7's, not yet"; return null; }
  return diary()?.note({ who: "person", via, kind: "decided", ...o }) ?? null;
}
/** yes to an ask: from the island (or the glance) its line says so; a serious ask is answered with its evidence in front,
 *  so the window opens to it */
export function yes(id: string, via: string | null, how?: string): boolean {
  const a = live(id);
  if (!a) return false;
  if (a.serious && !looked(a)) { if (isl.on) look(id); return false; }
  const had = S.askLine;
  S.askLine = id;
  if (!canAnswer(id)) { S.askLine = had; return false; }
  noteFrom(via, { key: "ask:" + id, ask: id, what: didWords(a, how, yesWords(a)), region: regionOfAsk(a), embed: { id: a.part || a.piece } });
  if (isl.ask === id) isl.ask = null;
  const ok = answer(id);
  if (had && had !== id && live(had)) S.askLine = had;
  if (ok && via && !quiet()) afterwards(how === "keep" ? "Kept · in today’s diary" : "Done · in today’s diary");
  return ok;
}
export function later(id: string, via: string | null): boolean {
  const a = live(id);
  if (!a) return false;
  const had = S.askLine;
  S.askLine = id; isl.passed.add(id);
  if (isl.ask === id) isl.ask = null;
  const ok = answer(id, "later");
  if (had && had !== id && live(had)) S.askLine = had;
  if (ok && via && !quiet()) afterwards("Later · in the glance");
  return ok;
}
type Drafts = Record<string, { pressed?: boolean; what: string; region?: string }>;
export function keep(id: string, via = "island"): boolean {
  const d = (D.drafts as Drafts | undefined)?.[id];
  if (d) {
    if (d.pressed) return false;
    noteFrom(via, { key: "press:" + id, what: `Kept ${d.what}`, region: d.region });
    const ag = (hooks as unknown as { agent?: { press(id: string): unknown } }).agent;
    const r = ag ? ag.press(id) : null;
    return r !== null || !!d.pressed;
  }
  return yes(id, via, "keep");
}
/** hand off: a thing given to an AI from outside (islands.html scene 7, "Give it to"); its run starts at once */
export function handOff(pieceId: string, ai: string, via = "island"): Given | null {
  const p = D.pieces[pieceId];
  if (!p || typeof M.start !== "function") return null;
  const k = ++isl.seq, dy = diary();
  noteFrom(via, { key: `give:${pieceId}:${ai}:${k}`, what: `Gave ${p.name || p.ai} to ${ai}`, region: p.region, embed: { id: pieceId } });
  const r = M.start({ ai, given: [pieceId], region: p.region }) as Done & { id?: string; run?: string };   // runs.js dropOn
  const st = r && r.id;
  let run: string | null = null;
  if (st && D.pieces[st] && D.pieces[st].kind === "starter") { const s = M.start(st) as Done & { run?: string }; run = (s && (s.id || s.run)) || null; }
  isl.given = { id: k, piece: pieceId, ai, name: String(p.name || p.ai), at: dy ? dy.hm(dy.now()) : "", run };
  if (!quiet()) afterwards(`${ai} took it`);
  render();
  return isl.given;
}
/** the one reward (islands.html scene 10): the end of what was given from here, at a pause, once; then to the diary.
 *  The fixture's runs do not end by themselves, so the end is scripted, as the mockup's was */
export function finish(): Reward | null {
  const g = isl.given;
  if (!g) return null;
  isl.given = null;
  isl.reward = { id: "rw" + g.id, ai: g.ai, name: g.name, at: g.at, region: D.pieces[g.piece] ? D.pieces[g.piece].region : null, piece: g.piece, shownAt: null };
  render();
  return isl.reward;
}
/** the island drew the reward (Island.tsx, once it is on screen): only now may its line be written */
export function rewardShown(id: string): void { if (isl.reward && isl.reward.id === id && !isl.reward.shownAt) isl.reward.shownAt = Date.now(); }
export function rewardDone(): boolean {
  const r = isl.reward;
  if (!r || !r.shownAt) return false;
  isl.reward = null;
  if (MODE === "live") isl.notYet = "the reward's diary line: next.diary.write {via} is slice 7's, not yet";
  else diary()?.note({ who: r.ai, via: "island", kind: "ai", key: "reward:" + r.id, what: `Finished ${r.name}, which you gave it at ${r.at}`, region: r.region, embed: { id: r.piece } });
  if (!quiet()) afterwards("In today’s diary");
  render();
  return true;
}
/** the island's words for a moment after an answer; they go by their own animation (Island.tsx calls afterGone) */
export function afterwards(t: string): void { isl.after = t; isl.afterN++; }
export function afterGone(n: number): void { if (isl.afterN === n && isl.after) { isl.after = null; render(); } }
/** look: a serious ask opens the window on its session */
export function look(id: string): void { const a = D.asks[id]; if (!a) return; setOpen(true); M.goto(a.piece); }

// ---------------------------------------------------------------- the window: open, closed, 12 · 8 · 6 columns (I2)

export function setOpen(v: boolean): void {
  if (!isl.on || isl.open === !!v) return;
  if (v) {
    const id = live(isl.ask) ? isl.ask : null, from = id ? deskDom.rect("#dk-isl") : null;
    isl.ask = null; isl.open = true;
    if (id) { S.askLine = id; S.peek = null; isl.carried = id; }
    refit(); render();
    if (id && from) fly(id, "in", from);
  } else {
    const id = lineAsk(), from = id ? deskDom.rect("#line") : null;
    if (live(id)) { isl.ask = id; if (S.askLine === id) S.askLine = null; if (S.peek === id) S.peek = null; }
    isl.open = false; deskDom.layout(); render();
    if (live(id) && from) fly(id!, "out", from);
  }
}
export function setCols(n: number): void { if (![6, 8, 12].includes(+n)) return; isl.cols = +n; if (!isl.open) isl.open = true; refit(); render(); }
/** the canvas never reflows: only the camera fits the window again (I5); the window's frame is laid out first, so the
 *  camera reads the window's own width */
export function refit(): void {
  deskDom.layout();
  if (!S || !D || !D.pos) return;
  if (S.dist === "far" || S.dist === "middle") { S.camSet = false; hooks.settleCam?.(); }
}
function fly(id: string, dir: "in" | "out", from: Fly["from"]): void { if (quiet() || isl.still) return; isl.fly = { id, dir, from, n: (isl.fly?.n ?? 0) + 1 }; render(); }
export function flown(n: number): void { if (isl.fly?.n === n) { isl.fly = null; render(); } }

/** the desk view on or off (dev page), with its window's columns and whether it is open */
export function setDesk(on: boolean, o: { cols?: number; open?: boolean } = {}): void {
  on = !!on;
  if (o.cols) isl.cols = +o.cols;
  if (o.open != null) isl.open = !!o.open;
  if (on === isl.on) { if (on) { refit(); render(); } return; }
  isl.on = on;
  if (on) deskDom.attach();
  else {
    deskDom.detach();
    if (S && !live(S.askLine) && live(isl.ask)) S.askLine = isl.ask;   // the island's ask comes back to the line with the window
    isl.ask = null; isl.open = true; isl.listening = false;
  }
  refit(); render();
}
/** the native island (bridge.ts): on while the new face is up in a real Sol; the window is open while it is seen */
export function setNative(on: boolean): void {
  isl.native = on; isl.on = on;
  if (!on) { if (S && !live(S.askLine) && live(isl.ask)) S.askLine = isl.ask; isl.ask = null; isl.open = true; }
  render();
}

// ---------------------------------------------------------------- the render: an ask is in one place before anything draws

/** desk.js before(): run on every change of the store, before the views draw (they draw later, in React's own turn) */
export function before(): void {
  if (!isl.on || !S || !D) return;
  if (!isl.open) {
    const id = lineAsk();
    if (live(id)) {
      if (!live(isl.ask)) isl.ask = id; else if (isl.ask !== id) isl.passed.delete(id!);
      if (S.askLine === id) S.askLine = null;
      if (S.peek === id) S.peek = null;
    }
  } else if (live(isl.ask)) { S.askLine = isl.ask; isl.carried = isl.ask; isl.ask = null; }
}
subscribe(before);

// ---------------------------------------------------------------- what the island draws (desk and native alike)

export type IslandState =
  | { k: "rest" }
  | { k: "ears"; words: string; count?: number; busy: boolean }
  | { k: "talk"; said: string; heard: string | null }
  | { k: "peak"; id: string; ai: string; name: string; at: string }
  | { k: "ask"; id: string; rung: string; text: string; sub: string; look: boolean; yes: string; more: number };
/** desk.js drawIsland's choice, as data: the native island's page draws it from this alone */
export function islandState(): IslandState {
  const a = live(islandAsk()), n = working();
  if (isl.listening && shown()) {
    const heard = isl.last && isl.last.from === "island" && isl.last.words === isl.said ? isl.last.fn : null;
    return { k: "talk", said: isl.said, heard };
  }
  if (isl.reward && shown()) { const r = isl.reward; return { k: "peak", id: r.id, ai: r.ai, name: r.name, at: r.at }; }
  if (a) {
    const lk = !!a.serious && !looked(a), p = D.pieces[a.piece];
    const lc = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);
    return { k: "ask", id: a.id, rung: lc(rungOf(a)), text: cap(String(a.text)), sub: `${String(a.source)}${p?.name ? " · " + p.name : ""}${lk ? ` · “${yesWords(a)}” after you look` : ""}`,
      look: lk, yes: yesWords(a), more: open().filter((x) => x.id !== a.id).length };
  }
  if (isl.after) return { k: "ears", words: isl.after, busy: false };
  if (n) return { k: "ears", words: `${n} working`, count: n, busy: true };
  return { k: "rest" };
}
/** a press on the island or the glance, by its data-dk (desk.js's click handler; the native island sends the same) */
export function press(dk: string): void {
  const i = dk.indexOf(":"), k = i < 0 ? dk : dk.slice(0, i), id = i < 0 ? "" : dk.slice(i + 1);
  if (k === "yes") yes(id, "island");
  else if (k === "later") later(id, "island");
  else if (k === "look") look(id);
  else if (k === "gyes") yes(id, "glance");
  else if (k === "glater") later(id, "glance");
  else if (k === "see") { const r = isl.reward; rewardDone(); if (r) { setOpen(true); M.goto(r.piece); } }
  else if (k === "done") rewardDone();
  else if (k === "open") { if (!isl.open || isl.cols === 12) isl.cols = isl.cols === 12 && isl.open ? 8 : isl.cols; setOpen(true); M.goto(id); }
  else if (k === "tab") setCols(8);
  else if (k === "listen") listen(true);
  render();
}
