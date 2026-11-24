// Context: facts with sources, learned and stale (#1617 Harmony slice S29; capacity.md, capability.md "memory", as
// quoted in the slice). What Sol may take as true about a person, one store for every seat instead of each seat's own
// memory, kept per place: a fact belongs to a place (a folder path, "denise", "denise/bookings"), and an act in a place
// reads that place's facts and those of every place above it (context follows place).
//   next.context {scope}                     → {facts: [{id, place, fact, source, learned, stale, offLimits?}], proposals}
//   next.fact.add {place, fact, source, replaces?}          the person's own fact
//   next.fact.propose {place, fact, source, seat, replaces?} a seat's learning: a proposal, never a fact until kept
//   next.fact.keep {id, keep}                the person's answer to a proposal
//   next.fact.remove {id, undo?}             a hold: the fact stays in the file, out of every context, and nobody may
//                                            add or propose its words in that place again until undone
// The rule, one place:
//   - every fact has a source (what it came from, in words or a file), or it is not kept;
//   - learned is true for every fact the person did not say themselves (Sol's, or a seat's they kept);
//   - a seat's learning arrives as a proposal (agent/meta/learn.ts's "Always like this?"): one question per learning,
//     the same words proposed again in that place land on the open one (its count and its seats grow), never a second;
//     a no is kept, and those words are not asked again there;
//   - stale ground is flagged, never deleted: a fact that a newer one replaces (by its id or its words), or one a check
//     found gone (staleFact: upkeep's, S24's), stays with stale set and still shows, so the person sees what changed.
// Kept in SOL_HOME/next/context.json {v: 1, facts, proposals}, written whole (file.ts), beside the old stores; none is
// read or written by it. Lane 4 of ticket #18 (Home's engine half, docs/three-versions-2026-11-14/gate1/lane4-design.md)
// files by "the person's record: each area's facts' words → that area"; wordsAt(home, place) is that read from this
// store (standing facts only: not removed, not stale, not off limits), so the two can share one store later.
// Signed: franktsai2008-eng's agent, Harmony slice S29 (#1617).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import { nestedIn, okScope, upward } from "./fits.js";

export type By = "person" | "sol" | "seat";
export type Fact = {
  id: string; place: string; fact: string; source: string; by: By; seat?: string; at: number; learned: boolean;
  /** the fact it replaces (that one is stale from now) */
  replaces?: string;
  offLimits?: true;
  /** flagged by a check (the source is gone): the words of why */
  staleBy?: { at: number; why: string };
  /** a hold: out of every context, its words refused in its place, until undone */
  removed?: { at: number };
};
export type Proposal = { id: string; place: string; fact: string; source: string; seats: string[]; count: number; at: number; replaces?: string; answer?: "keep" | "no"; answered?: number };
export type Row = { id: string; place: string; fact: string; source: string; learned: boolean; stale: boolean; staleWhy?: string; offLimits?: true; by: By; seat?: string; at: number };
export type Answer<T> = ({ ok: true } & T) | { ok: false; why: string };

const MAX = 500;
const clean = (v: unknown, max = MAX): string => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** the same words: case and spacing aside */
const same = (a: string, b: string) => a.toLowerCase().replace(/[\s.]+$/g, "") === b.toLowerCase().replace(/[\s.]+$/g, "");
const SEAT = /^[\w .:@/-]{1,60}$/;

export const contextFile = (home: string) => join(nextDir(home), "context.json");

type Store = { facts: Fact[]; proposals: Proposal[] };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function readStore(home: string): Store {
  const { data } = readJson(contextFile(home));
  const facts = (Array.isArray(data.facts) ? data.facts : []).filter((f): f is Fact => isObj(f) && typeof f.id === "string" && okScope(f.place)
    && typeof f.fact === "string" && !!f.fact && typeof f.source === "string" && !!f.source);
  const proposals = (Array.isArray(data.proposals) ? data.proposals : []).filter((p): p is Proposal => isObj(p) && typeof p.id === "string" && okScope(p.place)
    && typeof p.fact === "string" && typeof p.source === "string" && Array.isArray(p.seats));
  return { facts, proposals };
}
const save = (home: string, s: Store) => writeJson(contextFile(home), { v: 1, facts: s.facts, proposals: s.proposals });
let seq = 0;
const idOf = (p: string, at: number) => `${p}-${at.toString(36)}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** the fact a newer one replaces: by its id, or by its words in the same place (pure) */
const target = (s: Store, place: string, r: string): Fact | undefined =>
  s.facts.find((f) => f.place === place && f.id === r) ?? s.facts.find((f) => f.place === place && !f.removed && same(f.fact, r));
/** whether a fact is stale, and why (pure): replaced by a later one standing, or flagged by a check */
function staleOf(s: Store, f: Fact): string | null {
  if (f.staleBy) return f.staleBy.why;
  // a replacing fact the person later removed still replaced it: the old ground does not come back as true
  const by = s.facts.find((g) => g !== f && g.replaces && target(s, g.place, g.replaces) === f);
  return by ? `replaced by “${by.fact}” (${by.source})` : null;
}
/** removed words are held for everyone; a no to a seat's proposal holds them only from Sol and the seats (the person
 *  may still say it themselves) */
const removedHere = (s: Store, place: string, fact: string): boolean => s.facts.some((f) => f.removed && f.place === place && same(f.fact, fact));
const saidNo = (s: Store, place: string, fact: string): boolean => s.proposals.some((p) => p.answer === "no" && p.place === place && same(p.fact, fact));

type In = { place?: unknown; fact?: unknown; source?: unknown; replaces?: unknown; seat?: unknown; offLimits?: unknown };
function read(a: In): { place: string; fact: string; source: string; replaces?: string } | { why: string } {
  if (!okScope(a.place)) return { why: "a fact needs its place, like denise or denise/bookings" };
  const fact = clean(a.fact), source = clean(a.source, 300);
  if (!fact) return { why: "a fact needs its words" };
  if (!source) return { why: "a fact needs its source" };
  const replaces = clean(a.replaces);
  return { place: a.place, fact, source, ...(replaces ? { replaces } : {}) };
}

/** a fact the person said (next.fact.add), or Sol's own from what it saw (by "sol": learned). Its words held there
 *  (removed, or a no) are refused; the same words standing there already are that fact, never a second */
export function addFact(home: string, a: In, by: "person" | "sol" = "person", now = Date.now()): Answer<{ fact: Fact; again?: true }> {
  const r = read(a);
  if ("why" in r) return { ok: false, why: r.why };
  const s = readStore(home);
  if (removedHere(s, r.place, r.fact)) return { ok: false, why: "removed: it is not taken as true here again until the person says so" };
  if (by === "sol" && saidNo(s, r.place, r.fact)) return { ok: false, why: "the person said no to it here" };
  const was = s.facts.find((f) => f.place === r.place && !f.removed && same(f.fact, r.fact) && !staleOf(s, f));
  if (was) return { ok: true, fact: was, again: true };
  if (r.replaces && !target(s, r.place, r.replaces)) return { ok: false, why: "it replaces a fact this place does not have" };
  const f: Fact = { id: idOf("fact", now), place: r.place, fact: r.fact, source: r.source, by, at: now, learned: by !== "person",
    ...(r.replaces ? { replaces: r.replaces } : {}), ...(a.offLimits === true ? { offLimits: true as const } : {}) };
  s.facts.push(f);
  save(home, s);
  return { ok: true, fact: f };
}

/** next.fact.propose: a seat's learning, kept as a proposal that asks "Keep this?". The same words proposed again in
 *  that place while open land on the open one */
export function propose(home: string, a: In, now = Date.now()): Answer<{ proposal: Proposal; ask?: string; known?: true }> {
  const r = read(a);
  if ("why" in r) return { ok: false, why: r.why };
  const seat = clean(a.seat, 60);
  if (!seat || !SEAT.test(seat)) return { ok: false, why: "a proposal names the seat it comes from" };
  const s = readStore(home);
  if (removedHere(s, r.place, r.fact)) return { ok: false, why: "removed: it is not taken as true here again until the person says so" };
  if (saidNo(s, r.place, r.fact)) return { ok: false, why: "the person said no to it here" };
  const standing = s.facts.find((f) => f.place === r.place && !f.removed && same(f.fact, r.fact) && !staleOf(s, f));
  if (standing) return { ok: false, why: "it is a fact here already" };
  const open = s.proposals.find((p) => !p.answer && p.place === r.place && same(p.fact, r.fact));
  if (open) {
    open.count += 1;
    if (!open.seats.includes(seat)) open.seats.push(seat);
    save(home, s);
    return { ok: true, proposal: open, ask: "Keep this?" };
  }
  const p: Proposal = { id: idOf("prop", now), place: r.place, fact: r.fact, source: r.source, seats: [seat], count: 1, at: now, ...(r.replaces ? { replaces: r.replaces } : {}) };
  s.proposals.push(p);
  save(home, s);
  return { ok: true, proposal: p, ask: "Keep this?" };
}

/** next.fact.keep {id, keep}: kept, the proposal is a fact (learned, from the seat, with its source); no, it is kept as a
 *  no and its words are not asked again in that place */
export function answer(home: string, a: { id?: unknown; keep?: unknown }, now = Date.now()): Answer<{ fact?: Fact; proposal: Proposal }> {
  const s = readStore(home);
  const p = s.proposals.find((x) => x.id === a.id);
  if (!p) return { ok: false, why: "no proposal of that id" };
  if (p.answer) return { ok: false, why: "it was answered already" };
  if (typeof a.keep !== "boolean") return { ok: false, why: "keep is yes or no" };
  p.answer = a.keep ? "keep" : "no";
  p.answered = now;
  if (!a.keep) { save(home, s); return { ok: true, proposal: p }; }
  // the person said the same words themselves meanwhile: that fact stands, never a second beside it
  const was = s.facts.find((f) => f.place === p.place && !f.removed && same(f.fact, p.fact) && !staleOf(s, f));
  if (was) { save(home, s); return { ok: true, fact: was, proposal: p }; }
  const f: Fact = { id: idOf("fact", now), place: p.place, fact: p.fact, source: p.source, by: "seat", seat: p.seats[0], at: now, learned: true, ...(p.replaces ? { replaces: p.replaces } : {}) };
  s.facts.push(f);
  save(home, s);
  return { ok: true, fact: f, proposal: p };
}

/** next.fact.remove {id, undo?}: a hold, never a delete. Undo lets the fact stand again */
export function remove(home: string, a: { id?: unknown; undo?: unknown }, now = Date.now()): Answer<{ fact: Fact; again?: true }> {
  const s = readStore(home);
  const f = s.facts.find((x) => x.id === a.id);
  if (!f) return { ok: false, why: "no fact of that id" };
  if (a.undo === true) {
    if (!f.removed) return { ok: true, fact: f, again: true };
    delete f.removed;
  } else {
    if (f.removed) return { ok: true, fact: f, again: true };
    f.removed = { at: now };
  }
  save(home, s);
  return { ok: true, fact: f };
}

/** a check found a fact's ground gone (its file, its seat): flagged stale with why, never deleted */
export function staleFact(home: string, a: { id?: unknown; why?: unknown }, now = Date.now()): Answer<{ fact: Fact }> {
  const s = readStore(home);
  const f = s.facts.find((x) => x.id === a.id);
  const why = clean(a.why, 200);
  if (!f) return { ok: false, why: "no fact of that id" };
  if (!why) return { ok: false, why: "stale says why" };
  f.staleBy = { at: now, why };
  save(home, s);
  return { ok: true, fact: f };
}

const row = (s: Store, f: Fact): Row => {
  const why = staleOf(s, f);
  return { id: f.id, place: f.place, fact: f.fact, source: f.source, learned: f.learned, stale: !!why, ...(why ? { staleWhy: why } : {}),
    ...(f.offLimits ? { offLimits: true as const } : {}), by: f.by, ...(f.seat ? { seat: f.seat } : {}), at: f.at };
};

/** next.context {scope}: the facts of that place and every place above it, nearest place first then oldest first,
 *  stale ones flagged and still shown, removed ones out; and the proposals still open there. A folder the person put
 *  inside another (pos.json's `in`, BR1 item 6) reads that folder's facts above its own, however their paths go */
export function contextOf(home: string, scope: unknown): Answer<{ scope: string; facts: Row[]; proposals: Proposal[] }> {
  if (!okScope(scope)) return { ok: false, why: "a scope is a place, like denise or denise/bookings" };
  const s = readStore(home), up = upward(scope, nestedIn(home));
  const facts = up.flatMap((p) => s.facts.filter((f) => f.place === p && !f.removed)).map((f) => row(s, f));
  const proposals = s.proposals.filter((p) => !p.answer && up.includes(p.place));
  return { ok: true, scope, facts, proposals };
}

/** the words Home's filing reads for a place (lane 4's "each area's facts' words"): standing facts only */
export function wordsAt(home: string, place: string): string[] {
  const r = contextOf(home, place);
  return r.ok ? r.facts.filter((f) => !f.stale && !f.offLimits).map((f) => f.fact) : [];
}
