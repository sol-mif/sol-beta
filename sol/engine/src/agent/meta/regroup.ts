// Agents' meta (#1327, 2026-11-17): an agents.json grouped by an older Sol. Once agents.json exists Sol never
// rearranges agents by itself (#1381), so a home grouped before the grouping got better would keep its older shape for
// good. Instead the late look works the current grouping out once (the file's `grouping` below GROUPING) and it waits
// as one ask on the floor, "Sol groups agents better now: 9 → 3", answered Regroup or Keep as is. Never without it.
//   what moves    only the agents the grouping made that the person never shaped; one they shaped (a name of theirs,
//                 a line learned from a fix, a join answered together, a place added or taken out, how far it goes)
//                 or made (an offer kept, a line typed) stays whole, and its rules are not regrouped
//   what stays    everything the person said: holds and sign-in pauses (they are by rule), joins and apart, never,
//                 met, the changes; `fired` follows each place to its new agent; an agent whose rules are the same
//                 keeps its id, name and face
//   regroup       one change line with undo: the agents, routines and fired as they were, the ask open again
//   keep as is    `grouping` is current, so it is never asked again for this version; its undo asks again
//   nothing new   the current grouping has as many agents: `grouping` written current, nothing asked
// Pure: agents.ts hands in the file and the grouping it worked out.
import type { Agent, AgentsFile, Change, ChangeKind, JoinAsk, RuleRef } from "../agents.js";
import { pairKey } from "./jobs.js";

/** the grouping's version: written by the first grouping; a file below it was grouped by an older Sol */
export const GROUPING = 2;
/** the regrouping worked out once, waiting on the person's answer */
export type Regroup = { to: number; from?: number; state: "open" | "kept" | "regrouped"; at: string; key: string; agents: Agent[]; routines: RuleRef[]; asks: JoinAsk[] };
/** what a regroup undoes to (null: it was Keep as is) */
export type Was = { agents: Agent[]; routines?: RuleRef[]; fired: string[]; joins: string[] } | null;

/** the file's grouping: written since GROUPING 2; before it, a file with routines (rule 3) was grouped as 2 is */
export const groupingOf = (f: Pick<AgentsFile, "grouping" | "routines">) => f.grouping ?? (f.routines ? 2 : 1);
export const olderGrouping = (f: Pick<AgentsFile, "grouping" | "routines">) => groupingOf(f) < GROUPING;
/** the late look works the regrouping out: an older file whose regrouping is not worked out for these rules yet */
export const regroupDue = (f: Pick<AgentsFile, "grouping" | "routines" | "regroup">, key: string) =>
  olderGrouping(f) && (!f.regroup || f.regroup.to < GROUPING || f.regroup.key !== key);

/** the changes that are the person shaping one agent (the keeper's holds and rests are by rule, kept either way) */
const SHAPING = new Set<ChangeKind>(["renamed", "merged", "scope", "learned", "changed", "trust", "kept", "joined"]);
/** the agents the person shaped or made (pure): they stay whole through a regroup */
export function shapedOf(f: Pick<AgentsFile, "agents" | "changes" | "joins">): Agent[] {
  const touched = new Set(f.changes.filter((c) => !c.undone && SHAPING.has(c.kind)).map((c) => c.agent));
  const together = new Set(f.joins.filter((j) => j.state === "together" && j.agent).map((j) => j.agent!));
  return f.agents.filter((a) => a.born?.how !== "grouped" || touched.has(a.id) || together.has(a.id) || !!a.fixes?.length
    || !!a.learned?.some((l) => l.fixes?.length) || !!a.pending || !!a.reach || !!a.out?.length);
}

const refKey = (r: RuleRef) => `${r.folder}#${r.rule}`;
const setOf = (rs: RuleRef[]) => rs.map(refKey).sort().join("\n");

/** the regrouping (pure): the shaped agents as they are, then the grouping's own agents, each keeping the id, name and
 *  face of an old agent with the same rules; null when it has as many agents as now (nothing worth asking) */
export function regroupOf(f: Pick<AgentsFile, "agents" | "grouping" | "routines">, shaped: Agent[], g: { agents: Agent[]; routines: RuleRef[]; asks: JoinAsk[] }, at: string, key: string): Regroup | null {
  const old = new Map(f.agents.filter((a) => !shaped.includes(a)).map((a) => [setOf(a.rules), a]));
  const ids = new Set(shaped.map((a) => a.id));
  const fresh = g.agents.map((a) => {
    const was = old.get(setOf(a.rules));
    const x: Agent = was ? { ...a, id: was.id, name: was.name, turn: was.turn, born: was.born } : { ...a };
    let id = x.id, n = 2;
    while (ids.has(id)) id = `${x.id}-${n++}`;
    ids.add(id);
    return { ...x, id };
  });
  const agents = [...shaped, ...fresh];
  if (agents.length === f.agents.length) return null;
  return { to: GROUPING, from: groupingOf(f), state: "open", at, key, agents, routines: g.routines, asks: g.asks };
}

/** a place's fired dates follow it to the agent that works there now (pure) */
export function firedAfter(fired: string[], agents: Agent[]): string[] {
  const ids = new Set(agents.map((a) => a.id));
  return fired.map((k) => {
    const [agent, place, ...rest] = k.split("|");
    if (ids.has(agent) || !place) return k;
    const to = agents.find((a) => (a.places ?? []).some((p) => p.place === place) || a.rules.some((r) => r.folder === place));
    return to ? [to.id, place, ...rest].join("|") : k;
  });
}

type Add = (f: AgentsFile, c: Omit<Change, "id" | "undone">) => Change;
/** Regroup (pure over the file): the regrouping in, the joins it asks added, one change line with its undo */
export function regroupFile(f: AgentsFile, add: Add, at: string): Change | null {
  const p = f.regroup;
  if (!p || p.state !== "open") return null;
  const before = f.agents.length;
  const was: Was = { agents: structuredClone(f.agents), ...(f.routines ? { routines: structuredClone(f.routines) } : {}), fired: [...f.fired], joins: [] };
  f.agents = structuredClone(p.agents);
  f.routines = structuredClone(p.routines);
  f.fired = firedAfter(f.fired, f.agents);
  const have = new Set(f.joins.map((j) => j.id));
  for (const x of p.asks) {
    if (have.has(x.id) || f.apart.includes(pairKey(x.rules[0], x.rules[1]))) continue;
    f.joins.push({ ...x, state: "open", at });
    was.joins.push(x.id);
  }
  f.grouping = p.to;
  p.state = "regrouped";
  return add(f, { at, kind: "regrouped", agent: "", line: `Sol regrouped your ${before} agents into ${f.agents.length}, one per job; what you set stays as it was.`, undo: { regroup: { was } } });
}
/** Keep as is (pure over the file): never asked again for this version; one change line, its undo asks again */
export function keepAsIs(f: AgentsFile, add: Add, at: string): Change | null {
  const p = f.regroup;
  if (!p || p.state !== "open") return null;
  f.grouping = p.to;
  p.state = "kept";
  return add(f, { at, kind: "regrouped", agent: "", line: `Your ${f.agents.length} agents stay as they are; Sol won't ask about grouping them again.`, undo: { regroup: { was: null } } });
}
/** the undo of either (pure over the file): the agents as they were, the ask open again */
export function unregroup(f: AgentsFile, was: Was) {
  if (was) {
    f.agents = was.agents;
    if (was.routines) f.routines = was.routines; else delete f.routines;
    f.fired = was.fired;
    f.joins = f.joins.filter((j) => !(was.joins.includes(j.id) && j.state === "open"));
  }
  if (f.regroup) {
    f.regroup.state = "open";
    f.grouping = f.regroup.from ?? 1;
  }
}
