// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The fits beside the store (round 8, #1615; merge/fits.js, as it is): whose fits these are, the person's answers (kept
// across loads, as the mockup's ST), the month replayed from them, the Diary's lines written from that month (one per
// thing that happened, keyed fit:<id>:on|offer|keep|notnow|back and week:<day>), find, the landing on a knob, and what
// is open on screen (a why, Who set what, What I've learned, the knob card). Nothing here lives in D, so counts 13 and
// 14 see D as the AI's calls leave it. Live there are no people (the fixture's come from the dev page only, usePeople),
// so every view draws nothing and every move answers "not yet" (cv/moves/fits.ts).
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { D, M, S, SCEN, SCN, hooks, regionOf, render, subscribe, done, type Done } from "../cv/core.ts";
import * as B from "../diary/book.ts";
import { folderName } from "../place.ts";
import { SCN as SCNS, SUMS, VOICE, fresh, prepare, scorer, sim, weekLine, type Fit, type Month, type Person, type PersonIn, type St } from "./rules.ts";

// ---------------------------------------------------------------- the people (the fixture's, on the dev page only)

let PEOPLE: Record<string, Person> = {};
/** the dev page gives the panel's people (fits/fixture.ts); a real Sol never does */
export function usePeople(P: Record<string, PersonIn>): void { PEOPLE = prepare(P); reset(); }
export const people = () => PEOPLE;
const ALL = () => Object.values(PEOPLE).flatMap((p) => p.fits);
export const fitOf = (id: string): Fit | null => ALL().find((f) => f.id === id) || null;
/** the person on screen: the scenario's own name, when they are one of the panel's */
export function who(): string | null { const n = (SCEN[SCN]?.label || "").split(" · ")[0]; return PEOPLE[n] ? n : null; }
export const person = (n: string | null = who()): Person | null => (n && PEOPLE[n]) || null;

// ---------------------------------------------------------------- the person's answers and the month

let ST: Record<string, St> = {};
export function st(n: string | null = who()): St | null { const p = person(n); return p && n ? (ST[n] ||= fresh(p)) : null; }
let CACHE: { k: string; r: Month } | null = null;
/** what each fit is now, for the views: the month replayed from the person's answers */
export function now(n: string | null = who()): Month | null {
  const p = person(n), s = st(n);
  if (!p || !s || !n) return null;
  const k = n + JSON.stringify(s);
  if (CACHE && CACHE.k === k) return CACHE.r;
  const r = sim(p, s);
  CACHE = { k, r };
  return r;
}

// ---------------------------------------------------------------- what is open on screen

export const ui = {
  /** the whys open: d:<fit> in the Diary, s:<fit> in Settings */
  open: new Set<string>(),
  /** Settings' fits page (Who set what, What I've learned), its ringed row */
  page: null as null | "fits" | "learned", ring: null as string | null, ringed: null as string | null,
  /** the knob a find landed on (#ft-knob), in its folder; n remounts it so the ring plays again */
  knob: null as null | { id: string; rid: string }, n: 0,
  /** a fact just removed, for its undo */
  removed: null as null | { t: string; undo: () => void },
  /** the Diary card's subject (a still's, or the open why): never folded (fit.ts fitDiary) */
  keep: null as string | null,
};
export function toggleWhy(key: string): void { if (ui.open.has(key)) ui.open.delete(key); else ui.open.add(key); render(); }
/** Settings at Who set what or What I've learned; `ring` rings that row and opens its why */
export function openPage(p: "fits" | "learned" | null, ring?: string | null): void {
  ui.page = p; ui.ring = ring ?? null;
  if (p === "fits" && ring) { ui.ringed = ring; ui.open.add("s:" + ring); }
  if (p && S.page !== "settings") M.stOpen(); else render();
}
/** the knob card: shown while its folder is in view at Middle; anything else closes it */
export function knob(id: string | null): void {
  if (!id) { if (ui.knob) { ui.knob = null; render(); } return; }
  const f = fitOf(id);
  if (!f || !f.place) { knob(null); return; }
  ui.knob = { id, rid: f.place }; ui.n++; render();
}
export function knobNow(): { id: string; rid: string } | null {
  const k = ui.knob;
  if (k && (S.region !== k.rid || S.dist !== "middle" || !!S.page)) ui.knob = null;
  return ui.knob;
}
// Settings closed: its fits page goes with it; the view left the folder: the knob goes
subscribe(() => { if (S.page !== "settings" && ui.page) { ui.page = null; ui.ring = null; } knobNow(); });
// Escape closes the knob card first
hooks.keys.push((e) => { if (e.key === "Escape" && ui.knob) { knob(null); return true; } return false; });

// ---------------------------------------------------------------- the Diary: one line for each thing that happened

const DAY = 864e5;
const tOf = (d: number, i: number) => { const b = B.book(); return d === 0 ? b.start + 6e4 * (i + 1) : B.TODAY0 + d * DAY + (9 * 60 + i * 7) * 6e4; };
export function write(): void {
  const n = SCNS[SCN];
  if (!n || !person(n)) return;
  const r = now(n)!;
  let i = 0;
  for (const e of r.ev) {
    const f = e.f, region = f.place && regionOf(f.place) ? f.place : null, base = { day: e.d, t: tOf(e.d, i++), region };
    if (e.t === "apply" || e.t === "reapply") B.note({ ...base, who: VOICE, kind: "fit", key: `fit:${f.id}:on:${e.d}`, what: f.line });
    else if ((e.t === "offer" || e.t === "reoffer") && f.layer === "surface") B.note({ ...base, who: VOICE, kind: "fit", key: `fit:${f.id}:offer`, what: f.offerLine });
    else if (e.t === "keep") B.note({ ...base, who: "person", kind: "decided", key: `fit:${f.id}:keep`, what: `You kept it: ${f.value}.`, why: f.layer === "structure" ? "your week, fitted" : "a fit offered" });
    else if (e.t === "notnow") B.note({ ...base, who: "person", kind: "decided", key: `fit:${f.id}:notnow`, what: `Not now: ${f.value}.`, why: "asked again in four weeks at most" });
    else if (e.t === "back") B.note({ ...base, who: "person", kind: "decided", key: `fit:${f.id}:back:${e.d}`, what: `You took back: ${f.value}. It is a hold now.`, why: "Sol never makes it again" });
  }
  /* the weekly summary: one line on each summary day that offered or made something */
  for (const d of SUMS) { const w = weekLine(r, d); if (w) B.note({ who: VOICE, kind: "week", key: `week:${d}`, day: d, t: tOf(d, 0) - 6e4, what: w }); }
}
/** on a load, after the diary's own seed (which starts a fresh book): the knob closes, the month is written. cv/moves/fits.ts
 *  hangs it on hooks.onLoad, last in the moves' order (this file is imported earlier, by the plane's layout) */
export function onLoad(): void { ui.knob = null; CACHE = null; write(); }

/** a change of the person's answers: the month again, its lines, every view */
export function redraw(): void { CACHE = null; write(); render(); }
export function change(fn: (s: St) => void, msg?: string, id?: string): Done {
  const n = who(), s = st(n);
  if (!n || !s) return { ...done(false), why: "not one of the panel’s people" };
  const was = JSON.parse(JSON.stringify(s)) as St;
  fn(s); redraw();
  if (msg) hooks.flash?.(msg);
  return done(true, id, () => { ST[n] = was; redraw(); });
}
export function reset(): void { ST = {}; CACHE = null; ui.open.clear(); ui.knob = null; ui.page = null; ui.ring = null; ui.ringed = null; ui.removed = null; ui.keep = null; }

// ---------------------------------------------------------------- find (Settings' find and ⌘P) and the landing

export type Hit = { x: "fit" | "fact"; id: string; sc: number };
/** every fit and fact of the person, scored by Settings' own scorer */
export function find(q: string): Hit[] {
  const n = who(), p = person(n), r = now(n), s = st(n);
  if (!p || !r || !s) return [];
  const score = scorer(q), out: Hit[] = [];
  for (const f of p.fits) {
    if (r.state(f) === "none") continue;
    const sc = score(f.setting + " " + f.value, [f.why, f.thing, f.kind, f.mode || "", folderName(f.place, ""), "fit fitted why because sol set changed"].join(" "));
    if (sc > 0) out.push({ x: "fit", id: f.id, sc: sc + 1 });
  }
  for (const f of p.facts) { if (s.gone[f.k]) continue; const sc = score(f.fact, f.source + " learned know about me"); if (sc > 0) out.push({ x: "fact", id: f.k, sc }); }
  return out.sort((a, b) => b.sc - a.sc);
}
/** a found row as ⌘P draws it (the mockup's palRow): its words and where a press goes */
export type Pal = { g: string; l: string; s: string; fit?: string; go: () => void };
export function palRow(h: Hit): Pal {
  const n = who(), r = now(n)!;
  if (h.x === "fit") { const f = fitOf(String(h.id))!; return { g: "Settings", l: f.setting, s: `${r.state(f) === "held" ? "A hold" : "Set by Sol"}: ${f.value}`, fit: f.id, go: () => { land(f.id); } }; }
  const f = person(n)!.facts.find((x) => x.k === h.id)!;
  return { g: "Settings", l: f.fact, s: "What I’ve learned", go: () => openPage("learned", f.k) };
}
/** ⌘P's search, as the mockup's window.stFind: the first four */
export const palFind = (q: string): Pal[] => find(q).slice(0, 4).map(palRow);

/** the landing: the knob in its place (the folder it acts in) at Middle, ringed, its why open; no folder: its row in
 *  Who set what, ringed */
export function land(id: string): Done & { to?: string } {
  const f = fitOf(id), n = who();
  if (!f || !n || f.who !== n) return done(false);
  if (!f.place || !regionOf(f.place)) { knob(null); openPage("fits", id); return { ...done(true, id), to: "settings" }; }
  if (S.page) M.page(null);
  M.goto(f.place);
  knob(id);
  return { ...done(true, id, () => knob(null)), to: f.place };
}

/** for the counts (window.CV.hooks.fits on the dev page) */
(hooks as unknown as { fits: unknown }).fits = {
  get P() { return PEOPLE; }, SCN: SCNS, sim, now, st, who, fitOf, find, palFind, land, knob, openPage, write, ui,
  reset() { reset(); render(); },
  /** the Diary's lines, for count 37 */
  lines: (k: number) => B.lines(k),
  get D() { return D; },
};
