// What Sol knows, one list in the engine (BR1 people p-engine, #1615; sol/PROTOCOL.md "next.known"). The engine half of
// the face's next/known.ts (builder F): the same keys, the same words, so a fact is the same fact on every screen.
//   knownOf(you, at, store) → Known[]   at is a place (a part's id, "w:<path>" / "h:<id>", or the path) or "you" (all)
//   setReadSource(w, {source, read})    a source off (its facts out now, read.off) or on again (from the next read); Back
//   fixFact(w, {k, how, now?, place?})  a preview of what changes and a token; {token, keep} does it, {token, back} undoes
//   sinceOf(w, {folder, session?, after?}) · leave(w, {session, k})   what changed in a folder, for a session to hear
//   tryFit(w, {knob, scope, take, by?})  fit mode: the same preview and token as a fix; keep is the person's take there
//   rememberTold · toldOf(w, {session}) · becauseOf(sol, session)   what a session's first turn told, and so why it did it
//   noteFix(w, {how, what, place, reason, batch?})     one store (strategic.html change 1): every fix the person makes
//                                       (a drag, an Undo, a Back, a Keep, a Stop, a hide, a put back) is one scoped line,
//                                       fix:<id>, in this list, with the things shown the same for the same reason (same)
//   sameFor(w, {reason, how, reach})    "Same for these?": these N, or everywhere (a rule:<reason> line agents read)
//   place(w, {folder, to, from?, why, reading, batch?}) · placedNow(w) · seenPlaced(w, {folder})   where Sol put a folder,
//                                       and why: placed:<folder> lines, unseen until seen (next.placed); unplace(w,
//                                       {folder}|{batch}) takes them out (the shelf, the move-in's one Back, movein-place.ts)
//   sameNow(w, {reason, place?})        read only: the things like it by reading (next.known.same.of, F's similar)
//   becauseFor(w, keys, session?)       an agent's move carries the keys of what it acted on, or the engine refuses it
// A Known: the line, where it came from in words (source), who said it (by), which read saw it (from), when (at), and
// its place (null: about the person, everywhere). Keys: fact:<id> and tool:<part>:<tool> the engine holds; seen:<part>:
// <what> what a place's own fields say; talk and aim:<words> the person's own fields. Every change the person makes
// here is logged once, with where it happened, so a session working in that folder can hear it (next.session.since).
// The store, SOL_HOME/next/known.json: the previews waiting for keep, the undos of what was kept, the change log, the
// keys a session left, the keys the person said were right (no longer maybe old) or not true (seen: and the person's).
// Signed: marcocyl04-ux's agent (BR1 people), BR1 (#1615).
import { randomBytes } from "node:crypto";
import { setSource, patchRecord, readRecord } from "../consent.js";
import { addFact, readStore as readFacts, remove as removeFact } from "./context.js";
import { back as fitBack, nestedIn, okScope, personSet, takeOf } from "./fits.js";
import { nextDir, readJson, writeJson } from "./file.js";
import { scopeOf as folderScope } from "./pos.js";
import { SOURCES, type Source } from "./you-read.js";
import { dropPart, forgetFact, recordHomeOf, setTalk, writeFields, youOf, type Part, type Style, type Told, type Where, type You } from "./you.js";
import { basename, join } from "node:path";
import { homedir } from "node:os";

export type By = "read" | "person" | "sol" | "seat";
export type Known = { k: string; fact: string; source: string; by: By; stale?: true; from?: Source; at?: string; place: string | null; fix?: { how: FixHow; what: string; reason?: string } };
export type How = "right" | "not-true" | "not-anymore" | "only-here";
export type Change = { k: string; place: string | null; was: string; now: string | null; source: string; at: string; batch?: string };
/** what the person did to fix something Sol did or showed; the face words each how as FIX_SAID does */
export type FixHow = "drag" | "put-back" | "undo" | "back" | "keep" | "stop" | "hide" | "show" | "later" | "answer" | "pass" | "open";
/** one fix, scoped: what (the thing's name, in the person's words), where (its place; null: everywhere), the key of what
 *  Sol acted on that it answers (reason: a fact's key, placed:<folder>, look:<folder>:<part>), the move-in's batch */
export type FixLine = { id: string; how: FixHow; what: string; place: string | null; reason?: string; was?: string; now?: string; batch?: string; because?: string[]; at: string };
/** where Sol put, moved or set up a folder, and why: the reading (an id like "one-day" or "inside:<folder>", never a
 *  name) is what "similar" goes by; seen once the person has looked at it; by "person": the person put it there (the
 *  shelf), so it is theirs and never Sol's to move again */
export type Placed = { folder: string; name: string; to: string; from: string | null; why: string; reading: string; batch?: string; at: string; seen?: true; by?: "person" };
/** a fix the person said holds beyond the one thing: these (the things listed) or everywhere (each one like it, later too) */
export type Rule = { reason: string; how: FixHow | How; reach: "these" | "everywhere"; to: string[]; at: string };
/** the things shown the same for the same reason, by reading, never by name: a fix asks once of them */
export type Same = { reason: string; n: number; these: { k: string; place: string | null; fact: string }[] };
type Step =
  | { op: "forgot"; k: string } | { op: "hold"; id: string } | { op: "unhold"; id: string }
  | { op: "hide"; k: string } | { op: "sure"; k: string } | { op: "talk"; was: Style | null }
  | { op: "source"; source: Source; was: "yes" | "no" | null; held: boolean }
  | { op: "fit"; knob: string; scope: string } | { op: "rule"; reason: string; how: string; hid: string[] };
type Pending = { token: string; at: number; changes: Preview[]; plan: Plan | FitPlan };
type Done = { token: string; at: number; undo: Step[]; log: Change[] };
/** one line of a preview; a fit's says its knob and scope too (what is the knob, from and to its takes: the face words them) */
type Preview = { what: string; from: string; to: string | null; when: "now" | "from the next read"; knob?: string; scope?: string };
type Plan = { k: string; how: How; now?: string; scope?: string; place: string | null; fact: string };
type FitPlan = { fit: { knob: string; scope: string; take: string; was: string | null; by: "point" | "say" | "pick" | "try"; reason?: string } };
/** a session's first turn, what it told (you.ts youHereTold): the facts by their keys, where, when */
type ToldAt = { at: string; place: string | null; told: Told[] };
type Store = { v: 1; pending: Pending[]; done: Done[]; changes: Change[]; left: Record<string, string[]>; sure: string[]; hidden: string[]; told: Record<string, ToldAt>; fixes: FixLine[]; placed: Placed[]; rules: Rule[] };

const file = (sol: string) => join(nextDir(sol), "known.json");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export function readStore(sol: string): Store {
  const { data } = readJson(file(sol));
  const left: Record<string, string[]> = {};
  if (data.left && typeof data.left === "object") for (const [s, ks] of Object.entries(data.left as object)) left[s] = strs(ks);
  const told: Record<string, ToldAt> = {};
  if (data.told && typeof data.told === "object") for (const [s, t] of Object.entries(data.told as object)) if (t && Array.isArray((t as ToldAt).told)) told[s] = t as ToldAt;
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return { v: 1, pending: arr<Pending>(data.pending), done: arr<Done>(data.done), changes: arr<Change>(data.changes), left, sure: strs(data.sure), hidden: strs(data.hidden), told,
    fixes: arr<FixLine>(data.fixes), placed: arr<Placed>(data.placed), rules: arr<Rule>(data.rules) };
}
/** the newest 200 sessions' first turns are kept (a session older than that says nothing of why) */
const lastTold = (t: Record<string, ToldAt>) => Object.fromEntries(Object.entries(t).sort((a, b) => a[1].at.localeCompare(b[1].at)).slice(-200));
const writeStore = (sol: string, s: Store) =>
  writeJson(file(sol), { ...s, pending: s.pending.slice(-20), done: s.done.slice(-40), changes: s.changes.slice(-300), sure: s.sure.slice(-500), hidden: s.hidden.slice(-500), told: lastTold(s.told),
    fixes: s.fixes.slice(-500), placed: s.placed.slice(-2000), rules: s.rules.slice(-200) });
const token = () => randomBytes(9).toString("base64url");
const iso = (t: number) => new Date(t).toISOString();

// ------------------------------------------------------------------------------------------- the one list (pure)

/** where a fact came from, in the person's words (the face's fromWords, word for word) */
const FROM: Record<string, string> = {
  "claude-sessions": "your AI chats", "codex-sessions": "your AI chats", projects: "your code", files: "your files", apps: "your apps",
  browser: "your browser", "calendar-store": "your calendar", notes: "your notes", record: "you set it up", you: "you said",
};
export const fromWords = (f: string) => FROM[f] ?? "what Sol read";
const isSource = (f: string): f is Source => (SOURCES as readonly string[]).includes(f);
/** a tool named like an id (has "_") is not said */
const sayable = (tool: string) => !!tool.trim() && !tool.includes("_");
const hr = (h: number) => { const x = ((h % 24) + 24) % 24; return x === 0 ? "12am" : x < 12 ? `${x}am` : x === 12 ? "12pm" : `${x - 12}pm`; };
/** the busiest run of three hours, "9pm–12am" */
export function busiest(at: number[]): string {
  let best = 0, from = 0;
  for (let h = 0; h < 24; h++) { const s = (at[h] || 0) + (at[(h + 1) % 24] || 0) + (at[(h + 2) % 24] || 0); if (s > best) { best = s; from = h; } }
  return best > 0 ? `${hr(from)}–${hr(from + 3)}` : "";
}
/** what a seen:<place>:<what> key read: its last segment (a place's id holds colons, "w:/a/b", "h:x"; a reading never) */
export const seenWhat = (k: string) => k.slice(k.lastIndexOf(":") + 1);
/** one place said two ways: a part's id, "w:<path>" or "h:<id>", the path itself */
export const samePlace = (a: string, b: string) => a === b || a === `w:${b}` || a === `h:${b}` || b === `w:${a}` || b === `h:${a}`;

/** what Sol knows of a place: its own facts (knows) first, then what its fields say */
export function ofPart(p: Part, readAt?: string): Known[] {
  const place = p.id, out: Known[] = [];
  const seen = (what: string, fact: string, source: string, by: By, from?: string): Known =>
    ({ k: `seen:${p.id}:${what}`, fact, source, by, ...(from && isSource(from) ? { from } : {}), ...(readAt && by !== "person" ? { at: readAt } : {}), place });
  for (const f of p.knows) if (!(f.k.startsWith("tool:") && !sayable(f.k.split(":").slice(2).join(":")))) out.push({ ...f, place });
  const ais = [p.from.includes("claude-sessions") ? "Claude Code" : "", p.from.includes("codex-sessions") ? "Codex" : ""].filter(Boolean);
  if (ais.length) { const via = p.from.includes("claude-sessions") ? "claude-sessions" : "codex-sessions"; out.push(seen("ais", `${ais.join(" and ")} work${ais.length > 1 ? "" : "s"} here`, fromWords(via), "read", via)); }
  const when = busiest(p.at);
  if (when) out.push(seen("hours", `Most of your work happens ${when}`, "what Sol read", "sol"));
  if (p.share != null && p.share > 0) out.push(seen("share", p.share < 0.01 ? "Under 1% of your time" : `${Math.round(p.share * 100)}% of your time`, p.main ? "your main place" : "what Sol read", "sol"));
  for (const f of p.from) if (f === "calendar-store" || f === "browser" || f === "notes" || f === "apps") out.push(seen(`in:${f}`, `Seen in ${fromWords(f)}`, fromWords(f), "read", f));
  if (p.new) out.push(seen("new", "New since Sol last looked", "what Sol read", "sol"));
  if (p.faded) out.push(seen("quiet", "Quiet lately", "what Sol read", "sol"));
  return out;
}
const TALK_W: Record<string, string> = { plain: "plain words", brief: "brief, the answer first", explained: "explains the why" };
/** what Sol knows of the person everywhere: how Sol talks (once picked or read), what they're here for */
export function ofYou(y: You): Known[] {
  const out: Known[] = [];
  if (y.talk.by !== "default")
    out.push({ k: "talk", fact: `Sol talks to you: ${TALK_W[y.talk.style] ?? y.talk.style}`, source: y.talk.by === "you" ? "you picked it" : y.talk.why ?? "how you set your AIs", by: y.talk.by === "you" ? "person" : "read", ...(y.talk.by === "you" ? {} : { from: "claude-sessions" as const }), place: null });
  for (const a of y.aims.filter((a) => a.said || a.ok))
    out.push({ k: `aim:${a.w}`, fact: `You're here for ${a.w.toLowerCase()}`, source: a.said ? "you said" : "what Sol read", by: a.said ? "person" : "sol", ...(a.at ? { at: a.at } : {}), place: null });
  return out;
}
/** what Sol picked up from what the person did (home.sources' learned lines, learnedOf), as the face's ofLearned says
 *  them: learned:<id>, how often it was seen; about the person, everywhere */
export type Learned = { id: string | number; text: string; seen?: number };
export const ofLearned = (lines: readonly Learned[]): Known[] =>
  lines.map((l) => ({ k: `learned:${l.id}`, fact: l.text, source: l.seen ? `seen ${l.seen} time${l.seen === 1 ? "" : "s"}` : "what you did", by: "sol" as const, place: null }));

/** what Sol knows at a place, or of the person ("you": the person's own first, the learned lines, then each place's).
 *  A source turned off says nothing (its facts are out now); a key the person said was not true is gone; one they said
 *  was right is not maybe old any more; the same key twice is said once */
export function knownOf(y: You, at: string, s: Pick<Store, "sure" | "hidden"> & { rules?: Rule[] } = { sure: [], hidden: [] }, learned: readonly Learned[] = []): Known[] {
  const off = new Set<string>(y.read.off), sure = new Set(s.sure), hidden = new Set(s.hidden);
  // a fact's reading the person said was wrong everywhere: no place says it again (seen:<any place>:<what>)
  const gone = new Set((s.rules ?? []).filter((r) => r.reach === "everywhere" && (r.how === "hide" || r.how === "not-true") && r.reason.startsWith("seen:")).map((r) => seenWhat(r.reason)));
  const parts = y.parts.filter((p) => at === "you" || samePlace(p.id, at) || p.scope === at);
  const all = [...(at === "you" ? [...ofYou(y), ...ofLearned(learned)] : []), ...parts.flatMap((p) => ofPart(p, y.read.at ?? undefined))];
  const seenK = new Set<string>(), out: Known[] = [];
  for (const f of all) {
    if (seenK.has(f.k) || hidden.has(f.k) || (f.from && off.has(f.from)) || (f.k.startsWith("seen:") && gone.has(seenWhat(f.k)))) continue;
    seenK.add(f.k);
    if (f.stale && sure.has(f.k)) { const { stale: _s, ...g } = f; out.push(g); } else out.push(f);
  }
  return out;
}

/** next.known { at? }: the one list, at a place or of the person (with the learned lines Home has now, when it is on) */
export function knownNow(w: Where, a: { at?: unknown }, now = Date.now(), learned: readonly Learned[] = []) {
  const at = typeof a.at === "string" && a.at.trim() ? a.at.trim() : "you";
  const s = readStore(w.sol);
  return { ok: true as const, at, facts: [...knownOf(youOf(w, now), at, s, learned), ...storeLines(s, at)] };
}

// ------------------------------------------------------------------------------------------------ a source off

const recHome = (w: Where) => w.rec ?? recordHomeOf(w.sol, w.user);
const sourceWas = (w: Where): Record<string, string> | null => {
  const r = readRecord(recHome(w));
  return r === "missing" || r === "broken" ? null : ((r.consent?.sources ?? {}) as Record<string, string>);
};
/** the record's word for a source put back as it was (unset: no word at all) */
function putSource(w: Where, source: Source, was: "yes" | "no" | null) {
  if (was) return setSource(source, was, recHome(w));
  return patchRecord((rec) => { const c = rec.consent && typeof rec.consent === "object" ? rec.consent : {}; const { [source]: _x, ...rest } = (c.sources ?? {}) as Record<string, string>; return { ...rec, consent: { ...c, sources: rest } }; }, recHome(w));
}
/** next.you.source { source, read }: read false, the source is off (the record's consent "no", the one the read turn's
 *  guard reads; held while there is no record): its facts leave every list now, next.you's read.off names it and
 *  read.sources does not; a token gives it Back. read true, the record's "yes": it is read from the next read on */
export function setReadSource(w: Where, a: { source?: unknown; read?: unknown }, now = Date.now()) {
  const source = typeof a.source === "string" && isSource(a.source) ? a.source : null;
  if (!source) return { ok: false as const, why: `source is one of ${SOURCES.join(", ")}` };
  if (typeof a.read !== "boolean") return { ok: false as const, why: "read is true or false" };
  const said = sourceWas(w);
  const was = said ? (said[source] === "yes" || said[source] === "no" ? (said[source] as "yes" | "no") : null) : null;
  const before = knownOf(youOf(w, now), "you", readStore(w.sol));
  if (said) { const r = setSource(source, a.read ? "yes" : "no", recHome(w)); if ("why" in r) return { ok: false as const, why: r.why }; }
  else { const r = writeFields(w, (f) => ({ ...f, off: a.read ? (f.off ?? []).filter((s) => s !== source) : [...new Set([...(f.off ?? []), source])] })); if (!r.ok) return r; }
  const s = readStore(w.sol), t = token();
  const log: Change[] = a.read ? [] : before.filter((f) => f.from === source).map((f) => ({ k: f.k, place: f.place, was: f.fact, now: null, source: `you turned off ${fromWords(source)}`, at: iso(now) }));
  s.done.push({ token: t, at: now, undo: [{ op: "source", source, was, held: !said }], log });
  s.changes.push(...log);
  writeStore(w.sol, s);
  return { ok: true as const, token: t, source, read: a.read, ...(a.read ? { when: "from the next read" as const } : {}) };
}

// ------------------------------------------------------------------------------------------------ a fact fixed

const OK_HOW: How[] = ["right", "not-true", "not-anymore", "only-here"];
const clean = (v: unknown, n = 500) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
/** the place a fact moves to (only-here): a scope (denise/orders), or a part by its id or path, by the scope it keeps */
function scopeOf(y: You, place: string): string | null {
  if (okScope(place)) return place;
  return y.parts.find((p) => samePlace(p.id, place))?.scope ?? null;
}
/** next.you.fact.fix { k, how, now?, place? }: what the person says of one fact. right saves at once (a maybe-old fact
 *  is not maybe old any more); the others answer a preview, what would change and when, with a token; {token, keep:true}
 *  does it and {token, back:true} undoes it (or drops a preview not kept). not-true: the fact goes (one the engine holds
 *  is forgotten as next.you.fact.forget does; one Sol works out is not said again). not-anymore: it was true; with now,
 *  its new words stand in its place. only-here: a fact told of a wider place, moved to `place` alone */
export function fixFact(w: Where, a: { k?: unknown; how?: unknown; now?: unknown; place?: unknown; token?: unknown; keep?: unknown; back?: unknown }, t = Date.now()) {
  if (typeof a.token === "string") return a.keep === true ? keep(w, a.token, t) : a.back === true ? back(w, a.token) : { ok: false as const, why: "a token goes with keep:true or back:true" };
  const k = clean(a.k, 240), how = a.how as How;
  if (!k) return { ok: false as const, why: "k is a fact's key from next.known" };
  if (!OK_HOW.includes(how)) return { ok: false as const, why: `how is one of ${OK_HOW.join(", ")}` };
  const y = youOf(w, t), s = readStore(w.sol);
  const f = knownOf(y, "you", s).find((x) => x.k === k);
  if (!f) return { ok: false as const, why: "no fact of that key now" };
  const nowWords = clean(a.now);
  if (how === "right") {
    const log: Change = { k, place: f.place, was: f.fact, now: f.fact, source: "you said it is right", at: iso(t) };
    const tk = token();
    s.sure = [...s.sure.filter((x) => x !== k), k];
    s.done.push({ token: tk, at: t, undo: [{ op: "sure", k }], log: [log] });
    s.changes.push(log);
    writeStore(w.sol, s);
    return { ok: true as const, saved: true as const, token: tk };
  }
  let scope: string | undefined;
  if (how === "only-here") {
    if (!k.startsWith("fact:")) return { ok: false as const, why: "only a fact you or your AIs told Sol moves to one place" };
    const to = typeof a.place === "string" ? scopeOf(y, a.place) : null;
    if (!to) return { ok: false as const, why: "place is a place of yours, a part's id or a scope like denise/orders" };
    scope = to;
  }
  if (how === "not-anymore" && nowWords && !k.startsWith("fact:")) return { ok: false as const, why: "new words stand only for a fact you or your AIs told Sol" };
  const changes: Preview[] = how === "only-here" ? [{ what: f.fact, from: f.place ?? "everywhere", to: scope!, when: "now" }]
    : how === "not-anymore" && nowWords ? [{ what: f.fact, from: f.fact, to: nowWords, when: "now" }]
    : [{ what: f.fact, from: f.fact, to: null, when: k.startsWith("tool:") ? "from the next read" : "now" }];
  const tk = token();
  s.pending.push({ token: tk, at: t, changes, plan: { k, how, ...(nowWords ? { now: nowWords } : {}), ...(scope ? { scope } : {}), place: f.place, fact: f.fact } });
  writeStore(w.sol, s);
  return { ok: true as const, preview: { changes, token: tk }, same: sameOf(y, s, k, f.place) };
}

function keep(w: Where, tk: string, t: number) {
  const s = readStore(w.sol);
  const p = s.pending.find((x) => x.token === tk);
  if (!p) return s.done.some((x) => x.token === tk) ? { ok: true as const, kept: true as const, again: true as const } : { ok: false as const, why: "no preview of that token" };
  if ("fit" in p.plan) return keepFit(w, s, p as Pending & { plan: FitPlan }, t);
  const { k, how, now: nowWords, scope, place, fact } = p.plan;
  const undo: Step[] = [];
  const said = how === "not-true" ? "you said it is not true" : how === "not-anymore" ? "you said it is not so any more" : "you said it is only true here";
  if (k.startsWith("fact:")) {
    const id = k.slice(5), old = readFacts(w.sol).facts.find((x) => x.id === id);
    if (!old) return { ok: false as const, why: "that fact is not kept any more" };
    if (nowWords || scope) {
      const r = addFact(w.sol, { place: scope ?? old.place, fact: nowWords ?? old.fact, source: scope ? old.source : "you said" }, "person", t);
      if (!r.ok) return r;
      if (!r.again) undo.push({ op: "hold", id: r.fact.id });
    }
    const r = removeFact(w.sol, { id }, t);
    if (!r.ok) { for (const u of undo) if (u.op === "hold") removeFact(w.sol, { id: u.id }, t); return r; }
    undo.push({ op: "unhold", id });
  } else if (k.startsWith("tool:")) {
    const r = forgetFact(w, { k }, t);
    if (!r.ok) return r;
    undo.push({ op: "forgot", k });
  } else if (k === "talk") {
    const was = youOf(w, t).talk;
    const r = setTalk(w, { style: null }, t);
    if (!r.ok) return r;
    undo.push({ op: "talk", was: was.by === "you" ? was.style : null });
  } else {
    s.hidden = [...s.hidden.filter((x) => x !== k), k];
    undo.push({ op: "hide", k });
  }
  const log: Change = { k, place, was: fact, now: nowWords ?? (scope ? fact : null), source: said, at: iso(t) };
  s.pending = s.pending.filter((x) => x.token !== tk);
  s.done.push({ token: tk, at: t, undo, log: [log] });
  s.changes.push(log);
  writeStore(w.sol, s);
  return { ok: true as const, kept: true as const, token: tk, you: youOf(w, t) };
}

/** Back: a preview not kept is dropped; a kept one (a fix, a right, a source off) is undone step by step, its log out */
function back(w: Where, tk: string) {
  const s = readStore(w.sol);
  if (s.pending.some((x) => x.token === tk)) { s.pending = s.pending.filter((x) => x.token !== tk); writeStore(w.sol, s); return { ok: true as const, back: true as const }; }
  const d = s.done.find((x) => x.token === tk);
  if (!d) return { ok: false as const, why: "nothing of that token to undo" };
  for (const u of [...d.undo].reverse()) {
    if (u.op === "hold") removeFact(w.sol, { id: u.id });
    else if (u.op === "unhold") removeFact(w.sol, { id: u.id, undo: true });
    else if (u.op === "forgot") forgetFact(w, { k: u.k, back: true });
    else if (u.op === "hide") s.hidden = s.hidden.filter((x) => x !== u.k);
    else if (u.op === "sure") s.sure = s.sure.filter((x) => x !== u.k);
    else if (u.op === "talk") setTalk(w, { style: u.was });
    else if (u.op === "fit") fitBack(w.sol, { knob: u.knob, scope: u.scope });
    else if (u.op === "rule") { s.rules = s.rules.filter((x) => !(x.reason === u.reason && x.how === u.how)); s.hidden = s.hidden.filter((x) => !u.hid.includes(x)); }
    else if (u.op === "source") {
      if (u.held) writeFields(w, (f) => ({ ...f, off: u.was === "no" ? [...new Set([...(f.off ?? []), u.source])] : (f.off ?? []).filter((x) => x !== u.source) }));
      else putSource(w, u.source, u.was);
    }
  }
  // the record stays (what was done, then its Back, a fix line of its own); only the undo is spent, so it can't run twice
  s.done = s.done.filter((x) => x.token !== tk);
  writeStore(w.sol, s);
  const l = d.log[0];
  if (l) noteFix(w, { how: "back", what: `“${l.now ?? l.was ?? l.k}”`, place: l.place ?? EVERYWHERE, reason: l.k }, Date.now());
  return { ok: true as const, back: true as const, token: tk };
}

// ---------------------------------------------------------------------------------------------------- fit mode

/** a knob is an id (fits.ts's own rule): letters, digits, dots, dashes */
const KNOB = /^[a-z][a-z0-9._-]{0,79}$/i;
const BY_FIT = ["point", "say", "pick", "try"] as const;
const FIT_SAID = { point: "you pointed at it and kept it", say: "you said it and kept it", pick: "you picked it and kept it", try: "you tried Sol’s idea and kept it" } as const;
/** next.fit.try { knob, scope, take, by?, folder?, reason? }: fit mode's one change (the person pointed at a place,
 *  said it or picked it; `by`), answered as next.you.fact.fix answers: a preview of what changes there, with a token;
 *  {token, keep:true} keeps it as the person's own take there (next.fit.set, with how it was asked as its source) and
 *  logs it for the sessions working there (next.session.since); {token, back:true} drops a preview, or takes a kept one
 *  back (next.fit.back, which holds the knob there: Sol leaves it alone until the person lets it go). The take that
 *  decides there now (the nearest scope's, fits.takeOf) is `from`; the same take standing in that very scope is no change */
export function tryFit(w: Where, a: { knob?: unknown; scope?: unknown; take?: unknown; by?: unknown; folder?: unknown; reason?: unknown; token?: unknown; keep?: unknown; back?: unknown }, t = Date.now()) {
  if (typeof a.token === "string") return a.keep === true ? keep(w, a.token, t) : a.back === true ? back(w, a.token) : { ok: false as const, why: "a token goes with keep:true or back:true" };
  if (typeof a.knob !== "string" || !KNOB.test(a.knob)) return { ok: false as const, why: "knob is a setting's id, like size or attention" };
  if (!okScope(a.scope)) return { ok: false as const, why: "scope is a place: ~ for all of Sol, a folder like school/la245, or session:<id>" };
  const take = clean(a.take, 200);
  if (!take) return { ok: false as const, why: "take is the choice to try" };
  const knob = a.knob, scope = a.scope, by = BY_FIT.find((x) => x === a.by) ?? "pick", reason = clean(a.reason, 300);
  const now = takeOf(w.sol, knob, scope, undefined, typeof a.folder === "string" ? a.folder : undefined);
  if (now.take === take && now.scope === scope) return { ok: false as const, why: "that is the take there already" };
  const changes: Preview[] = [{ what: knob, from: now.take ?? "default", to: take, when: "now", knob, scope }];
  const s = readStore(w.sol), tk = token();
  s.pending.push({ token: tk, at: t, changes, plan: { fit: { knob, scope, take, was: now.take, by, ...(reason ? { reason } : {}) } } });
  writeStore(w.sol, s);
  return { ok: true as const, preview: { changes, token: tk } };
}
function keepFit(w: Where, s: Store, p: Pending & { plan: FitPlan }, t: number) {
  const { knob, scope, take, was, by, reason } = p.plan.fit;
  const r = personSet(w.sol, { knob, scope, take, source: `fit mode: ${by}`, ...(reason ? { reason } : {}) }, t);
  if (!r.ok) return r;
  const log: Change = { k: `fit:${knob}`, place: scope === "~" ? null : scope, was: was ?? "default", now: take, source: FIT_SAID[by], at: iso(t) };
  s.pending = s.pending.filter((x) => x.token !== p.token);
  s.done.push({ token: p.token, at: t, undo: [{ op: "fit", knob, scope }], log: [log] });
  s.changes.push(log);
  writeStore(w.sol, s);
  return { ok: true as const, kept: true as const, token: p.token, fit: r.fit };
}

// ------------------------------------------------------------------------------------------- why Sol did it

/** a session's first turn told it these facts (you.ts youHereTold), kept by the session's id once its first answer
 *  names it (index.ts); nothing told, nothing kept */
export function rememberTold(w: Where, session: string, cwd: string | null, told: Told[], t = Date.now()) {
  if (!session || !told.length) return;
  const s = readStore(w.sol);
  s.told[session] = { at: iso(t), place: cwd, told };
  writeStore(w.sol, s);
}
/** next.session.told { session }: what that session's first turn told, each fact as next.known says it */
export function toldOf(w: Where, a: { session?: unknown }) {
  const session = clean(a.session, 120);
  if (!session) return { ok: false as const, why: "session is a session's id" };
  const t = readStore(w.sol).told[session];
  return { ok: true as const, session, at: t?.at ?? null, place: t?.place ?? null, told: t?.told ?? [] };
}
/** because: the keys of what a session knew from its first turn, for whatever it made (an ask, a plan, a Diary line);
 *  a session Sol told nothing gives none, and nothing is made up in its place */
export function becauseOf(sol: string, session: string | null | undefined): string[] {
  if (!session) return [];
  return (readStore(sol).told[session]?.told ?? []).map((x) => x.k);
}

// ------------------------------------------------------------------------------------- what a session hears

/** whether a change belongs to a folder: about the person (no place), the folder itself however it is said, or a place
 *  inside it or around it (a scope's last part as the folder's own name; a folder's id and its scope as one); with `inOf` (fits.ts nestedIn, pos.json's
 *  `in`), also inside it or around it as the person nested them on the canvas, however their paths go */
export function inFolder(place: string | null, folder: string, inOf?: (place: string) => string | null | undefined): boolean {
  if (place === null) return true;
  const bare = (s: string) => s.replace(/^[wh]:/, "").replace(/\/+$/, "");
  const p = bare(place), f = bare(folder);
  if (p === f || f.startsWith(p + "/") || p.startsWith(f + "/") || f.endsWith("/" + p) || f.includes("/" + p + "/")) return true;
  /** one folder however it is said, as its scope: "h:x" and "home/x" are one, "w:/a/b", "/a/b" and "a/b" are one */
  const canon = (s: string) => (/^[wh]:/.test(s) ? folderScope(s) : null) ?? s.replace(/^\/+|\/+$/g, "");
  const cp = canon(place), cf = canon(folder);
  if (cp === cf || cf.startsWith(cp + "/") || cp.startsWith(cf + "/")) return true;
  if (!inOf) return false;
  const said = (x: string) => { const i = inOf(x); return i !== undefined ? i : inOf(canon(x)); };
  /** the folders a place was put in, nearest first, as scopes (loops and depth bounded) */
  const up = (x: string) => { const out: string[] = []; for (let s = said(x); s && !out.includes(s) && out.length < 64; s = said(s)) out.push(s); return out.map(canon); };
  return up(place).includes(cf) || up(folder).includes(cp);
}
/** next.session.since { folder, session?, after? }: what changed in what Sol knows there (newest last), after a time
 *  (ms or ISO) when one is given; a session's left keys (next.session.leave) out */
export function sinceOf(w: Where, a: { folder?: unknown; session?: unknown; after?: unknown }) {
  const folder = clean(a.folder, 1000);
  if (!folder) return { ok: false as const, why: "folder is the folder the session works in" };
  const s = readStore(w.sol);
  const after = typeof a.after === "number" ? a.after : typeof a.after === "string" ? Date.parse(a.after) : NaN;
  const left = new Set(typeof a.session === "string" ? s.left[a.session] ?? [] : []), inOf = nestedIn(w.sol);
  const changes = s.changes.filter((c) => inFolder(c.place, folder, inOf) && !left.has(c.k) && (isNaN(after) || Date.parse(c.at) > after))
    .map(({ k, was, now, source, at }) => ({ k, was, now, source, at }));
  return { ok: true as const, folder, changes };
}
/** next.session.leave { session, k }: this session does not hear that change (it knew, or it does not matter there) */
export function leave(w: Where, a: { session?: unknown; k?: unknown }) {
  const session = clean(a.session, 120), k = clean(a.k, 240);
  if (!session || !k) return { ok: false as const, why: "a session and a fact's key" };
  const s = readStore(w.sol);
  s.left[session] = [...new Set([...(s.left[session] ?? []), k])].slice(-200);
  const ids = Object.keys(s.left);
  if (ids.length > 200) for (const id of ids.slice(0, ids.length - 200)) delete s.left[id];
  writeStore(w.sol, s);
  return { ok: true as const, session, k };
}

/** next.you.claude { on }: the person's word on reading with their Claude; the next read goes by it (byOf) */
export function setClaude(w: Where, a: { on?: unknown }, now = Date.now()) {
  if (typeof a.on !== "boolean") return { ok: false as const, why: "on is true or false" };
  const r = writeFields(w, (f) => ({ ...f, claude: a.on as boolean }));
  return r.ok ? { ok: true as const, you: youOf(w, now) } : r;
}

// ------------------------------------------------------------------------------- one store (change 1, #1615)

const FIX_SAID: Record<FixHow, (f: FixLine) => string> = {
  drag: (f) => `You moved ${f.what}${f.now ? ` to ${f.now}` : ""}`,
  "put-back": (f) => `You put ${f.what} back${f.was ? ` in ${f.was}` : ""}`,
  undo: (f) => `You undid ${f.what}`,
  back: (f) => `You said no to ${f.what}`,
  keep: (f) => `You kept ${f.what}`,
  stop: (f) => `You stopped ${f.what}`,
  hide: (f) => `You hid ${f.what}${f.place ? " here" : ""}`,
  show: (f) => `You brought ${f.what} back${f.place ? " here" : ""}`,
  later: (f) => `You put ${f.what} off till later`,
  answer: (f) => `You answered ${f.what}${f.now ? `: ${f.now}` : ""}`,
  pass: (f) => `You let ${f.what} pass`,
  open: (f) => `You opened ${f.what}`,
};
const FIX_HOWS = Object.keys(FIX_SAID) as FixHow[];
/** a fix as what Sol knows: the person's own, in their words, where it happened; fix says what it was (its how, its thing, the key
 *  it answers), so a window can tell from the one store what the person forgot and has not brought back */
export const ofFix = (f: FixLine): Known => ({ k: `fix:${f.id}`, fact: FIX_SAID[f.how](f), source: "you did it", by: "person", at: f.at, place: f.place, fix: { how: f.how, what: f.what, ...(f.reason ? { reason: f.reason } : {}) } });
/** a placement as what Sol knows: where Sol put it and why, Sol's own. Kept out of the plane (to "shelf", its stored
 *  name) is said as archived (Marco's 14:51 ruling retired the Shelf word): "You archived …", "Sol archived …" */
const toSaid = (to: string) => `in ${/^[wh]:/.test(to) ? to.slice(2).split("/").filter(Boolean).pop() ?? to : to}`;
const putSaid = (who: "You" | "Sol", p: Placed) => (p.to === "shelf"
  ? `${who} archived ${p.name}${who === "Sol" && p.from ? ` from ${p.from}` : ""}`
  : `${who} put ${p.name} ${who === "Sol" && p.from ? `from ${p.from} ` : ""}${toSaid(p.to)}`);
export const ofPlaced = (p: Placed): Known => p.by === "person"
  ? { k: `placed:${p.folder}`, fact: putSaid("You", p), source: "you did it", by: "person", at: p.at, place: p.folder }
  : { k: `placed:${p.folder}`, fact: `${putSaid("Sol", p)} because ${p.why}`, source: "where Sol put it", by: "sol", at: p.at, place: p.folder };
/** a rule the person made of a fix: these, or everywhere */
const ofRule = (r: Rule): Known => ({ k: `rule:${r.reason}:${r.how}`, fact: r.reach === "everywhere" ? `Everywhere: ${HOW_RULE[r.how] ?? r.how} for the same reason` : `For ${r.to.length} more: ${HOW_RULE[r.how] ?? r.how} for the same reason`, source: "you said it", by: "person", at: r.at, place: null });
const HOW_RULE: Record<string, string> = { hide: "hidden", "put-back": "not moved", drag: "moved as you moved it", undo: "undone", back: "not done", stop: "stopped", keep: "kept", show: "shown", later: "put off", answer: "answered", pass: "let pass", open: "opened", "not-true": "not true", "not-anymore": "not so any more", "only-here": "only where you said" };

/** the one store's own lines (fixes, placements, rules) at a place or of the person, as next.known says them */
export function storeLines(s: Pick<Store, "fixes" | "placed" | "rules">, at: string): Known[] {
  const here = (place: string | null) => at === "you" || place === null || samePlace(place, at) || inFolder(place, at);
  return [...s.fixes.map(ofFix), ...s.placed.map(ofPlaced), ...s.rules.map(ofRule)].filter((k) => here(k.place));
}

/** what a reason's "same" is: the reading a fact or a placement rests on, never a name. seen:<place>:<what> → <what>;
 *  placed:<folder> → that placement's reading; look:<folder>:<part> → the part; anything else stands for itself */
function readingOf(s: Pick<Store, "placed">, reason: string): { by: "seen" | "placed" | "look" | "k"; is: string } {
  if (reason.startsWith("seen:")) return { by: "seen", is: seenWhat(reason) };
  if (reason.startsWith("placed:")) { const p = s.placed.find((x) => `placed:${x.folder}` === reason); return { by: "placed", is: p?.reading ?? "" }; }
  if (reason.startsWith("look:")) return { by: "look", is: reason.split(":").pop() ?? "" };
  return { by: "k", is: reason };
}
/** the things shown the same for the same reason as `reason`, the one at `place` aside; none: null */
export function sameOf(y: You, s: Store, reason: string, place: string | null, looks: readonly { folder: string; part: string; k: string; fact: string }[] = []): Same | null {
  const r = readingOf(s, reason);
  if (!r.is) return null;
  const other = (p: string | null) => !(place && p && samePlace(p, place));
  let these: Same["these"] = [];
  if (r.by === "seen") these = knownOf(y, "you", s).filter((f) => f.k.startsWith("seen:") && seenWhat(f.k) === r.is && other(f.place)).map(({ k, place, fact }) => ({ k, place, fact }));
  // a folder's parts (next/look.ts) say their facts as seen:<folder>:<what> too, so the same reading reaches them
  if (r.by === "seen") these = [...these, ...looks.filter((l) => seenWhat(l.k) === r.is && other(l.folder) && !these.some((t) => t.k === l.k)).map((l) => ({ k: l.k, place: l.folder, fact: l.fact }))];
  else if (r.by === "placed") these = s.placed.filter((p) => p.reading === r.is && other(p.folder)).map((p) => ({ k: `placed:${p.folder}`, place: p.folder, fact: ofPlaced(p).fact }));
  else if (r.by === "look") these = looks.filter((l) => l.part === r.is && other(l.folder)).map((l) => ({ k: l.k, place: l.folder, fact: l.fact }));
  return these.length ? { reason, n: these.length, these: these.slice(0, 200) } : null;
}

/** a fix's place when it holds for the person everywhere, said out loud: a fix with no place is refused, never everywhere */
export const EVERYWHERE = "everywhere";
export const NO_FIX_PLACE = `place is the folder the fix happened in, or "${EVERYWHERE}"`;
export const NO_FIX_REASON = "reason is the key of what Sol did or showed that the fix answers (its because)";
/** next.known.fix { how, what, place, reason, was?, now?, batch? }: one fix the person made, written once as a scoped
 *  line (fix:<id> in next.known, a change a session working there hears), with the things shown the same for the same
 *  reason, to ask "Same for these?" once. Its place (a folder, or "everywhere") and its reason (the key it answers) are
 *  both asked for, so every line says where it holds and why; a fix without either is refused */
export function noteFix(w: Where, a: { how?: unknown; what?: unknown; place: unknown; reason: unknown; was?: unknown; now?: unknown; batch?: unknown; because?: unknown }, t = Date.now(), looks: Parameters<typeof sameOf>[4] = []) {
  const how = FIX_HOWS.find((x) => x === a.how);
  if (!how) return { ok: false as const, why: `how is one of ${FIX_HOWS.join(", ")}` };
  const what = clean(a.what, 200);
  if (!what) return { ok: false as const, why: "what is the thing, in the person's words" };
  const at = clean(a.place, 1000), reason = clean(a.reason, 300);
  if (!at) return { ok: false as const, why: NO_FIX_PLACE };
  if (!reason) return { ok: false as const, why: NO_FIX_REASON };
  const place = at === EVERYWHERE ? null : at, was = clean(a.was, 300), now = clean(a.now, 300), batch = clean(a.batch, 80);
  // the keys of what Sol knew that made the thing fixed (a raise's ask carries them), kept as keys only
  const because = Array.isArray(a.because) ? [...new Set(a.because.map((k) => clean(k, 300)).filter(Boolean))].slice(0, 20) : [];
  const s = readStore(w.sol);
  // a thing let pass is let pass once: a second pass for the same reason is the same line
  const passed = how === "pass" ? s.fixes.find((x) => x.how === "pass" && x.reason === reason) : undefined;
  if (passed) return { ok: true as const, fix: ofFix(passed), same: null };
  const f: FixLine = { id: token(), how, what, place, reason, ...(was ? { was } : {}), ...(now ? { now } : {}), ...(batch ? { batch } : {}), ...(because.length ? { because } : {}), at: iso(t) };
  const line = ofFix(f);
  s.fixes.push(f);
  s.changes.push({ k: line.k, place, was: was || what, now: now || null, source: line.fact, at: f.at, ...(batch ? { batch } : {}) });
  if (how === "put-back" || how === "drag") for (const p of s.placed) if (place && samePlace(p.folder, place)) p.seen = true;
  writeStore(w.sol, s);
  return { ok: true as const, fix: line, same: sameOf(youOf(w, t), s, reason, place, looks) };
}
/** where an engine part writes a fix: its SOL_HOME, the person on this Mac */
export const fixWhere = (sol: string, user = process.env.HOME || homedir()): Where => ({ sol, user, rec: recordHomeOf(sol, user) });
/** the folder a session, plan or automation works in (its cwd), as a fix's place: w:<path>; working nowhere, everywhere */
export const placeOfCwd = (cwd: unknown): string => (typeof cwd === "string" && cwd.startsWith("/") ? `w:${cwd.replace(/\/+$/, "") || "/"}` : EVERYWHERE);
/** the helper an engine part calls when the person's act is a fix (a Stop, a Later, an answer, a raise passed by): one
 *  line in this SOL_HOME's store, scoped and with its because as noteFix asks; the act stands even when the line is lost.
 *  Quiet's raise outcomes: { how: "later" | "answer" | "pass", what: the raise in words, place: its folder or
 *  "everywhere", reason: the key of what Sol raised, now?: the answer's words } */
export function noteFixIn(sol: string, a: { how: FixHow; what: string; place: string; reason: string; was?: string; now?: string; because?: string[] }, t = Date.now()) {
  try { return noteFix(fixWhere(sol), a, t); }
  catch { return { ok: false as const, why: "the act stands; its line could not be kept" }; }
}
/** the person pressed Stop on a session, a plan or an automation: one fix line, scoped to the folder it worked in,
 *  because of the thing stopped (session:<id>, plan:<id>, auto:<id>) */
/** a raise's outcomes, read back (Quiet's judging, builder J): the lines the person wrote answering an ask (reason
 *  ask:<id>) by answer, later, pass or open, newer than sinceMs, oldest first; place null is everywhere */
export const OUTCOME_HOWS: readonly FixHow[] = ["answer", "later", "pass", "open"];
export function outcomesOf(sol: string, sinceMs = 0): { how: FixHow; what: string; place: string | null; reason: string; because?: string[]; now?: string; at: string }[] {
  return readStore(sol).fixes
    .filter((f) => OUTCOME_HOWS.includes(f.how) && f.reason?.startsWith("ask:") && Date.parse(f.at) > sinceMs)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((f) => ({ how: f.how, what: f.what, place: f.place, reason: f.reason!, ...(f.because ? { because: f.because } : {}), ...(f.now ? { now: f.now } : {}), at: f.at }));
}
export const noteStop = (sol: string, a: { what: string; reason: string; cwd: unknown }, t = Date.now()) =>
  noteFixIn(sol, { how: "stop", what: a.what, place: placeOfCwd(a.cwd), reason: a.reason }, t);
/** the newest fix line answering `reason`: a Back says the thing as its fix said it, once the thing is out of the list */
const lastFixOf = (sol: string, reason: string) => readStore(sol).fixes.filter((f) => f.reason === reason).pop();
/** next.you.fact.forget { k, back? } (Reading's ×, Settings › You's Forget, and their Back): a told fact (fact:) or one
 *  the read saw (tool:) forgotten as forgetFact forgets it, a line a place's fields say (seen:) hidden from what Sol
 *  knows; each one fix line, where the line was, because of the key itself. A thing an opened Reading row kept
 *  (read:<kind>:<name>) is in no list Sol knows: its line says the kept line's text when the window passes it (what),
 *  else its name and kind, never the key */
const readWords = (k: string, said: unknown) => {
  const t = clean(said, 200), m = /^read:([^:]+):(.+)$/.exec(k);
  return t ? `“${t}”` : m ? `“${m[2]}” (${m[1]})` : "";
};
export function forgetKnown(w: Where, a: { k?: unknown; back?: unknown; what?: unknown }, now = Date.now()) {
  const k = typeof a.k === "string" ? a.k : "", back = a.back === true;
  const line = knownNow(w, {}, now).facts.find((f) => f.k === k), was = lastFixOf(w.sol, k);
  let r: ReturnType<typeof forgetFact>;
  if (k.startsWith("seen:") && k.length <= 1000) {
    if (!back && !line) return { ok: false as const, why: "k is a line of what Sol knows" };
    const s = readStore(w.sol);
    s.hidden = [...s.hidden.filter((x) => x !== k), ...(back ? [] : [k])];
    writeStore(w.sol, s);
    r = { ok: true as const, you: youOf(w, now) };
  } else r = forgetFact(w, { k, back }, now);
  if (!r.ok) return r;
  noteFix(w, { how: back ? "show" : "hide", what: line ? `“${line.fact}”` : was?.what ?? (readWords(k, a.what) || k), place: (line ? line.place : was ? was.place : null) ?? EVERYWHERE, reason: k }, now);
  return r;
}
/** next.you.part.drop { id, back? } (Reading's × on a part, and its Back): the part out of the picture as dropPart takes
 *  it, and one fix line at that part, because of the part's own key (its id) */
export function dropKnown(w: Where, a: { id?: unknown; back?: unknown }, now = Date.now()) {
  const id = typeof a.id === "string" ? a.id : "", part = youOf(w, now).parts.find((p) => p.id === id), was = lastFixOf(w.sol, id);
  const r = dropPart(w, a, now);
  if (!r.ok) return r;
  noteFix(w, { how: r.dropped ? "hide" : "show", what: part?.name ?? was?.what ?? (basename(id.replace(/^[wh]:/, "")) || id), place: id, reason: id }, now);
  return r;
}

/** next.known.same.of { reason, place?, folders? }: read only, the things shown the same as `reason` by its reading (a
 *  fact's what, a placement's reading, a part), never a name; `looks` are the parts of the folders the face shows */
export function sameNow(w: Where, a: { reason?: unknown; place?: unknown }, t = Date.now(), looks: Parameters<typeof sameOf>[4] = []) {
  const reason = clean(a.reason, 300);
  if (!reason) return { ok: false as const, why: "reason is the key of the thing, as next.known gives it" };
  return { ok: true as const, reason, same: sameOf(youOf(w, t), readStore(w.sol), reason, clean(a.place, 1000) || null, looks) };
}

/** next.known.same { reason, how, reach, to? }: the person's answer to "Same for these?": these (the keys listed, the
 *  ones sameOf gave) or everywhere (each one like it, later ones too); "here" asks nothing more. A fact's key fixed
 *  not-true or hidden leaves those lines; a rule:<reason> line says it, and every agent move reads it */
export function sameFor(w: Where, a: { reason?: unknown; how?: unknown; reach?: unknown; to?: unknown }, t = Date.now()) {
  const reason = clean(a.reason, 300), how = a.how as FixHow | How, reach = a.reach;
  if (!reason) return { ok: false as const, why: "reason is the key the fix answered" };
  if (!FIX_HOWS.includes(how as FixHow) && !OK_HOW.includes(how as How)) return { ok: false as const, why: "how is the fix's own how" };
  if (reach === "here") return { ok: true as const, reach };
  if (reach !== "these" && reach !== "everywhere") return { ok: false as const, why: "reach is here, these or everywhere" };
  const s = readStore(w.sol), to = strs(a.to).map((x) => clean(x, 1000)).filter(Boolean).slice(0, 200);
  if (reach === "these" && !to.length) return { ok: false as const, why: "to is the keys of the things shown the same" };
  const hid = how === "hide" || how === "not-true" ? to.filter((k) => k.startsWith("seen:") && !s.hidden.includes(k)) : [];
  s.hidden = [...s.hidden, ...hid];
  const r: Rule = { reason, how, reach, to, at: iso(t) };
  s.rules = [...s.rules.filter((x) => !(x.reason === reason && x.how === how)), r];
  const line = ofRule(r), tk = token();
  s.done.push({ token: tk, at: t, undo: [{ op: "rule", reason, how, hid }], log: [{ k: line.k, place: null, was: reason, now: reach, source: line.fact, at: r.at }] });
  s.changes.push({ k: line.k, place: null, was: reason, now: reach, source: line.fact, at: r.at });
  writeStore(w.sol, s);
  return { ok: true as const, reach, rule: line, token: tk };
}
/** whether the person said "everywhere" (or these, naming it) for this reading: an agent leaves such a thing alone */
export function ruled(s: Pick<Store, "rules" | "placed">, reason: string, k?: string): Rule | null {
  const r = readingOf(s, reason);
  return s.rules.find((x) => { const o = readingOf(s, x.reason); return o.by === r.by && o.is === r.is && (x.reach === "everywhere" || (!!k && x.to.includes(k))); }) ?? null;
}

// ------------------------------------------------------------------------------- where Sol put things

/** Sol put, moved or set up a folder (the move-in, a sort): one placed:<folder> line, unseen until the person sees it;
 *  a later placement of the same folder takes its place, but never one the person made (by: "person", seen at once) */
export function place(w: Where, a: { folder?: unknown; name?: unknown; to?: unknown; from?: unknown; why?: unknown; reading?: unknown; batch?: unknown; by?: "person" }, t = Date.now()) {
  const folder = clean(a.folder, 1000), to = clean(a.to, 300), why = clean(a.why, 300), reading = clean(a.reading, 200);
  if (!folder || !to || !why || !reading) return { ok: false as const, why: "a placement says the folder, where it went, why in words, and the reading it rests on" };
  const p: Placed = { folder, name: clean(a.name, 200) || folder.split("/").filter(Boolean).pop() || folder, to, from: clean(a.from, 300) || null, why, reading, ...(clean(a.batch, 80) ? { batch: clean(a.batch, 80) } : {}), at: iso(t), ...(a.by === "person" ? { seen: true as const, by: "person" as const } : {}) };
  const s = readStore(w.sol);
  if (a.by !== "person" && s.placed.some((x) => x.folder === folder && x.by === "person")) return { ok: false as const, why: "the person put that folder where it is; Sol does not move it" };
  s.placed = [...s.placed.filter((x) => x.folder !== folder), p];
  writeStore(w.sol, s);
  return { ok: true as const, placed: p };
}
/** next.placed {}: the folders Sol placed, moved or set up that the person has not seen yet, each with its fact and old
 *  place (the canvas's dot), newest last */
export function placedNow(w: Where) {
  const s = readStore(w.sol);
  return { ok: true as const, placed: s.placed.filter((p) => !p.seen).map((p) => ({ ...p, k: `placed:${p.folder}`, fact: ofPlaced(p).fact })) };
}
/** next.placed.seen { folder }: the person has seen it; its dot goes, its line stays in next.known */
export function seenPlaced(w: Where, a: { folder?: unknown }) {
  const folder = clean(a.folder, 1000), s = readStore(w.sol), p = s.placed.find((x) => x.folder === folder);
  if (!p) return { ok: false as const, why: "Sol placed no folder of that name" };
  p.seen = true;
  writeStore(w.sol, s);
  return { ok: true as const, folder };
}
/** placements taken out: one folder's, or every one of a batch (the move-in's one Back); what went, for the caller's line */
export function unplace(w: Where, a: { folder?: string; batch?: string }): Placed[] {
  const s = readStore(w.sol), out = s.placed.filter((p) => (a.folder ? p.folder === a.folder : !!a.batch && p.batch === a.batch));
  if (!out.length) return [];
  s.placed = s.placed.filter((p) => !out.includes(p));
  writeStore(w.sol, s);
  return out;
}
/** the person's own changes since a moment, outside a batch: what makes a whole Back a reset, so it turns into "Read again" */
export const ownSince = (w: Where, at: string, batch: string) => readStore(w.sol).fixes.filter((f) => f.at > at && f.batch !== batch).length;

// ------------------------------------------------------------------------------- an agent's move and its because

export const NO_BECAUSE = "an agent's move carries its because: the keys, from what Sol knows (next.known), of the facts it acted on";
/** the because an agent's move may carry: the keys it names that Sol knows now (or its session's first turn was told),
 *  then its session's told keys; none of either, the move is refused (null) */
export function becauseFor(w: Where, keys: unknown, session?: string | null, now = Date.now()): string[] | null {
  const s = readStore(w.sol), told = becauseOf(w.sol, session);
  const have = new Set([...knownOf(youOf(w, now), "you", s).map((f) => f.k), ...storeLines(s, "you").map((f) => f.k), ...told]);
  const named = strs(keys).map((k) => clean(k, 300)).filter((k) => have.has(k));
  const out = [...new Set([...named, ...told])].slice(0, 40);
  return out.length ? out : null;
}
