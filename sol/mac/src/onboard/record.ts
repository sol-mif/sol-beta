// The person's record (#1088): one file every mode reads, written by the one onboarding and continued by each mode's first
// visit. It lives in the person's own home, `~/.sol/record/me.json`, read and written through the engine's work wire
// (work.read / work.write, cwd "~"). Its parts:
//   name, said (their sentences), off (what they put off-limits), hands (how hands-on: record | show | draft | do)
//   machine.screens   [{ id, w, h, scale, main, x, y }]  the screens, as the window sees them (screens.ts); the stage's
//                     two-screen work reads this name. A copy sits in this window's storage under `sol.record.machine.screens`
//                     for a reader that has no engine.
//   machine.apps      [{ name, open }]  ·  ai [{ name, signed, reach? }]  ·  connectors [{ name, via, src }]: what is
//                     connected and through what (claude account | claude code | codex | gh | gog), so Home's tools take
//                     the same way later (#1217)
//   areas             the folders formed: [{ id, name, part, facts: [fact ids] }]   facts: every Found, with `st` and `area`
//   confirmed         { [confirm id]: "yes" | "no" }   built: when "this is my Home" was pressed
//   unchecked         the folders made and not yet checked once (checked.ts): Home opens the check on them, or rings them
//   later             of those, the ones put off with "check later": ringed, never asked again in the card
//   visits            { build?: { at, kept? }, cowork?: { at } }  a later mode's first visit, continued here
//   consent           what the person allowed, one record every surface writes and reads (consent.ts, #1216): the
//                     answer and when, the stops left out, the off-limits, the level per folder, the machine's
//                     permissions, the Beta tap. The engine reads its levels and refuses past them (engine consent.ts)
// Each folder formed also gets `<sol home>/<area id>/ground.json` in the folder's own shape (home/folders/ground.ts), so
// a folder opens already set up: the folder walks become the confirms that were left.
import type { Area, Confirm, Found, Part, Sorted } from "./sort";
import type { Screen } from "./screens";
import { STICKY_RULE } from "../home/folders/stickies.ts";
import { pieceFrom, type Ground } from "../home/folders/ground.ts";
import { joinMachine, levelOf, type Consent } from "./consent.ts";
import type { Setup } from "./setup.ts";

type Ask = <T>(o: object, ms: number) => Promise<T | null>;
export type Hands = "record" | "show" | "draft" | "do";
export type St = "read" | "said" | "confirmed" | "unsure" | "no";
export type Fact = Found & { st: St; area: string };
export type Record = {
  v: 1; made: string; name: string; said: string; off: string[]; hands: Hands;
  machine: { screens: Screen[]; apps: { name: string; open: boolean }[] };
  ai: { name: string; signed: boolean; reach?: "export" }[];
  connectors: { name: string; via: string; src?: string }[];   // via: "claude account" | "claude code" | "codex" | "gh" | "gog"
  areas: { id: string; name: string; part: Part; facts: string[]; said?: string }[]; facts: Fact[];
  confirmed: Record_<string, "yes" | "no">; asks?: Confirm[]; built?: string; skipped?: string[];
  into?: Record_<string, string>;   // a guessed folder answered "put it in <area>": its id → that area (a "no" in confirmed)
  visits: { build?: { at: string; kept?: string | null }; cowork?: { at: string; team?: string } };
  solHome?: string | null; routines?: string[];
  refused?: string[];   // the sources the computer said no to (a subset of skipped): their glyph is a door to allow
  first?: string;
  madeDirs?: string[];   // the folders the onboarding made under Sol's home: never made again if the person deletes one
  readBy?: "ai";   // the parts and the off-limits were read by the person's own Claude (#1195), not by the rules: looking again keeps them
  consent?: Consent;   // what the person allowed (consent.ts)
  setup?: Setup;   // their own AI setup beside Jelly's (setup.ts, #1423): the rows read, each disagreement's choice, how far Jelly may change their files
  unchecked?: string[];   // the folders made and not yet checked once (checked.ts, #1423): the hand-over and "+" add, the check and opening remove
  later?: string[];       // of those, the ones put off with "check later": ringed in Home, never asked again in the card
  fillDirs?: string[];   // folders made whose two files are not written yet (the write did not answer): filled on the next landing   // the one routine Home arrives with a ▶ for (picked at the hand-over; cleared once it has run)
};
type Record_<K extends string, V> = { [k in K]: V };

export const DIR = ".sol/record", FILE = `${DIR}/me.json`;
export const SCREENS_KEY = "sol.record.machine.screens";
export { DONE_KEY } from "./which.ts";   // the one rule for which Home (which.ts) owns it

export const empty = (): Record => ({ v: 1, made: new Date().toISOString(), name: "", said: "", off: [], hands: "show",
  machine: { screens: [], apps: [] }, ai: [], connectors: [], areas: [], facts: [], confirmed: {}, visits: {} });

/** what a read answered, in three: the text (an empty file is ""), "missing" (the engine said the file is not there),
 *  or "unknown" (a timeout, a dropped link, too big, binary, any other error). On "unknown" nothing may be written:
 *  the file may hold what the person made. */
export type Answer = { text: string } | "missing" | "unknown";
export const answerOf = (r: { text?: string; error?: string } | null | undefined): Answer =>
  typeof r?.text === "string" && !r.error ? { text: r.text } : groundMissing(r) ? "missing" : "unknown";
export type Got = { rec: Record } | { missing: true } | { unknown: string };
/** the record from a read: a record, missing, or unknown (no answer, or a file that will not parse) */
export function recordFrom(r: { text?: string; error?: string } | null | undefined): Got {
  const a = answerOf(r);
  if (a === "missing") return { missing: true };
  if (a === "unknown") return { unknown: "I could not read your record just now" };
  try { const j = JSON.parse(a.text); if (!j || typeof j !== "object" || Array.isArray(j)) throw 0; return { rec: { ...empty(), ...j } as Record }; }
  catch { return { unknown: "your record would not read as one" }; }
}
export async function readRecordAt(ask: Ask): Promise<Got> {
  return recordFrom(await ask<{ text?: string; error?: string }>({ type: "work.read", cwd: "~", path: FILE }, 8000));
}
export async function readRecord(ask: Ask): Promise<Record | null> {
  const g = await readRecordAt(ask);
  return "rec" in g ? g.rec : null;
}
export async function writeRecord(ask: Ask, rec: Record): Promise<boolean> {
  try { localStorage.setItem(SCREENS_KEY, JSON.stringify(rec.machine.screens)); } catch { /* private */ }
  const r = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: FILE, text: JSON.stringify(rec, null, 2) + "\n" }, 8000);
  return !!r?.ok;
}

/** the record from what was said, found and sorted */
export function recordOf(name: string, said: string, found: Found[], s: Sorted, screens: Screen[], skipped: string[]): Record {
  const unsure = new Set(s.confirms.map((c) => c.fact).filter(Boolean));
  const facts: Fact[] = found.map((f) => ({ ...f, area: s.place[f.id] ?? "you", st: unsure.has(f.id) ? "unsure" : "read" }));
  const of = (k: Found["kind"]) => found.filter((f) => f.kind === k);
  return { ...empty(), name, said, off: s.off, skipped,
    machine: { screens, apps: of("machine").map((f) => ({ name: f.v, open: !!f.open })) },
    ai: of("ai").map((f) => ({ name: f.v, signed: !f.reach && f.signed !== false, ...(f.reach ? { reach: f.reach } : {}) })),
    // what is connected and through what (#1217): the way Home's tools use later, never a browser when a connector exists
    connectors: of("tool").map((f) => ({ name: f.v, via: f.via ?? f.src, src: f.src })),
    areas: s.areas.map((a: Area) => ({ id: a.id, name: a.name, part: a.part, facts: a.facts, said: a.said })), facts };
}

/** a folder's ground.json (home/folders/ground.ts's shape): its facts and a piece for each, with where each was read.
 *  The level is not copied here: it is the consent's alone (consent.ts levelOf), read by the engine at each turn (#1227) */
export function groundOf(rec: Record, a: Record["areas"][number]): Ground {
  const at = new Date().toISOString();
  const facts: Ground["facts"] = rec.facts.filter((f) => f.area === a.id).map((f) => ({ id: f.id, step: 0, k: f.k, v: f.when ? `${f.v}, ${f.when}` : f.v,
    st: f.st === "unsure" ? "question" : f.st === "confirmed" ? "confirmed" : "read", src: f.src, at }));
  // #1223: a folder never lands empty. Every thing the reader found for it is a piece, with where it was read (its
  // proof) and through what; one the person said no to is not here. What the person confirmed is kept; the rest waits
  // for their keep or "not here" in Home, answered in place into this file (#1227, ground.ts answerIn).
  const mine = rec.facts.filter((f) => f.area === a.id && f.st !== "no");
  const pieces = mine.map((f) => pieceFrom(f, f.st === "confirmed" || f.st === "said" ? true : null));
  // the ways in this folder's things came (a connector, a tool's session list), named once each
  const vias = [...new Set(mine.map((f) => f.via).filter((v): v is string => !!v))];
  const connectors = vias.map((v) => ({ id: v.toLowerCase().replace(/[^a-z0-9]+/g, "-"), nm: v, why: "what this folder's things were read through" }));
  return { v: 1, folder: a.id, name: a.name, facts, connectors, pieces, may: { said: rec.said, src: "the one onboarding" }, struck: [],
    ledger: [{ at, by: "the one onboarding", what: `${facts.length} facts and ${pieces.length} pieces from the first look` }] };
}

/** a folder's ground.json may be written only when the engine answered that it is not there; a file there, or no
 *  answer at all (a timeout, a dropped link), leaves it alone */
export const groundMissing = (r: { text?: string; error?: string } | null | undefined) => !!r && !r.text && /ENOENT|no such file|not there/i.test(r.error ?? "");

/** a folder made by the one onboarding is a folder agent from its first second: its policy.md names it, says what it may
 *  do (from the level) and where it may look, and holds the stickies rule, so a sticky's ▶ in Home has someone to run
 *  it. The engine's rungs are read · propose · draft: "just do it" stays at draft here until the person raises it. */
/** the engine's rung for a level: read · propose · draft ("just do it" stays at draft until the person raises it there) */
export const rungOf = (h: Hands) => (h === "record" ? "read" : h === "draft" || h === "do" ? "draft" : "propose");
/** what the person typed, on one line: a newline and "- [do] …" in a sentence never becomes a rule in policy.md */
const oneLine = (t: string) => t.replace(/\s*[\r\n]+\s*/g, " ").trim();
export function policyOf(rec: Record, a: Record["areas"][number]): string {
  const rung = rungOf(levelOf(rec, a.id));
  const what = { read: "look and write down what I would do; open and send nothing", propose: "do the work up to the send; I press", draft: "draft mail and posts; sending is mine" }[rung];
  const where = rec.facts.filter((f) => f.area === a.id && (f.kind === "place" || f.kind === "file")).map((f) => oneLine(f.v)).slice(0, 8).join(", ") || "this folder";
  return `# ${a.name}\n\nMade by the one onboarding from what ${rec.name ? rec.name.split(" ")[0] : "the person"} said: "${oneLine(a.said ?? rec.said)}".\n\nWhat it may do: ${what}.\nWhere it may look: ${where}.\nNever: ${oneLine(rec.off.join(", ")) || "nothing said"}.\n\n${STICKY_RULE.replace("- [watch] stickies:", `- [watch, ${rung}] stickies:`).replace("Marco ticks it done himself", `${rec.name ? rec.name.split(" ")[0] : "the person"} ticks it done`)}\n`;
}

const RUNGS: Hands[] = ["record", "show", "draft", "do"];
/** of two levels, the more careful one */
export const lower = (a: Hands, b: Hands): Hands => (RUNGS.indexOf(a) <= RUNGS.indexOf(b) ? a : b);

/** a run over an earlier record (show it again, look again): what the person did since is kept. Answers and visits
 *  are joined (the earlier answer stands unless answered again), parts made with "+" stay, routines stay, the level
 *  is the one moved in this run, or else the more careful of the two */
export function mergeRecords(old: Record | null, next: Record, levelMoved: boolean): Record {
  if (!old?.built) return next;
  const ids = new Set(next.areas.map((a) => a.id));
  const keptAreas = old.areas.filter((a) => !ids.has(a.id));
  const keptFacts = old.facts.filter((f) => keptAreas.some((a) => a.id === f.area) && !next.facts.some((x) => x.id === f.id));
  return { ...next, areas: [...next.areas, ...keptAreas], facts: [...next.facts, ...keptFacts],
    confirmed: { ...old.confirmed, ...next.confirmed }, into: { ...(old.into ?? {}), ...(next.into ?? {}) }, visits: { ...old.visits, ...next.visits },
    hands: levelMoved ? next.hands : lower(old.hands, next.hands), routines: [...new Set([...(old.routines ?? []), ...(next.routines ?? [])])], solHome: next.solHome ?? old.solHome,
    // the folder lists are the disk's history: carried, so a folder waiting to be filled is still waiting after a run
    madeDirs: [...new Set([...(old.madeDirs ?? []), ...(next.madeDirs ?? [])])], fillDirs: [...new Set([...(old.fillDirs ?? []), ...(next.fillDirs ?? [])])],
    unchecked: [...new Set([...(old.unchecked ?? []), ...(next.unchecked ?? [])])], later: [...new Set([...(old.later ?? []), ...(next.later ?? [])])],
    // what the person allowed: this run's, with what another surface saw since (the machine, the Beta tap) kept
    // their setup's choices: a choice pressed before is kept over this run's "later" (looking again asks nothing)
    setup: next.setup ? { ...next.setup, choices: Object.fromEntries(Object.entries(next.setup.choices).map(([id, c]) => [id, c === "later" ? old.setup?.choices[id] ?? c : c])) } : old.setup,
    consent: next.consent ? { ...next.consent, machine: joinMachine(old.consent?.machine ?? {}, next.consent.machine), beta: next.consent.beta ?? old.consent?.beta ?? null } : old.consent };
}

/** the stickies rule's line in a policy.md, at a rung (pure): the line "- [watch, <rung>] stickies: …" with its rung set;
 *  null when the file has no such line (not a folder the onboarding made: left alone) or it is already at that rung */
export function withRung(text: string, rung: string): string | null {
  // only a policy.md the onboarding made, and only its line with an explicit rung: Home's own "[watch] stickies:" (read)
  // and every folder of the person's own are left as they are
  if (!text.includes("Made by the one onboarding")) return null;
  // any mode the person set since (agent.rule may have made it [do, draft]): the mode is kept, only the rung moves
  const lines = text.split("\n"), at = lines.findIndex((l) => /^\s*[-*]\s+\[[a-z]+\s*,\s*[a-z]+\]\s+stickies\s*:/i.test(l));
  if (at < 0) return null;
  const next = lines[at].replace(/\[([a-z]+)\s*,\s*[a-z]+\]/i, `[$1, ${rung}]`);
  if (next === lines[at]) return null;
  lines[at] = next;
  return lines.join("\n");
}
type Raw = { text?: string; hash?: string; error?: string } | null;
/** a file changed with the hash it was read with; a write over a file changed since is read again (three tries) */
export async function changeFile(ask: Ask, cwd: string, path: string, change: (text: string | null) => string | null): Promise<"ok" | "same" | "unknown"> {
  for (let i = 0; i < 3; i++) {
    const r = await ask<Raw>({ type: "work.read", cwd, path }, 6000), a = answerOf(r);
    if (a === "unknown") return "unknown";
    const text = change(a === "missing" ? null : a.text);
    if (text === null) return "same";
    const w = await ask<{ ok?: boolean; changed?: boolean }>({ type: "work.write", cwd, path, text, ...(r?.hash ? { hash: r.hash } : {}) }, 8000);
    if (w?.ok) return "ok";
    if (!w?.changed) return "unknown";
  }
  return "unknown";
}
/** the folder agent's rung follows the level: only the stickies line's rung is rewritten, nothing else in policy.md */
export const setRung = (ask: Ask, folder: string, h: Hands) => changeFile(ask, folder, "policy.md", (t) => (t === null ? null : withRung(t, rungOf(h))));
/** the record changed on disk: read as it is now, the change applied, written with the hash read (a change made since,
 *  by another screen or a mode's first visit, is read again and kept). null: not written (the read did not answer) */
export async function changeRecord(ask: Ask, change: (r: Record) => Record): Promise<Record | null> {
  let out: Record | null = null;
  const r = await changeFile(ask, "~", FILE, (t) => {
    if (t === null) return null;
    const g = recordFrom({ text: t });
    if (!("rec" in g)) return null;
    out = change(g.rec);
    return JSON.stringify(out, null, 2) + "\n";
  });
  if (r !== "ok" || !out) return null;
  try { localStorage.setItem(SCREENS_KEY, JSON.stringify((out as Record).machine.screens)); } catch { /* private */ }
  return out;
}

/** every folder's ground.json and policy.md: written only where the engine said missing (the rung follows the level
 *  only on a press of the level, setRung); `held` names the folders whose read did not answer (nothing written there): the
 *  person is told in one line */
/** which of the record's folders a landing may make: those not there now (the engine said missing), and never one the
 *  onboarding made before (a folder the person deleted stays deleted). Asked BEFORE any folder is made */
export async function newFolders(ask: Ask, rec: Record, solHome: string | null, held?: Set<string>): Promise<string[]> {
  if (!solHome) return [];
  const ids = rec.areas.map((a) => a.id).filter((id) => !(rec.madeDirs ?? []).includes(id));
  const there = await Promise.all(ids.map((id) => ask<{ text?: string; error?: string }>({ type: "work.read", cwd: solHome, path: id }, 6000)));
  // a read that did not answer is neither made nor forgotten: the folder is named to the person (held)
  // (a folder's listing is an answer: it is there)
  const listed = (i: number) => Array.isArray((there[i] as { entries?: unknown } | null)?.entries);
  ids.forEach((id, i) => { if (answerOf(there[i]) === "unknown" && !listed(i)) held?.add(rec.areas.find((a) => a.id === id)?.name ?? id); });
  // missing: new. There, but made by an earlier landing whose files did not answer (fillDirs): filled now, only where missing
  return ids.filter((id, i) => answerOf(there[i]) === "missing" || (listed(i) && (rec.fillDirs ?? []).includes(id)));
}
/** ground.json and policy.md, written only into the folders this landing made (`made`, from newFolders) and only where
 *  the engine said missing: a folder of the person's own, empty or not, is never written into. `held` names the folders
 *  whose read did not answer: the person is told in one line */
export async function landFolders(ask: Ask, rec: Record, solHome: string | null, made: string[]): Promise<{ held: string[] }> {
  const held = new Set<string>();
  // each folder's two files side by side (a folder's own two in order)
  if (solHome) await Promise.all(rec.areas.filter((x) => made.includes(x.id)).map(async (a) => {
    for (const [path, text] of [["ground.json", () => JSON.stringify(groundOf(rec, a), null, 2) + "\n"], ["policy.md", () => policyOf(rec, a)]] as const) {
      const r = await changeFile(ask, solHome, `${a.id}/${path}`, (t) => (t === null ? text() : null));
      if (r === "unknown") held.add(a.name);   // no answer (a timeout, the engine restarting): never written over
    }
  }));
  return { held: [...held] };
}
/** the record's folder lists after a landing: `done` is made and filled (madeDirs), the rest of `made` waits (fillDirs) */
export const afterLanding = (r: Record, made: string[], done: string[]): Record => ({ ...r,
  madeDirs: [...new Set([...(r.madeDirs ?? []), ...done])],
  fillDirs: [...new Set([...(r.fillDirs ?? []), ...made])].filter((id) => !done.includes(id)) });
/** write the record and every folder's files */
export async function landAll(ask: Ask, rec: Record, solHome: string | null, made: string[]): Promise<{ ok: boolean; held: string[] }> {
  const ok = await writeRecord(ask, rec);
  return { ok, ...(await landFolders(ask, rec, solHome, made)) };
}
export const HELD_KEY = "sol.onboard.held";
/** what a later look ("look again") brought: the record's fact ids, marked in Home until their folder is opened */
export const FRESH_KEY = "sol.onboard.fresh";
/** one found thing across runs: the explorer numbers its facts afresh each run, so a fact is known by what it is */
export const keyOf = (f: { kind: string; k: string; v: string; src: string }) => `${f.kind}|${f.k}|${f.v}|${f.src}`;
/** "since Friday", "since earlier today": the day the record was last made */
export const since = (iso?: string | null) => { if (!iso) return "last time"; const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? "earlier today" : d.toLocaleDateString("en-US", { weekday: "long" }); };

/** one at a time, the last asked only: a level dragged up and back writes once per settle, in order, ending on the last
 *  value (never two writes racing, never an earlier value landing after a later one) */
export function lastOnly<T>(run: (v: T) => Promise<unknown>): (v: T) => Promise<void> {
  let want: { v: T } | null = null, busy: Promise<void> | null = null;
  return (v: T) => {
    want = { v };
    if (!busy) busy = (async () => { while (want) { const w = want; want = null; try { await run(w.v); } catch { /* the next one still runs */ } } busy = null; })();
    return busy;
  };
}
/** the level, for the whole window: Home and a mode's first-visit card share one queue, so the two never race */
const levelQ = lastOnly((f: () => Promise<unknown>) => f());
export const oneLevelAtATime = (f: () => Promise<unknown>) => levelQ(f);
