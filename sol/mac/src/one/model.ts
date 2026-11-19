// The one session in Build (#1002, behind `build.one`): what the face computes from the engine's word, pure, so the
// tests read it without a window. The pieces and the roster come from the engine (engine/src/work/one.ts); the glance
// answers the four questions a person must answer at a glance: where am I, what is happening, what needs me, what did
// I just do.
import { useSyncExternalStore } from "react";
import { buildSwitch, type SwitchEnv } from "../flag.ts";

/** the switch: off by default; a row in Settings under me (OneRow), `?build.one=on|off` on the page's link */
export const BUILD_ONE = "build.one";
export const makeOneSwitch = (env?: SwitchEnv) => buildSwitch(BUILD_ONE, env);
const sw = makeOneSwitch();
export const buildOne = () => sw.get();
export const setBuildOne = (v: boolean) => sw.set(v);
export const useBuildOne = () => useSyncExternalStore(sw.sub, sw.get);

export type Lack = "words" | "call" | "press" | "eye" | "none";
export type Part = { id: string; title: string; prompt: string; reuse?: string };
export type Future = { name: string; says?: string; cost?: string; ticks?: { at: number; label: string }[] };
export type Mark = { x: number; y: number; note?: string };
export type Shows = { form: "thing" | "two" | "order" | "proof" | "away" | "futures"; image?: string; before?: string; after?: string; steps?: string[]; checks?: { name: string; state: "green" | "red" | "running" }[]; lines?: string[];
  futures?: Future[]; marks?: boolean; page?: string; may?: string[]; mayNot?: string[]; willExist?: string; names?: [string, string]; cost?: string; risk?: string; why?: string };
export type Piece = {
  id: string; at: number; kind: "goal" | "split" | "call" | "press" | "eye" | "needs" | "note"; lack: Lack; title: string; say: string;
  /** the long project (build.one.long): a note naming the kind it now decides · asked first · decided by the one session */
  dial?: string; early?: boolean; decided?: boolean;
  guess?: string; choices?: string[]; parts?: Part[]; session?: string; shows?: Shows;
  state: "open" | "sent" | "acted" | "done" | "dropped";
  perm?: string; answer?: { text?: string; pick?: string[]; marks?: Mark[]; free?: "ask" | "edits" }; goesAt?: number; acted?: { started: string[]; sent: string[]; at: number }; by: "one" | "engine";
};
export type Row = { id: string; title: string; cwd: string; project?: string; updatedAt: number; state: "working" | "needs" | "failed" | "resting" | "done"; doing: string; waits: string; mine: boolean;
  goal?: string; step?: string; steps?: number; since?: number; machine?: string; page?: string };
/** the picture's lines, grouped by the goal each session works for (sessions the one started first), then the rest */
export type PicLine = { head: string } | { row: Row };
export function byGoal(rows: Row[]): PicLine[] {
  const goals: string[] = [];
  for (const r of rows) if (r.goal && !goals.includes(r.goal)) goals.push(r.goal);
  const out: PicLine[] = [];
  for (const g of goals) { out.push({ head: g }); for (const r of rows.filter((x) => x.goal === g)) out.push({ row: r }); }
  const rest = rows.filter((r) => !r.goal);
  if (rest.length) { if (goals.length) out.push({ head: "your other sessions" }); for (const r of rest) out.push({ row: r }); }
  return out;
}
/** how long, in a person's words: 40 s, 3 min, 2 h, 3 d */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
}
/** a row's line beside its title: working says what it does now, how many steps and for how long; the rest say their wait */
export function rowLine(r: Row, now: number): string {
  if (r.state === "working") return [r.step ?? "at work", r.steps ? `${r.steps} step${r.steps > 1 ? "s" : ""}` : "", r.since ? ago(now - r.since) : ""].filter(Boolean).join(" · ");
  if (r.state === "needs") return r.waits;
  if (r.state === "failed") return "stopped: its last turn failed";
  return `${r.state === "done" ? "done" : "resting"} · ${ago(now - r.updatedAt)} ago`;
}
export type Did = { at: number; words: string; piece?: string; undo?: boolean };

export const LACK_WORDS: Record<Lack, string> = { words: "your words", call: "your call", press: "your press", eye: "your eye", none: "nothing: to know" };

/** the pieces in the order the stage shows them: what waits on the person first (oldest first, so the first ask is
 *  answered first), then what is going (sent, acted), newest first; done and put away are left out */
export function onStage(ps: Piece[], rows?: Row[]): Piece[] {
  // a session stopped on the person (an allow, its question) comes first: work waits on it; then oldest first
  const open = ps.filter((p) => p.state === "open").sort((a, b) => Number(b.kind === "needs") - Number(a.kind === "needs") || a.at - b.at);
  // an answer that started or sent nothing has done its work once it went: it leaves the stage for earlier; one that
  // started sessions stays while one of them still works or waits (with rows known), then steps back to earlier too
  const going = ps.filter((p) => p.state === "sent" || (p.state === "acted" && stillGoing(p, rows))).sort((a, b) => b.at - a.at).slice(0, 4);
  return [...open, ...going];
}
const stillGoing = (p: Piece, rows?: Row[]) => {
  const ids = [...(p.acted?.started ?? []), ...(p.acted?.sent ?? [])];
  if (!ids.length) return false;
  if (!rows) return true;
  return Date.now() - (p.acted?.at ?? 0) < 60_000 || rows.some((r) => ids.includes(r.id) && (r.state === "working" || r.state === "needs"));
};
export const earlier = (ps: Piece[], rows?: Row[]) => ps.filter((p) => p.state === "done" || p.state === "dropped" || (p.state === "acted" && !stillGoing(p, rows))).sort((a, b) => b.at - a.at).slice(0, 12);

export type Glance = { where: string; happening: string; needs: string; needsId?: string; did: string; didUndo?: string; working: number; waiting: number };
/** the four questions, each one short line */
export function glance(a: { folder?: string; busy: boolean; rows: Row[]; pieces: Piece[]; did: Did[]; failed?: boolean }): Glance {
  const working = a.rows.filter((r) => r.state === "working").length;
  const waitingRows = a.rows.filter((r) => r.state === "needs").length;
  const open = onStage(a.pieces, a.rows).filter((p) => p.state === "open" && p.lack !== "none");
  const where = `Build · projects${a.folder ? ` · ${short(a.folder)}` : ""}`;
  const happening = [a.busy ? "it is thinking" : "", working ? `${working} at work` : "", waitingRows ? `${waitingRows} wait${waitingRows > 1 ? "" : "s"} on you` : "",
    !a.busy && !working && !waitingRows ? (a.failed ? "its last turn failed: see the talk" : "all quiet") : ""].filter(Boolean).join(" · ");
  const first = open[0];
  const needs = first ? `${LACK_WORDS[first.lack]} on “${first.title}”${open.length > 1 ? ` · ${open.length - 1} more` : ""}`
    : waitingRows ? `${waitingRows} session${waitingRows > 1 ? "s" : ""} wait${waitingRows > 1 ? "" : "s"} on an answer` : "nothing";
  const last = a.did[a.did.length - 1];
  const undoable = last?.piece ? a.pieces.find((p) => p.id === last.piece && (p.state === "sent" || p.state === "acted")) : undefined;
  return { where, happening, needs, ...(first ? { needsId: first.id } : {}), did: last ? last.words : "nothing yet", ...(undoable ? { didUndo: undoable.id } : {}), working, waiting: open.length + waitingRows };
}
// a folder as the glance says it: under home as ~, and when long, its last two parts (the part that says which one)
const short = (p: string) => { const s = p.replace(/^\/(Users|home)\/[^/]+/, "~"); const parts = s.split("/"); return s.length > 22 && parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : s; };

/** a piece's draft while the person works on it: kept per piece across redraws and a close, until it is sent */
export type Draft = { text: string; pick: string[]; typed: boolean; marks?: Mark[]; free?: "ask" | "edits" };
export const draftOf = (p: Piece, kept?: Draft): Draft => kept ?? { text: p.answer?.text ?? "", pick: p.answer?.pick ?? (p.kind === "split" ? (p.parts ?? []).map((x) => x.id) : isOrder(p) ? [...(p.shows?.steps ?? [])] : []), typed: !!p.answer?.text, ...(p.answer?.marks?.length ? { marks: p.answer.marks } : {}) };
/** a mark put on the picture, at a place in % of it; a second mark at the same place (within 3%) takes the first away */
export function putMark(d: Draft, m: Mark): Draft {
  const ms = d.marks ?? [], near = ms.findIndex((k) => Math.abs(k.x - m.x) < 3 && Math.abs(k.y - m.y) < 3);
  return { ...d, marks: near >= 0 ? ms.filter((_, i) => i !== near) : [...ms, m].slice(0, 12) };
}
export const noteMark = (d: Draft, i: number, note: string): Draft => ({ ...d, marks: (d.marks ?? []).map((k, j) => (j === i ? { ...k, note } : k)) });
/** a piece whose answer is an order the person rearranges */
export const isOrder = (p: Piece) => p.shows?.form === "order" && (p.kind === "call" || p.kind === "note" || p.kind === "press") && !!p.shows.steps?.length;
/** a step moved one place up (-1) or down (+1); at an end it stays */
export function moveStep(d: Draft, i: number, by: -1 | 1): Draft {
  const j = i + by; if (j < 0 || j >= d.pick.length) return d;
  const pick = d.pick.slice(); [pick[i], pick[j]] = [pick[j], pick[i]];
  return { ...d, pick };
}
/** a step dragged from place i to place j */
export function moveTo(d: Draft, i: number, j: number): Draft {
  if (i === j || i < 0 || j < 0 || i >= d.pick.length || j >= d.pick.length) return d;
  const pick = d.pick.slice(); const [x] = pick.splice(i, 1); pick.splice(j, 0, x);
  return { ...d, pick };
}
/** proof in one line: how many green, running, red */
export function proofLine(c: { state: string }[]): string {
  const n = (s: string) => c.filter((x) => x.state === s).length;
  return [n("green") ? `${n("green")} green` : "", n("running") ? `${n("running")} running` : "", n("red") ? `${n("red")} red` : ""].filter(Boolean).join(" · ");
}
/** an image the engine can show (an absolute path to a picture) rather than words */
export const isPicture = (v?: string) => !!v && /^\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(v.trim());
/** a pick pressed: a split's parts toggle; a call's choice is one pick, pressed again it is removed */
export function pressPick(p: Piece, d: Draft, k: string): Draft {
  if (p.kind === "split") return { ...d, pick: d.pick.includes(k) ? d.pick.filter((x) => x !== k) : [...d.pick, k] };
  return { ...d, pick: d.pick[0] === k ? [] : [k] };
}
/** what the send button says, and whether it can send: never an untouched guess by Enter alone, never nothing */
export function sendOf(p: Piece, d: Draft): { label: string; ok: boolean; guess: boolean } {
  if (p.kind === "split") {
    const n = d.pick.length, reuse = (p.parts ?? []).filter((x) => d.pick.includes(x.id) && x.reuse).length, fresh = n - reuse;
    const words = [fresh ? `start ${fresh}` : "", reuse ? `send to ${reuse}` : ""].filter(Boolean).join(", ");
    return { label: n ? words : "pick a part", ok: n > 0, guess: false };
  }
  if (p.kind === "needs" && p.choices?.length) return { label: d.pick[0] === "allow" ? "allow" : d.pick[0] === "no" ? "say no" : "pick one", ok: d.pick.length > 0, guess: false };
  if (p.kind === "goal" || p.kind === "needs") {
    if (d.text.trim()) return { label: "send", ok: true, guess: false };
    return p.guess ? { label: "send its guess", ok: true, guess: true } : { label: "send", ok: false, guess: false };
  }
  if (isOrder(p) && p.kind === "call") { const moved = d.pick.join("\n") !== (p.shows?.steps ?? []).join("\n"); return { label: moved ? "send this order" : "keep this order", ok: true, guess: false }; }
  const n = d.marks?.length ?? 0;
  if (n && (p.kind === "eye" || p.kind === "call") && !d.pick.length) return { label: `send ${n} mark${n > 1 ? "s" : ""}`, ok: true, guess: false };
  if (p.kind === "call" || p.kind === "eye") return { label: d.pick.length ? (n ? `send, with ${n} mark${n > 1 ? "s" : ""}` : "send") : p.shows?.futures ? "pick a way" : "pick one", ok: d.pick.length > 0 || !!d.text.trim(), guess: false };
  if (p.kind === "press") return p.shows?.futures ? (d.pick.length ? { label: `hold to go ahead: ${d.pick[0]}`, ok: true, guess: false } : { label: "pick a way first", ok: false, guess: false }) : { label: "hold to go ahead", ok: true, guess: false };
  return { label: "got it", ok: true, guess: false };
}
/** the answer that goes: a guess sent as is is the guess's words */
export function answerOf(p: Piece, d: Draft): { text?: string; pick?: string[]; marks?: Mark[]; free?: "ask" | "edits" } {
  const s = sendOf(p, d);
  const text = s.guess ? p.guess ?? "" : d.text.trim();
  return { ...(text ? { text } : {}), ...(d.pick.length ? { pick: d.pick } : {}), ...(p.kind === "press" ? { pick: d.pick.length && p.shows?.futures ? d.pick : ["go"] } : {}), ...(p.kind === "note" ? { pick: ["ok"] } : {}), ...(d.marks?.length ? { marks: d.marks } : {}), ...(p.kind === "split" ? { free: d.free ?? "edits" } : {}) };
}
/** the line under a piece after it was sent: the grace counting down, or what it started */
export function goingOf(p: Piece, now: number): string {
  if (p.state === "sent") return `goes in ${Math.max(0, Math.ceil(((p.goesAt ?? now) - now) / 1000))} s · undo takes it back, nothing went`;
  if (p.state === "acted") {
    const s = p.acted?.started.length ?? 0, t = p.acted?.sent.length ?? 0;
    return [s ? `started ${s} session${s > 1 ? "s" : ""}` : "", t ? `sent to ${t}` : "", !s && !t ? "it went to the project's session" : ""].filter(Boolean).join(", ") + (s ? " · undo stops them" : "");
  }
  return "";
}

/** the picture of what is happening: the sessions drawn from the one, those at work and those that wait first, at most 7 */
export function threads(rows: Row[]): Row[] {
  const live = rows.filter((r) => r.state === "working" || r.state === "needs" || r.mine);
  const rest = rows.filter((r) => !live.includes(r));
  return [...live, ...rest].slice(0, 7);
}

/** a session's title as the picture shows it: its first clause, at most 44 letters (titles are often a cut first prompt) */
export function titleOf(t: string): string {
  const s = t.replace(/^you are\s+/i, "").replace(/[`*_]/g, "").trim();
  const first = s.split(/(?<=[.,;:!?])\s|\s[-–—·]\s/)[0].replace(/[.,;:]$/, "");
  return first.length > 44 ? first.slice(0, 43).trimEnd() + "…" : first || "untitled";
}

/** while the person was away (#1002, the design's back-from-night): what the sessions did since they last looked, as a
 *  few lines: what finished, what stopped, what waits on them, what they had set going. Nothing when away under 20 min. */
export const AWAY_MS = 20 * 60_000;
export function awayOf(a: { seen: number; now: number; rows: Row[]; did: Did[]; pieces: Piece[] }): { for: string; lines: string[] } | null {
  if (!a.seen || a.now - a.seen < AWAY_MS) return null;
  const moved = a.rows.filter((r) => r.updatedAt > a.seen);
  const lines: string[] = [];
  const done = moved.filter((r) => r.state === "done" || r.state === "resting"), failed = moved.filter((r) => r.state === "failed");
  const working = a.rows.filter((r) => r.state === "working"), needs = onStage(a.pieces).filter((p) => p.state === "open" && p.lack !== "none");
  if (done.length) lines.push(`${done.length === 1 ? `“${titleOf(done[0].title)}”` : `${done.length} sessions`} finished a turn`);
  if (failed.length) lines.push(`${failed.length === 1 ? `“${titleOf(failed[0].title)}”` : `${failed.length} sessions`} stopped: a turn failed`);
  if (working.length) lines.push(`${working.length} still at work`);
  // what the person set going while they were here last (an allow or a no is not news)
  for (const d of a.did.filter((x) => x.at > a.seen && !/: (allow|no)$/.test(x.words) && !/^sent to \d+ from/.test(x.words)).slice(-2)) lines.push(d.words);
  lines.push(needs.length ? `${needs.length} wait${needs.length > 1 ? "" : "s"} on you, first below` : "nothing waits on you");
  if (lines.length === 1 && !needs.length) return null;
  return { for: ago(a.now - a.seen), lines };
}

/** "where we are" lines drawn as a grid (the design's lost-the-plot: one picture, the goal, where we are, what is next,
 *  what is his): lines like "Play page, done: …" become a row per thread and a column per state. Null when the lines
 *  are not of that shape (most must be), so they stay a list. */
export const STATES = ["done", "at work", "unsure", "yours", "next"] as const;
export type Grid = { threads: { name: string; cells: Partial<Record<(typeof STATES)[number], string[]>> }[]; rest: string[] };
const STATE_OF: [RegExp, (typeof STATES)[number]][] = [[/^(done|finished)/i, "done"], [/^(working|at work|running)/i, "at work"], [/^(unsure|unknown|failed|stopped)/i, "unsure"],
  [/^(yours|waits on you|needs you)/i, "yours"], [/^(next|later)/i, "next"]];
export function gridOf(lines: string[]): Grid | null {
  const threads: Grid["threads"] = [], rest: string[] = [];
  for (const l of lines) {
    const m = /^(.{1,48}?),\s*([a-z ]{3,16}?)\s*(?:\([^)]*\))?:\s*(.+)$/i.exec(l.trim());
    const st = m && STATE_OF.find(([re]) => re.test(m[2]))?.[1];
    if (!m || !st) { rest.push(l); continue; }
    let t = threads.find((x) => x.name.toLowerCase() === m[1].trim().toLowerCase());
    if (!t) threads.push((t = { name: m[1].trim(), cells: {} }));
    (t.cells[st] ??= []).push(m[3].trim());
  }
  return threads.length >= 1 && rest.length <= Math.floor(lines.length / 3) ? { threads, rest } : null;
}

/** away lines with headers (a short line in capitals: "WHEN YOU'RE BACK", "IT MAY", "IT MAY NOT") become sections,
 *  so a hand-over reads as boxes, not one long list; null when there are no headers */
export function sectionsOf(lines: string[]): { head: string; kind: "may" | "not" | "will" | "plain"; items: string[] }[] | null {
  const isHead = (l: string) => l.length <= 32 && /[A-Z]/.test(l) && l === l.toUpperCase();
  if (!lines.some(isHead)) return null;
  const out: { head: string; kind: "may" | "not" | "will" | "plain"; items: string[] }[] = [];
  for (const l of lines) {
    if (isHead(l)) { const h = l.toLowerCase(); out.push({ head: h, kind: /may not|must not|won.?t|will not/.test(h) ? "not" : /\bmay\b|\bcan\b/.test(h) ? "may" : /back|exist|after/.test(h) ? "will" : "plain", items: [] }); }
    else if (out.length) out[out.length - 1].items.push(l); else out.push({ head: "", kind: "plain", items: [l] });
  }
  return out;
}
