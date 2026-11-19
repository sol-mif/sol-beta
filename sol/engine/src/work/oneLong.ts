// The long project (#1002, behind `build.one.long`): the one session's memory across days, and where the person's word
// is worth most. Marco: Sol is a long-term project; the one session runs the systems underneath "over a longer time
// frame" and asks for his input "based on how the user can most optimally contribute to the project along with how
// the user would like to steer".
//
// From real events only (one.ts calls in): every piece that asked him (what, when, how long he took, and whether his
// answer agreed with what the one session would have picked or changed the outcome), what each goal started and what
// ran. From that, a dial per kind of question:
//   early    his answers changed the outcome (2 of the last 5 or more): asked first, shown in full
//   ask      asked as today
//   decide   he agreed five times running: the one session picks what it would have picked, says so once ("I'll
//            decide these now; pull me back any time"), each pick with the usual grace and undo
// He moves a dial himself by dragging it; his setting wins over the rule until he lets it go ("auto").
//
//   <STATE_DIR>/one-long.json  { asks: [Ask], moved: [Moved], dials: {kind: Dial}, said: {kind: at}, seen }
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./state.js";

export type Mode = "early" | "ask" | "decide";
export type Dial = Mode | "auto";
/** the kinds of question, as he would name them */
export const ASK_KINDS = ["a file change", "a command", "a block on its stage", "a session's question", "the goal", "how the work splits", "which way", "the order of work", "a choice", "a go", "how it looks"] as const;
export type AskKind = (typeof ASK_KINDS)[number];
/** the kinds the one session may come to decide by itself: each has a pick it would make. A go (merge, spend), the
 *  goal and how it looks stay his (the dial goes between early and ask) */
export const DECIDABLE: readonly AskKind[] = ["a file change", "a command", "a block on its stage", "how the work splits", "which way", "the order of work", "a choice"];
export const RUN = 5;

export type Ask = { id: string; at: number; kind: AskKind; title: string; goal?: string;
  /** when he answered and how long he took (ms); agreed: his answer was what the one session would have picked */
  answeredAt?: number; took?: number; agreed?: boolean; answer?: string; would?: string;
  /** who answered: he did, or the one session decided (a decided ask is not counted as his) */
  by?: "you" | "it" };
export type Moved = { at: number; goal: string; words: string; kind: "started" | "ran" | "made" | "decided" };
type LongFile = { asks: Ask[]; moved: Moved[]; dials: Record<string, Dial>; said: Record<string, number>; seen?: number };

// ---- the rule (pure; unit tests: test/one-long.test.ts)
/** his answers of one kind, newest last (decided ones are not his and do not count) → how the one session asks */
export function modeOf(answers: boolean[], dial: Dial = "auto", kind?: AskKind): Mode {
  if (dial !== "auto") return dial === "decide" && kind && !DECIDABLE.includes(kind) ? "ask" : dial;
  const last = answers.slice(-RUN);
  if (last.filter((a) => !a).length >= 2) return "early";
  if (last.length >= RUN && last.every(Boolean) && (!kind || DECIDABLE.includes(kind))) return "decide";
  return "ask";
}
/** the place on the dial, 0 (ask me, early) to 1 (you decide): his own answers pull it (pure) */
export function leanOf(answers: boolean[]): number {
  const last = answers.slice(-RUN);
  if (!last.length) return 0.5;
  let run = 0; for (let i = last.length - 1; i >= 0 && last[i]; i--) run++;
  return Math.round(Math.min(1, Math.max(0, run / RUN - last.filter((a) => !a).length * 0.2)) * 100) / 100;
}

/** a piece's kind of question (what one.ts's piece is, as plain fields) */
export type PieceLike = { id: string; at: number; kind: string; title: string; perm?: string; session?: string; guess?: string; choices?: string[]; parts?: { id: string }[];
  shows?: { form?: string; steps?: string[]; futures?: unknown[] }; tool?: string };
export function kindOf(p: PieceLike): AskKind | undefined {
  // a way's press by my agent (#1281) is a go: only the person answers its card, the one session never decides it
  if (p.kind === "needs" && p.perm && p.tool === "mcp__sol__way_press") return "a go";
  if (p.kind === "needs") return p.perm ? (/Bash|terminal/.test(p.tool ?? "") ? "a command" : /compose|update|place|freeze|bind|sticky/.test(p.tool ?? "") ? "a block on its stage" : "a file change") : "a session's question";
  if (p.kind === "goal") return "the goal";
  if (p.kind === "split") return "how the work splits";
  if (p.kind === "call") return p.shows?.form === "order" ? "the order of work" : p.shows?.futures || p.shows?.form === "two" ? "which way" : "a choice";
  if (p.kind === "press") return "a go";
  if (p.kind === "eye") return "how it looks";
  return undefined;   // a note asks nothing
}
/** what the one session would have picked on this piece, as an answer (undefined: it has no pick of its own) */
export function wouldPick(p: PieceLike): { pick?: string[]; text?: string } | undefined {
  const k = kindOf(p);
  if (k === "a file change" || k === "a command" || k === "a block on its stage") return { pick: ["allow"] };
  if (k === "how the work splits") return p.parts?.length ? { pick: p.parts.map((x) => x.id) } : undefined;
  if (k === "the order of work") return p.shows?.steps?.length ? { pick: [...p.shows.steps] } : undefined;
  if (k === "which way" || k === "a choice") { const c = p.choices ?? []; if (c.length < 2) return undefined; return { pick: [c.find((x) => p.guess && x.toLowerCase() === p.guess.toLowerCase()) ?? c[0]] }; }
  if (k === "the goal") return p.guess ? { text: p.guess } : undefined;
  if (k === "a go") return { pick: ["go"] };
  if (k === "how it looks") return { pick: ["looks right"] };
  return undefined;
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
/** did his answer agree with what it would have picked? Words of his own beside the pick, or marks, change it (pure) */
export function agreedOf(p: PieceLike, a: { pick?: string[]; text?: string; marks?: unknown[] }): boolean | undefined {
  const w = wouldPick(p);
  if (!w) return undefined;
  if (a.marks?.length) return false;
  if (w.text !== undefined) return !!a.text && norm(a.text) === norm(w.text);
  if (a.text?.trim()) return false;
  const k = kindOf(p);
  if (k === "how the work splits") return (a.pick ?? []).length === (w.pick ?? []).length;
  if (k === "the order of work") return (a.pick ?? []).join("\n") === (w.pick ?? []).join("\n") || a.pick?.[0] === "go";
  return (a.pick ?? [])[0] === (w.pick ?? [])[0];
}
const pickWords = (a: { pick?: string[]; text?: string }) => (a.text ? `“${a.text.slice(0, 80)}”` : (a.pick ?? []).join(", ").slice(0, 80)) || "ok";

// ---- the file
const FILE = () => join(STATE_DIR, "one-long.json");
let file: LongFile | null = null;
function load(): LongFile {
  if (file) return file;
  try { const v = JSON.parse(readFileSync(FILE(), "utf8")); file = { asks: Array.isArray(v.asks) ? v.asks : [], moved: Array.isArray(v.moved) ? v.moved : [], dials: v.dials ?? {}, said: v.said ?? {}, ...(v.seen ? { seen: v.seen } : {}) }; }
  catch { file = { asks: [], moved: [], dials: {}, said: {} }; }
  return file!;
}
function save() {
  const f = load(); f.asks = f.asks.slice(-600); f.moved = f.moved.slice(-600);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(FILE() + ".tmp", JSON.stringify(f, null, 1)); renameSync(FILE() + ".tmp", FILE());
}
export const _reloadLong = () => { file = null; };
export const longFile = () => load();

/** his own answers of one kind, oldest first */
export const answersOf = (kind: AskKind) => load().asks.filter((a) => a.kind === kind && a.by === "you" && a.agreed !== undefined).map((a) => a.agreed!);
export const modeFor = (kind: AskKind) => modeOf(answersOf(kind), load().dials[kind] ?? "auto", kind);

// ---- the events one.ts tells (real ones only)
/** a piece asked him: kept; returns what to do: decide (the pick to answer with, and whether to say so first) or ask */
export function asked(p: PieceLike, goal?: string): { decide?: { pick?: string[]; text?: string }; first?: boolean; mode?: Mode } {
  const kind = kindOf(p); if (!kind) return {};
  const f = load();
  if (!f.asks.some((a) => a.id === p.id)) f.asks.push({ id: p.id, at: p.at, kind, title: p.title.slice(0, 120), ...(goal ? { goal } : {}) });
  const mode = modeFor(kind), would = wouldPick(p);
  let out: ReturnType<typeof asked> = { mode };
  if (mode === "decide" && would) { const first = !f.said[kind]; f.said[kind] = Date.now(); out = { decide: would, first, mode }; }
  save();
  return out;
}
/** he (or the one session, deciding) answered a piece */
export function answered(p: PieceLike, a: { pick?: string[]; text?: string; marks?: unknown[] }, by: "you" | "it" = "you", now = Date.now()) {
  const f = load(), x = f.asks.find((q) => q.id === p.id); if (!x) return;
  const w = wouldPick(p), ag = agreedOf(p, a);
  x.answeredAt = now; x.took = Math.max(0, now - x.at); x.by = by; x.answer = pickWords(a);
  if (w) x.would = pickWords(w);
  if (ag !== undefined) x.agreed = ag; else delete x.agreed;
  if (by === "it" && x.goal) f.moved.push({ at: now, goal: x.goal, words: `decided “${x.title}”: ${x.answer}`, kind: "decided" });
  save();
}
/** he took his answer back inside its grace: the ask waits again, not counted */
export function unanswered(id: string) { const x = load().asks.find((q) => q.id === id); if (x) { delete x.answeredAt; delete x.took; delete x.agreed; delete x.by; delete x.answer; save(); } }
/** something moved toward a goal: sessions started, a session's turn ran, a page made */
export function moved(goal: string | undefined, words: string, kind: Moved["kind"], at = Date.now()) {
  if (!goal) return; load().moved.push({ at, goal: goal.slice(0, 120), words: words.slice(0, 200), kind }); save();
}
/** he moves a dial (or lets it go back to his answers: auto) */
export function setDial(kind: string, d: Dial) {
  if (!(ASK_KINDS as readonly string[]).includes(kind)) throw new Error("no such kind of question");
  const f = load(); if (d === "auto") delete f.dials[kind]; else f.dials[kind] = d;
  if (d !== "decide") delete f.said[kind];
  save();
}
export function seenNow(at = Date.now()) { const f = load(); const was = f.seen; f.seen = at; save(); return was; }

// ---- what the face draws
export type KindView = { kind: AskKind; mode: Mode; dial: Dial; lean: number; decidable: boolean;
  /** his own answers, oldest first: agreed or changed, how long he took, what he said and what it would have picked */
  answers: { at: number; agreed: boolean; took: number; title: string; answer?: string; would?: string }[]; decided: number };
export function dials(): KindView[] {
  const f = load(), out: KindView[] = [];
  for (const k of ASK_KINDS) {
    const mine = f.asks.filter((a) => a.kind === k && a.by === "you" && a.agreed !== undefined);
    const decided = f.asks.filter((a) => a.kind === k && a.by === "it").length;
    if (!mine.length && !decided && !f.dials[k]) continue;
    out.push({ kind: k, mode: modeFor(k), dial: f.dials[k] ?? "auto", lean: leanOf(mine.map((a) => a.agreed!)), decidable: DECIDABLE.includes(k), decided,
      answers: mine.slice(-12).map((a) => ({ at: a.answeredAt ?? a.at, agreed: a.agreed!, took: a.took ?? 0, title: a.title, ...(a.answer ? { answer: a.answer } : {}), ...(a.would ? { would: a.would } : {}) })) });
  }
  return out;
}
/** how much his word changed things in a kind: changed / answered (0 when he never answered one) */
const weight = (k: AskKind) => { const a = answersOf(k).slice(-RUN * 2); return a.length ? a.filter((x) => !x).length / a.length : 0; };
/** "since you were here", for the project: per goal what moved and what waits, and first the one place his hand is
 *  worth most now (an open ask of the kind where his answers changed the most; then the oldest). open: the pieces that
 *  wait on him, as plain fields */
export function since(seen: number | undefined, open: (PieceLike & { goal?: string })[], now = Date.now()) {
  const f = load(), from = seen ?? 0;
  const goals = new Map<string, { goal: string; moved: Moved[]; waits: string[]; last: number }>();
  const g = (name: string) => { let x = goals.get(name); if (!x) goals.set(name, x = { goal: name, moved: [], waits: [], last: 0 }); return x; };
  for (const m of f.moved) if (m.at > from) { const x = g(m.goal); x.moved.push(m); x.last = Math.max(x.last, m.at); }
  for (const p of open) { const x = g(p.goal ?? "other work"); x.waits.push(p.title); x.last = Math.max(x.last, p.at); }
  const ranked = open.map((p) => { const k = kindOf(p); return { p, k, w: k ? weight(k) : 0 }; }).sort((a, b) => b.w - a.w || a.p.at - b.p.at);
  const top = ranked[0];
  const worth = top ? { id: top.p.id, title: top.p.title, goal: top.p.goal, kind: top.k,
    why: top.k && top.w > 0 ? `your answers changed ${Math.round(top.w * 100)}% of “${top.k}”` : "it has waited longest" } : undefined;
  const decided = f.asks.filter((a) => a.by === "it" && (a.answeredAt ?? 0) > from).length;
  return { from, days: from ? Math.floor((now - from) / 86_400_000) : 0, worth, decided,
    goals: [...goals.values()].sort((a, b) => b.last - a.last).map((x) => ({ goal: x.goal, waits: x.waits,
      moved: x.moved.slice(-5).map((m) => ({ at: m.at, words: m.words, kind: m.kind })), count: x.moved.length })) };
}
/** the one session's own reading of where his word is worth most (told with each report and on its tool) */
export function wordText(): string {
  const v = dials(); if (!v.length) return "No answers of the person's yet: ask as usual.";
  return v.map((k) => `${k.kind}: ${k.mode === "early" ? "ASK EARLY, before the work starts, and show the whole (futures, two takes, the page): his answers changed the outcome" : k.mode === "decide" ? "you decide (he agreed every time; the engine answers these with your pick, he can pull it back)" : "ask as usual"} (${k.answers.filter((a) => a.agreed).length} agreed, ${k.answers.filter((a) => !a.agreed).length} changed${k.dial !== "auto" ? `; he set it to ${k.dial} himself` : ""})`).join("\n");
}
