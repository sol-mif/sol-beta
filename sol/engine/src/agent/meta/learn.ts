// Agents' meta (#1327, pass 2): refining an agent, three levels, and its scope. Each write is one change line with undo.
//   fix     its work: the person rewrote a line it made (before → after). The first fix asks "Always like this?"
//           (always: true learns it, false keeps it once). The same fix twice (Jev "same fix?" ≥ JEV_SAME over the
//           two edits; Jev null: the same words added and taken out, dates and numbers aside) is learned anyway.
//           Learned in one place → for that place; in two → for the agent. A learned line goes into the rule's
//           sentence (" Always: …."), has undo, and hands back the open work to redo.
//   change  its job: a line the person says. Sol rewrites the template and rehearses it on the last real run (one
//           Sol turn, Host.d.say): { before, after }; keep writes it into every place. A said change that matches a
//           learned line is that line, never a second one.
//   scope   its places: add one (its first run at drafts at most) or take one out (its rule off, its work kept).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLedger, readTickets } from "../store.js";
import { change as changeLine, ensure, find, homeOf, madeSomething, no, nowOf, runsOf, saveAgents, type Agent, type Fix, type Host, type Learned, type PlaceRef, type RuleRef, type Say } from "../agents.js";
import { makeAsk, type Ask } from "./jev.js";
import { maskOf } from "./jobs.js";
import { placesOf } from "./places.js";
import { neverRead } from "./offer.js";
import { loadTraces, filesIn } from "./traces.js";
import { JEV_SAME } from "./numbers.js";
import { capped, triggerFor } from "./when.js";
import { jobFor, rewritePlace, writePlace } from "./render.js";
import { lineOf } from "./policy.js";

const askOf = (a: Host): Ask => a.d.ask ?? makeAsk();
const sayOf = (a: Host): Say => a.d.say ?? (async () => null);
const rid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const words = (s: string) => new Set(maskOf(s, []).toLowerCase().replace(/<[a-z]+>/g, " ").split(/[^a-z']+/).filter((w) => w.length > 1 && !/^\d/.test(w)));
const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort().join(" ");
/** Jev null: two fixes are the same when they add the same words and take out the same words (pure) */
export function sameFixByCode(a: Pick<Fix, "before" | "after">, b: Pick<Fix, "before" | "after">): boolean {
  const [ab, aa, bb, ba] = [words(a.before), words(a.after), words(b.before), words(b.after)];
  const add = minus(aa, ab), out = minus(ab, aa);
  return !!(add || out) && add === minus(ba, bb) && out === minus(bb, ba);
}
const fixWords = (x: Pick<Fix, "before" | "after">) => `before: ${maskOf(x.before, [])} → after: ${maskOf(x.after, [])}`;
/** a learned line in plain words, from the fix (pure) */
export const learnedLine = (x: Pick<Fix, "before" | "after">) => `instead of “${x.before.trim()}”, “${x.after.trim()}”`;

const snapshot = (ag: Agent): Agent => JSON.parse(JSON.stringify(ag));
const linesOf = (home: string, refs: PlaceRef[]) => refs.map((r) => ({ folder: r.folder, rule: r.rule, line: lineOf(home, r.folder, r.rule) ?? "" })).filter((x) => x.line);
const openWork = (home: string, refs: PlaceRef[]): RuleRef[] =>
  refs.filter((r) => readTickets(join(home, r.folder)).some((t) => t.rule === r.rule && t.state !== "ended")).map((r) => ({ folder: r.folder, rule: r.rule }));

/** agents.fix */
export async function fix(a: Host, m: { id: string; place: string; before: string; after: string; always?: boolean }) {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const f = ensure(a), ag = find(f, m.id);
  if (!ag) return no(m.id);
  const ref = ag.places?.find((p) => p.place === m.place);
  if (!ref) return { ok: false, why: `${ag.name} does not work in ${m.place}` };
  const before = String(m.before ?? "").trim(), after = String(m.after ?? "").trim();
  if (!before || before === after) return { ok: false, why: "the line is the same" };
  // the answer to an open "Always like this?" lands on that fix, never a second one beside it
  const learnedFixes = new Set((ag.learned ?? []).flatMap((l) => l.fixes));
  const open = typeof m.always === "boolean" ? (ag.fixes ?? []).find((x) => !x.answer && !learnedFixes.has(x.id) && x.place === m.place && x.before === before && x.after === after) : undefined;
  const fx: Fix = open ?? { id: rid("x"), place: m.place, before, after, at };
  if (!open) ag.fixes = [...(ag.fixes ?? []), fx];
  if (m.always === false) { fx.answer = "once"; saveAgents(home, f); return { ok: true, fix: fx.id, learned: null }; }
  if (m.always === true) fx.answer = "always";
  // the earlier fixes not yet learned, the newest first: the same fix twice is learned anyway
  const taken = new Set((ag.learned ?? []).flatMap((l) => l.fixes));
  const matched: Fix[] = [fx];
  for (const prev of [...(ag.fixes ?? [])].reverse()) {
    if (prev.id === fx.id || prev.answer === "once" || taken.has(prev.id)) continue;
    const p = await askOf(a)("fix", fixWords(prev), fixWords(fx));
    if (p === null ? sameFixByCode(prev, fx) : p >= JEV_SAME) matched.push(prev);
  }
  if (matched.length < 2 && m.always !== true) { saveAgents(home, f); return { ok: true, fix: fx.id, ask: "Always like this?" }; }
  const where = [...new Set(matched.map((x) => x.place))];
  const scope = where.length >= 2 ? null : where[0];
  const refs = (ag.places ?? []).filter((p) => scope === null || p.place === scope);
  const old = snapshot(ag), lines = linesOf(home, refs);
  old.fixes = (old.fixes ?? []).filter((x) => x.id !== fx.id).concat({ ...fx, answer: "once" });
  const l: Learned = { id: rid("l"), line: learnedLine(fx), place: scope, at, fixes: matched.map((x) => x.id) };
  ag.learned = [...(ag.learned ?? []), l];
  for (const r of refs) rewritePlace(home, ag, r);
  const redo = openWork(home, refs);
  const c = changeLine(f, { at, kind: "learned", agent: ag.id, rules: refs.map((r) => ({ folder: r.folder, rule: r.rule })), line: `${ag.name} learned${scope ? ` for ${ref.name}` : ""}: ${l.line}.${redo.length ? ` ${redo.length} open to redo.` : ""}`, undo: { restore: { agent: old, lines } } });
  saveAgents(home, f);
  return { ok: true, fix: fx.id, learned: l, redo, change: c };
}

// ---------------------------------------------------------------- a said change

/** the last real run: the newest ledger line of its rules that made something, and what it made when it is a file */
export function lastRun(home: string, ag: Agent): { place: string; text: string } | null {
  let best: { at: number; place: string; folder: string; made: string } | null = null;
  for (const r of ag.places ?? []) {
    const l = runsOf(readLedger(join(home, r.folder), 500), r.rule).find(madeSomething);
    if (l && (!best || l.at > best.at)) best = { at: l.at, place: r.place, folder: r.folder, made: l.made };
  }
  if (!best) return null;
  for (const file of filesIn(best.made)) {
    try { return { place: best.place, text: readFileSync(join(home, best.folder, file), "utf8").slice(0, 2000).trim() }; } catch { /* not a file here */ }
  }
  return { place: best.place, text: best.made };
}
/** the rehearsal's prompt (pure) */
export function changePrompt(template: string, line: string, before: string): string {
  return [
    `An agent does this job each time ("<place>" is where the place goes): ${template}`,
    `The person wants this change: ${line}`,
    `Its last real run made this:`, before, ``,
    `Rewrite the job with the change (keep "<place>"), and show what that last run would have made with it.`,
    `End with exactly one line of JSON, alone on the last line: {"template":"…","after":"…"}`,
  ].join("\n");
}
/** the rehearsal's answer (pure) */
export function changeSaid(text: string | null): { template: string; after: string } | null {
  if (!text) return null;
  for (const line of text.trim().split("\n").reverse()) {
    if (!line.trim().startsWith("{")) continue;
    try { const j = JSON.parse(line.trim()); if (typeof j?.template === "string" && j.template.trim() && typeof j?.after === "string") return { template: j.template.trim(), after: j.after }; } catch { /* the next */ }
  }
  return null;
}
const sameLine = (a: string, b: string) => { const A = words(a), B = words(b); return B.size > 0 && [...B].every((w) => A.has(w)); };
const timesIn = (s: string) => s.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) ?? [];

/** agents.change: rehearse (keep false) or keep */
export async function changeJob(a: Host, m: { id: string; line: string; keep?: boolean }) {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const f = ensure(a), ag = find(f, m.id);
  if (!ag) return no(m.id);
  const line = String(m.line ?? "").trim().replace(/\s+/g, " ");
  if (!line) return { ok: false, why: "say the change in a line" };
  for (const l of ag.learned ?? []) {
    const p = await askOf(a)("fix", l.line, line);
    if (p === null ? sameLine(l.line, line) : p >= JEV_SAME) return { ok: true, same: l };
  }
  const last = lastRun(home, ag);
  if (!last) return { ok: false, why: "it has not made anything yet: nothing to rehearse on" };
  const template = ag.template ?? ag.job;
  let got = ag.pending && ag.pending.line === line && m.keep ? { template: ag.pending.template, after: ag.pending.after } : null;
  got ??= changeSaid(await sayOf(a)(changePrompt(template, line, last.text)));
  if (!got) return { ok: false, why: "Sol could not rehearse it now; try again in a moment" };
  if (!m.keep) {
    ag.pending = { line, template: got.template, before: last.text, after: got.after };
    saveAgents(home, f);
    return { ok: true, before: last.text, after: got.after, template: got.template };
  }
  const old = snapshot(ag), lines = linesOf(home, ag.places ?? []);
  delete old.pending;
  ag.template = got.template;
  ag.job = got.template.replace(/<place>/g, `each ${ag.parameter ?? "place"}`);
  delete ag.pending;
  for (const r of ag.places ?? []) {
    if (r.trigger.kind === "own") {
      // the person's own rule: the new job with this place's name, its own times kept in order
      const mine = timesIn(lineOf(home, r.folder, r.rule) ?? r.base ?? "");
      let i = 0;
      r.base = jobFor(got.template, r.name).replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, (t) => mine[i++] ?? t);
      rewritePlace(home, ag, r, false, r.base);
    } else rewritePlace(home, ag, r);
  }
  const c = changeLine(f, { at, kind: "changed", agent: ag.id, rules: ag.rules, line: `${ag.name}: ${line}.`, undo: { restore: { agent: old, lines } } });
  saveAgents(home, f);
  return { ok: true, before: last.text, after: got.after, change: c };
}

// ---------------------------------------------------------------- scope

/** agents.scope: add a place (its first run at drafts at most) or take one out (its rule off, its work kept) */
export function scope(a: Host, m: { id: string; add?: string; remove?: string }) {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const f = ensure(a), ag = find(f, m.id);
  if (!ag) return no(m.id);
  if (m.add) {
    if (ag.places?.some((p) => p.place === m.add)) return { ok: true, line: "it is there already" };
    const p = placesOf(home).places.find((x) => x.id === m.add);
    if (!p) return { ok: false, why: `no place ${m.add}` };
    const ref = joinPlace(home, ag, p, at, neverRead(home, p, ag.sources ?? []));
    ag.out = (ag.out ?? []).filter((x) => x !== p.id);
    const c = changeLine(f, { at, kind: "scope", agent: ag.id, rules: [{ folder: ref.folder, rule: ref.rule }], line: `${p.name} added to ${ag.name}${ref.first ? `; ${ref.first} for its first run` : ""}.`, undo: { unscope: { place: p.id } } });
    saveAgents(home, f);
    return { ok: true, place: ref, change: c };
  }
  if (m.remove) {
    const ref = ag.places?.find((p) => p.place === m.remove);
    if (!ref) return { ok: false, why: `${ag.name} does not work in ${m.remove}` };
    const line = lineOf(home, ref.folder, ref.rule) ?? "";
    a.setRule(ref.folder, ref.rule, "off");
    ag.places = ag.places!.filter((p) => p !== ref);
    ag.rules = ag.rules.filter((r) => !(r.folder === ref.folder && r.rule === ref.rule));
    ag.out = [...new Set([...(ag.out ?? []), ref.place])];
    const c = changeLine(f, { at, kind: "scope", agent: ag.id, rules: [{ folder: ref.folder, rule: ref.rule }], line: `${ref.name} taken out of ${ag.name}; what it made there stays.`, undo: { rescope: { ref, line } } });
    saveAgents(home, f);
    return { ok: true, change: c };
  }
  return { ok: false, why: "add or remove a place" };
}

/** a place joins an agent (scope add, or a new sibling on the tick): its trigger learned from the job's traces, its
 *  first run at drafts at most (a look when Sol never read its inputs there) */
export function joinPlace(home: string, ag: Agent, p: { id: string; name: string; folder: string; sources: string[] }, at: string, never = false): PlaceRef {
  const traces = loadTraces(home).traces.filter((t) => ag.traces?.includes(t.id));
  const mine = traces.filter((t) => t.place === p.id);
  const isOwn = !!ag.places?.length && ag.places.every((r) => r.trigger.kind === "own");
  const trust = ag.reach ?? ag.places?.[0]?.trust ?? "drafts";
  const cap = never ? "looks" : capped(trust, "drafts");
  const ref0: Omit<PlaceRef, "rule"> = {
    place: p.id, name: p.name, folder: p.folder, trust, at,
    trigger: triggerFor(mine, traces, ag.sources ?? [], p.sources),
    ...(cap !== trust ? { first: cap } : {}),
    ...(isOwn ? { base: jobFor(ag.template ?? ag.job, p.name) } : {}),
  };
  const ownSource = isOwn ? /\]\s+([a-z][a-z0-9-]*)\s*:/i.exec(lineOf(home, ag.places![0].folder, ag.places![0].rule) ?? "")?.[1] : undefined;
  const w = writePlace(home, ag, isOwn ? { ...ref0, trigger: { kind: "own" } } : ref0, ownSource);
  const ref: PlaceRef = { ...(isOwn ? { ...ref0, trigger: { kind: "own" as const } } : ref0), rule: w.rule };
  ag.places = [...(ag.places ?? []), ref];
  ag.rules.push({ folder: ref.folder, rule: ref.rule });
  return ref;
}
