// The project's settings page's pure parts (#428, Project.tsx): the view the engine sends (team.project, PROTOCOL round
// 69), where a part comes from, who a change still waits for, and the form's patch. No React here: src/project.test.ts.
import { blockPatch, type Block, type BlockLive } from "./blocks/live.ts";   // team blocks (#429)
export type Night = { hour: number; staleDays: number };
export type ProjectRhythm = { handIn: string; review: string; release: string; until: string; zone: string; dev: string[]; beta: string[]; night: Night;
  /** each night's backup and the handover hour (#478); an engine before it sends none */
  handover?: string; devBackup?: string[]; betaBackup?: string[] };
export type AgentRules = { share: "facts" | "more"; pick: boolean };
export type Owners = Record<string, string[]>;
export const STEPS = ["night", "owners", "handin", "agents"] as const;
export type StepId = (typeof STEPS)[number];
export type Onboarding = { welcome: string; steps: Record<StepId, { on: boolean; note: string }> };
export const STEP_WORD: Record<StepId, string> = { night: "the night", owners: "who owns what", handin: "how to hand in", agents: "what your agent may do" };
/** the project's word on its team blocks (#429): on or off by id, a team's own block's declaration with it */
export type BlocksPart = Record<string, { on: boolean; block?: Block }>;
export type Patch = { rhythm?: ProjectRhythm; agents?: AgentRules; owners?: Owners; blocks?: BlocksPart; onboarding?: Onboarding };
export type ProposalView = {
  id: string; by: string; at: string; why?: string; patch: Patch; was: Patch; needs: string[]; poll: string;
  state: "open" | "applied" | "refused" | "withdrawn" | "outdated"; agent?: boolean; done?: { at: string; agreed?: string[]; by?: string };
  summary: string; votes: Record<string, "agree" | "not yet">;
};
export type SetBy = { by: string; at: string; proposal: string; agreed: string[] };
export type ProjectView = {
  repo: string; code: string; rhythm: ProjectRhythm; agents: AgentRules; owners: Owners; onboarding?: Onboarding;
  blocks?: BlockLive[];   // an engine before round 74 sends none
  from: { rhythm: "record" | "file" | "default"; night: "record" | "carried" | "default"; agents: "record" | "default"; owners: "record" | "file" | "default"; blocks?: "record" | "default"; onboarding?: "record" | "default" };
  set: Partial<Record<Part, SetBy>>; proposals: ProposalView[]; newer?: boolean; error?: string;
};

export type Part = "rhythm" | "agents" | "owners" | "blocks" | "onboarding";
export const AGREE = 0, NOT_YET = 1;
export const STATE_WORD: Record<ProposalView["state"], string> = { open: "waiting for agreement", applied: "applied", refused: "not agreed", withdrawn: "withdrawn", outdated: "outdated: the setting changed first" };
const logins = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
export const hourWord = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** the onboarding in force (pure): an engine older than #430 sends `{}` or nothing, read as the default */
export function onboardingOf(v: Pick<ProjectView, "onboarding">): Onboarding {
  const o = v.onboarding, out: Onboarding = { welcome: typeof o?.welcome === "string" ? o.welcome : "", steps: {} as Onboarding["steps"] };
  for (const k of STEPS) { const x = o?.steps?.[k]; out.steps[k] = { on: x?.on !== false, note: typeof x?.note === "string" ? x.note : "" }; }
  return out;
}

/** where a part comes from, in a few words (pure) */
export function fromLine(part: Part, v: Pick<ProjectView, "from" | "set">, ago: (iso: string) => string): string {
  const s = v.set[part];
  if (s) return `set by ${s.by}${s.agreed.length ? `, agreed by ${s.agreed.join(", ")}` : ""} · ${ago(s.at)}`;
  const f = v.from[part] ?? "default";
  if (f === "file") return part === "owners" ? "from the repository's CODEOWNERS, until the project agrees its own; CODEOWNERS is written from it after" : "from the repository's .sol/rhythm.json, until the project agrees its own";
  return "the default, until the project agrees its own";
}

/** who has said what on a proposal, and who it still waits for (pure) */
export function waitsOn(p: Pick<ProposalView, "needs" | "votes">): { agreed: string[]; notYet: string[]; waiting: string[] } {
  const agreed: string[] = [], notYet: string[] = [], waiting: string[] = [];
  for (const l of p.needs) (p.votes[l] === "agree" ? agreed : p.votes[l] === "not yet" ? notYet : waiting).push(l);
  return { agreed, notYet, waiting };
}

export type Form =
  | { part: "rhythm"; r: ProjectRhythm; dev: string; beta: string; devBackup?: string; betaBackup?: string; why: string; error?: string; busy?: boolean }
  | { part: "agents"; a: AgentRules; why: string; error?: string; busy?: boolean }
  | { part: "owners"; rows: { area: string; leads: string }[]; why: string; error?: string; busy?: boolean }
  | { part: "blocks"; id: string; on: boolean; why: string; error?: string; busy?: boolean }
  | { part: "onboarding"; o: Onboarding; why: string; error?: string; busy?: boolean };

/** the form's patch (pure): the part whole, as the engine wants it */
/** what the engine refuses in a rhythm change, said before it is sent (pure, #478; project.ts rhythmRefusal): a
 *  backup with no zone, or a handover outside the night; "" when it may go */
export function formRefusal(f: Form): string {
  if (f.part !== "rhythm") return "";
  if (!logins(f.devBackup ?? "").length && !logins(f.betaBackup ?? "").length) return "";
  if (!f.r.zone) return "a backup needs the rhythm's zone, so the handover is the same hour on every Mac: name the zone too";
  const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  const rel = (t: string) => (m(t) - m(f.r.review) + 1440) % 1440;
  const h = rel(f.r.handover ?? "23:00"), end = rel(f.r.until) || 1440;
  return h > 0 && h < end ? "" : `the handover (${f.r.handover ?? "23:00"}) must fall between the review hour (${f.r.review}) and the end of the night (${f.r.until})`;
}

export function patchOf(f: Form): Patch {
  if (f.part === "rhythm") return { rhythm: { ...f.r, dev: logins(f.dev), beta: logins(f.beta), ...(f.devBackup !== undefined ? { devBackup: logins(f.devBackup) } : {}), ...(f.betaBackup !== undefined ? { betaBackup: logins(f.betaBackup) } : {}) } };
  if (f.part === "agents") return { agents: f.a };
  if (f.part === "blocks") return blockPatch(f.id, f.on);
  if (f.part === "onboarding") return { onboarding: f.o };
  const owners: Owners = {};
  for (const r of f.rows) { const area = r.area.trim().toLowerCase(), leads = logins(r.leads).slice(0, 2); if (area && leads.length) owners[area] = leads; }
  return { owners };
}

