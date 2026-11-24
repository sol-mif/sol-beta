// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The fits' rules (round 8, #1615; merge/fits.js, ported as it is): pure, no DOM, no store. A fit is a setting Sol wrote
// from the person's own history; it always says why, with a count. One Back of a kind on a thing (kind@thing) is a hold:
// Sol never makes or offers it there again. Reach: "Small things, tell me" makes a surface fit and tells it; "Ask me
// first" offers it; "Only what I ask" does nothing. A structure fit (a mode reshaped) waits for the weekly summary
// (Wednesdays −28, −21, −14, −7, 0), at most one per mode, and is made only on Keep.
//   sim(person, state, o)  replays days −29…0 (today is 0, Wednesday 18 November) and says what each fit is now
// Tested by next-fits.test.ts. Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import type { Known } from "../known.ts";

export type Reach = "ask" | "small" | "off";
export type Fit = {
  id: string; layer: "surface" | "structure"; mode?: string; place: string | null; knob?: string; kind: string; thing: string; at: number;
  decided?: { v: "keep" | "notnow"; day: number }; back?: number;
  setting: string; value: string; offer?: string; offerLine?: string; line?: string; why: string; src: string; who?: string;
};
export type Yours = { setting: string; value: string; day: number };
export type Person = { reach: Reach; said: number | null; fits: Fit[]; yours: Yours[]; facts: Known[]; name?: string };
/** a person as the fixture writes them: each fact its line and where it came from (prepare gives it its k) */
export type PersonIn = Omit<Person, "facts"> & { facts: Pick<Known, "fact" | "source">[] };
/** the person's answers, kept across loads: a load replays the month from them */
export type St = { reach: Reach; asked: boolean; decided: Record<string, { v: "keep" | "notnow"; day: number }>; backs: Record<string, number>; released: Record<string, 1>; gone: Record<string, 1> };
export type Ev = { d: number; f: Fit; t: "apply" | "reapply" | "offer" | "reoffer" | "keep" | "notnow" | "back" | "blocked"; week?: number };
export type FitState = "held" | "on" | "notnow" | "offered" | "none";
export type Month = {
  ev: Ev[]; on: Record<string, number>; offered: Record<string, number>; held: Record<string, number>; notnow: Record<string, number>;
  backs: Record<string, number>; state: (f: Fit) => FitState; reach: Reach;
};

const DAY = 864e5, TODAY0 = Date.UTC(2026, 10, 18);
const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dateOf = (d: number) => { const x = new Date(TODAY0 + d * DAY); return `${x.getUTCDate()} ${MO[x.getUTCMonth()]}`; };
export const whenOf = (d: number) => (d === 0 ? "today" : d === -1 ? "yesterday" : dateOf(d));
export const VOICE = "Your AI";
export const TUNE: { id: Reach; n: string }[] = [{ id: "ask", n: "Ask me first" }, { id: "small", n: "Small things, tell me" }, { id: "off", n: "Only what I ask" }];
export const REACH_SAY: Record<Reach, string> = {
  ask: "When your weeks change, I offer a better fit and wait for your yes.",
  small: "When your weeks change, I make small fits and tell you in the Diary. Anything bigger waits for your Keep.",
  off: "I change nothing on my own now. Everything here is yours to set.",
};
/** the weekly summary's days: Wednesdays, today the last */
export const SUMS = [-28, -21, -14, -7, 0];
/** the five panel scenarios whose Diary carries the month (count 37's five) */
export const SCN: Record<string, string> = { "dev-morning": "Dev", jayden: "Jayden", denise: "Denise", minji: "Min-ji", fresh: "Sam" };

export const hk = (f: Fit) => f.kind + "@" + f.thing;
export const because = (f: Fit) => `Because ${f.why}.`;
/** a reason with a count, as counts 35 and 37 read it */
export const REASON = /Because you\w* .*\d/;
export const COUNTED = /\d+ of (?:[\w’]+ ){0,3}\d+|\d+ times/;
/** round 8 fixes (F3): a fit's words never start with a lone key letter ("R on …"), and a quoted phrase is never cut with "…" */
export const CODE = (t: string) => /^(?![AI]\s)[A-Z]\s/.test(t.trim()) || /…”|…"/.test(t);

/** the people as the fixture gives them: names, each fit's person and each fact's id (fits.js, after P) */
export function prepare(P: Record<string, PersonIn>): Record<string, Person> {
  let fid = 0;
  const names = Object.keys(P), out: Record<string, Person> = {};
  for (const [n, p] of Object.entries(P)) {
    for (const f of p.fits) f.who = n;
    out[n] = { ...p, name: n, facts: p.facts.map((f): Known => ({ k: `fit:${++fid + 100 * names.indexOf(n)}`, fact: f.fact, source: f.source, by: "sol", place: null })) };
  }
  return out;
}
export function fresh(p: Person): St {
  const s: St = { reach: p.said == null ? "ask" : p.reach, asked: p.said != null, decided: {}, backs: {}, released: {}, gone: {} };
  for (const f of p.fits) { if (f.decided) s.decided[f.id] = { ...f.decided }; if (f.back != null) s.backs[f.id] = f.back; }
  return s;
}

/** the month: 30 days of signals, replayed.
 *  o.backOnDay: one Back on that day, of the fit then on (count 34) · o.holds:false replays without the hold rule (the
 *  control) · o.crowd: every structural signal in one week (count 36's stress) · o.reach: replay under another reach */
export function sim(p: Person, s: St, o: { backOnDay?: number; holds?: boolean; crowd?: boolean; reach?: Reach } = {}): Month {
  const reach = o.reach || s.reach, holds = o.holds !== false;
  const at = (f: Fit) => (o.crowd && f.layer === "structure" ? -3 : f.at);
  const sig = (f: Fit) => { const a: number[] = []; for (let d = at(f); d <= 0; d += 3) a.push(d); return a; };
  const ev: Ev[] = [], on: Record<string, number> = {}, offered: Record<string, number> = {}, was: Record<string, 1> = {}, held: Record<string, number> = {}, pend: Fit[] = [], notnow: Record<string, number> = {};
  const backs = { ...s.backs }, decided = { ...s.decided };
  if (o.backOnDay != null) { for (const k in backs) if (backs[k] >= o.backOnDay) delete backs[k]; }
  for (let d = -29; d <= 0; d++) {
    for (const f of p.fits) {
      if (!sig(f).includes(d)) continue;
      if (holds && held[hk(f)] != null && !s.released[hk(f)]) { ev.push({ d, f, t: "blocked" }); continue; }
      if (on[f.id] != null || offered[f.id] != null || notnow[f.id] != null) continue;
      if (f.layer === "structure") { if (!pend.includes(f)) pend.push(f); continue; }
      if (reach === "off") continue;
      if (reach === "small" && !f.offerLine) { on[f.id] = d; ev.push({ d, f, t: was[f.id] ? "reapply" : "apply" }); }
      else { offered[f.id] = d; ev.push({ d, f, t: was[f.id] ? "reoffer" : "offer" }); }
    }
    if (SUMS.includes(d)) {
      const modes = new Set<string | undefined>();
      for (const f of pend.slice()) { if (modes.has(f.mode)) continue; modes.add(f.mode); offered[f.id] = d; pend.splice(pend.indexOf(f), 1); ev.push({ d, f, t: was[f.id] ? "reoffer" : "offer", week: d }); }
    }
    for (const f of p.fits) {
      const k = decided[f.id];
      if (!k || k.day !== d || offered[f.id] == null || on[f.id] != null || notnow[f.id] != null) continue;
      if (k.v === "keep") { on[f.id] = d; ev.push({ d, f, t: "keep" }); } else { notnow[f.id] = d; ev.push({ d, f, t: "notnow" }); }
    }
    /* the Back on the replay's day: the fit on longest that a Back of the person's own has not already taken */
    if (o.backOnDay === d) { const f = p.fits.filter((f) => on[f.id] != null).sort((a, b) => on[a.id] - on[b.id])[0]; if (f) backs[f.id] = d; }
    for (const f of p.fits) if (backs[f.id] === d && on[f.id] != null) { delete on[f.id]; delete offered[f.id]; was[f.id] = 1; ev.push({ d, f, t: "back" }); if (holds) held[hk(f)] = d; }
  }
  const state = (f: Fit): FitState => (held[hk(f)] != null && backs[f.id] != null && !s.released[hk(f)] ? "held" : on[f.id] != null ? "on" : notnow[f.id] != null ? "notnow" : offered[f.id] != null ? "offered" : "none");
  return { ev, on, offered, held, notnow, backs, state, reach };
}

/** who set it: a hold, the person's Keep, or Sol on its own */
export function byWhom(m: Month, f: Fit): "hold" | "kept" | "sol" {
  if (m.state(f) === "held") return "hold";
  const e = m.ev.find((e) => e.f === f && (e.t === "keep" || e.t === "apply"));
  return e && e.t === "keep" ? "kept" : "sol";
}
/** the day it was last made, kept or taken back */
export function onDay(m: Month, f: Fit): number { const e = [...m.ev].reverse().find((e) => e.f === f && /apply|keep|back/.test(e.t)); return e ? e.d : f.at; }
export function byDay(m: Month, f: Fit, t: Ev["t"]): string { const e = [...m.ev].reverse().find((e) => e.f === f && e.t === t); return e ? " · " + whenOf(e.d) : ""; }

/** one week's summary (on a summary day): the mode offers, the week's small fits, the holds */
export function week(p: Person, m: Month, k: number): { d: number; offers: Fit[]; small: Fit[]; holds: Fit[] } | null {
  const d = SUMS.includes(k) ? k : null;
  if (d == null) return null;
  const wk = m.ev.filter((e) => e.d > d - 7 && e.d <= d);
  const offers = wk.filter((e) => e.week === d).map((e) => e.f), small = wk.filter((e) => e.f.layer === "surface" && /apply|offer/.test(e.t)).map((e) => e.f);
  const holds = p.fits.filter((f) => m.state(f) === "held");
  if (!offers.length && !small.length && !holds.length) return null;
  return { d, offers, small, holds };
}
/** the week's one Diary line: what it offered or made */
export function weekLine(m: Month, d: number): string | null {
  const wk = m.ev.filter((e) => e.d > d - 7 && e.d <= d && /apply|offer/.test(e.t)), offers = wk.filter((e) => e.week === d);
  if (!wk.length) return null;
  const small = wk.filter((e) => e.f.layer === "surface").length;
  return `Your week, fitted to you: ${small ? `${small === 1 ? "one small fit" : small + " small fits"}` : "no small fits"}${offers.length ? `, and ${offers.length === 1 ? "one change to a mode" : offers.length + " changes to modes"} for your Keep` : ""}.`;
}

/** find: a fit's or a fact's words, scored as Settings' own find scores (a word in the title 3, elsewhere 1) */
const norm = (s: string) => (s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$' ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "my", "me", "i", "it", "is", "and", "for", "with", "what", "how", "your"]);
export function scorer(q: string): (title: string, words: string) => number {
  const toks = norm(q).split(" ").filter((t) => t && !STOP.has(t));
  return (title, words) => {
    if (!toks.length) return 0;
    let sc = 0, miss = 0;
    const tw = norm(title).split(" "), ww = norm(words).split(" ");
    toks.forEach((t) => { if (tw.some((w) => w.startsWith(t))) sc += 3; else if (ww.some((w) => w.startsWith(t))) sc += 1; else miss++; });
    return miss > (toks.length > 2 ? 1 : 0) ? -1 : sc;
  };
}
