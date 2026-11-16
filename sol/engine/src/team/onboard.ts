// Onboarding into a project, with skip (#430, part of #413, area C4). When someone joins a project, Cowork walks them
// through it, one step at a time: the project's night (hand in, the dev night, fixes until, the release, from its rhythm),
// who owns what (its owners), how to hand in, and what their agent may do (its agent rules). Each step can be skipped,
// and so can the whole walk; it can be walked again from the project's settings.
//   what it says   built here from the project's settings in force (project.ts), never written by hand: the steps'
//                  facts are the settings themselves. What the project adds is its `onboarding` part (a welcome line;
//                  per step, shown or left out and a note of its own), changed like every setting: a proposal agreed
//                  in the project's polls (project.ts `propose`)
//   who walked it  one file in the project's record, `.sol/onboarded.json`, through the kit's store: per person, each
//                  step done or skipped, and the whole walk finished ("done") or skipped. A person writes only their
//                  own row; the project sees everyone's, so it knows who has not been walked through yet
//   facts only     until a person has finished the walk, their agent shares facts only with the other agents, whatever
//                  the project allows (`shareFor`, read by the agents' speaking rules, #432). A walk skipped whole
//                  counts as not finished: coming back to it and finishing lifts that
// Pure but for the store and `shareFor` at the end.
import { Store, type Applied } from "./kit.js";
import type { ThingsDeps } from "./things.js";
import { STEPS, STEP_WORD, onboardingIn, agentRules, recordFor, type StepId, type ProjectRhythm, type AgentRules, type Owners, type ProjectFile } from "./project.js";

export const ONBOARDED_PATH = ".sol/onboarded.json";
export const PEOPLE_MAX = 200;
export type Mark = "done" | "skipped";
export type Walked = { login: string; at: string; steps: Partial<Record<StepId, Mark>>; all?: Mark };
export type Onboarded = { v: 1; people: Record<string, Walked>; newer?: true };

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : "");
const isMark = (v: unknown): v is Mark => v === "done" || v === "skipped";
const empty = (): Onboarded => ({ v: 1, people: {} });

/** the file as read, made valid (pure): a row keyed by its login, lowercased */
export function parseOnboarded(text: unknown): Onboarded {
  let raw: unknown;
  try { raw = JSON.parse(String(text ?? "")); } catch { return empty(); }
  if (!isObj(raw)) return empty();
  const f = empty();
  for (const x of Object.values(isObj(raw.people) ? raw.people : {})) {
    if (!isObj(x) || typeof x.login !== "string" || !LOGIN.test(x.login) || !iso(x.at)) continue;
    const steps: Walked["steps"] = {};
    if (isObj(x.steps)) for (const k of STEPS) if (isMark(x.steps[k])) steps[k] = x.steps[k] as Mark;
    f.people[x.login.toLowerCase()] = { login: x.login, at: iso(x.at), steps, ...(isMark(x.all) ? { all: x.all } : {}) };
    if (Object.keys(f.people).length === PEOPLE_MAX) break;
  }
  if (typeof raw.v === "number" && raw.v > 1) f.newer = true;
  return f;
}

/** the file as written (pure): logins in order, steps in the walk's order, so a write that changes nothing is no commit */
export function serializeOnboarded(f: Onboarded): string {
  const people = Object.fromEntries(Object.keys(f.people).sort().map((k) => {
    const p = f.people[k];
    return [k, { login: p.login, at: p.at, steps: Object.fromEntries(STEPS.filter((s) => p.steps[s]).map((s) => [s, p.steps[s]])), ...(p.all ? { all: p.all } : {}) }];
  }));
  return JSON.stringify({ v: 1, people }, null, 2) + "\n";
}

export type OnboardOp =
  | { step: { by: string; id: unknown; how: unknown; at: string } }
  | { finish: { by: string; how: unknown; at: string } }
  | { redo: { by: string; at: string } };

/** one change, always to the asker's own row (pure). A step marked, the walk finished or skipped whole; walked again,
 *  the row goes, so the walk is due again. The same mark again changes nothing */
export function applyOnboarded(f: Onboarded, op: OnboardOp): Applied<Onboarded, { walked: Walked | null }> {
  const by = "step" in op ? op.step.by : "finish" in op ? op.finish.by : op.redo.by;
  if (!LOGIN.test(by)) return { file: f, changed: false, error: "who is this? sign in first" };
  const key = by.toLowerCase(), had = f.people[key];
  if ("redo" in op) {
    if (!had) return { file: f, changed: false, result: { walked: null } };
    const people = { ...f.people };
    delete people[key];
    return { file: { ...f, people }, changed: true, result: { walked: null }, message: `onboarding: ${by} walks it again` };
  }
  if (!had && Object.keys(f.people).length >= PEOPLE_MAX) return { file: f, changed: false, error: "this project has walked too many people through to keep another" };
  const base: Walked = had ?? { login: by, at: "", steps: {} };
  let next: Walked;
  if ("step" in op) {
    const id = STEPS.find((s) => s === op.step.id);
    if (!id) return { file: f, changed: false, error: "no such step" };
    if (!isMark(op.step.how)) return { file: f, changed: false, error: "a step is done or skipped" };
    if (base.steps[id] === op.step.how) return { file: f, changed: false, result: { walked: base } };
    next = { ...base, login: by, at: op.step.at, steps: { ...base.steps, [id]: op.step.how } };
  } else {
    if (!isMark(op.finish.how)) return { file: f, changed: false, error: "the walk is finished or skipped" };
    if (base.all === op.finish.how) return { file: f, changed: false, result: { walked: base } };
    next = { ...base, login: by, at: op.finish.at, all: op.finish.how };
  }
  return { file: { ...f, people: { ...f.people, [key]: next } }, changed: true, result: { walked: next },
    message: `onboarding: ${by} ${"step" in op ? `${op.step.how} ${STEP_WORD[op.step.id as StepId]}` : op.finish.how === "done" ? "finished the walk" : "skipped the walk"}` };
}

export const onboarded = new Store<Onboarded, OnboardOp, { walked: Walked | null }>(ONBOARDED_PATH, parseOnboarded, serializeOnboarded, applyOnboarded, "onboarding");

// ---- what the walk says (pure) ----

export type WalkState = "done" | "skipped" | "partway" | "new";
export const stateOf = (w: Walked | undefined): WalkState => (!w ? "new" : w.all ?? "partway");
/** whether the walk opens by itself for this person: not finished and not skipped whole */
export const isDue = (w: Walked | undefined) => { const s = stateOf(w); return s === "new" || s === "partway"; };

/** what a person's agent shares with the other agents (pure): the project's rule once they finished the walk, facts
 *  only before (new, partway, or skipped whole) */
export const shareOf = (rules: AgentRules, w: Walked | undefined): AgentRules["share"] => (stateOf(w) === "done" ? rules.share : "facts");

const who = (l: string[]) => (l.length ? l.join(" and ") : "");
const zoneWord = (z: string) => (z ? `in ${z.replace(/_/g, " ")} time` : "on each person's own clock");

/** a step's title and its facts, from the settings in force (pure) */
export function stepFacts(id: StepId, s: { rhythm: ProjectRhythm; owners: Owners; agents: AgentRules }): { title: string; lines: string[] } {
  const r = s.rhythm;
  if (id === "night") return { title: "the project's night", lines: [
    `hand in by ${r.handIn}: what is handed in by then is read on tonight's dev night`,
    r.dev.length === 1 ? `the dev night at ${r.review}: ${r.dev[0]} reads each change handed in and takes it in (one merge commit), or sends it back`
      : `the dev night at ${r.review}: ${who(r.dev) || "the reviewers"} read each change handed in and take it in (one merge commit), or send it back`,
    `fixes until ${r.until}: a change sent back can be fixed and handed in again until then`,
    `the release at ${r.release}: everyone's Sol gets what went in${who(r.beta) ? `, and on the beta night ${who(r.beta)} take${r.beta.length === 1 ? "s" : ""} it into beta or hold${r.beta.length === 1 ? "s" : ""} it` : ""}`,
    `all ${zoneWord(r.zone)}`,
  ] };
  if (id === "owners") {
    const areas = Object.entries(s.owners);
    return { title: "who owns what", lines: areas.length
      ? [...areas.map(([a, l]) => `${a}: ${who(l)}`), "an area's lead is who to ask about it, and agrees to changes in who leads it"]
      : ["no area has a lead yet: anyone may take anything", "the project's settings name leads, once the project agrees"] };
  }
  if (id === "handin") return { title: "how to hand in", lines: [
    "work on your own branch, and open a pull request that names its issue",
    "once its checks are green, the session that worked on it asks with a card: Bring it in, or Not tonight",
    `at ${r.handIn} Sol opens a short hand-in session listing what goes in tonight and what is held`,
    `handed in means ready on GitHub (not a draft), aimed at the main branch, by ${r.review}`,
    s.agents.pick ? "only your press hands a change in; your agent may take one back to draft, when you say so" : "only your press hands a change in; your agent never does",
    "what is not handed in simply waits for the next night",
  ] };
  return { title: "what your agent may do", lines: [
    s.agents.share === "more" ? "agents may tell each other more than facts" : "agents tell each other facts only: what they are on, the files, what was decided",
    s.agents.pick ? "an agent may take a change back to draft, never hand one in: you do" : "an agent never picks what to hand in: you do",
    "an agent never takes a change in, sends it back or releases: people do",
    "until you finish this walk, your agent shares facts only, whatever the project allows",
  ] };
}

export type WalkStep = { id: StepId; title: string; lines: string[]; note: string; mark?: Mark };
export type WalkView = {
  repo: string; welcome: string; steps: WalkStep[]; me: string; state: WalkState; due: boolean;
  /** the night's four hours, for the face's picture of it */
  night: { handIn: string; review: string; until: string; release: string; zone: string };
  people: { login: string; state: WalkState; at: string }[]; custom: boolean; newer?: true;
};

/** the walk for one person (pure): the steps the project shows, each with its facts and note and my mark; where
 *  everyone is. `f` is the project's settings file (null: none read), `s` the settings in force */
export function walkOf(f: Pick<ProjectFile, "onboarding"> | null, s: { rhythm: ProjectRhythm; owners: Owners; agents: AgentRules }, o: Onboarded, me: string, repo: string): WalkView {
  const ob = onboardingIn(f), mine = o.people[me.toLowerCase()];
  const steps = STEPS.filter((k) => ob.steps[k].on).map((k) => ({ id: k, ...stepFacts(k, s), note: ob.steps[k].note, ...(mine?.steps[k] ? { mark: mine.steps[k] } : {}) }));
  return {
    repo, welcome: ob.welcome, steps, me, state: stateOf(mine), due: isDue(mine) && steps.length > 0,
    night: { handIn: s.rhythm.handIn, review: s.rhythm.review, until: s.rhythm.until, release: s.rhythm.release, zone: s.rhythm.zone },
    people: Object.values(o.people).map((p) => ({ login: p.login, state: stateOf(p), at: p.at })).sort((a, b) => (a.login.toLowerCase() < b.login.toLowerCase() ? -1 : 1)),
    custom: !!f?.onboarding, ...(o.newer ? { newer: true as const } : {}),
  };
}

/** what this person's agent shares with the others in a project (#432 reads it): the project's rule once they finished
 *  the walk, facts only before. Never throws: a file that cannot be read is facts only */
export async function shareFor(d: ThingsDeps, record: string, login: string, rules: AgentRules): Promise<AgentRules["share"]> {
  if (rules.share === "facts" || !record) return "facts";
  const o = await onboarded.get(d, record).catch(() => null);
  return o ? shareOf(rules, o.people[login.toLowerCase()]) : "facts";
}

/** what my agent shares in the project a repository belongs to (#432's speaking rules): the project's rule once I
 *  finished its walk, facts only before. Never throws */
export async function agentShare(repo: string, login: string): Promise<AgentRules["share"]> {
  const rules = await agentRules(repo).catch(() => null);
  if (!rules || rules.share === "facts") return "facts";
  const { record, things } = recordFor(repo);
  return things ? shareFor(things(), record, login, rules) : "facts";
}
