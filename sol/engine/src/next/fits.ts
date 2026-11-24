// Fits with an author, a reason and a hold (#1617 Harmony slice S15; relationship.md "personalization and
// customization", split.md E7, as quoted in the slice). A fit is a take on a knob in a scope (a place: "dev",
// "dev/api"). A fit Sol writes is personalization, a fit the person writes is customization; both sit here, and the
// author is the only boundary between them.
//   next.fits {scope?}            → next.fits {fits: [{knob, scope, take, author, reason, count, held, history[]}]}
//   next.fit.set {knob, scope, take | held:false}   the person's take (customization); held:false lets Sol fit it again
//   next.fit.back {knob, scope}   the take standing there is taken back: the one before it returns, and the fit is held
// The rule, one place:
//   - every fit Sol writes carries a reason and its count from the person's history (a whole number above 0), or none
//     is written;
//   - one Back by the person of a fit on a knob in a scope holds it: Sol's write there is refused until the person lets
//     it go (fit.set {held:false}). A take the person set is theirs: Sol does not write over it either;
//   - Sol may offer a take once: while it is open no second offer of that knob and scope is made, and after one "not
//     now" none is made again (a hold of the offer, not of the knob);
//   - the nearest scope wins: a fit asked for in "dev/api/tests" reads "dev/api/tests", then "dev/api", then "dev";
//   - history replays a past state: fitsAt(home, t) is the fits as they stood at t.
// One history, never edited (home/undo.ts's rule): each act is one event appended, and a Back is a new event whose
// cause is the act it takes back (value.undo true), so the fits now are a fold of the events, and so is any past state.
// The events are shaped as the Home log's (kind, item, value, cause, by), but kept in SOL_HOME/next/fits.json, beside
// the old stores: the log takes a kind only with its row in contract/kinds.ts, which is not this slice's file. Moving
// them onto the log is two rows (fit.set, fit.back) and this file's read, at the join.
// Signed: franktsai2008-eng's agent, Harmony slice S15 (#1617).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import { readPos, scopeOf } from "./pos.js";

export type Author = "person" | "sol" | "default";
export type FitKind = "fit.set" | "fit.back" | "fit.release" | "fit.offer" | "fit.keep" | "fit.notnow";
/** one event of the one history: never edited, never removed */
export type FitEv = {
  id: string; at: number; kind: FitKind; knob: string; scope: string;
  take?: string; author?: "person" | "sol"; reason?: string; count?: number;
  /** where the take came from, when it is known (a press, a setting's page, a file); unknown stays absent, never guessed */
  source?: string;
  /** the act this one answers (a Back's set, a keep's or not now's offer) */
  cause?: string;
};
/** a step of the history: `id` is its change id; `undoes` the change a Back took back (its undo revision) */
export type Step = { id: string; at: number; act: "set" | "back" | "release" | "offer" | "keep" | "notnow"; take?: string; author?: "person" | "sol"; reason?: string; count?: number; source?: string; undoes?: string; undone?: true };
/** `change`: the change id of the take standing (null when none); `source`: where it came from, null when unknown */
export type Fit = { knob: string; scope: string; take: string | null; author: Author; reason: string | null; count: number | null; source: string | null; change: string | null; held: boolean; history: Step[] };
export type Answer<T> = ({ ok: true } & T) | { ok: false; why: string };

const MAX = 200;
const clean = (v: unknown, max = MAX): string => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, max) : "");
/** a knob is an id: letters, digits, dots, dashes ("life.density", "voice") */
const KNOB = /^[a-z][a-z0-9._-]{0,79}$/i;
/** a scope is a place: a folder path of segments ("dev", "dev/api"), no empty, "." or ".." segment */
export const okScope = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 500 && !/[\u0000-\u001f\\]/.test(s) && !s.startsWith("~/") && s.split("/").every((p) => p !== "" && p !== "." && p !== "..");
/** a scope and every scope above it, nearest first ("dev/api/tests" → tests, api, dev, ~). Proposed for BR1, Frank's
 *  word (#1615): "~" is All of Sol, above every folder, so a take kept for all of Sol is found from any place; and
 *  "session:<id>" is one session, read before the folder it works in (chain). BR1 item 6: `inOf`, when given, says the
 *  folder a place sits in as the person put it (pos.json's `in`): a place's id there, null for the top, undefined
 *  unsaid; said, it is the next place up instead of the path's parent (a folder put inside another reads that folder's
 *  facts), and every place after it goes on the same way. Unsaid everywhere it is the path alone, as before */
export const ROOT = "~";
const DEEP = 64;
export const upward = (scope: string, inOf?: (place: string) => string | null | undefined): string[] => {
  if (scope === ROOT) return [ROOT];
  if (scope.startsWith("session:")) return [scope, ROOT];
  const out: string[] = [];
  for (let s: string | null = scope; s && s !== ROOT && !out.includes(s) && out.length < DEEP;) {
    out.push(s);
    const said: string | null | undefined = inOf?.(s), cut: number = s.lastIndexOf("/");
    s = said === null ? null : okScope(said) && !said.startsWith("session:") ? said : cut > 0 ? s.slice(0, cut) : null;
  }
  return [...out, ROOT];
};
/** the person's nesting as upward's `inOf`: the folder each place was put in on the canvas (pos.json's `in`), read once.
 *  pos.json keys a folder by its id ("h:massage", "w:/a/b") and so is its `in`; a fit, a fact and a change keep the
 *  folder's scope ("home/massage", "a/b"; pos.ts scopeOf). Asked by an id, the answer is an id; asked by a scope, a scope */
export const nestedIn = (home: string) => {
  const pos = readPos(home).pos, idOf = new Map<string, string>();
  for (const [id, p] of Object.entries(pos)) { const s = scopeOf(id); if (s && p.in !== undefined && !idOf.has(s)) idOf.set(s, id); }
  return (p: string): string | null | undefined => {
    const id = pos[p] ? p : idOf.get(p), i = id ? pos[id].in : undefined;
    if (typeof i !== "string") return i;
    const up = i.replace(/\/+$/, "");
    return id === p ? up : scopeOf(up) ?? up;
  };
};
/** where a take is looked for: a session first, then the folder it works in and the folders above it (as the person
 *  nested them, when `inOf` is given), then ~ */
export const chain = (scope: string, folder?: unknown, inOf?: (place: string) => string | null | undefined): string[] =>
  scope.startsWith("session:") && okScope(folder) && !String(folder).startsWith("session:") ? [scope, ...upward(folder as string, inOf)] : upward(scope, inOf);

export const fitsFile = (home: string) => join(nextDir(home), "fits.json");
const KINDS: ReadonlySet<string> = new Set(["fit.set", "fit.back", "fit.release", "fit.offer", "fit.keep", "fit.notnow"]);

/** the events, in the order written; a line that is not one is skipped (the file is set aside only when unreadable) */
export function readEvents(home: string): FitEv[] {
  const { data } = readJson(fitsFile(home));
  const raw = Array.isArray(data.events) ? data.events : [];
  return raw.filter((e): e is FitEv => !!e && typeof e === "object" && KINDS.has((e as FitEv).kind)
    && typeof (e as FitEv).id === "string" && typeof (e as FitEv).at === "number" && typeof (e as FitEv).knob === "string" && okScope((e as FitEv).scope));
}
let seq = 0;
/** events appended in one write (a keep and its take are one), each with its own id */
function append(home: string, evs: FitEv[], ...es: Omit<FitEv, "id">[]): FitEv {
  const add = es.map((e) => ({ id: `fit-${e.at.toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`, ...e }) as FitEv);
  writeJson(fitsFile(home), { v: 1, events: [...evs, ...add] });
  return add[0];
}

const key = (knob: string, scope: string) => `${knob}\u0000${scope}`;

/** one knob in one scope, folded from its events up to `until` (pure) */
function fold(evs: FitEv[], knob: string, scope: string, until = Infinity): Fit {
  const mine = evs.filter((e) => e.knob === knob && e.scope === scope && e.at <= until);
  const backed = new Set(mine.filter((e) => e.kind === "fit.back" && e.cause).map((e) => e.cause!));
  const history: Step[] = mine.map((e) => ({
    id: e.id, at: e.at, act: e.kind.slice(4) as Step["act"],
    ...(e.take !== undefined ? { take: e.take } : {}), ...(e.author ? { author: e.author } : {}),
    ...(e.reason !== undefined ? { reason: e.reason } : {}), ...(e.count !== undefined ? { count: e.count } : {}),
    ...(e.source !== undefined ? { source: e.source } : {}), ...(e.kind === "fit.back" && e.cause ? { undoes: e.cause } : {}),
    ...(backed.has(e.id) ? { undone: true as const } : {}),
  }));
  // the take standing: the newest set not taken back
  const standing = [...mine].reverse().find((e) => e.kind === "fit.set" && !backed.has(e.id));
  // held: a Back by the person since the last release
  let held = false;
  for (const e of mine) { if (e.kind === "fit.back") held = true; if (e.kind === "fit.release") held = false; }
  return {
    knob, scope, take: standing?.take ?? null, author: standing?.author ?? "default",
    reason: standing?.reason ?? null, count: standing?.count ?? null, source: standing?.source ?? null, change: standing?.id ?? null, held, history,
  };
}

/** every knob and scope with any event, as they stand at `until` (Infinity: now), in the order first written */
export function fitsAt(home: string, until = Infinity, evs = readEvents(home)): Fit[] {
  const seen = new Map<string, [string, string]>();
  for (const e of evs) if (e.at <= until && !seen.has(key(e.knob, e.scope))) seen.set(key(e.knob, e.scope), [e.knob, e.scope]);
  return [...seen.values()].map(([k, s]) => fold(evs, k, s, until));
}

/** next.fits {scope?, folder?}: every fit; with a scope, those that bear on it (its own and those above it; a session's
 *  folder, when given, is read under it) */
export function fitsOf(home: string, scope?: unknown, folder?: unknown): Answer<{ fits: Fit[] }> {
  const all = fitsAt(home);
  if (scope === undefined || scope === null) return { ok: true, fits: all };
  if (!okScope(scope)) return { ok: false, why: "a scope is a place, like dev or dev/api" };
  const up = new Set(chain(scope, folder, nestedIn(home)));
  return { ok: true, fits: all.filter((f) => up.has(f.scope)) };
}

/** the take a knob has in a scope: the nearest scope with a take standing wins; none, the default. A scope held with
 *  nothing standing stops the walk: what the person took back there is not handed back from a scope above. Held is
 *  carried down: a knob held in a scope is held in every scope under it */
export function takeOf(home: string, knob: string, scope: string, evs = readEvents(home), folder?: string, inOf = nestedIn(home)): Fit {
  const up = chain(scope, folder, inOf);
  for (let i = 0; i < up.length; i++) {
    const f = fold(evs, knob, up[i]);
    const heldHere = f.held || up.slice(i).some((s) => fold(evs, knob, s).held);
    if (f.take !== null || f.held) return { ...f, held: heldHere };
  }
  return { ...fold(evs, knob, scope), held: false };
}

type Ask = { knob?: unknown; scope?: unknown; take?: unknown; held?: unknown; reason?: unknown; count?: unknown; source?: unknown };
/** the source when one was given; none, absent (unknown stays unknown) */
const sourceOf = (a: Ask): { source?: string } => { const s = clean(a.source); return s ? { source: s } : {}; };
function where(a: Ask): { knob: string; scope: string } | { why: string } {
  if (typeof a.knob !== "string" || !KNOB.test(a.knob)) return { why: "a fit needs its knob" };
  if (!okScope(a.scope)) return { why: "a fit needs its scope, a place like dev or dev/api" };
  return { knob: a.knob, scope: a.scope };
}

/** next.fit.set from the person: their take (customization), or held:false to let Sol fit this knob here again */
export function personSet(home: string, a: Ask, now = Date.now()): Answer<{ fit: Fit }> {
  const w = where(a);
  if ("why" in w) return { ok: false, why: w.why };
  const evs = readEvents(home);
  if (a.held === false) {
    if (!fold(evs, w.knob, w.scope).held) return { ok: false, why: "it is not held" };
    append(home, evs, { at: now, kind: "fit.release", knob: w.knob, scope: w.scope });
    return { ok: true, fit: fold(readEvents(home), w.knob, w.scope) };
  }
  const take = clean(a.take);
  if (!take) return { ok: false, why: "a fit needs its take" };
  const reason = clean(a.reason);
  append(home, evs, { at: now, kind: "fit.set", knob: w.knob, scope: w.scope, take, author: "person", ...(reason ? { reason } : {}), ...sourceOf(a) });
  return { ok: true, fit: fold(readEvents(home), w.knob, w.scope) };
}

/** why Sol may not touch a knob in a scope now, or null when it may (pure over the events) */
function solBarred(evs: FitEv[], knob: string, scope: string): string | null {
  const f = fold(evs, knob, scope);
  if (upward(scope).some((s) => fold(evs, knob, s).held)) return "held: the person took it back, so Sol leaves it alone";
  if (f.author === "person") return "the person set it";
  return null;
}
const countOk = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c > 0;

/** the meta engine's write (personalization): refused when held or the person's, and without a reason and a count */
export function solSet(home: string, a: Ask, now = Date.now()): Answer<{ fit: Fit }> {
  const w = where(a);
  if ("why" in w) return { ok: false, why: w.why };
  const take = clean(a.take), reason = clean(a.reason);
  if (!take) return { ok: false, why: "a fit needs its take" };
  if (!reason || !countOk(a.count)) return { ok: false, why: "a fit Sol writes needs its reason and its count from the person's history" };
  const evs = readEvents(home);
  const barred = solBarred(evs, w.knob, w.scope);
  if (barred) return { ok: false, why: barred };
  append(home, evs, { at: now, kind: "fit.set", knob: w.knob, scope: w.scope, take, author: "sol", reason, count: a.count, ...sourceOf(a) });
  return { ok: true, fit: fold(readEvents(home), w.knob, w.scope) };
}

/** next.fit.back from the person: the take standing in that very scope taken back (a new event whose cause is it), the
 *  one before returns, and the fit is held. Nothing standing there: refused, nothing written */
export function back(home: string, a: Ask, now = Date.now()): Answer<{ fit: Fit }> {
  const w = where(a);
  if ("why" in w) return { ok: false, why: w.why };
  const evs = readEvents(home);
  const backed = new Set(evs.filter((e) => e.kind === "fit.back" && e.cause).map((e) => e.cause!));
  const standing = [...evs].reverse().find((e) => e.kind === "fit.set" && e.knob === w.knob && e.scope === w.scope && !backed.has(e.id));
  if (!standing) return { ok: false, why: "nothing set there to take back" };
  append(home, evs, { at: now, kind: "fit.back", knob: w.knob, scope: w.scope, cause: standing.id });
  return { ok: true, fit: fold(readEvents(home), w.knob, w.scope) };
}

// ---------------------------------------------------------------- an offer: once, and never again after one not now

export type Offer = { id: string; knob: string; scope: string; take: string; reason: string; count?: number; at: number };

/** Sol offers a take (it is not written until the person keeps it): once while open, never after a not now. An offer
 *  needs its reason; its count when it has one (a structural offer may come from the week, not a tally) */
export function offer(home: string, a: Ask, now = Date.now()): Answer<{ offer: Offer }> {
  const w = where(a);
  if ("why" in w) return { ok: false, why: w.why };
  const take = clean(a.take), reason = clean(a.reason);
  if (!take) return { ok: false, why: "a fit needs its take" };
  if (!reason) return { ok: false, why: "an offer needs its reason" };
  const count = countOk(a.count) ? a.count : undefined;
  const evs = readEvents(home);
  const barred = solBarred(evs, w.knob, w.scope);
  if (barred) return { ok: false, why: barred };
  const offers = evs.filter((e) => e.kind === "fit.offer" && e.knob === w.knob && e.scope === w.scope);
  const answered = new Set(evs.filter((e) => (e.kind === "fit.keep" || e.kind === "fit.notnow") && e.cause).map((e) => e.cause!));
  if (evs.some((e) => e.kind === "fit.notnow" && e.knob === w.knob && e.scope === w.scope)) return { ok: false, why: "not now was said: Sol does not offer it again" };
  if (offers.some((o) => !answered.has(o.id))) return { ok: false, why: "offered already, waiting for an answer" };
  const ev = append(home, evs, { at: now, kind: "fit.offer", knob: w.knob, scope: w.scope, take, author: "sol", reason, ...(count ? { count } : {}) });
  return { ok: true, offer: { id: ev.id, knob: w.knob, scope: w.scope, take, reason, ...(count ? { count } : {}), at: now } };
}

/** the person's answer to an offer: keep writes its take as theirs (with Sol's reason kept), not now ends it */
export function answerOffer(home: string, a: { offer?: unknown; keep?: unknown }, now = Date.now()): Answer<{ fit: Fit }> {
  const evs = readEvents(home);
  const o = evs.find((e) => e.kind === "fit.offer" && e.id === a.offer);
  if (!o) return { ok: false, why: "no offer of that id" };
  if (evs.some((e) => (e.kind === "fit.keep" || e.kind === "fit.notnow") && e.cause === o.id)) return { ok: false, why: "it was answered already" };
  if (a.keep === true) {
    append(home, evs, { at: now, kind: "fit.keep", knob: o.knob, scope: o.scope, cause: o.id }, { at: now, kind: "fit.set", knob: o.knob, scope: o.scope, take: o.take!, author: "person", ...(o.reason ? { reason: o.reason } : {}), ...(o.count ? { count: o.count } : {}) });
  } else {
    append(home, evs, { at: now, kind: "fit.notnow", knob: o.knob, scope: o.scope, cause: o.id });
  }
  return { ok: true, fit: fold(readEvents(home), o.knob, o.scope) };
}
