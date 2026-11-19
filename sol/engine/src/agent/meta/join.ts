// Agents' meta (#1327, pass 2): the ask band for grouping. Sol uses three bands everywhere (numbers.ts bandOf): Jev
// ≥ JEV_SAME acts, JEV_HALF..JEV_SAME asks, under leaves it alone. Two existing rules in places of one kind whose
// same-job score is in the half band are not merged and not dropped (agents.ts group): they are one open join ask in
// agents.json (`joins`), "one agent for both places?", with both rules' steps side by side. The person answers:
//   together  the two agents become one, as a same-band group is made: the core rule's sentence the template, each
//             place keeping its own rule as written, the richer rule's extra clauses that place's lines (jobs.ts
//             coreOf). Nothing in policy.md changes. One change line; its undo brings the two back and the ask.
//   apart     they stay two; the pair goes into `apart` and is never asked again. One change line; its undo asks again.
// The same ask inside one place (`inPlace`, meta/chains.ts, 2026-11-17): two rules of one place that may be one chain,
// "One agent for these two steps?". Together, one agent does both, its steps in their order (chained): the two
// templates one after the other, each rule kept as written; the same undo. Apart: the same.
import { join } from "node:path";
import { readPolicy } from "../store.js";
import { agentOfRoutine, change, ensure, find, homeOf, namesOf, nowOf, placeMask, saveAgents, same, type Agent, type Host, type Learned, type RuleRef } from "../agents.js";
import { coreOf, pairKey, type RuleIn } from "./jobs.js";
import { namesOf as namesByCode } from "./names.js";

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const agentOf = (agents: Agent[], r: RuleRef) => agents.find((x) => x.rules.some((y) => same(y, r))) ?? null;

/** two agents as one (pure over the rules' sentences as they stand now): the first keeps its id, name and face; the
 *  template is the core of all their rules; lines learned from fixes stay, the grouping's extras are worked out again */
export function joined(A: Agent, B: Agent, sentences: Map<string, { sentence: string; source: string }>, at: string): Agent {
  const refs = [...A.rules, ...B.rules];
  const ins: RuleIn[] = refs.map((r) => {
    const s = sentences.get(`${r.folder}#${r.rule}`);
    return { place: r.folder, folder: r.folder, rule: r.rule, sentence: s?.sentence ?? "", source: s?.source ?? "", names: namesOf(r.folder) };
  });
  const { core, extras } = coreOf(ins);
  const template = placeMask(core.sentence, core.folder);
  const kept = [...(A.learned ?? []), ...(B.learned ?? [])].filter((l) => (l.fixes ?? []).length > 0);
  const said = new Set(kept.map((l) => `${l.place}|${l.line.toLowerCase()}`));
  const fresh: Learned[] = extras.filter((x) => !said.has(`${x.place}|${x.line.toLowerCase()}`))
    .map((x, k) => ({ id: `l-${x.place.replace(/[^a-z0-9]+/gi, "-")}-${x.rule}-${k + 1}`, line: x.line, place: x.place, at, fixes: [] }));
  const learned = [...kept, ...fresh];
  return {
    ...A, rules: refs, template, job: template.replace(/<place>/g, "each place"),
    places: [...(A.places ?? []), ...(B.places ?? [])],
    kinds: [...new Set([...(A.kinds ?? []), ...(B.kinds ?? [])])],
    ...(learned.length ? { learned } : { learned: [] }),
    fixes: [...(A.fixes ?? []), ...(B.fixes ?? [])],
  };
}

/** two agents of one place as one chain (pure): the first keeps its id, name and face; its steps, then the other's; the
 *  lines learned from fixes stay; each rule as written */
export function chained(A: Agent, B: Agent): Agent {
  const places = [...(A.places ?? []), ...(B.places ?? [])];
  const template = [A.template ?? A.job, B.template ?? B.job].map((t) => t.replace(/[.;\s]+$/, "")).join("; ");
  const where = [...new Set(places.map((p) => p.place))];
  return {
    ...A, rules: [...A.rules, ...B.rules], template, job: template.replace(/<place>/g, where.length > 1 ? "each place" : places[0]?.name ?? "its place"),
    places, kinds: [...new Set([...(A.kinds ?? []), ...(B.kinds ?? [])])],
    learned: [...(A.learned ?? []), ...(B.learned ?? [])], fixes: [...(A.fixes ?? []), ...(B.fixes ?? [])],
  };
}

/** agents.join: together · apart, on one open join ask */
export function answerJoin(a: Host, id: string, answer: string) {
  const home = homeOf(a), at = new Date(nowOf(a)).toISOString();
  const f = ensure(a), j = f.joins.find((x) => x.id === id);
  if (!j) return { ok: false, why: `no join ask ${id}` };
  if (j.state !== "open") return { ok: false, why: `that was answered: ${j.state}` };
  if (answer !== "together" && answer !== "apart") return { ok: false, why: "an answer is together or apart" };
  // a side that is a routine (one rule, one place: no agent yet) is its rule as an agent of its own, made here
  const stubs: Agent[] = [];
  const [A, B] = j.rules.map((r, k) => {
    const have = agentOf(f.agents, r);
    if (have) return have;
    const rule = readPolicy(join(home, r.folder)).rules.find((x) => x.id === r.rule);
    if (!rule) return null;
    const s = agentOfRoutine(r, rule, at, (f.agents.length + k) % 6);
    stubs.push(s);
    return s;
  });
  if (!A || !B) return { ok: false, why: "one of the two rules is gone" };
  if (A === B) return { ok: false, why: "they are one agent already" };
  if (answer === "apart") {
    j.state = "apart";
    const k = pairKey(j.rules[0], j.rules[1]);
    if (!f.apart.includes(k)) f.apart.push(k);
    // a routine side has no agent (its stub was made only to compare): the line says its place, the change no agent
    const line = j.inPlace
      ? `These two steps in ${j.names[0]} stay apart; Sol won't ask about them again.`
      : stubs.length
      ? `${j.names[0]} and ${j.names[1]} stay apart; Sol won't ask about these two again.`
      : `${A.name} (${j.names[0]}) and ${B.name} (${j.names[1]}) stay two agents; Sol won't ask about these two again.`;
    const c = change(f, { at, kind: "apart", agent: stubs.includes(A) ? (stubs.includes(B) ? "" : B.id) : A.id, rules: j.rules, line, undo: { reask: { join: id } } });
    saveAgents(home, f);
    return { ok: true, change: c };
  }
  // a place never holds two rules of one job (two steps of one chain are not one job twice)
  const clash = j.inPlace ? null : (B.places ?? []).find((p) => (A.places ?? []).some((q) => q.place === p.place));
  if (clash) return { ok: false, why: `${clash.name} already has a rule for ${A.name}` };
  const sentences = new Map<string, { sentence: string; source: string }>();
  for (const r of [...A.rules, ...B.rules]) {
    const rule = readPolicy(join(home, r.folder)).rules.find((x) => x.id === r.rule);
    const base = [...(A.places ?? []), ...(B.places ?? [])].find((p) => same(p, r))?.base;
    sentences.set(`${r.folder}#${r.rule}`, { sentence: rule?.sentence ?? base ?? "", source: rule?.source ?? "" });
  }
  // the undo brings back the agents as they were; a routine side goes back to being a routine (no agent)
  const before = [A, B].filter((x) => !stubs.includes(x)).map((x) => ({ agent: structuredClone(x), at: f.agents.indexOf(x) }));
  const one = j.inPlace ? chained(A, B) : joined(A, B, sentences, at);
  if (stubs.includes(A)) f.agents.push(one);
  f.agents = f.agents.filter((x) => x !== B).map((x) => (x === A ? one : x));
  // its name again by code, now that it spans both places (two courses: Courses); a name the person gave stays
  if (!f.changes.some((c) => c.kind === "renamed" && !c.undone && (c.agent === A.id || c.agent === B.id))) {
    const unitsOf = (x: Agent): RuleIn[] => x.rules.map((r) => {
      const rule = readPolicy(join(home, r.folder)).rules.find((y) => y.id === r.rule);
      return { place: r.folder, folder: r.folder, rule: r.rule, sentence: rule?.sentence ?? "", source: rule?.source ?? "", names: namesOf(r.folder) };
    });
    const i = f.agents.indexOf(one);
    const name = namesByCode(f.agents.map((x) => ({ units: unitsOf(x) })), (k) => f.agents[k].name)[i];
    if (name && !f.agents.some((x) => x !== one && x.name.toLowerCase() === name.toLowerCase())) one.name = name;
  }
  j.state = "together"; j.agent = one.id;
  const line = j.inPlace ? `${one.name} is one agent now, doing both steps in ${j.names[0]}.` : `${one.name} is one agent now, on ${and([...new Set((one.places ?? []).map((p) => p.name))])}.`;
  const c = change(f, { at, kind: "merged", agent: one.id, rules: one.rules, line, undo: { unjoin: { join: id, agents: before } } });
  saveAgents(home, f);
  return { ok: true, agent: one, change: c };
}
export { find };
