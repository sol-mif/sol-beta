// Agents' meta (#1327, pass 2): when Sol suggests an agent. Principle gates, pattern evidences; code over counts.
//   (a) traces (traces.ts), kept at each did line and each answered ask
//   (b) the same job (jobs.ts): Jev over two traces, masked; ≥0.7 same, 0.45–0.7 half (counts half, never offers
//       alone); Jev null: the same sources and the same output kind
//   (c) the gate, all four or no offer (gate):
//         recurs     RECUR_TRACES in RECUR_DAYS, counted in time and across places, or 1 when a cadence was said
//         steps      at least a read and a make; one step fails as "a sticky is enough"
//         costs      a date it must meet, or COST_MINUTES of the person's own per time
//         reachable  every input readable now, or after one sign-in per source; unreachable fails silently
//   (d) one full Sol turn writes the offer (Host.d.say): name, job, steps, parameter, kind; the kind's places as tiles,
//       checked where the job's inputs are, unchecked with the reason. It cannot name the steps: "show me once".
//   (e) the person: keep (one rule template into each checked place's policy.md, the agent in agents.json) · not now
//       (again after NOT_NOW_MORE more traces) · never (that job shape is not offered again). Each with undo.
// The offer waits on the sticky whose did line passed the gate (the face draws the peek); never a notification.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SITES, nameOf, sitesOf } from "../sites.js";
import { readLedger } from "../store.js";
import { change, ensure, ensureFirst, find, homeOf, loadAgents, no, nowOf, partOf, saveAgents, slug, type Agent, type Host, type Offer, type OfferPlace, type PlaceRef, type Say } from "../agents.js";
import { makeAsk, type Ask } from "./jev.js";
import { groupTraces, maskOf, scorePair, traceWords, type Group } from "./jobs.js";
import { kindsOf } from "./kinds.js";
import { placesOf, type Place } from "./places.js";
import { collect, loadTraces, saveTraces, type Trace } from "./traces.js";
import { COST_MINUTES, DAY_MS, NOT_NOW_MORE, RECUR_DAYS, RECUR_TRACES } from "./numbers.js";
import { WATCHED, reachOf, triggerFor, type Trust } from "./when.js";
import { writePlace } from "./render.js";

export type Reach = "now" | "sign-in" | "never";
/** can Sol read this source for this place: now, after one sign-in, or never (pure over what is passed in) */
export function reachIn(place: Pick<Place, "sources"> | undefined, source: string, files: string[] = []): Reach {
  const s = source.toLowerCase();
  if (WATCHED.has(s) || s === "clock" || place?.sources.includes(s)) return "now";
  if (sitesOf(s).length || SITES.some((x) => nameOf(x).toLowerCase() === s || x === s)) return "sign-in";
  if (files.some((f) => f.toLowerCase().includes(s) || s.includes(f.toLowerCase().replace(/\.[a-z0-9]+$/, "")))) return "now";
  return "never";
}
/** a place's plain files, one level and one down (for reachIn) */
export function filesOf(home: string, folder: string): string[] {
  const out: string[] = [];
  const look = (d: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(d, { withFileTypes: true }).map((x) => (x.isDirectory() ? `${x.name}/` : x.name)); } catch { return; }
    for (const n of names) { if (n.startsWith(".")) continue; if (n.endsWith("/")) { if (depth < 1) look(join(d, n), depth + 1); continue; } out.push(n); }
  };
  look(join(home, folder), 0);
  return out;
}

export type GateOut = { ok: true; count: number } | { ok: false; count: number; fail: "recurs" | "steps" | "cost" | "reach"; say?: string };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
/** the four gates over one job's traces (pure); `reach` says how a source reads from where a trace was done */
export function gate(members: Group["members"], now: number, reach: (source: string, t: Trace) => Reach): GateOut {
  const recent = members.filter((m) => m.trace.at >= now - RECUR_DAYS * DAY_MS && m.trace.at <= now + DAY_MS);
  const count = recent.reduce((s, m) => s + m.weight, 0), full = recent.filter((m) => m.weight === 1).length;
  if (!recent.length) return { ok: false, count, fail: "recurs" };
  const said = recent.some((m) => m.trace.cadence);
  if (!said && !(full >= 2 && count >= RECUR_TRACES)) return { ok: false, count, fail: "recurs" };
  const last = [...recent].sort((a, b) => b.trace.at - a.trace.at)[0].trace;
  if (!last.sources.length || !last.made.kind) return { ok: false, count, fail: "steps", say: "a sticky is enough" };
  const mins = median(recent.map((m) => m.trace.minutes).filter((x): x is number => x !== null));
  if (!recent.some((m) => m.trace.date) && !(mins !== null && mins >= COST_MINUTES)) return { ok: false, count, fail: "cost" };
  for (const m of recent) for (const s of m.trace.sources) if (reach(s, m.trace) === "never") return { ok: false, count, fail: "reach" };
  return { ok: true, count };
}

// ---------------------------------------------------------------- the turn that writes it

export type Written = { name: string; job: string; steps: string[]; parameter: string; kind: string } | { showMe: true };
/** the offer's prompt (pure): the traces masked, the places, what to answer */
export function offerPrompt(traces: string[], kind: string | null, places: string[]): string {
  return [
    `A person did the same job ${traces.length} time${traces.length === 1 ? "" : "s"}. Each time, with the place, the names and the dates taken out:`,
    ...traces.map((t) => `- ${t}`),
    ``,
    kind ? `It is done in each ${kind}: ${places.join(", ")}.` : `It is done in: ${places.join(", ")}.`,
    `Sol would keep one dedicated agent for this job, the place being what changes each time. Write it in the person's plain words:`,
    `name (two or three words), job (one line, what it does each time, with <place> where the place goes), steps (what it does, in order, each a few words), parameter (what changes each time), kind (one word for the place).`,
    `If these traces do not tell you its steps, answer {"showMe": true}.`,
    `End with exactly one line of JSON, alone on the last line: {"name":"…","job":"…","steps":["…"],"parameter":"…","kind":"…"}`,
  ].join("\n");
}
/** the turn's answer (pure): its last JSON line; null when there is none that reads */
export function offerSaid(text: string | null): Written | null {
  if (!text) return null;
  for (const line of text.trim().split("\n").reverse()) {
    const l = line.trim();
    if (!l.startsWith("{")) continue;
    try {
      const j = JSON.parse(l);
      if (j?.showMe === true) return { showMe: true };
      const steps = Array.isArray(j?.steps) ? j.steps.map(String).filter(Boolean).slice(0, 8) : [];
      if (typeof j?.name !== "string" || !j.name.trim() || typeof j?.job !== "string" || !j.job.trim()) return null;
      if (steps.length < 2) return { showMe: true };
      return { name: j.name.trim().slice(0, 40), job: j.job.trim().slice(0, 200), steps, parameter: String(j.parameter ?? "the place").slice(0, 60), kind: String(j.kind ?? "place").slice(0, 30) };
    } catch { continue; }
  }
  return null;
}

// ---------------------------------------------------------------- noticing (the scan)

const running = new Map<string, Promise<Offer[]>>();
const askOf = (a: Host): Ask => a.d.ask ?? makeAsk({ home: a.d.home });
const sayOf = (a: Host): Say => a.d.say ?? (async () => null);
const and = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);
/** the names masked out of everything Jev and the turn see: every place's name and its folder's words */
const namesIn = (places: Place[]) => [...new Set(places.flatMap((p) => [p.name, ...p.folder.split("/"), ...p.folder.split("/").map((x) => x.replace(/[-_]+/g, " "))]))];

/** read the traces, group them into jobs, run the gate, and write an offer for each job that passes and has none;
 *  one scan at a time per home. Returns the open offers. `onlyFresh` (the tick): nothing more unless a new trace
 *  landed, so a turn that could not be had is asked again with the next trace or the next agents.offers, never each minute */
export function notice(a: Host, onlyFresh = false): Promise<Offer[]> {
  const home = homeOf(a);
  const was = running.get(home);
  if (was) return was;
  const p = scan(a, onlyFresh).finally(() => running.delete(home));
  running.set(home, p);
  return p;
}
async function scan(a: Host, onlyFresh: boolean): Promise<Offer[]> {
  const home = homeOf(a), now = nowOf(a), ask = askOf(a);
  await ensureFirst(a, ask);   // never the late look: agents.list starts it (#1429)
  const { places } = placesOf(home);
  const { file: tf, fresh } = collect(home, places, now);
  if (onlyFresh && !fresh) return (loadAgents(home)?.offers ?? []).filter((o) => o.state === "open");
  const pairs = Object.keys(tf.pairs).length;
  const byId = new Map(places.map((p) => [p.id, p]));
  const names = namesIn(places);
  const recent = tf.traces.filter((t) => t.at >= now - RECUR_DAYS * DAY_MS);
  const groups = await groupTraces(recent, ask, names, tf.pairs);
  if (Object.keys(tf.pairs).length !== pairs) saveTraces(home, tf);   // Jev's new answers kept, so a pair is asked once
  const f = loadAgents(home) ?? ensure(a);
  const files = new Map<string, string[]>();
  const filesAt = (folder: string) => { if (!files.has(folder)) files.set(folder, filesOf(home, folder)); return files.get(folder)!; };
  const reach = (s: string, t: Trace) => reachIn(byId.get(t.place), s, filesAt(byId.get(t.place)?.folder ?? t.place));
  let kinds: Awaited<ReturnType<typeof kindsOf>> | null = null;
  let changed = false;
  for (const g of groups) {
    const ids = g.members.map((m) => m.trace.id);
    if (f.agents.some((x) => x.traces?.some((id) => ids.includes(id)))) continue;
    const had = f.offers.find((o) => o.traces.some((id) => ids.includes(id)));
    const verdict = gate(g.members, now, reach);
    if (had) {
      if (had.state === "kept" || had.state === "never") continue;
      const more = ids.filter((id) => !had.traces.includes(id));
      if (more.length) { had.traces = [...had.traces, ...more]; had.count = verdict.count; changed = true; }
      if (had.state === "later" && had.count >= (had.laterAt ?? 0) + NOT_NOW_MORE) { had.state = "open"; delete had.laterAt; changed = true; }
      continue;
    }
    if (!verdict.ok) continue;
    // a job shape the person said never to: not offered again
    let refused = false;
    for (const n of f.never) {
      const fake: Trace = { ...g.anchor, id: `never-${n.words.length}`, text: n.words, sources: n.sources, made: { ...g.anchor.made, kind: n.kind } };
      if ((await scorePair(fake, g.anchor, ask, names)).band === "same") { refused = true; break; }
    }
    if (refused) continue;
    kinds ??= await kindsOf(places, ask);
    const where = [...new Set(g.members.map((m) => m.trace.place))];
    const kind = kinds.find((k) => k.members.some((m) => !m.ask && where.includes(m.place))) ?? null;
    const sources = [...new Set(g.members.flatMap((m) => m.trace.sources))];
    const list: OfferPlace[] = (kind ? kind.members.map((m) => ({ id: m.place, ask: m.ask })) : where.map((id) => ({ id, ask: undefined }))).map(({ id, ask: half }) => {
      const p = byId.get(id);
      const missing = sources.find((s) => reachIn(p, s, filesAt(p?.folder ?? id)) === "never");
      const did = where.includes(id);
      return { place: id, name: p?.name ?? id, checked: did || (!missing && !half), ...(!did && missing ? { why: `no ${missing} here yet` } : {}), ...(half ? { ask: true as const } : {}) };
    });
    const last = [...g.members].sort((x, y) => y.trace.at - x.trace.at)[0].trace;
    const words = g.members.map((m) => traceWords(m.trace, names));
    const written = offerSaid(await sayOf(a)(offerPrompt(words, kind?.name ?? null, list.map((x) => x.name))));
    if (!written) continue;   // the turn could not be had: asked again on the next scan
    const reachTrust: Trust = reachOf(last.made, g.members.map((m) => m.trace.text).join(" "));
    f.offers.push({
      id: `o-${g.anchor.id.slice(2)}`, state: "open", at: new Date(now).toISOString(),
      ...("showMe" in written ? { showMe: true as const, name: "", job: "", steps: [], parameter: "", kind: kind?.name ?? null } : { name: written.name, job: written.job, steps: written.steps, parameter: written.parameter, kind: written.kind || kind?.name || null }),
      kindId: kind?.id ?? null, places: list, reach: reachTrust, sources, made: last.made, traces: ids, count: verdict.count,
    });
    changed = true;
  }
  if (changed) saveAgents(home, f);
  return f.offers.filter((o) => o.state === "open");
}

/** agents.offers: the open offers, each with the sticky it waits on (its newest trace's place and words) */
export async function offers(a: Host) {
  const open = await notice(a);
  const tf = loadTraces(homeOf(a));
  return {
    ok: true,
    offers: open.map((o) => {
      const ts = tf.traces.filter((t) => o.traces.includes(t.id)).sort((x, y) => y.at - x.at);
      return { ...o, seen: ts.map((t) => ({ place: t.place, at: new Date(t.at).toISOString(), text: t.text })), on: ts[0] ? { place: ts[0].place, sticky: ts[0].text.split(": ")[0] } : null };
    }),
  };
}

// ---------------------------------------------------------------- the person's answer

/** a source behind a sign-in that Sol never read in this folder (no ledger line names it): the first run there is a look */
export function neverRead(home: string, place: Pick<Place, "folder" | "sources">, sources: string[]): boolean {
  const files = filesOf(home, place.folder);
  const signins = sources.filter((s) => reachIn(place, s, files) === "sign-in");
  if (!signins.length) return false;
  const ledger = readLedger(join(home, place.folder), 2000);
  return signins.some((s) => !ledger.some((l) => l.read.toLowerCase().includes(s.toLowerCase())));
}

/** agents.offer: keep (with the places ticked, else the checked ones) · later · never */
export function answerOffer(a: Host, id: string, answer: string, picked?: string[]) {
  const home = homeOf(a), now = nowOf(a), at = new Date(now).toISOString();
  const f = ensure(a), o = f.offers.find((x) => x.id === id);
  if (!o) return { ok: false, why: `no offer ${id}` };
  if (o.state !== "open") return { ok: false, why: `that offer is ${o.state === "kept" ? "kept already" : o.state === "later" ? "put off" : "refused"}` };
  if (answer === "later" || answer === "not now") {
    o.state = "later"; o.laterAt = o.count;
    const c = change(f, { at, kind: "offer", agent: "", line: `Not now: Sol asks about ${o.name || "this job"} again after ${NOT_NOW_MORE} more times.`, undo: { offer: { id, state: "open" } } });
    saveAgents(home, f);
    return { ok: true, change: c };
  }
  if (answer === "never") {
    o.state = "never";
    const tf = loadTraces(home);
    const anchor = tf.traces.find((t) => t.id === o.traces[0]);
    const words = anchor ? maskOf(anchor.text, []) : o.job;
    f.never.push({ words, sources: o.sources, kind: o.made.kind });
    const c = change(f, { at, kind: "offer", agent: "", line: `Never: Sol won't offer ${o.name || "this job"} again.`, undo: { offer: { id, state: "open", never: words } } });
    saveAgents(home, f);
    return { ok: true, change: c };
  }
  if (answer !== "keep") return { ok: false, why: "an answer is keep, later or never" };
  if (o.showMe) return { ok: false, why: "show Sol once first: it could not name the steps" };
  const { places } = placesOf(home);
  const byId = new Map(places.map((p) => [p.id, p]));
  const ids = (picked ?? o.places.filter((p) => p.checked).map((p) => p.place)).filter((p, i, l) => l.indexOf(p) === i);
  if (!ids.length) return { ok: false, why: "pick at least one place" };
  const unknown = ids.find((p) => !byId.has(p));
  if (unknown) return { ok: false, why: `no place ${unknown}` };
  const tf = loadTraces(home), traces = tf.traces.filter((t) => o.traces.includes(t.id));
  let aid = slug(o.name), n = 2;
  while (f.agents.some((x) => x.id === aid)) aid = `${slug(o.name)}-${n++}`;
  const ag: Agent = {
    id: aid, name: o.name, job: o.job.replace(/<place>/g, `each ${o.kind ?? "place"}`), turn: f.agents.length % 6, part: partOf(byId.get(ids[0])!.folder),
    rules: [], born: { how: "offer", at }, template: o.job, parameter: o.parameter, kinds: o.kindId ? [o.kindId] : [], places: [],
    seen: o.places.map((p) => ({ place: p.place, ...(p.why ? { why: p.why } : {}) })), out: [], learned: [], fixes: [], reach: o.reach, traces: o.traces, sources: o.sources, made: o.made,
  };
  const lines: { folder: string; line: string }[] = [];
  for (const id2 of ids) {
    const p = byId.get(id2)!;
    const mine = traces.filter((t) => t.place === id2);
    const ref0: Omit<PlaceRef, "rule"> = {
      place: id2, name: p.name, folder: p.folder, trust: o.reach, trigger: triggerFor(mine, traces, o.sources, p.sources), at,
      ...(neverRead(home, p, o.sources) ? { first: "looks" as const } : {}),
    };
    const w = writePlace(home, ag, ref0);
    ag.places!.push({ ...ref0, rule: w.rule });
    ag.rules.push({ folder: p.folder, rule: w.rule });
    lines.push({ folder: p.folder, line: w.line });
  }
  f.agents.push(ag);
  o.state = "kept"; o.agent = ag.id;
  const c = change(f, { at, kind: "kept", agent: ag.id, rules: ag.rules, line: `${ag.name} kept: on ${and(ag.places!.map((p) => p.name))}; it ${o.reach === "asks" ? "asks you each time" : o.reach} there.`, undo: { unkeep: { offer: o.id, lines } } });
  saveAgents(home, f);
  return { ok: true, agent: ag, change: c };
}
export { find, no };
