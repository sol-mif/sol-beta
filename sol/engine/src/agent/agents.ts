// Agents (#1327): fixed, dedicated agents, each one a job that repeats, its place the job's variable part (one agent per
// job, never one per instance). The rules stay in each place's policy.md and the engine still runs rules (index.ts);
// this file groups them, names them, reads how each group stands, and keeps what Sol changed. Everything here is
// computed from what is already on disk, except <HOME>/agents.json (never committed):
//   { v: 1, agents: [{ id, name, job, turn, part, rules: [{folder, rule}], born: {how, at},
//                      template?, parameter?, kinds?, places?: [{place, name, folder, rule, trust, first?, trigger, base?}],
//                      seen?, out?, learned?, fixes?, reach?, traces?, pending? }],
//     held: [{ folder, rule, why, site?, since, until }], changes: [{ id, at, kind, agent, line, rules?, undo, undone }],
//     offers: [Offer], never: [{ words, sources, kind }], fired: ["<agent>|<place>|<date>"],
//     joins: [Join], apart: ["<folder>#<rule>|<folder>#<rule>"], looked?: "<key of the rule set>" }
//
//   group(rules, ask)      the grouping, when agents.json is missing: every rule (but the stickies helper, which does
//                          whatever a sticky asks) by the same-job test with the place masked (meta/jobs.ts), one agent
//                          per job across places. Blind: no source, folder or word decides a job by its name.
//                          Two rules in places of one kind that Jev puts in the half band (0.45–0.7) are not merged
//                          and not dropped: they are one open join ask (`asks`, kept as `joins`; meta/join.ts answers
//                          it: together · apart). Jev null and pairs across kinds are never asked.
//                          Inside one place the same (meta/chains.ts, 2026-11-17): a rule code left alone whose best
//                          partner Jev's feeds puts in the half band is a join ask `inPlace`, "One agent for these two
//                          steps?"; Jev null, one Sol turn (Host.d.say) asks feeds of all those pairs at once and each
//                          yes is the same ask (p null); the first time, the floor says once that Jev would ask fewer
//                          (`jevNote`, agents.noted). No turn either: code's links only.
//   the late look          agents.json already there (the keeper or a wire message wrote it first): agents.list with Jev
//                          looks once per rule set (`looked`, a key of the rules' ids and texts) for half-band pairs
//                          and asks each; it never regroups, never re-asks `apart` or a pair in `joins`. Once
//                          agents.json exists Sol never rearranges agents by itself (#1381): a ≥0.7 pair is asked too.
//                          Jev null: nothing is recorded as looked, and inside each place the person's own model is
//                          asked once per rule set (`saidOn`) about the pairs of steps; each yes an ask, never a join.
//   listNow(a, ask)        agents.list's answer. agents.json there: at once from the file, the late look started in
//                          the background when the rule set is new (one per home at a time, a second list joins it;
//                          `looking: true` while it runs; lookInFlight(a) to await it). When it ends, agents.changed
//                          is pushed (its save, then once more) and the face reads the list again. agents.json
//                          missing: the answer at once too, `looking: true` and no agents, the first grouping started
//                          in the background through the same one-per-home flight (a second list joins it,
//                          lookInFlight(a) awaits it); its save pushes agents.changed. While it runs ensure() (a wire
//                          message, the keeper) groups by code without writing, so the first grouping is the one
//                          kept (a file a person's own action wrote meanwhile is kept instead). It failing outright:
//                          the code grouping is written, so a person is never left looking.
//   stateOf(...)           working · needs · stuck · resting · off, from tickets and the ledger (pure)
//   week(...)              seven days of runs, made, blocked (pure)
//   keep(a)                the keeper, on the engine's 60 s tick: a rule stuck at the same sign-in 3 runs in a row is
//                          held until that site is signed in; a clock or people rule whose last 7 days of runs made
//                          nothing rests 7 days. Each is one change line with undo. Never by itself: a mode raised, an
//                          account added, a file deleted, an agent made. (Joining, first runs and dates: meta/keeper.ts)
//   heldNow(home)          what the clock skips (index.ts tick); policy.md is never changed for it
// The meta (pass 2, the design "The meta (designed blind)", 2026-11-16) is in meta/: traces, kinds, the same-job test,
// the gate and the offer, triggers and trust, learning and scope.
//
// The keeper acts only once agents.json exists: the first agents.list (the Agents view opened) makes it. Until then
// nothing here changes how a rule runs.
//
// Agents are a functional use of the current jelly creature (Marco): `turn` 0–5 is where the one jelly's six bands
// start, so each agent has its own face.
import { existsSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, relative } from "node:path";
import type { LedgerLine, Mode, Rule, Ticket } from "./harness.js";
import { readLedger, readPolicy, readTickets } from "./store.js";
import { classDaysOf, whenOf } from "./sources/clock.js";
import { SITES, nameOf, type Site } from "./sites.js";
import type { Agents } from "./index.js";
import { coreOf, groupRules, groupRulesByCode, maskOf, pairKey, stepsOfRule, type HalfPair, type RuleGroup, type RuleIn } from "./meta/jobs.js";
import { chainsByCode, chainsOf, stepAsksLate, type StepPair } from "./meta/chains.js";
import { namesOf as namesByCode } from "./meta/names.js";
import { roleOf, stepsOf } from "./meta/day.js";
import { createHash } from "node:crypto";
import { track } from "../track.js";
import { kindsOf } from "./meta/kinds.js";
import { placesOf } from "./meta/places.js";
import type { Ask } from "./meta/jev.js";
import { IDLE_DAYS, LOOK_AGAIN_MS, OWN_PER_DAY, STUCK_RUNS } from "./meta/numbers.js";
import { cappedSay, ownPerDay } from "./meta/own.js";
import { asksOf, shelvesOf, type WorkIn } from "./meta/asks.js";
import { datesOf, nextFire, type Trigger, type Trust } from "./meta/when.js";
import type { Made } from "./meta/traces.js";
import { nameOfFolder } from "./meta/places.js";
import { lineOf, removeLine, restoreLine } from "./meta/policy.js";
import { GROUPING, keepAsIs, regroupDue, regroupFile, regroupOf, shapedOf, unregroup, type Regroup, type Was } from "./meta/regroup.js";

export type RuleRef = { folder: string; rule: string };
export type Born = { how: "grouped" | "offer" | "home" | "typed"; at: string };
/** one place an agent works in: its rule there, how far it goes there, its own trigger. `first`: its first run is
 *  capped (a new sibling at drafts, a source never read at looks), lifted by the keeper once it has run. `base`: the
 *  person's own sentence (a grouped rule), kept as written, learned lines added after it */
export type PlaceRef = { place: string; name: string; folder: string; rule: string; trust: Trust; first?: Trust; trigger: Trigger | { kind: "own" }; base?: string; at: string };
export type Learned = { id: string; line: string; place: string | null; at: string; fixes: string[] };
export type Fix = { id: string; place: string; before: string; after: string; at: string; answer?: "always" | "once" };
export type Agent = {
  id: string; name: string; job: string; turn: number; part: string; rules: RuleRef[]; born: Born;
  /** the job with "<place>" where the place goes */
  template?: string; parameter?: string; kinds?: string[]; places?: PlaceRef[];
  /** the places the offer listed (unchecked ones with why), and the ones the person took out: neither joins by itself */
  seen?: { place: string; why?: string }[]; out?: string[];
  learned?: Learned[]; fixes?: Fix[]; reach?: Trust; traces?: string[]; sources?: string[]; made?: Made;
  pending?: { line: string; template: string; before: string; after: string };
};
export type OfferPlace = { place: string; name: string; checked: boolean; why?: string; ask?: true };
export type Offer = {
  id: string; state: "open" | "later" | "never" | "kept"; showMe?: true; at: string;
  name: string; job: string; steps: string[]; parameter: string; kind: string | null; kindId: string | null;
  places: OfferPlace[]; reach: Trust; sources: string[]; made: Made; traces: string[]; count: number; laterAt?: number; agent?: string;
};
export type Never = { words: string; sources: string[]; kind: string };
/** a join ask: two rules in places of one kind that Jev scored in the half band. "One agent for both places?" with both
 *  rules' steps side by side (each sentence's clauses, its place masked), each place's name. Answered together (one
 *  agent) or apart (two, and the pair never asked again). `inPlace`: two rules of one place, "One agent for these two
 *  steps?" (together: one agent doing both, a chain). `p` null: no score, the person's own model said yes (Jev null) */
export type Join = { id: string; state: "open" | "together" | "apart"; at: string; rules: RuleRef[]; places: string[]; names: string[]; p: number | null; steps: string[][]; agent?: string; inPlace?: true };
/** what group() returns for a join ask (a script can print it) */
export type JoinAsk = Pick<Join, "id" | "rules" | "places" | "names" | "p" | "steps" | "inPlace">;
export type Held = { folder: string; rule: string; why: "stuck" | "idle" | "asked"; site?: string; since: string; until: string };
export type ChangeKind = "made" | "merged" | "held" | "rested" | "woke" | "mode" | "renamed" | "kept" | "joined" | "scope" | "learned" | "changed" | "trust" | "offer" | "apart" | "regrouped";
export type Undo =
  | { unhold: RuleRef[] }
  | { hold: Held[] }
  | { modes: (RuleRef & { mode: Mode })[] }
  | { name: string }
  | { unmake: { folder: string; line: string } }
  /** a kept offer: its appended lines out, the agent gone, the offer open again */
  | { unkeep: { offer: string; lines: { folder: string; line: string }[] } }
  /** a place that joined or was added: its rule off and the place out */
  | { unscope: { place: string } }
  /** a place taken out: back in, its rule's line as it was */
  | { rescope: { ref: PlaceRef; line: string } }
  /** a learned line or a kept change: the agent's fields and each rule's line as they were */
  | { restore: { agent: Agent; lines: { folder: string; rule: string; line: string }[] } }
  /** an offer answered "not now" or "never": open again (and the never line gone) */
  | { offer: { id: string; state: "open"; never?: string } }
  /** a join answered together: the two agents as they were (at their places in the list), the ask open again */
  | { unjoin: { join: string; agents: { agent: Agent; at: number }[] } }
  /** a join answered apart: the ask open again, the pair askable again */
  | { reask: { join: string } }
  /** Regroup answered (an older file's agents as they were) or Keep as is (null): the ask open again (meta/regroup.ts) */
  | { regroup: { was: Was } };
/** why Sol changed something by itself, so the face shows one line and one undo per cause (rule 6): a sign-in that
 *  stopped runs, runs that made nothing, a sign-in that got through, a first run lifted, a place that joined */
export type Cause = "sign-in" | "idle" | "through" | "first-run" | "joined";
export type Change = { id: string; at: string; kind: ChangeKind; agent: string; line: string; rules?: RuleRef[]; undo: Undo | null; undone: boolean; undoneAt?: string; cause?: Cause };
/** `routines`: one rule in one place, no agent (rule 3), still kept by the keeper. `met`: when the person first saw
 *  the floor (agents.meet); until then the keeper only holds at a sign-in. `jevNote`: the person's own model asked
 *  in Jev's place (when), and when the floor's one line about it was read (agents.noted): it is said once. `saidOn`:
 *  the rule set whose pairs of steps the person's own model was asked about in the late look (Jev null): once each.
 *  `grouping`: the version of the grouping that made the agents; `regroup`: an older one's regrouping, asked once */
export type AgentsFile = { v: 1; agents: Agent[]; held: Held[]; changes: Change[]; offers: Offer[]; never: Never[]; fired: string[]; joins: Join[]; apart: string[]; looked?: string; saidOn?: string; routines?: RuleRef[]; met?: string; jevNote?: { at: string; seen?: string }; grouping?: number; regroup?: Regroup };
export type State = "working" | "needs" | "stuck" | "resting" | "off";

/** the one rule that is no job: it does whatever the sticky pressed asks (Home's STICKY_RULE), so it stays a folder rule */
export const HELPER = "stickies";
/** sources that look at something (a site, a folder): a look that sees nothing new is doing its job, never rested */
const WATCHERS = new Set(["blackboard", "mail", "teams", "gc", "folder", "stickies"]);
const KEEP_CHANGES = 200;
const DAY = 86_400_000;

// ---------------------------------------------------------------- on disk

export const agentsFile = (home: string) => join(home, "agents.json");

let notify: () => void = () => {};
/** who hears that agents.json changed (the part sets it: agents.changed to every face) */
export function onAgentsChanged(f: () => void) { notify = f; }

/** a change as written before causes and plain lines (pure): the keeper's own lines get their cause from what they
 *  say (so they group, and the first open's intro reads them), and "Name: clock-3 stopped…" says the agent, not a
 *  rule id. The person's own presses keep no cause */
const OLD_CAUSE: [ChangeKind, RegExp, Cause][] = [
  ["held", / stopped at the .+ sign-in /, "sign-in"], ["rested", / made nothing in its last /, "idle"],
  ["woke", /'s rest is over/, "idle"], ["woke", / got through, so Sol let it run again/, "through"], ["woke", /: signed in to .+, so /, "through"],
  ["trust", / ran once in /, "first-run"], ["joined", / joined .+ by itself/, "joined"],
];
export function changeRead(c: Change): Change {
  if (!c || typeof c.line !== "string") return c;
  let line = c.line;
  const m = /^(.+?): signed in to (.+?), so \S+ runs again\.$/.exec(line);
  if (m) line = `${m[1]} runs again: you signed in to ${m[2]}.`;
  for (const r of c.rules ?? []) line = line.replace(`: ${r.rule}'s `, "'s ").replace(`: ${r.rule} `, " ");
  const cause = c.cause ?? OLD_CAUSE.find(([k, re]) => k === c.kind && re.test(c.line))?.[2];
  return { ...c, line, ...(cause ? { cause } : {}) };
}
export function loadAgents(home: string): AgentsFile | null {
  try {
    const j = JSON.parse(readFileSync(agentsFile(home), "utf8"));
    if (!j || !Array.isArray(j.agents)) return null;
    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    return { v: 1, agents: j.agents, held: arr(j.held), changes: arr(j.changes).map(changeRead), offers: arr(j.offers), never: arr(j.never), fired: arr(j.fired).slice(-500), joins: arr(j.joins), apart: arr(j.apart), ...(typeof j.looked === "string" ? { looked: j.looked } : {}), ...(typeof j.saidOn === "string" ? { saidOn: j.saidOn } : {}), ...(Array.isArray(j.routines) ? { routines: j.routines } : {}), ...(typeof j.met === "string" ? { met: j.met } : {}), ...(j.jevNote && typeof j.jevNote.at === "string" ? { jevNote: j.jevNote } : {}), ...(typeof j.grouping === "number" ? { grouping: j.grouping } : {}), ...(j.regroup && Array.isArray(j.regroup.agents) ? { regroup: j.regroup } : {}) };
  } catch { return null; }
}
/** agents.json written, and the faces told, only when what is stored really changed (#1429: a save of the same file
 *  told every face, which read the list and offers again, which saved again) */
export function saveAgents(home: string, f: AgentsFile) {
  const file = agentsFile(home), tmp = `${file}.${process.pid}.tmp`;
  const text = JSON.stringify({ ...f, changes: f.changes.slice(-KEEP_CHANGES) }, null, 2) + "\n";
  try { if (readFileSync(file, "utf8") === text) return; } catch { /* not there yet */ }
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  notify();
}

// ---------------------------------------------------------------- the grouping (when agents.json is missing)

export type FolderRules = { folder: string; rules: Rule[] };

export const partOf = (folder: string) => folder.split("/")[0] || folder;
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent";
/** the words a folder is known by: its name and each part of its path (masked out of its rules' sentences) */
export const namesOf = (folder: string) => [nameOfFolder(folder), ...folder.split("/").flatMap((x) => [x, x.replace(/[-_]+/g, " ")])];
/** the sentence with only the place's own words taken out: the template a grouped agent keeps */
export const placeMask = (sentence: string, folder: string) => {
  let s = sentence;
  for (const n of [...new Set(namesOf(folder).filter((x) => x.length > 1))].sort((a, b) => b.length - a.length)) s = s.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "<place>");
  return s;
};
const STOP = new Set(["from", "into", "to", "in", "on", "for", "and", "with", "of", "when", "where", "then", "that", "about", "at", "by"]);
const LEAD = new Set(["the", "a", "an", "each", "every", "my", "our", "your", "its", "their", "this", "new", "at", "on", "when", "night", "day", "morning", "evening", "before", "after", "last", "first", "read", "write", "make", "put", "file"]);
/** an agent's name in code, from its job (pure): the first words that say what it makes, up to a joining word; the
 *  file it makes when the words say nothing. The fallback: a Sol turn names grouped agents when one can be had */
export function nameOfJob(job: string): string {
  let t = maskOf(job, []);
  const arrow = t.indexOf("→");
  if (arrow > 0 && /^\s*(a new|when|each new|every new)\b/i.test(t)) t = t.slice(arrow + 1);
  const files = [...t.matchAll(/([\w-]+)\.[a-z0-9]{1,5}\b/gi)].map((m) => m[1]);
  const words = t.replace(/<[a-z]+>/g, " ").replace(/\S*[/.]\S*/g, " ").replace(/\b\d+\b|[;:,→()"“”–—]/g, " ").split(/\s+/).filter(Boolean);
  while (words.length && (LEAD.has(words[0].toLowerCase()) || STOP.has(words[0].toLowerCase()) || /^\d|^min$|^h$|^it$/i.test(words[0]))) words.shift();
  const out: string[] = [];
  for (const w of words) { if (out.length >= 1 && STOP.has(w.toLowerCase())) break; if (out.length >= 3) break; out.push(w); }
  const n = out.join(" ") || (files[files.length - 1] ?? "").replace(/[-_]+/g, " ");
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "An agent";
}
const trustOfRule = (r: Rule): Trust => (r.mode === "watch" || r.mode === "off" ? "looks" : r.rung === "propose" ? "asks" : r.rung === "draft" ? "drafts" : "does");
function rulesIn(folders: FolderRules[]) {
  const list = [...folders].sort((a, b) => a.folder.localeCompare(b.folder));
  const folderRules: RuleRef[] = [], rules: (RuleIn & { r: Rule })[] = [];
  for (const f of list) for (const r of f.rules) {
    if (r.source === HELPER) { folderRules.push({ folder: f.folder, rule: r.id }); continue; }
    rules.push({ place: f.folder, folder: f.folder, rule: r.id, sentence: r.sentence, source: r.source, names: namesOf(f.folder), r });
  }
  return { rules, folderRules };
}
/** a group of units is an agent when it has 2+ steps or 2+ places; one rule in one place is a routine of its folder */
export const isRoutine = (g: RuleGroup) => g.rules.length === 1 && (g.rules[0].members?.length ?? 1) === 1;
const membersOf = (u: RuleIn) => (u.members?.length ? u.members : [u]);
function agentsOf(groups: RuleGroup[], at: string): Agent[] {
  const agents: Agent[] = [];
  const names = namesByCode(groups.map((g) => ({ units: g.rules })), (i) => nameOfJob(placeMask(groups[i].rules[0].sentence, groups[i].rules[0].folder)));
  groups.forEach((g, i) => {
    // one rule a place: the template is the job's core (the rule that says least); a rule that does extra on top keeps
    // its extras as its place's own lines, as a learned line would be (jobs.ts coreOf). A chain: each rule as written
    const chain = g.rules.some((u) => membersOf(u).length > 1);
    const { core, extras } = chain ? { core: g.rules[0], extras: [] } : coreOf(g.rules);
    const template = placeMask(core.sentence, core.folder);
    const name = names[i];
    let id = slug(name), n = 2;
    while (agents.some((a) => a.id === id)) id = `${slug(name)}-${n++}`;
    const all = g.rules.flatMap(membersOf);
    agents.push({
      id, name, job: template.replace(/<place>/g, g.rules.length > 1 ? "each place" : nameOfFolder(core.folder)), turn: i % 6, part: partOf(g.rules[0].folder),
      rules: all.map((r) => ({ folder: r.folder, rule: r.rule })), born: { how: "grouped", at }, template,
      places: all.map((r) => ({ place: r.folder, name: nameOfFolder(r.folder), folder: r.folder, rule: r.rule, trust: trustOfRule((r as RuleIn & { r: Rule }).r), trigger: { kind: "own" as const }, base: r.sentence, at })),
      ...(extras.length ? { learned: extras.map((x, k) => ({ id: `l-${slug(`${x.place} ${x.rule}`)}-${k + 1}`, line: x.line, place: x.place, at, fixes: [] })) } : {}),
    });
  });
  return agents;
}
/** a routine as an agent of its own, when a join ask's answer makes it one (pure over its rule as it stands) */
export function agentOfRoutine(ref: RuleRef, rule: Rule, at: string, turn: number): Agent {
  const r: RuleIn & { r: Rule } = { place: ref.folder, folder: ref.folder, rule: ref.rule, sentence: rule.sentence, source: rule.source, names: namesOf(ref.folder), r: rule };
  const [ag] = agentsOf([{ rules: [r], job: maskOf(r.sentence, r.names) }], at);
  return { ...ag, id: `${ag.id}-${slug(ref.folder)}`, turn };
}
/** groups into agents and routines (rule 3: an agent needs 2+ steps or 2+ places) */
function split(groups: RuleGroup[], at: string) {
  return { agents: agentsOf(groups.filter((g) => !isRoutine(g)), at), routines: groups.filter(isRoutine).map((g) => ({ folder: g.rules[0].folder, rule: g.rules[0].rule })) };
}
/** a join ask's id from its pair (pure, stable: the same pair is the same ask) */
export const joinId = (a: RuleRef, b: RuleRef) => `j-${createHash("sha1").update(pairKey(a, b)).digest("hex").slice(0, 10)}`;
/** a half-band pair as the person is asked it (pure): both rules, both places, both rules' steps with the place masked */
export function joinOf(h: Pick<HalfPair, "a" | "b" | "p">): JoinAsk {
  const two = [h.a, h.b];
  return {
    id: joinId(h.a, h.b), rules: two.map((r) => ({ folder: r.folder, rule: r.rule })), places: two.map((r) => r.place),
    names: two.map((r) => nameOfFolder(r.folder)), p: h.p, steps: two.map((r) => stepsOfRule(placeMask(r.sentence, r.folder))),
  };
}
/** two rules of one place as the person is asked them (pure): "One agent for these two steps?", the same ask */
export const stepJoinOf = (h: StepPair): JoinAsk => ({ ...joinOf({ a: h.a, b: h.b, p: 0 }), p: h.p, inPlace: true });
/** are two places members of one kind (each in, neither only asked about) */
export const oneKindIn = (kinds: { members: { place: string; ask?: true }[] }[]) => (a: string, b: string) =>
  kinds.some((k) => [a, b].every((p) => k.members.some((m) => m.place === p && !m.ask)));
export type GroupOpts = {
  /** the home's kinds, asked for only when a half-band pair turns up; none: no pair is asked */
  kinds?: () => Promise<{ members: { place: string; ask?: true }[] }[]>;
  /** pairs the person kept apart (pairKey): never asked again */
  apart?: string[];
  /** the person's own model, asked once about one place's pairs when Jev is null (meta/chains.ts); none: code's links */
  say?: Say;
};
/** the key of a rule set (pure, either order): a rule added, removed or reworded is a new key */
export function ruleSetKey(folders: FolderRules[]): string {
  const lines = rulesIn(folders).rules.map((r) => `${r.folder}#${r.rule}\t${r.sentence}`).sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 16);
}
/** existing rules into agents (one per job across places), in a stable order; `ask` Jev (null answers: code). The
 *  half band in places of one kind: `asks`, one open join ask per pair, the two rules left as two agents until answered */
export type Grouped = { agents: Agent[]; folderRules: RuleRef[]; asks: JoinAsk[]; routines: RuleRef[] };
export async function group(folders: FolderRules[], at: string, ask: Ask, o: GroupOpts = {}): Promise<Grouped> {
  const { rules, folderRules } = rulesIn(folders);
  let kinds: Awaited<ReturnType<NonNullable<GroupOpts["kinds"]>>> | null = null;
  const half: HalfPair[] = [], steps: StepPair[] = [];
  // rule 1: each place's rules into chains first (one makes what the next reads), then chains across places by job
  const units = await chainsOf(rules, ask, { asks: steps, apart: new Set(o.apart ?? []), ...(o.say ? { say: o.say } : {}) });
  const groups = await groupRules(units, ask, {
    half, apart: new Set(o.apart ?? []),
    ...(o.kinds ? { oneKind: async (a: string, b: string) => oneKindIn((kinds ??= await o.kinds!()))(a, b) } : {}),
  });
  // a join ask's side may be a routine: answered together, the two become one agent on both places (meta/join.ts)
  return { ...split(groups, at), folderRules, asks: [...steps.map(stepJoinOf), ...half.map(joinOf)] };
}
/** the same by code alone (no Jev): sync */
export function groupByCode(folders: FolderRules[], at: string): Grouped {
  const { rules, folderRules } = rulesIn(folders);
  return { ...split(groupRulesByCode(chainsByCode(rules)), at), folderRules, asks: [] };
}

// ---------------------------------------------------------------- reading the ledger (pure)

const isRun = (l: LedgerLine) => !!l.rule && l.read !== "policy.md" && !/: the sign-in( window)?$/.test(l.read);
/** the site a line stopped at, by its name in "BU mail asked for a sign-in"; null when it did not */
export function signInSite(l: LedgerLine): Site | null {
  if (!/^nothing \(blocked\)/.test(l.made)) return null;
  const m = /^(.+?) asked for a sign-in/.exec(l.read);
  if (!m) return null;
  return SITES.find((s) => nameOf(s).toLowerCase() === m[1].toLowerCase()) ?? null;
}
const lookFailed = (l: LedgerLine) => /^the look failed/.test(l.held);
export const blocked = (l: LedgerLine) => /^nothing \(blocked\)/.test(l.made) || lookFailed(l);
export const madeNothing = (l: LedgerLine) => !blocked(l) && (l.made === "nothing" || /^nothing\b/.test(l.made));
export const madeSomething = (l: LedgerLine) => !blocked(l) && !madeNothing(l);
const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** a rule's runs, newest first, from its folder's ledger (newest first) */
export const runsOf = (ledger: LedgerLine[], rule: string) => ledger.filter((l) => l.rule === rule && isRun(l));

/** stuck: of the rule's last 3 runs, the newest that is not a failed look stopped at a sign-in */
export function stuckAt(runs: LedgerLine[]): Site | null {
  for (const l of runs.slice(0, 3)) {
    if (lookFailed(l)) continue;
    return signInSite(l);
  }
  return null;
}

/** seven days ending today: runs, made, blocked per day */
export function week(lines: LedgerLine[], now: number): { day: string; runs: number; made: number; blocked: number }[] {
  const out = Array.from({ length: 7 }, (_, i) => ({ day: dayOf(now - (6 - i) * DAY), runs: 0, made: 0, blocked: 0 }));
  const at = new Map(out.map((d) => [d.day, d]));
  for (const l of lines) {
    if (!isRun(l)) continue;
    const d = at.get(dayOf(l.at));
    if (!d) continue;
    d.runs++;
    if (blocked(l)) d.blocked++; else if (madeSomething(l)) d.made++;
  }
  return out;
}

/** the next time a rule's clock fires after now (ms), or null when it names no time */
export function nextOf(r: Rule, now: number, classDays: number[] | null = null): number | null {
  const w = whenOf(r.sentence, classDays);
  if (!w || r.mode === "off") return null;
  const start = new Date(now);
  for (let d = 0; d <= 8; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    if (w.days && !w.days.includes(day.getDay())) continue;
    const mins: number[] = w.times.map((t) => t.h * 60 + t.m);
    if (w.every) for (let m = w.every.from; m <= w.every.to; m += w.every.mins) mins.push(m);
    const at = mins.sort((a, b) => a - b).map((m) => day.getTime() + m * 60_000).find((t) => t > now);
    if (at !== undefined) return at;
  }
  return null;
}

export type StateIn = {
  rules: { rule: Rule; runs: LedgerLine[]; held?: Held; next: number | null }[];
  tickets: Ticket[];
};
export type StateOut = {
  state: State;
  stuck?: { site: Site; label: string };
  needs?: { title: string; ticketId: string; choices: string[]; wouldHave: boolean };
  working?: { ticketId: string; since: string };
  next?: string;
};
const working = (t: Ticket) => t.state === "open" && t.triggers.length > 0 && (t.runs.length === 0 || t.triggers[t.triggers.length - 1].at > t.runs[t.runs.length - 1].at);
const siteByName = (n?: string) => SITES.find((s) => nameOf(s) === n) ?? null;

/** an agent's state, computed, never stored. stuck > needs > working > resting > off */
export function stateOf(x: StateIn): StateOut {
  const on = x.rules.filter((r) => r.rule.mode !== "off");
  const tickets = x.tickets.filter((t) => t.state !== "ended");
  let stuck: Site | null = null;
  for (const r of on) {
    // a rule held for another reason (rested by hand, idle) is not stuck: its old sign-in stops are not news
    stuck = r.held ? (r.held.why === "stuck" ? siteByName(r.held.site) : null) : stuckAt(r.runs);
    if (stuck) break;
  }
  const out: StateOut = { state: "off" };
  if (stuck) out.stuck = { site: stuck, label: `sign in to ${nameOf(stuck)}` };
  const card = tickets.find((t) => t.state === "waiting" && t.needs && !(t.triggers[0]?.kind === "needs-sign-in"));
  if (card) out.needs = { title: card.needs!.title, ticketId: card.id, choices: card.needs!.choices, wouldHave: !!card.needs!.wouldHave };
  const w = tickets.find(working);
  if (w) out.working = { ticketId: w.id, since: new Date(w.triggers[w.triggers.length - 1].at).toISOString() };
  const nexts = on.map((r) => (r.held ? (/^\d{4}-/.test(r.held.until) ? Date.parse(r.held.until) : null) : r.next)).filter((n): n is number => n !== null);
  if (nexts.length) out.next = new Date(Math.min(...nexts)).toISOString();
  out.state = stuck ? "stuck" : card ? "needs" : w ? "working" : on.length ? "resting" : "off";
  return out;
}

// ---------------------------------------------------------------- the keeper

export const same = (a: RuleRef, b: RuleRef) => a.folder === b.folder && a.rule === b.rule;
export const newChangeId = () => `c-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
export function change(f: AgentsFile, c: Omit<Change, "id" | "undone">): Change {
  const full: Change = { id: newChangeId(), undone: false, ...c };
  f.changes.push(full);
  return full;
}
/** since when a rule's runs count for the keeper: its last hold, rest or wake, or the undo of one */
function cutoff(f: AgentsFile, r: RuleRef): number {
  let t = 0;
  for (const c of f.changes) {
    if (!c.rules?.some((x) => same(x, r)) || !["held", "rested", "woke"].includes(c.kind)) continue;
    t = Math.max(t, Date.parse(c.undone && c.undoneAt ? c.undoneAt : c.at) || 0);
  }
  return t;
}
const agentOfRule = (f: AgentsFile, r: RuleRef) => f.agents.find((a) => a.rules.some((x) => same(x, r)));

/** the keeper's decisions over one agents.json (pure: the ledgers are handed in, newest first). Returns true when it changed */
export function keepFile(f: AgentsFile, read: (folder: string) => { rules: Rule[]; ledger: LedgerLine[] }, now: number): boolean {
  let changed = false;
  const iso = new Date(now).toISOString();
  const cache = new Map<string, { rules: Rule[]; ledger: LedgerLine[] }>();
  const of = (folder: string) => { if (!cache.has(folder)) cache.set(folder, read(folder)); return cache.get(folder)!; };
  // every agent's rules, and the routines (one rule in one place: no agent, the place's name in the line)
  const kept = [...f.agents.flatMap((a) => a.rules.map((ref) => ({ a: { id: a.id, name: a.name }, ref }))),
    ...(f.routines ?? []).filter((r) => !agentOfRule(f, r)).map((ref) => ({ a: { id: "", name: nameOfFolder(ref.folder) }, ref }))];
  for (const { a, ref } of kept) {
    const { rules, ledger } = of(ref.folder);
    const rule = rules.find((r) => r.id === ref.rule);
    if (!rule || rule.mode === "off") continue;
    const since = cutoff(f, ref);
    const runs = runsOf(ledger, ref.rule).filter((l) => l.at > since);
    const held = f.held.find((h) => same(h, ref));
    if (held) {
      const over = /^\d{4}-/.test(held.until) && now >= Date.parse(held.until);
      const through = held.why === "stuck" && runs[0] && runs[0].at > Date.parse(held.since) && !blocked(runs[0]);
      if (over || through) {
        f.held = f.held.filter((h) => h !== held);
        change(f, { at: iso, kind: "woke", agent: a.id, rules: [ref], line: over ? `${a.name}'s rest is over; it runs on its clock again.` : `${a.name} got through, so Sol let it run again.`, undo: { hold: [held] }, cause: over ? "idle" : "through" });
        changed = true;
      }
      continue;
    }
    // stuck at the same sign-in 3 runs in a row → held until that site is signed in
    const last3 = runs.slice(0, STUCK_RUNS).map(signInSite);
    if (last3.length === STUCK_RUNS && last3[0] && last3.every((s) => s === last3[0])) {
      const site = nameOf(last3[0]);
      const h: Held = { folder: ref.folder, rule: ref.rule, why: "stuck", site, since: iso, until: "signed-in" };
      f.held.push(h);
      change(f, { at: iso, kind: "held", agent: a.id, rules: [ref], line: `${a.name} stopped at the ${site} sign-in ${STUCK_RUNS} times in a row; Sol holds it until you sign in.`, undo: { unhold: [ref] }, cause: "sign-in" });
      changed = true;
      continue;
    }
    // before the person has seen the floor, the keeper only pauses at a sign-in (rule 6): nothing rests unseen
    if (!f.met) continue;
    // a clock or people rule whose last 7 days of runs made nothing → rested 7 days
    if (WATCHERS.has(rule.source)) continue;
    const days: string[] = [];
    for (const l of runs) { const d = dayOf(l.at); if (!days.includes(d)) days.push(d); if (days.length > IDLE_DAYS) break; }
    const recent = runs.filter((l) => days.slice(0, IDLE_DAYS).includes(dayOf(l.at)));
    if (days.length >= IDLE_DAYS && recent.every(madeNothing)) {
      const until = new Date(now + IDLE_DAYS * DAY).toISOString();
      f.held.push({ folder: ref.folder, rule: ref.rule, why: "idle", since: iso, until });
      change(f, { at: iso, kind: "rested", agent: a.id, rules: [ref], line: `${a.name} made nothing in its last ${recent.length} runs over ${IDLE_DAYS} days; Sol rests it for ${IDLE_DAYS} days.`, undo: { unhold: [ref] }, cause: "idle" });
      changed = true;
    }
  }
  return changed;
}

const readFolder = (home: string) => (folder: string) => {
  const p = join(home, folder);
  return { rules: readPolicy(p).rules, ledger: readLedger(p, 100_000) };
};

/** the keeper on the engine's tick: nothing until agents.json exists */
export function keep(home: string, now = Date.now()): boolean {
  const f = loadAgents(home);
  if (!f) return false;
  const changed = keepFile(f, readFolder(home), now);
  if (changed) saveAgents(home, f);
  return changed;
}

/** what the clock skips now: `<folder>#<rule>` (folder relative to the home) */
export function heldNow(home: string, now = Date.now()): Set<string> {
  const f = loadAgents(home);
  return new Set((f?.held ?? []).filter((h) => !(/^\d{4}-/.test(h.until) && now >= Date.parse(h.until))).map((h) => `${h.folder}#${h.rule}`));
}

/** a sign-in to a site succeeded in a folder: its rules held for that site wake */
export function signedIn(home: string, folder: string, site: Site, now = Date.now()): number {
  const f = loadAgents(home);
  if (!f) return 0;
  const woken = f.held.filter((h) => h.folder === folder && h.why === "stuck" && h.site === nameOf(site));
  track("agents.signin.done", { freed: woken.length });   // Agents in use (inuse.ts): a count, never the site
  if (!woken.length) return 0;
  f.held = f.held.filter((h) => !woken.includes(h));
  for (const h of woken) {
    const a = agentOfRule(f, h);
    change(f, { at: new Date(now).toISOString(), kind: "woke", agent: a?.id ?? "", rules: [{ folder: h.folder, rule: h.rule }], line: `${a?.name ?? nameOfFolder(folder)} runs again: you signed in to ${h.site}.`, undo: { hold: [h] }, cause: "through" });
  }
  saveAgents(home, f);
  return woken.length;
}

// ---------------------------------------------------------------- the person's hand (the wire calls these)

/** a whole Sol turn that answers in words (the offer, a rehearsal); null when it could not be had */
export type Say = (prompt: string) => Promise<string | null>;
export type Host = Pick<Agents, "folders" | "folderOf" | "runRule" | "setRule"> & { d: { home: string; now?: () => number; ask?: Ask; say?: Say } };
export const homeOf = (a: Host) => a.d.home;
export const nowOf = (a: Host) => (a.d.now ?? Date.now)();
const relOf = (a: Host, abs: string) => relative(homeOf(a), abs).split("\\").join("/");

const emptyFile = (): AgentsFile => ({ v: 1, agents: [], held: [], changes: [], offers: [], never: [], fired: [], joins: [], apart: [] });
function made(a: Host, g: Pick<Grouped, "agents" | "routines">, n: number, at: string, asks: JoinAsk[] = [], looked?: string, write = true): AgentsFile {
  const f = emptyFile(), agents = g.agents;
  f.grouping = GROUPING;
  if (looked) f.looked = looked;
  f.agents = agents;
  f.routines = g.routines;
  f.joins = asks.map((x) => ({ ...x, state: "open" as const, at }));
  // the person's own model asked in Jev's place: the floor says once that Jev would ask fewer
  if (asks.some((x) => x.p === null)) f.jevNote = { at };
  const rules = agents.reduce((s, x) => s + x.rules.length, 0);
  if (agents.length) change(f, { at, kind: "made", agent: "", line: `Sol grouped ${rules} rules from ${n} folders into ${agents.length} agents, one per job.`, undo: null });
  if (write) saveAgents(homeOf(a), f);
  return f;
}
const foldersOf = (a: Host) => a.folders().map((f) => ({ folder: relOf(a, f.path), rules: readPolicy(f.path).rules }));
/** agents.json, grouped by code when it is missing (the sync path: the keeper, a wire message before any list). While
 *  the first grouping runs for this home the code grouping is handed back unwritten: the first grouping is kept */
export function ensure(a: Host): AgentsFile {
  const have = loadAgents(homeOf(a));
  if (have) return have;
  const folders = foldersOf(a), at = new Date(nowOf(a)).toISOString();
  return made(a, groupByCode(folders, at), folders.length, at, [], undefined, !firsts.has(homeOf(a)));
}
/** agents.json, grouped with Jev when it is missing (agents.list, the first time the Agents view opens); joins the
 *  first grouping or the late look in flight */
export async function ensureWith(a: Host, ask: Ask): Promise<AgentsFile> {
  const have = loadAgents(homeOf(a));
  if (have) return (await lookOnce(a, ask)) ?? have;
  return (await firstOnce(a, ask)) ?? ensure(a);
}
/** the same, never starting the late look (the offers' scan): agents.list starts that, on a new rule set (#1429: each
 *  read of the offers looked again and told every face, whose list read the offers again) */
export async function ensureFirst(a: Host, ask: Ask): Promise<AgentsFile> {
  return loadAgents(homeOf(a)) ?? (await firstOnce(a, ask)) ?? ensure(a);
}
/** the first grouping itself (agents.json missing). Jev null on a rule question: that pair by code (groupRules) */
async function firstGrouping(a: Host, ask: Ask): Promise<AgentsFile> {
  const folders = foldersOf(a), at = new Date(nowOf(a)).toISOString();
  // the kinds are read (and Jev asked about them) only when a half-band pair of rules turns up
  // Jev answered every rule question: this grouping was the look, so the late look skips this rule set
  let blind = false;
  const seen: Ask = async (q, x, y) => { const p = await ask(q, x, y); if (p === null && q === "rule") blind = true; return p; };
  // Jev null on one place's pairs: the person's own model is asked once about all of them (a.d.say; none: code's links)
  const g = await group(folders, at, seen, { kinds: async () => kindsOf(placesOf(homeOf(a)).places, ask), ...(a.d.say ? { say: cappedSay(a.d.say, { home: homeOf(a), now: () => nowOf(a) }) } : {}) });
  // the names are code's, in the person's words (meta/names.ts): no Sol turn names anything, so nothing waits on one
  const key = ruleSetKey(folders);
  // Jev could not answer: the late look waits LOOK_AGAIN_MS too, so a face re-reading on agents.changed cannot loop
  if (blind) blindAt.set(homeOf(a), { key, at: Date.now() });
  return loadAgents(homeOf(a)) ?? made(a, g, folders.length, at, g.asks, blind ? undefined : key);
}

/** the late look (agents.json already there, Jev at hand): once per rule set, the half- and same-band pairs of one kind among
 *  the rules as they sit in agents.json become join asks, groupRules' own pair code. Nothing is regrouped; a pair in
 *  `apart`, in `joins` (any state) or already in one agent is skipped. Jev null on any rule question: nothing asked,
 *  nothing recorded, so a later list looks again */
export async function lookLate(a: Host, ask: Ask): Promise<AgentsFile | null> {
  const home = homeOf(a);
  let f = loadAgents(home);
  if (!f) return null;
  const folders = foldersOf(a), key = ruleSetKey(folders);
  if (regroupDue(f, key)) f = await regroupLook(a, ask, f, folders, key);
  if (f.looked === key) return f;
  const placed = new Set(f.agents.flatMap((x) => x.rules.map((r) => `${r.folder}#${r.rule}`)));
  const { rules } = rulesIn(folders);
  // each agent's rules in one place are one unit, as the grouping saw them (a chain is asked about whole)
  const units: RuleIn[] = [];
  for (const ag of f.agents) {
    const mine = rules.filter((r) => placed.has(`${r.folder}#${r.rule}`) && ag.rules.some((x) => same(x, r)));
    for (const folder of [...new Set(mine.map((r) => r.folder))]) {
      const ms = mine.filter((r) => r.folder === folder);
      units.push(ms.length === 1 ? ms[0] : { ...ms[0], sentence: ms.map((m) => m.sentence.replace(/[.\s]+$/, "")).join("; "), members: ms });
    }
  }
  // and each routine (rule 3) as it is: a pair with one is a join ask too (answered together, one agent)
  for (const r of rules) if ((f.routines ?? []).some((x) => same(x, r)) && !placed.has(`${r.folder}#${r.rule}`)) units.push(r);
  const inPlace = units;
  const skip = new Set(f.apart);
  for (const j of f.joins) if (j.rules.length === 2) skip.add(pairKey(j.rules[0], j.rules[1]));
  for (const ag of f.agents) for (const x of ag.rules) for (const y of ag.rules) if (!same(x, y)) skip.add(pairKey(x, y));
  // Jev null on any question here: the look is not recorded, so a later list looks again
  let blind = false;
  const seen: Ask = async (q, x, y) => { const p = await ask(q, x, y); if (p === null) blind = true; return p; };
  let kinds: Awaited<ReturnType<NonNullable<GroupOpts["kinds"]>>> | null = null;
  const half: HalfPair[] = [];
  await groupRules(inPlace, seen, { half, apart: skip, asksSame: true, oneKind: async (x, y) => oneKindIn((kinds ??= await kindsOf(placesOf(home).places, ask)))(x, y) });
  // inside each place: two steps Jev puts in the half band or over are asked, never joined (meta/chains.ts). Jev null:
  // the person's own model asks about them, once per rule set (`saidOn`); across places nothing is asked without Jev
  const order = (u: RuleIn) => rules.findIndex((r) => same(r, u));
  const turn: { say?: Say; said?: boolean } = a.d.say && f.saidOn !== key ? { say: cappedSay(a.d.say, { home, now: () => nowOf(a) }) } : {};
  const steps = await stepAsksLate([...units].sort((x, y) => order(x) - order(y)), blind ? async () => null : seen, skip, turn);
  if (blind && !turn.said) return f;
  // the file again, as it is now (the keeper may have written while Jev answered)
  const now = loadAgents(home) ?? f, at = new Date(nowOf(a)).toISOString();
  const have = new Set(now.joins.map((j) => j.id));
  for (const x of [...steps.map(stepJoinOf), ...(blind ? [] : half.map(joinOf))]) if (!have.has(x.id) && !now.apart.includes(pairKey(x.rules[0], x.rules[1]))) now.joins.push({ ...x, state: "open", at });
  if (steps.some((x) => x.p === null) && !now.jevNote) now.jevNote = { at };
  // Jev null: not looked, so a later list looks again with Jev; the model's turn is not had again on this rule set
  if (!blind) now.looked = key;
  if (turn.said) now.saidOn = key;
  saveAgents(home, now);
  return now;
}

/** an older grouping's file (meta/regroup.ts): the rules no shaped agent holds grouped as the first grouping groups
 *  them now (Jev null on a pair: code), worked out once per rule set and kept as the ask; nothing regrouped. As many
 *  agents as now: the file is marked current and nothing is asked */
async function regroupLook(a: Host, ask: Ask, f: AgentsFile, folders: FolderRules[], key: string): Promise<AgentsFile> {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const shaped = shapedOf(f), theirs = new Set(shaped.flatMap((x) => x.rules.map((r) => `${r.folder}#${r.rule}`)));
  const rest = folders.map((x) => ({ ...x, rules: x.rules.filter((r) => !theirs.has(`${x.folder}#${r.id}`)) }));
  const g = await group(rest, at, ask, { apart: f.apart, kinds: async () => kindsOf(placesOf(home).places, ask) });
  // the file again, as it is now (the keeper may have written while Jev answered)
  const now = loadAgents(home) ?? f, p = regroupOf(now, shaped, g, at, key);
  if (p) now.regroup = p; else { now.grouping = GROUPING; delete now.regroup; }
  saveAgents(home, now);
  return now;
}

/** agents.regroup: an older grouping's ask answered. "regroup": the agents as the grouping makes them now, what the
 *  person set kept; "keep": as they are, never asked again for this version. Each one change line with undo. The rules
 *  changed since it was worked out: the ask goes and the next look works it out again */
export function regroup(a: Host, answer: "regroup" | "keep") {
  const f = ensure(a), p = f.regroup;
  if (!p || p.state !== "open") return { ok: false, why: "nothing to regroup" };
  if (answer === "regroup" && p.key !== ruleSetKey(foldersOf(a))) {
    delete f.regroup;
    saveAgents(homeOf(a), f);
    return { ok: false, why: "your rules changed; Sol works the grouping out again" };
  }
  const at = new Date(nowOf(a)).toISOString();
  const c = answer === "regroup" ? regroupFile(f, change, at) : keepAsIs(f, change, at);
  saveAgents(homeOf(a), f);
  return { ok: true, change: c };
}

// ---------------------------------------------------------------- the late look, in the background

/** the look running per home (one at a time: the first grouping or the late look), the homes whose running one is the
 *  first grouping, and the rule set whose last look Jev could not answer, and when */
const looks = new Map<string, Promise<AgentsFile | null>>();
const firsts = new Set<string>();
const blindAt = new Map<string, { key: string; at: number }>();
/** the homes where a face was told `looking: true` while this look runs: only they are told again when it ends */
const told = new Set<string>();
/** the first grouping or the late look running for this home, to await (a test, a script); null when none is */
export const lookInFlight = (a: Host): Promise<AgentsFile | null> | null => looks.get(homeOf(a)) ?? null;
/** the late look, one per home at a time: a second call while one runs joins it, never starts another */
export function lookOnce(a: Host, ask: Ask): Promise<AgentsFile | null> {
  const home = homeOf(a), have = looks.get(home);
  if (have) return have;
  const p = lookLate(a, ask).finally(() => {
    looks.delete(home);
    // a face that was told it is looking is told it is over, even when it found nothing to save; no face told: nothing
    if (told.delete(home)) notify();
  });
  looks.set(home, p);
  return p;
}
/** the first grouping, in the same flight: a second call (or a late look asked meanwhile) joins it. It failing
 *  outright: the code grouping is written, so the person is never left looking */
function firstOnce(a: Host, ask: Ask): Promise<AgentsFile | null> {
  const home = homeOf(a), have = looks.get(home);
  if (have) return have;
  firsts.add(home);
  const p = firstGrouping(a, ask)
    .catch(() => { firsts.delete(home); try { return ensure(a); } catch { return null; } })
    .finally(() => { firsts.delete(home); looks.delete(home); told.delete(home); notify(); });
  looks.set(home, p);
  return p;
}
/** agents.list with Jev at hand, never waiting on Jev: agents.json there, the answer from it and the late look in the
 *  background when the rule set is new; missing, no agents and the first grouping in the background. `looking`
 *  while either runs */
export async function listNow(a: Host, ask: Ask) {
  const home = homeOf(a), f = loadAgents(home);
  if (!f) { void firstOnce(a, ask); return { ok: true, agents: [], folderRules: [], offers: 0, offersKey: "", joins: [], asks: { front: null, then: [], more: 0, need: 0, all: [], home: [] }, shelves: null, changes: [], looking: true }; }
  if (!looks.has(home)) {
    const key = ruleSetKey(foldersOf(a)), blind = blindAt.get(home);
    const again = !blind || blind.key !== key || Date.now() - blind.at >= LOOK_AGAIN_MS;
    if ((f.looked !== key && again) || regroupDue(f, key)) {
      void lookOnce(a, ask).then((r) => {
        if (loadAgents(home)?.looked === key || r === null) blindAt.delete(home);
        else blindAt.set(home, { key, at: Date.now() });   // Jev null: a face re-reading the list does not loop on it
      }, () => blindAt.set(home, { key, at: Date.now() }));
    }
  }
  const looking = looks.has(home);
  if (looking) told.add(home);
  return { ...list(a), looking };
}

/** a ticket of this rule that waits on the person's work (a draft, keep or drop, a payment, "Apply…"): Home's, never the
 *  floor's (rule 4); a sign-in it waits on is a blocked ask instead */
export const waitsOn = (t: Ticket, rule: string) => t.rule === rule && t.state === "waiting" && !!t.needs && t.triggers[0]?.kind !== "needs-sign-in";

/** what the stored offers are, as one string (pure): the face reads agents.offers again only when it changes (#1429) */
export const offersKey = (offers: Offer[]) => offers.map((o) => `${o.id}:${o.state}:${o.traces.length}:${o.count}`).join(" ");

/** agents.list's answer */
export function list(a: Host) {
  const home = homeOf(a), now = nowOf(a);
  const f = ensure(a);
  const folders = new Map<string, { rules: Rule[]; ledger: LedgerLine[]; tickets: Ticket[]; days: number[] | null }>();
  const of = (folder: string) => {
    if (!folders.has(folder)) { const p = join(home, folder); folders.set(folder, { rules: readPolicy(p).rules, ledger: readLedger(p, 100_000), tickets: readTickets(p), days: classDaysOf(p) }); }
    return folders.get(folder)!;
  };
  for (const x of a.folders()) of(relOf(a, x.path));
  const placed = new Set(f.agents.flatMap((x) => x.rules.map((r) => `${r.folder}#${r.rule}`)));
  const work: WorkIn[] = [];
  const agents = f.agents.map((ag) => {
    const rules = ag.rules.map((ref) => {
      const fo = of(ref.folder), rule = fo.rules.find((r) => r.id === ref.rule);
      if (!rule) return null;
      const runs = runsOf(fo.ledger, ref.rule), held = f.held.find((h) => same(h, ref));
      return { ref, rule, runs, held, next: nextOf(rule, now, fo.days), tickets: fo.tickets };   // "class days" needs the folder's days, as the clock reads them
    }).filter((x): x is NonNullable<typeof x> => !!x);
    // rule ids are per folder (clock-1 in two folders), so each rule takes its own folder's tickets
    // a place on a date trigger: its next fire is its next run (its rule names no hour a clock reads)
    const dated = new Map<string, number>();
    for (const p of ag.places ?? []) {
      if (p.trigger.kind !== "date") continue;
      const txt = (n: string) => { try { return readFileSync(join(home, p.folder, n), "utf8"); } catch { return ""; } };
      const nx = nextFire(p.trigger, datesOf(txt("stickies.md"), txt("calendar.md"), now, p.place.includes("#") ? p.name : undefined), now);
      if (nx) dated.set(`${p.folder}#${p.rule}`, nx.at);
    }
    const st = stateOf({ rules: rules.map((r) => ({ rule: r.rule, runs: r.runs, held: r.held, next: r.next ?? dated.get(`${r.ref.folder}#${r.ref.rule}`) ?? null })), tickets: rules.flatMap((r) => r.tickets.filter((t) => t.rule === r.rule.id)) });
    const words = rules.map((r) => ({ folder: r.ref.folder, rule: r.rule.id, sentence: r.rule.sentence, source: r.rule.source, names: namesOf(r.ref.folder) }));
    // rule 4: its waiting work (a draft, keep or drop) is Home's; the agent only counts it
    const mine = rules.flatMap((r) => r.tickets.filter((t) => waitsOn(t, r.rule.id)).map((t) => ({ ticket: t.id, title: t.needs!.title, folder: r.ref.folder, rule: r.rule.id, agent: ag.id })));
    work.push(...mine);
    const waits = mine.length;
    return {
      id: ag.id, name: ag.name, job: ag.job, turn: ag.turn, part: ag.part, born: ag.born, ...st,
      role: roleOf(words), steps: stepsOf(words, (folder) => of(folder).days), waits,
      stucks: stucksOf(rules.filter((r) => r.rule.mode !== "off").map((r) => ({ ref: r.ref, runs: r.runs, held: r.held, next: r.next ?? dated.get(`${r.ref.folder}#${r.ref.rule}`) }))),
      parameter: ag.parameter ?? null, kinds: ag.kinds ?? [], reach: ag.reach ?? null,
      places: (ag.places ?? []).map((p) => ({ place: p.place, name: p.name, trust: p.trust, ...(p.first ? { first: p.first } : {}), trigger: p.trigger, folder: p.folder, rule: p.rule })),
      learned: ag.learned ?? [], asks: (ag.fixes ?? []).filter((x) => !x.answer && !(ag.learned ?? []).some((l) => l.fixes.includes(x.id))).map((x) => ({ fix: x.id, place: x.place, before: x.before, after: x.after, q: "Always like this?" })),
      ...(ag.pending ? { pending: ag.pending } : {}),
      rules: rules.map((r) => ({
        folder: r.ref.folder, rule: r.rule.id, sentence: r.rule.sentence, mode: r.rule.mode, rung: r.rule.rung, source: r.rule.source,
        runs: r.runs.length, made: r.runs.filter(madeSomething).length, blocked: r.runs.filter(blocked).length, nothing: r.runs.filter(madeNothing).length,
        ...(r.runs[0] ? { last: r.runs[0] } : {}),
        ...(r.held ? { held: { why: r.held.why, until: r.held.until, ...(r.held.site ? { site: r.held.site } : {}) } } : {}),
      })),
      week: week(rules.flatMap((r) => r.runs), now),
    };
  });
  // the rules no agent holds: routines (rule 3) and the stickies helper, each with where it stopped at a sign-in
  const folderRules = [...folders].flatMap(([folder, fo]) => fo.rules.filter((r) => !placed.has(`${folder}#${r.id}`)).map((r) => {
    const ref = { folder, rule: r.id }, s = r.mode === "off" ? [] : stucksOf([{ ref, runs: runsOf(fo.ledger, r.id), held: f.held.find((h) => same(h, ref)), next: nextOf(r, now, fo.days) }]);
    for (const t of fo.tickets) if (waitsOn(t, r.id)) work.push({ ticket: t.id, title: t.needs!.title, folder, rule: r.id, agent: null });
    return { folder, name: nameOfFolder(folder), part: partOf(folder), rule: r.id, sentence: r.sentence, mode: r.mode, source: r.source, ...(r.source === HELPER ? { helper: true } : {}), ...(s[0] ? { stuck: s[0] } : {}) };
  }));
  // rule 6: before the first visit, the sign-in holds Sol made (not undone) are one intro sentence with one undo
  const intro = f.met ? null : (() => {
    const cs = f.changes.filter((c) => c.cause === "sign-in" && !c.undone);
    return cs.length ? { ids: cs.map((c) => c.id), agents: new Set(cs.map((c) => c.agent || c.rules?.[0]?.folder)).size, sites: [...new Set(cs.map((c) => f.held.find((h) => c.rules?.some((r) => same(h, r)))?.site).filter((x): x is string => !!x))] } : null;
  })();
  // the open join asks, each with the agents its two rules are in now (one gone: the ask is not shown)
  // a side that is a routine (no agent: rule 3) shows as its place, with no id; a rule gone, the ask is not shown
  // each place said as it is said today (a join written before a code read as one, geo214 → GEO214, reads as one too)
  const joins = f.joins.filter((j) => j.state === "open").map((j) => ({ ...j, names: j.rules.map((r) => nameOfFolder(r.folder)) })).map((j) => {
    const two = j.rules.map((r, k) => {
      const x = f.agents.find((y) => y.rules.some((z) => same(z, r)));
      if (x) return { id: x.id, name: x.name, turn: x.turn };
      // two steps of one place: a routine side is said by what it makes (its place is the same on both sides)
      const rule = folders.get(r.folder)?.rules.find((y) => y.id === r.rule);
      return rule ? { id: "", name: j.inPlace ? nameOfJob(placeMask(rule.sentence, r.folder)) : j.names[k], turn: 0 } : null;
    });
    return two.every(Boolean) && (two[0]!.id === "" || two[0]!.id !== two[1]!.id) ? { id: j.id, places: j.places, names: j.names, steps: j.steps, p: j.p, at: j.at, agents: two.map((x) => x!), ...(j.inPlace ? { inPlace: true } : {}) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  // rules 4, 5, 7: what needs the person (blocked, ranked) and what waits in Home; past CAST agents, shelves
  const asks = asksOf({
    agents: agents.map((x) => ({ id: x.id, name: x.name, stucks: x.stucks, fixes: (f.agents.find((y) => y.id === x.id)?.fixes ?? []).filter((k) => x.asks.some((q) => q.fix === k.id)) })),
    routines: folderRules.map((r) => ({ folder: r.folder, rule: r.rule, name: r.name, ...(r.stuck ? { stuck: r.stuck } : {}) })),
    joins, work,
    regroup: f.regroup?.state === "open" ? { before: f.agents.length, after: f.regroup.agents.length, at: f.regroup.at } : null,
  }, now);
  const shelves = shelvesOf(agents, new Set(agents.filter((x) => x.stucks.length || x.asks.length).map((x) => x.id)));
  return { ok: true, agents, folderRules, offers: f.offers.filter((o) => o.state === "open").length, offersKey: offersKey(f.offers), joins, asks, shelves, changes: f.changes.slice(-20).reverse(), ...(f.met ? { met: f.met } : {}), ...(intro ? { intro } : {}), ...(f.jevNote && !f.jevNote.seen ? { jevNote: jevNote() } : {}) };
}
/** the floor's one line when the person's own model asked in Jev's place: no key to paste, the cheapest model, a day's
 *  cap (meta/own.ts OWN_PER_DAY, #1476); said once (agents.noted) */
export const jevNote = (n: number = ownPerDay()): string => n > 0
  ? `No Jev needed: Sol asks the cheapest model in your own AI instead, at most ${n} times a day. Tell Sol a smaller number to make it ask less.`
  : "No Jev here, and you asked Sol not to use your own AI for this: code decides alone.";
export const JEV_NOTE = jevNote(OWN_PER_DAY);
/** agents.noted: the line about Jev was read; it is not said again */
export function noted(a: Host) {
  const f = ensure(a);
  if (!f.jevNote || f.jevNote.seen) return { ok: true };
  f.jevNote.seen = new Date(nowOf(a)).toISOString();
  saveAgents(homeOf(a), f);
  return { ok: true };
}
export type Stuck = { site: string; folder: string; rule: string; since: number; next?: number };
/** each site the rules stopped at (pure): a rule held at a sign-in, or stopped at one in its last runs; one per site,
 *  with since when (the hold, or the run that stopped) and the rule's own next run, for the face's rank (rule 5) */
export function stucksOf(rules: { ref: RuleRef; runs: LedgerLine[]; held?: Held; next?: number | null }[]): Stuck[] {
  const out: Stuck[] = [];
  for (const r of rules) {
    let s: string | null = null, since = 0;
    if (r.held) { if (r.held.why === "stuck" && r.held.site) { s = r.held.site; since = Date.parse(r.held.since) || 0; } }
    else {
      const x = stuckAt(r.runs);
      if (x) { s = nameOf(x); since = r.runs.slice(0, 3).find((l) => !lookFailed(l))?.at ?? 0; }
    }
    if (s && !out.some((o) => o.site === s)) out.push({ site: s, folder: r.ref.folder, rule: r.ref.rule, since, ...(r.next ? { next: r.next } : {}) });
  }
  return out;
}

/** agents.meet: the person has seen the floor; from now on the keeper does all of its keeping (rule 6) */
export function meet(a: Host) {
  const f = ensure(a);
  if (f.met) return { ok: true, met: f.met };
  f.met = new Date(nowOf(a)).toISOString();
  saveAgents(homeOf(a), f);
  return { ok: true, met: f.met };
}

export const find = (f: AgentsFile, id: string) => f.agents.find((x) => x.id === id) ?? null;
export const no = (id: string) => ({ ok: false, why: `no agent "${id}"` });

/** agents.run: each rule not off, one after another; the tickets back */
export async function run(a: Host, id: string) {
  const f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  // the rules not off (policy.md is the truth); all off, nothing runs and the person is told why
  const on = ag.rules.filter((ref) => readPolicy(join(homeOf(a), ref.folder)).rules.find((x) => x.id === ref.rule)?.mode !== "off");
  if (!on.length) return { ok: false, why: `${ag.name} is off: set it to watch or do first` };
  const tickets: (Ticket | null)[] = [], lines: string[] = [];
  for (const ref of on) {
    const r = await a.runRule(ref.folder, ref.rule, true);
    if (r.ok) { tickets.push(r.ticket ?? null); if (r.line) lines.push(`${ref.rule}: ${r.line}`); }
    else lines.push(`${ref.rule}: ${r.why}`);
  }
  return { ok: true, tickets, lines };
}

/** agents.mode: setRule on each rule (policy.md is the truth); one change line */
export function mode(a: Host, id: string, m: Mode) {
  if (!["off", "watch", "do"].includes(m)) return { ok: false, why: "a mode is off, watch or do" };
  const f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  const before: (RuleRef & { mode: Mode })[] = [];
  for (const ref of ag.rules) {
    const r = readPolicy(join(homeOf(a), ref.folder)).rules.find((x) => x.id === ref.rule);
    if (!r || r.mode === m) continue;
    const done = a.setRule(ref.folder, ref.rule, m);
    if (done.ok) before.push({ ...ref, mode: r.mode });
  }
  if (!before.length) return { ok: true, line: `${ag.name} was already ${m}` };
  const c = change(f, { at: new Date(nowOf(a)).toISOString(), kind: "mode", agent: ag.id, rules: before.map(({ folder, rule }) => ({ folder, rule })), line: `${ag.name} set to ${m} (${before.length} rule${before.length > 1 ? "s" : ""}).`, undo: { modes: before } });
  saveAgents(homeOf(a), f);
  return { ok: true, change: c };
}

/** agents.rest: holds (on) or wakes (off) all its rules; one change line */
export function rest(a: Host, id: string, on: boolean) {
  const f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  const at = new Date(nowOf(a)).toISOString();
  if (on) {
    const fresh = ag.rules.filter((r) => !f.held.some((h) => same(h, r)));
    if (!fresh.length) return { ok: true, line: `${ag.name} is already resting` };
    f.held.push(...fresh.map((r): Held => ({ ...r, why: "asked", since: at, until: "woken" })));
    const c = change(f, { at, kind: "rested", agent: ag.id, rules: fresh, line: `${ag.name} rests until you wake it.`, undo: { unhold: fresh } });
    saveAgents(homeOf(a), f);
    return { ok: true, change: c };
  }
  const woken = f.held.filter((h) => ag.rules.some((r) => same(h, r)));
  if (!woken.length) return { ok: true, line: `${ag.name} was not resting` };
  f.held = f.held.filter((h) => !woken.includes(h));
  const c = change(f, { at, kind: "woke", agent: ag.id, rules: woken.map(({ folder, rule }) => ({ folder, rule })), line: `${ag.name} woke; it runs on its clock again.`, undo: { hold: woken } });
  saveAgents(homeOf(a), f);
  return { ok: true, change: c };
}

/** a rule an agent wrote, taken back: out of policy.md when it is the last of its source there (no id moves), else off */
function takeOut(a: Host, r: RuleRef) {
  const line = lineOf(homeOf(a), r.folder, r.rule);
  if (!line) return;
  const rules = readPolicy(join(homeOf(a), r.folder)).rules, me = rules.find((x) => x.id === r.rule);
  const last = me && rules.filter((x) => x.source === me.source).pop()?.id === r.rule;
  if (last) removeLine(homeOf(a), r.folder, line); else a.setRule(r.folder, r.rule, "off");
}

/** agents.undo: one change reversed, once */
export function undo(a: Host, changeId: string) {
  const f = ensure(a), c = f.changes.find((x) => x.id === changeId);
  if (!c) return { ok: false, why: `no change ${changeId}` };
  if (c.undone) return { ok: false, why: "already undone" };
  if (!c.undo) return { ok: false, why: "this one has no undo" };
  const u = c.undo;
  if ("unhold" in u) f.held = f.held.filter((h) => !u.unhold.some((r) => same(h, r)));
  else if ("hold" in u) for (const h of u.hold) { if (!f.held.some((x) => same(x, h))) f.held.push(h); }
  else if ("modes" in u) for (const r of u.modes) a.setRule(r.folder, r.rule, r.mode);
  else if ("name" in u) { const ag = find(f, c.agent); if (ag) ag.name = u.name; }
  else if ("unmake" in u) {
    const p = join(homeOf(a), u.unmake.folder, "policy.md");
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch { /* gone */ }
    const lines = text.split("\n"), i = lines.lastIndexOf(u.unmake.line);
    if (i >= 0) { lines.splice(i, 1); const tmp = `${p}.${process.pid}.tmp`; writeFileSync(tmp, lines.join("\n")); renameSync(tmp, p); }
    f.agents = f.agents.filter((x) => x.id !== c.agent);
  }
  else if ("unkeep" in u) {
    const ag = find(f, c.agent);
    for (const r of [...(ag?.rules ?? [])].reverse()) takeOut(a, r);   // the last first: each is then the last of its source
    f.agents = f.agents.filter((x) => x.id !== c.agent);
    const o = f.offers.find((x) => x.id === u.unkeep.offer);
    if (o) { o.state = "open"; delete o.agent; }
  }
  else if ("unscope" in u) {
    const ag = find(f, c.agent), ref = ag?.places?.find((p) => p.place === u.unscope.place);
    if (ag && ref) {
      takeOut(a, ref);
      ag.places = ag.places!.filter((p) => p !== ref);
      ag.rules = ag.rules.filter((r) => !same(r, ref));
      ag.out = [...new Set([...(ag.out ?? []), ref.place])];
    }
  }
  else if ("rescope" in u) {
    const ag = find(f, c.agent);
    if (ag) {
      if (u.rescope.line) restoreLine(homeOf(a), u.rescope.ref.folder, u.rescope.ref.rule, u.rescope.line);
      if (!ag.places?.some((p) => p.place === u.rescope.ref.place)) ag.places = [...(ag.places ?? []), u.rescope.ref];
      if (!ag.rules.some((r) => same(r, u.rescope.ref))) ag.rules.push({ folder: u.rescope.ref.folder, rule: u.rescope.ref.rule });
      ag.out = (ag.out ?? []).filter((x) => x !== u.rescope.ref.place);
    }
  }
  else if ("restore" in u) {
    const i = f.agents.findIndex((x) => x.id === c.agent);
    if (i >= 0) f.agents[i] = u.restore.agent;
    for (const l of u.restore.lines) restoreLine(homeOf(a), l.folder, l.rule, l.line);
  }
  else if ("offer" in u) {
    const o = f.offers.find((x) => x.id === u.offer.id);
    if (o) { o.state = "open"; delete o.laterAt; }
    if (u.offer.never) f.never = f.never.filter((n) => n.words !== u.offer.never);
  }
  else if ("unjoin" in u) {
    f.agents = f.agents.filter((x) => x.id !== c.agent);
    for (const s of [...u.unjoin.agents].sort((x, y) => x.at - y.at)) f.agents.splice(Math.min(s.at, f.agents.length), 0, s.agent);
    const j = f.joins.find((x) => x.id === u.unjoin.join);
    if (j) { j.state = "open"; delete j.agent; }
  }
  else if ("reask" in u) {
    const j = f.joins.find((x) => x.id === u.reask.join);
    if (j) { j.state = "open"; f.apart = f.apart.filter((k) => k !== pairKey(j.rules[0], j.rules[1])); }
  }
  else if ("regroup" in u) unregroup(f, u.regroup.was);
  c.undone = true;
  c.undoneAt = new Date(nowOf(a)).toISOString();
  saveAgents(homeOf(a), f);
  return { ok: true, change: c };
}

/** agents.undo with several: one cause's changes reversed together (rule 6), the newest first; those already undone
 *  are passed over. ok when at least one was undone */
export function undoMany(a: Host, ids: string[]) {
  const f = ensure(a);
  const mine = f.changes.filter((c) => ids.includes(c.id) && !c.undone && c.undo).sort((x, y) => y.at.localeCompare(x.at));
  if (!mine.length) return { ok: false, why: "nothing there to undo" };
  const done = mine.map((c) => undo(a, c.id)).filter((r) => r.ok);
  return { ok: done.length > 0, undone: done.length };
}

/** agents.make: a typed line becomes a clock rule in the folder's policy.md and an agent of its own */
export function make(a: Host, line: string, folder: string, time: string) {
  const words = String(line ?? "").trim().replace(/\s+/g, " ");
  if (words.split(" ").filter(Boolean).length < 4) return { ok: false, why: "a sticky is enough" };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time ?? ""))) return { ok: false, why: "a time is HH:MM" };
  const abs = a.folderOf(String(folder ?? ""));
  if (!abs) return { ok: false, why: `no folder "${folder}" with a policy.md` };
  const rel = relOf(a, abs), f = ensure(a);
  const bullet = `- [watch] clock: ${time} ${words}`;
  const p = join(abs, "policy.md");
  const text = readFileSync(p, "utf8");
  appendFileSync(p, (text.endsWith("\n") ? "" : "\n") + bullet + "\n");
  const rule = readPolicy(abs).rules.filter((r) => r.source === "clock").pop()!;
  let id = slug(words.split(" ").slice(0, 4).join(" ")), n = 2;
  while (f.agents.some((x) => x.id === id)) id = `${slug(words.split(" ").slice(0, 4).join(" "))}-${n++}`;
  const at = new Date(nowOf(a)).toISOString();
  const name = words.split(" ").slice(0, 4).join(" ").replace(/^./, (c) => c.toUpperCase());
  const ag: Agent = { id, name, job: words, turn: f.agents.length % 6, part: partOf(rel), rules: [{ folder: rel, rule: rule.id }], born: { how: "typed", at } };
  f.agents.push(ag);
  const c = change(f, { at, kind: "made", agent: id, rules: ag.rules, line: `${name}: made from your line, in ${rel}/policy.md at ${time}, in watch.`, undo: { unmake: { folder: rel, line: bullet } } });
  saveAgents(homeOf(a), f);
  return { ok: true, agent: ag, change: c };
}

/** agents.rename */
export function rename(a: Host, id: string, name: string) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!n) return { ok: false, why: "a name, please" };
  const f = ensure(a), ag = find(f, id);
  if (!ag) return no(id);
  if (ag.name === n) return { ok: true };
  const old = ag.name;
  ag.name = n;
  const c = change(f, { at: new Date(nowOf(a)).toISOString(), kind: "renamed", agent: id, line: `${old} is now ${n}.`, undo: { name: old } });
  saveAgents(homeOf(a), f);
  return { ok: true, change: c };
}

/** the site an agent is stuck on, and the rule that stopped there; `ref` names one rule (a routine has no agent) */
export function stuckOf(a: Host, id: string, ref?: RuleRef): { folder: string; rule: string; site: Site } | null {
  const f = ensure(a), ag = ref ? null : find(f, id);
  if (!ag && !ref) return null;
  for (const r of ag ? ag.rules : [ref!]) {
    const h = f.held.find((x) => same(x, r));
    if (h && h.why !== "stuck") continue;   // resting for another reason: not stuck (stateOf reads it the same)
    const s = h ? siteByName(h.site) : stuckAt(runsOf(readLedger(join(homeOf(a), r.folder), 50), r.rule));
    if (s) return { folder: r.folder, rule: r.rule, site: s };
  }
  return null;
}

export const hasAgentsFile = (home: string) => existsSync(agentsFile(home));
