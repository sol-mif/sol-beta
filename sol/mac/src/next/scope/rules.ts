// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// The pure rules of round 9 (#1615; the mockup's merge/scope.js, as it is): what an AI made (a result), its brief
// (scope → consent → fits → slice → seat: Used with each source, Not used with each reason), the links between things
// (made from · part of · uses · blocks · same as, with who made each), a cut as a hold, done things folding after the
// person's learned span, and the ladder that ranks places at Far. No DOM here except `route`, which is pure geometry.
// Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import { D, SCN, SCEN, asksInRegion, type Data, type Piece } from "../cv/core.ts";
import { folderName } from "../place.ts";
import { titleOf } from "../plane/layout.ts";   // BR1 (#1615): a session reads as its task, never its AI
import { note } from "../diary/book.ts";
import { nowMin } from "../life/rules.ts";
import { aisIn } from "../lead/rules.ts";
import { now as fitsNow, person as fitsPerson, st as fitsSt, who as fitsWho } from "../fits/state.ts";
import type { Fit } from "../fits/rules.ts";
import { ctx as seatCtx, me as seatsMe } from "../cv/moves/seats.ts";
import { acctSt, seatSt } from "../settings/seats/model.ts";

export const VOICE = "Your AI", DAY = 864e5, MIN = 6e4, TODAY0 = Date.UTC(2026, 10, 18);
/** at most this many links drawn at once; at most this many places whole at Far */
export const MAXL = 7, WHOLE = 12;
/** a scenario's own step at load, before the links are read (the fixture's dev-500 trims or grows itself to 500 things) */
export const GROW: Record<string, (d: Data) => void> = {};

// ---------------------------------------------------------------- the person's holds (one set a person, as fits keeps theirs)

export type Hold = { id: string; k: "use" | "link"; place: string; day: number; key?: string; name?: string; from?: string; pair?: string; a?: string; b?: string; an?: string; bn?: string; kind?: string; by?: string };
type St = { holds: Hold[]; seq: number; span: number | null; spanWhy: string | null };
let ST: Record<string, St> = {};
export const who = () => ((SCEN[SCN]?.label) || "You").split(" · ")[0];
export const st = (n: string = who()): St => ST[n] || (ST[n] = { holds: [], seq: 0, span: null, spanWhy: null });
export const resetHolds = () => { ST = {}; };

// ---------------------------------------------------------------- words

const STOP = new Set(`the and for with from that this your you our are was were has have had not but all any each its into than then them they what
  which who when where how more most some here there just only also will can may let get got new one two out off own per via about after before
  again over under until his her him she their make made take takes take done day days today now still yet very much many on at in to of a an`.split(/\s+/));
let AIS = new Set<string>();
const aisNow = (d: Data = D) => { AIS = new Set((d.ais || []).map((a) => a.name.toLowerCase())); };
export const wordsOf = (s: unknown) => new Set(String(s || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !AIS.has(w)));
export const textOf = (p: Piece) => [p.name, p.words, p.text, p.copy && String(p.copy).replace(/-/g, " "), (p.talk || []).filter((l) => /^you:/.test(l)).join(" ")].filter(Boolean).join(" ");
export const nameOf = (p: Piece | undefined | null) => (!p ? "" : p.kind === "session" ? titleOf(p) : p.name);
export const aiWord = (ai: string | undefined) => (!ai || ai === VOICE ? "your AI" : ai);
export const agoDays = (d: number) => d < 1 ? "today" : d < 2 ? "yesterday" : d < 14 ? `${Math.floor(d)} days ago` : d < 60 ? `${Math.floor(d / 7)} weeks ago` : `${Math.floor(d / 30)} months ago`;
export const spanWords = (n: number) => n % 7 === 0 ? (n === 7 ? "a week" : `${n / 7} weeks`) : `${n} days`;

// ---------------------------------------------------------------- results: what an AI made

export type Result = { id: string; piece: string; ai: string; label: string; ask: string; kind: "run" | "part" | "made" | "block"; part?: string; made?: string };
type Made = { id: string; by?: string; title: string; text?: string; kind?: string };
const askOf = (p: Piece) => { const l = (p.talk || []).find((l) => /^you:/.test(l)); return l ? l.replace(/^you:\s*/, "") : p.words || `take ${p.copy || p.name}`; };
export function results(d: Data = D): Result[] {
  const out: Result[] = [];
  if (!d) return out;
  for (const p of Object.values(d.pieces)) {
    if (p.kind === "session" && p.ai) out.push({ id: "run:" + p.id, piece: p.id, ai: p.ai, label: `The change in ${titleOf(p)}`, ask: askOf(p), kind: "run" });
    if (p.parts) for (const x of p.parts) if (x.ai) out.push({ id: "part:" + x.id, piece: p.id, part: x.id, ai: x.ai, label: `A part: ${x.name}`, ask: x.words || x.name, kind: "part" });
    if (p.kind === "sticky") for (const m of (p.made as Made[] | undefined) || []) if (m.by && m.by !== "person") out.push({ id: "made:" + m.id, piece: p.id, made: m.id, ai: m.by, label: m.title, ask: p.words || p.name, kind: "made" });
    if (p.kind === "block" && p.by) out.push({ id: "blk:" + p.id, piece: p.id, ai: p.by, label: p.name, ask: String(p.text || p.name), kind: "block" });
  }
  return out;
}
export const resultOf = (rid: string | null) => (rid ? results().find((r) => r.id === rid) || null : null);

// ---------------------------------------------------------------- the seat: the plan the AI runs on, and its room

const ROOM: Record<string, number> = { "Claude Code": 6, Codex: 5, Claude: 6, "Sol’s own": 4 };
export type Seat = { n: string; plan: string; useW?: string; room: number; own?: boolean };
export function seatOf(ai: string): Seat {
  const me = seatsMe();
  if (!me) return { n: "Sol’s own", plan: "Free", room: ROOM["Sol’s own"] };
  const c = seatCtx(), s = me.seats.find((s) => (s.who || []).includes(ai)) || me.seats.find((s) => seatSt(c, s) === "use") || me.seats.find((s) => s.own) || me.seats[0];
  return { n: s.n, plan: s.plan || "", useW: s.useW || "", room: ROOM[s.n] || 5, own: !(s.who || []).includes(ai) };
}

// ---------------------------------------------------------------- the brief (capacity.md): scope → consent → fits → slice → seat

export type Used = { key: string; name: string; t: string; src: string; score: number };
export type Not = { t: string; why: string; kind: "off-limits" | "cut for room" | "not opened" | "not shared"; hold?: string; also?: string };
export type Brief = { rid: string; r: Result; ai: string; label: string; region: string; place: string; used: Used[]; not: Not[]; fits: Fit[]; seat: Seat };
const heldUse = (rid: string, key: string) => st().holds.find((h) => h.k === "use" && h.place === rid && h.key === key) || null;
export function brief(rid: string): Brief | null {
  const r = resultOf(rid);
  if (!r) return null;
  const p = D.pieces[r.piece];
  if (!p) return null;
  aisNow();
  const reg = p.region, place = folderName(reg), seat = seatOf(r.ai), part = r.part ? (p.parts || []).find((x) => x.id === r.part) : undefined, made = r.made ? ((p.made as Made[]) || []).find((m) => m.id === r.made) : undefined;
  const topic = wordsOf([r.ask, r.label, textOf(p), part ? part.name : "", made ? made.title + " " + made.text : ""].join(" "));
  const ov = (t: string) => [...wordsOf(t)].filter((w) => topic.has(w));
  const C: Used[] = [];
  const add = (key: string, name: string, t: string, src: string, score: number) => { if (!C.some((c) => c.key === key)) C.push({ key, name, t, src, score }); };
  // the thing itself and its ancestors: piece → place → person
  if (r.kind === "run") add("ask", r.ask, `Your words: “${r.ask}”`, "what you said in Talk", 100);
  if (r.kind === "part" && part) {
    add("ask", part.name, `The part it was given: “${part.name}”`, `the split of “${nameOf(p)}”`, 100);
    add("p:" + p.id, nameOf(p), `The job: “${p.words || nameOf(p)}”`, "part of: the job this part belongs to", 95);
  }
  if (r.kind === "made") add("ask", p.name, `Your sticky: “${p.name}”`, `you wrote it${p.at != null ? ", " + agoDays((nowMin() - Number(p.at)) / 1440) : ""}`, 100);
  if (r.kind === "block") {
    add("ask", p.name, `The block: “${p.name}”`, "what it was asked to show", 100);
    const j = D.pieces[p.joined as string];
    if (j) add("p:" + j.id, nameOf(j), `The session: “${nameOf(j)}”`, "made from: the session it came out of", 95);
  }
  if (r.kind === "run" && p.term && p.term.stateWord) add("term", "the terminal", `The terminal: ${p.term.stateWord}`, `the terminal of ${titleOf(p)}`, 70);
  if (r.kind === "part" && part && part.term && part.term.stateWord) add("term", "the terminal", `The terminal: ${part.term.stateWord}`, `the terminal of the part “${part.name}”`, 70);
  add("place:" + reg, place, `This folder: ${place}`, "the place it sits in", 60);
  // links: what the person or Sol tied to it
  for (const l of linksOf(p.id)) {
    const o = D.pieces[l.a === p.id ? l.b : l.a];
    if (!o) continue;
    add("p:" + o.id, nameOf(o), `“${nameOf(o)}”`, `a link: ${rowWord(l, p.id).toLowerCase()} it · ${l.by === "sol" ? "made by Sol" : "yours"}`, l.by === "sol" ? 80 : 85);
  }
  // the rest of the place, ranked by the words it shares
  for (const q of Object.values(D.pieces)) {
    if (q.region !== reg || q.id === p.id || q.kind === "arrivals" || q.kind === "set") continue;
    const w = ov(textOf(q));
    add("p:" + q.id, nameOf(q), `“${nameOf(q)}”`, w.length ? `the same folder; it shares “${w[0]}”` : "the same folder", w.length ? 20 + 10 * w.length : q.inside === "done" ? 1 : 5);
  }
  // what the person told Sol (the fits' facts, each with where it came from)
  const n = fitsWho(), fp = n ? fitsPerson(n) : null, facts = fp ? fp.facts : [], gone: Record<string, 1> = (n && fitsSt(n)?.gone) || {};
  for (const f of facts) {
    if (gone[f.k]) continue;
    const w = ov(f.fact), hit = w.length || f.fact.includes(r.ai) || f.fact.toLowerCase().includes(place.toLowerCase());
    if (hit) add("f:" + f.k, f.fact, `What you told me: ${f.fact}`, f.source, 30 + 10 * w.length);   // keyed by the fact's k (known.ts): one fact, one key
  }
  // consent first: what is held out here, then accounts no AI may open; then the slice to the seat's room
  C.sort((a, b) => b.score - a.score);
  const used: Used[] = [], not: Not[] = [];
  for (const c of C) {
    const h = heldUse(reg, c.key);
    if (h) { not.push({ t: c.t, why: `off-limits: you said “Don’t use this here” ${h.day === 0 ? "today" : agoDays(-h.day)}`, kind: "off-limits", hold: h.id }); continue; }
    if (used.length < seat.room) used.push(c); else not.push({ t: c.t, why: `cut for room: ${seat.n} had room for ${seat.room}`, kind: "cut for room" });
  }
  const me = seatsMe(), c = seatCtx();
  for (const a of me ? me.accts : []) {
    const s = acctSt(c, a);
    if ((s === "lapsed" || s === "blocked") && String(a.by || "").includes(r.ai)) not.push({ t: a.n, why: `not opened: ${s === "lapsed" ? `the sign-in ended ${a.since || "lately"}` : "the sign-in is blocked"}`, kind: "not opened" });
    else if (s === "never" || s === "off") not.push({ t: a.n, why: "off-limits: you never let an AI read it", kind: "off-limits" });
  }
  const linked = new Set(linksOf(p.id).map((l) => (l.a === p.id ? l.b : l.a)));
  const far = Object.values(D.pieces).filter((q) => q.region !== reg && !linked.has(q.id) && q.kind !== "arrivals").map((q) => ({ q, w: ov(textOf(q)) })).filter((x) => x.w.length).sort((a, b) => b.w.length - a.w.length).slice(0, 3);
  for (const { q, w } of far) not.push({ t: `“${nameOf(q)}”`, why: `not shared: it is in ${folderName(q.region)}, and nothing links it to ${place}`, kind: "not shared", also: w[0] });
  if (!not.length) { const k = D.regions.length - 1; not.push({ t: k ? `Your other ${k === 1 ? "folder" : k + " folders"}` : "Anything outside this folder", why: `not shared: nothing links ${k === 1 ? "it" : "them"} to ${place}`, kind: "not shared" }); }
  // the fits applied here: Sol's fits that are on, in this folder or everywhere
  const mo = n ? fitsNow(n) : null;
  const fits = fp && mo ? fp.fits.filter((f) => mo.state(f) === "on" && (!f.place || f.place === reg)) : [];
  return { rid, r, ai: r.ai, label: r.label, region: reg, place, used, not, fits, seat };
}

// ---------------------------------------------------------------- links

export type LinkKind = "uses" | "made from" | "part of" | "blocks" | "same as";
export type Link = { a: string; b: string; kind: LinkKind; by: "sol" | "person" };
export const pk = (a: string, b: string) => [a, b].sort().join("|");
const linkList = (d: Data = D) => ((d as { links?: Link[] }).links ||= []);
export const linksOf = (id: string, d: Data = D) => ((d as { links?: Link[] }).links || []).filter((l) => l.a === id || l.b === id);
export const heldLink = (a: string, b: string) => st().holds.find((h) => h.k === "link" && h.pair === pk(a, b)) || null;
const OUT: Record<LinkKind, string> = { uses: "Uses", "made from": "Made from", "part of": "Part of", blocks: "Blocks", "same as": "Same as" };
const IN: Record<LinkKind, string> = { uses: "Used by", "made from": "Made into", "part of": "Has part", blocks: "Blocked by", "same as": "Same as" };
export const rowWord = (l: Link, from: string) => (l.a === from ? OUT[l.kind] : IN[l.kind]);
export const VERB: Record<LinkKind, string> = { uses: "uses", "made from": "was made from", "part of": "is part of", blocks: "blocks", "same as": "is the same as" };
export const sayLink = (l: Link, d: Data = D) => `“${nameOf(d.pieces[l.a])}” ${VERB[l.kind]} “${nameOf(d.pieces[l.b])}”`;
export function addLink(a: string, b: string, kind: LinkKind, by: "sol" | "person", o: { quiet?: boolean; why?: string; t?: number } = {}, d: Data = D): Link | null {
  const ls = linkList(d);
  if (a === b || !d.pieces[a] || !d.pieces[b]) return null;
  if (ls.some((l) => pk(l.a, l.b) === pk(a, b))) return null;
  if (by === "sol" && heldLink(a, b)) return null;
  const l: Link = { a, b, kind, by };
  ls.push(l);
  if (by === "sol" && !o.quiet) note({ who: VOICE, kind: "link", key: "link:" + pk(a, b), region: d.pieces[a].region, embed: { id: a }, t: o.t, what: `Linked ${sayLink(l, d)}${o.why ? `: ${o.why}` : ""}.` });
  return l;
}
/** after an act on a thing, Sol links what its brief leaned on most in the same place, unless a cut holds the pair apart */
export function relink(pid: string, o: { why?: string; t?: number } = {}, d: Data = D): Link | null {
  const p = d.pieces[pid];
  if (!p) return null;
  aisNow(d);
  const mine = wordsOf(textOf(p));
  const best = Object.values(d.pieces).filter((q) => q.region === p.region && q.id !== pid && !["arrivals", "copies", "set"].includes(q.kind))
    .map((q) => ({ q, n: [...wordsOf(textOf(q))].filter((w) => mine.has(w)).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)[0];
  if (!best || heldLink(pid, best.q.id) || linksOf(pid, d).some((l) => pk(l.a, l.b) === pk(pid, best.q.id))) return null;
  return addLink(pid, best.q.id, "uses", "sol", { why: o.why || "the run used it", t: o.t }, d);
}
/** at load: what the canvas already shows (a block from its session, a sticky's run from what it used, two things named alike) */
export function linkCanvas(d: Data): void {
  linkList(d);
  const yday = (i: number) => TODAY0 - DAY + (20 * 60 + 30 + i) * MIN;
  let i = 0;
  for (const p of Object.values(d.pieces)) if (p.kind === "block" && p.joined && d.pieces[p.joined as string]) addLink(p.id, p.joined as string, "made from", "sol", { why: `${p.by} made the block from its session`, t: yday(i++) }, d);
  const seen = new Set<string>();
  for (const r of results(d)) {
    if (seen.has(r.piece)) continue;
    seen.add(r.piece);
    const p = d.pieces[r.piece];
    if (p.state === "done" && p.ended != null) { relink(p.id, { t: TODAY0 + (Number(p.ended) - 30) * MIN }, d); continue; }
    relink(p.id, { t: yday(i++) }, d);
  }
  const named = Object.values(d.pieces).filter((p) => p.kind !== "session" && p.kind !== "arrivals" && p.kind !== "copies" && String(p.name || "").split(" ").length >= 3);
  for (const a of named) for (const b of named) {
    if (a.id >= b.id || a.region === b.region) continue;
    const A = wordsOf(a.name), B = wordsOf(b.name), s = [...A].filter((w) => B.has(w)).length;
    if (A.size >= 2 && s / Math.max(A.size, B.size) >= 0.8) addLink(a.id, b.id, "same as", "sol", { why: "they read the same; keep one or both", t: yday(i++) }, d);
  }
}
/** the person's links first, then the ones on screen, then by kind */
export function orderLinks(id: string, onScreen?: Set<string>): Link[] {
  const K: LinkKind[] = ["blocks", "made from", "part of", "uses", "same as"];
  return linksOf(id).filter((l) => D.pieces[l.a] && D.pieces[l.b]).sort((x, y) =>
    (x.by === "person" ? 0 : 1) - (y.by === "person" ? 0 : 1)
    || (onScreen ? (onScreen.has(x.a === id ? x.b : x.a) ? 0 : 1) - (onScreen.has(y.a === id ? y.b : y.a) ? 0 : 1) : 0)
    || K.indexOf(x.kind) - K.indexOf(y.kind));
}
export const mostLinked = (d: Data = D): string | null => {
  const c: Record<string, number> = {};
  for (const l of (d as { links?: Link[] }).links || []) { c[l.a] = (c[l.a] || 0) + 1; c[l.b] = (c[l.b] || 0) + 1; }
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

// ---------------------------------------------------------------- done things fold (canvas.md §4): after the person's span

export const doneAge = (p: Piece) => (p.state === "done" && p.ended != null ? (nowMin() - Number(p.ended)) / 1440 : null);
/** learned from the person's own reopens: a done thing reopened later than a week moves the span to the next whole week */
export function span(d: Data = D): number {
  const s = st(), re = Object.values(d.pieces).map((p) => p.reopened as number | undefined).filter((x): x is number => x != null);
  if (re.length) {
    const m = Math.max(...re);
    if (m > 7) { s.span = Math.ceil(m / 7) * 7; s.spanWhy = `you reopened ${re.length === 1 ? "a done thing" : re.length + " done things"} up to ${m} days after ${re.length === 1 ? "it was" : "they were"} done`; }
  }
  return s.span || 7;
}
export function fold(d: Data = D, o: { quiet?: boolean; t?: number } = {}): Record<string, string[]> {
  const n = span(d), got: Record<string, string[]> = {};
  for (const p of Object.values(d.pieces)) {
    if (p.inside === "done" && doneAge(p) == null) { delete p.inside; continue; }   // reopened: back on the plane
    const a = doneAge(p);
    if (a == null || a < n || p.inside) continue;
    p.inside = "done";
    (got[p.region] ||= []).push(p.id);
  }
  if (!o.quiet) for (const [rid, ids] of Object.entries(got)) note({ who: VOICE, kind: "fold", key: `fold:${rid}:${ids.length}:${ids[0]}`, region: rid, embed: { id: rid }, t: o.t,
    what: `Folded ${ids.length === 1 ? `“${nameOf(d.pieces[ids[0]])}”` : ids.length + " done things"} into ${folderName(rid)}’s done line: done more than ${spanWords(n)} ago. Find still finds ${ids.length === 1 ? "it" : "them"}.` });
  return got;
}
export const foldedIn = (rid: string, d: Data = D) => Object.values(d.pieces).filter((p) => p.region === rid && p.inside === "done").sort((a, b) => (Number(b.ended) || 0) - (Number(a.ended) || 0));

// ---------------------------------------------------------------- Far at scale: the ladder, at most 12 whole

/** asks first (the best rank), then a place blocked by another, then AIs at work, then live things, then the plane's order */
export function ladder(d: Data = D): { id: string; asks: boolean; blocked: number }[] {
  const blocked: Record<string, number> = {};
  for (const l of (d as { links?: Link[] }).links || []) if (l.kind === "blocks") { const a = d.pieces[l.a], b = d.pieces[l.b]; if (a && b && a.region !== b.region && !b.inside) blocked[b.region] = (blocked[b.region] || 0) + 1; }
  const liveN: Record<string, number> = {};
  for (const p of Object.values(d.pieces)) if (!p.inside && p.state !== "done") liveN[p.region] = (liveN[p.region] || 0) + 1;
  const asks = (rid: string) => { const a = asksInRegion(rid); return a.length ? Math.min(...a.map((x) => x.rank || 99)) : null; };
  return d.regions.map((r, i) => ({ r, i, a: asks(r.id), b: blocked[r.id] || 0, ai: aisIn(r.id), n: liveN[r.id] || 0 }))
    .sort((x, y) => Number(x.a == null) - Number(y.a == null) || (x.a != null && y.a != null ? x.a - y.a : 0) || Number(y.b > 0) - Number(x.b > 0) || y.ai - x.ai || y.n - x.n || x.i - y.i)
    .map((x) => ({ id: x.r.id, asks: x.a != null, blocked: x.b }));
}
export const wholeSet = (d: Data = D) => (d.regions.length > WHOLE ? new Set(ladder(d).slice(0, WHOLE).map((x) => x.id)) : null);

// ---------------------------------------------------------------- a link's line: orthogonal, on a 6px grid, around every box

export type Box = { l: number; t: number; r: number; b: number };
export type Pt = { x: number; y: number };
/** a route from just off A's edge to just off B's, around every box in `obs`, with a cost for each turn; null: no way */
export function route(A: Box, B: Box, obs: Box[], w: number, h: number): Pt[] | null {
  const C = 6, W = Math.ceil(w / C), H = Math.ceil(h / C), N = W * H, bl = new Uint8Array(N), cx = (i: number) => i * C + C / 2;
  const mark = (r: Box, pad: number, v = 1) => {
    const x0 = Math.max(0, Math.floor((r.l - pad) / C)), x1 = Math.min(W - 1, Math.floor((r.r + pad) / C)), y0 = Math.max(0, Math.floor((r.t - pad) / C)), y1 = Math.min(H - 1, Math.floor((r.b + pad) / C));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bl[y * W + x] |= v;
    return { x0, x1, y0, y1 };
  };
  for (const o of obs) mark(o, 3);
  const a = mark(A, 1, 2), b = mark(B, 1, 4);
  // the cells just off each side: 0 up, 1 right, 2 down, 3 left
  const ring = (m: { x0: number; x1: number; y0: number; y1: number }, R: Box) => {
    const c: [number, number, number][] = [];
    for (let x = m.x0; x <= m.x1; x++) { if (cx(x) < R.l + 4 || cx(x) > R.r - 4) continue; if (m.y0 > 0) c.push([x, m.y0 - 1, 0]); if (m.y1 < H - 1) c.push([x, m.y1 + 1, 2]); }
    for (let y = m.y0; y <= m.y1; y++) { if (cx(y) < R.t + 3 || cx(y) > R.b - 3) continue; if (m.x0 > 0) c.push([m.x0 - 1, y, 3]); if (m.x1 < W - 1) c.push([m.x1 + 1, y, 1]); }
    return c.filter(([x, y]) => !bl[y * W + x]);
  };
  const S0 = ring(a, A), G = ring(b, B);
  if (!S0.length || !G.length) return null;
  const goal = new Map(G.map(([x, y, d]) => [y * W + x, d]));
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], g = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1), hp: [number, number][] = [];
  const hf = (x: number, y: number) => Math.max(0, b.x0 - x, x - b.x1) + Math.max(0, b.y0 - y, y - b.y1);
  const push = (f: number, s: number) => { hp.push([f, s]); let i = hp.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
  const pop = () => {
    const t = hp[0], e = hp.pop()!;
    if (hp.length) { hp[0] = e; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r < hp.length && hp[r][0] < hp[m][0]) m = r; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } }
    return t;
  };
  for (const [x, y, d] of S0) { const s = (y * W + x) * 4 + d; g[s] = 0; push(hf(x, y), s); }
  let end = -1, n = 0;
  while (hp.length && n++ < 300000) {
    const [f, s] = pop(), c = s >> 2, d = s & 3, x = c % W, y = (c - x) / W;
    if (f - hf(x, y) > g[s] + 1e-9) continue;
    if (goal.has(c)) { end = s; break; }
    for (let k = 0; k < 4; k++) {
      if (k === (d + 2) % 4) continue;
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nc = ny * W + nx;
      if (bl[nc] && !goal.has(nc)) continue;
      const ns = nc * 4 + k, ng = g[s] + 1 + (k === d ? 0 : 8);
      if (ng < g[ns]) { g[ns] = ng; prev[ns] = s; push(ng + hf(nx, ny), ns); }
    }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let s = end; s >= 0; s = prev[s]) cells.unshift(s);
  const P = cells.map((s) => { const c = s >> 2, x = c % W; return { x: cx(x), y: cx((c - x) / W) }; }), d0 = cells[0] & 3, dg = goal.get(cells[cells.length - 1] >> 2)!;
  // onto the edges: the first cell's side of A, the last cell's side of B
  const onA = [{ x: P[0].x, y: A.t }, { x: A.r, y: P[0].y }, { x: P[0].x, y: A.b }, { x: A.l, y: P[0].y }][d0], L = P[P.length - 1], onB = [{ x: L.x, y: B.t }, { x: B.r, y: L.y }, { x: L.x, y: B.b }, { x: B.l, y: L.y }][dg];
  const pts = [onA, ...P, onB], out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const p = out[out.length - 1], q = pts[i], r = pts[i + 1]; if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) continue; out.push(q); }
  out.push(pts[pts.length - 1]);
  return out;
}
