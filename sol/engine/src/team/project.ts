// A project's settings (#428, part of #413, area C2): one file in the project's record, `.sol/project.json`, written
// through the kit's store (kit.ts, compare-and-swap on the file's sha), so a GitHub project keeps it in its record repo
// and a cloud project on the cloud. SOL's own record is not sol-dev's main (#439): nothing here writes to a code repo.
//   rhythm      the times (hand in, review, release, until; HH:MM in `zone`), the dev and beta reviewers, each night's
//               backup and the handover hour (#478, `devBackup`, `betaBackup`, `handover`), and the night job's hour and
//               still-claim days (`night`, from team.json by conversion step 0002)
//   agents      what agents share with each other: "facts" (the default) or "more"; and whether an agent may take a
//               change back to draft (`pick`, default off; handing one in is the person's press only, #476)
//   owners      the ownership table: an area label → one or two leads. CODEOWNERS is written from it (codeowners.ts,
//               #438); until the record has a table, the code repository's CODEOWNERS leads are its starting value
//   onboarding  what Cowork walks a person through when they join (#430, onboard.ts): a welcome line, and for each
//               step (the night, who owns what, how to hand in, what agents may do) whether it is shown and the
//               project's own note under it. Until the record has one it is `{}`, read as the default
//   blocks      which team blocks are on (#429, blocks.ts): an id's on or off, and a team's own block's declaration
//   proposals   every change asked for, signed by who asked, with the poll that carries the agreement
// Nobody edits a setting straight: a change is a proposal, and the people it names must agree. The agreement is a poll
// in the project's polls (polls.ts), "agree" or "not yet", one vote a person; the change applies once every person it
// needs said agree (`settle`, run by any Sol that sees a vote; two Sols at once meet in the compare-and-swap). A
// setting that changed under a proposal since it was made is not overwritten: the proposal is `outdated`.
// Until the record has a rhythm of its own, a repository's committed `.sol/rhythm.json` (tonight.ts) is its starting
// value, and night.json (nightfile.ts) the night job's; the first change agreed writes the whole rhythm to the record.
// The small reads for the other builders, each with its defaults and never throwing: projectRhythm(), agentRules(),
// owners(), mayAgentsPick(). Pure but for the store and the reads at the end.
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { Store, type Applied } from "./kit.js";
import { polls, type Poll } from "./polls.js";
import { rhythmOf, setRhythmSource, forgetRhythms, parseRhythm, handoverFits, RHYTHM_PATH, HANDOVER, type Rhythm } from "./tonight.js";
import { NIGHT_DEFAULT, cleanNight, nightFilePath, carriedNight, writeNightFile, type Night } from "./nightfile.js";
import type { ThingsDeps } from "./things.js";
import { setPickSource, forgetPicks } from "./handin.js";
import { cleanBlocksPart, sortBlocks, blocksIn, mergeBlocks, sameBlocks, blocksSummary, type BlocksPart, type BlockView } from "./blocks.js";   // team blocks (#429)
import { tableOf, CODEOWNERS } from "./codeowners.js";

export const PROJECT_PATH = ".sol/project.json";
export const AGREE = 0, NOT_YET = 1;
export const POLL_OPTIONS = ["agree", "not yet"];
export const PROPOSALS_MAX = 40;
export const AREAS_MAX = 30;

export type ProjectRhythm = Rhythm & { night: Night };
export type AgentRules = { share: "facts" | "more"; pick: boolean };
export type Owners = Record<string, string[]>;
export const STEPS = ["night", "owners", "handin", "agents"] as const;
export type StepId = (typeof STEPS)[number];
export type Onboarding = { welcome: string; steps: Record<StepId, { on: boolean; note: string }> };
export const WELCOME_MAX = 300, NOTE_MAX = 300;
export type Part = "rhythm" | "agents" | "owners" | "blocks" | "onboarding";
export const PARTS: Part[] = ["rhythm", "agents", "owners", "blocks", "onboarding"];
export type Patch = { rhythm?: ProjectRhythm; agents?: AgentRules; owners?: Owners; blocks?: BlocksPart; onboarding?: Onboarding };
export type ProposalState = "open" | "applied" | "refused" | "withdrawn" | "outdated";
export type Proposal = {
  id: string; by: string; at: string; why?: string;
  patch: Patch;            // the parts as they would be, each whole
  was: Patch;              // the same parts as they were when it was asked
  needs: string[];         // who must agree (lowercased logins)
  poll: string;            // the poll that carries the agreement
  state: ProposalState;
  agent?: true;            // asked by the person's agent (#429): its person is among who must agree, and has not yet
  done?: { at: string; agreed?: string[]; by?: string };
};
/** who last set a part, by which proposal (the page says it, signed) */
export type SetBy = { by: string; at: string; proposal: string; agreed: string[] };
export type ProjectFile = {
  v: 1 | 2; rhythm?: ProjectRhythm; agents?: AgentRules; owners?: Owners; blocks?: BlocksPart; onboarding?: Onboarding;
  set: Partial<Record<Part, SetBy>>; proposals: Proposal[]; newer?: true;
};
/** what a project starts from before its record has a part of its own */
export type Start = { rhythm?: Rhythm | null; night?: Night | null; unsure?: true; owners?: Owners | null; ownersUnsure?: true };   // unsure: the rhythm file could not be read; ownersUnsure: CODEOWNERS could not

export const RHYTHM_DEFAULT: ProjectRhythm = { handIn: "20:00", review: "21:00", release: "09:00", until: "06:00", zone: "", dev: [], beta: [], handover: HANDOVER, devBackup: [], betaBackup: [], night: { ...NIGHT_DEFAULT } };
export const AGENTS_DEFAULT: AgentRules = { share: "facts", pick: false };
export const onboardingDefault = (): Onboarding => ({ welcome: "", steps: Object.fromEntries(STEPS.map((k) => [k, { on: true, note: "" }])) as Onboarding["steps"] });

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const AREA = /^[A-Za-z0-9][A-Za-z0-9 _./-]{0,39}$/;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
const hhmm = (v: unknown, d: string) => (typeof v === "string" && HHMM.test(v.trim()) ? v.trim().padStart(5, "0") : d);
const zoneOk = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };
const loginList = (v: unknown, max: number) => {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) {
    const l = String(x).trim();
    if (LOGIN.test(l) && !out.some((y) => y.toLowerCase() === l.toLowerCase())) out.push(l);
    if (out.length === max) break;
  }
  return out;
};
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : "");

// ---- the parts, made valid (pure) ----

/** a rhythm as given, made valid: a bad time is its default, an unknown zone is none (each machine's clock) */
export function cleanRhythm(v: unknown, base: ProjectRhythm = RHYTHM_DEFAULT): ProjectRhythm | null {
  if (!isObj(v)) return null;
  const z = typeof v.zone === "string" ? v.zone.trim() : base.zone;
  return {
    handIn: hhmm(v.handIn, base.handIn), review: hhmm(v.review, base.review), release: hhmm(v.release, base.release), until: hhmm(v.until, base.until),
    zone: z && zoneOk(z) ? z : "",
    dev: "dev" in v ? loginList(v.dev, 10) : [...base.dev], beta: "beta" in v ? loginList(v.beta, 10) : [...base.beta],
    // each night's backup and the handover hour (#478): a rhythm written before them has none, and 23:00
    handover: hhmm(v.handover, base.handover ?? HANDOVER),
    devBackup: "devBackup" in v ? loginList(v.devBackup, 10) : [...(base.devBackup ?? [])], betaBackup: "betaBackup" in v ? loginList(v.betaBackup, 10) : [...(base.betaBackup ?? [])],
    night: cleanNight(v.night) ?? { ...base.night },
  };
}
export function cleanAgents(v: unknown): AgentRules | null {
  if (!isObj(v)) return null;
  return { share: v.share === "more" ? "more" : "facts", pick: v.pick === true };
}
/** the ownership table: an area's label (one line, a GitHub label's shape) → one or two leads; an area with none is left out */
export function cleanOwners(v: unknown): Owners | null {
  if (!isObj(v)) return null;
  const out: Owners = {};
  for (const [k, x] of Object.entries(v)) {
    const area = oneLine(k, 40).toLowerCase();
    const leads = loginList(x, 2);
    if (!AREA.test(area) || !leads.length || area in out) continue;
    out[area] = leads;
    if (Object.keys(out).length === AREAS_MAX) break;
  }
  return out;
}
/** what the walk shows (#430): a welcome line and, per step, shown or not and the project's note (a few lines, no
 *  control characters but the line break). `{}` (the file as #428 wrote it) is no onboarding of the project's own */
export function cleanOnboarding(v: unknown): Onboarding | null {
  if (!isObj(v) || (!("welcome" in v) && !("steps" in v))) return null;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x : "").replace(/\r\n?/g, "\n").replace(/[\p{Cf}]|[^\P{Cc}\n]/gu, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
  const out = onboardingDefault();
  out.welcome = text(v.welcome, WELCOME_MAX);
  const steps = isObj(v.steps) ? v.steps : {};
  for (const k of STEPS) { const x = steps[k]; if (isObj(x)) out.steps[k] = { on: x.on !== false, note: text(x.note, NOTE_MAX) }; }
  return out;
}
const cleanPart = (p: Part, v: unknown, base?: ProjectRhythm) => (p === "rhythm" ? cleanRhythm(v, base) : p === "agents" ? cleanAgents(v) : p === "blocks" ? cleanBlocksPart(v) : p === "onboarding" ? cleanOnboarding(v) : cleanOwners(v));
function cleanPatch(v: unknown, base?: ProjectRhythm): Patch {
  const out: Patch = {};
  if (!isObj(v)) return out;
  for (const p of PARTS) if (p in v) { const c = cleanPart(p, v[p], base); if (c) (out as Record<Part, unknown>)[p] = c; }
  return out;
}

function cleanProposal(v: unknown): Proposal | null {
  if (!isObj(v)) return null;
  const at = iso(v.at), id = typeof v.id === "string" && /^[0-9a-f]{8}$/.test(v.id) ? v.id : "";
  const patch = cleanPatch(v.patch), was = cleanPatch(v.was);
  if (!at || !id || !Object.keys(patch).length || typeof v.poll !== "string" || !/^[0-9a-f]{8}$/.test(v.poll)) return null;
  const state: ProposalState = (["open", "applied", "refused", "withdrawn", "outdated"] as const).find((s) => s === v.state) ?? "open";
  const p: Proposal = { id, by: typeof v.by === "string" && LOGIN.test(v.by) ? v.by : "", at, patch, was, needs: loginList(v.needs, 20).map((x) => x.toLowerCase()), poll: v.poll, state };
  const why = oneLine(v.why, 200);
  if (why) p.why = why;
  if (v.agent === true) p.agent = true;
  if (isObj(v.done) && iso(v.done.at)) p.done = { at: iso(v.done.at), ...(Array.isArray(v.done.agreed) ? { agreed: loginList(v.done.agreed, 20) } : {}), ...(typeof v.done.by === "string" && LOGIN.test(v.done.by) ? { by: v.done.by } : {}) };
  return p;
}

const empty = (): ProjectFile => ({ v: 1, set: {}, proposals: [] });

/** the file as read, made valid (pure): a part that is not there is the project's default (or its starting value) */
export function parseProject(text: unknown): ProjectFile {
  let raw: unknown;
  try { raw = JSON.parse(String(text ?? "")); } catch { return empty(); }
  if (!isObj(raw)) return empty();
  const f = empty();
  const r = cleanRhythm(raw.rhythm), a = cleanAgents(raw.agents), o = cleanOwners(raw.owners), b = cleanBlocksPart(raw.blocks);
  if (r) f.rhythm = r;
  if (a) f.agents = a;
  if (o) f.owners = o;
  if (b) f.blocks = b;
  const ob = cleanOnboarding(raw.onboarding);
  if (ob) f.onboarding = ob;
  if (isObj(raw.set)) for (const p of PARTS) {
    const s = raw.set[p];
    if (isObj(s) && iso(s.at) && typeof s.by === "string" && LOGIN.test(s.by)) f.set[p] = { by: s.by, at: iso(s.at), proposal: typeof s.proposal === "string" ? s.proposal.slice(0, 8) : "", agreed: loginList(s.agreed, 20) };
  }
  const seen = new Set<string>();
  for (const x of Array.isArray(raw.proposals) ? raw.proposals : []) { const p = cleanProposal(x); if (p && !seen.has(p.id)) { seen.add(p.id); f.proposals.push(p); } }
  if (typeof raw.v === "number" && raw.v > FILE_V) f.newer = true;
  return f;
}

/** the file's version (#478): 2 once a rhythm in it names a backup or a handover hour of its own, so a Sol from before
 *  them (which reads only 1) refuses to write the file ("written by a newer Sol") instead of settling a proposal and
 *  dropping the keys it does not know. A file without them stays 1, and every Sol writes it as before */
const FILE_V = 2;
const backedUp = (r?: ProjectRhythm) => !!r && (!!r.devBackup?.length || !!r.betaBackup?.length || (r.handover ?? HANDOVER) !== HANDOVER);
export const versionOf = (f: Pick<ProjectFile, "rhythm" | "proposals">): 1 | 2 =>
  backedUp(f.rhythm) || f.proposals.some((p) => backedUp(p.patch.rhythm) || backedUp(p.was.rhythm)) ? 2 : 1;

/** what a rhythm change may not be (pure, #478): a backup with no zone (the handover would be each Mac's own 23:00), or
 *  a handover outside the night (after the review hour, before `until`); "" when it may */
export function rhythmRefusal(r: ProjectRhythm): string {
  if (!(r.devBackup?.length || r.betaBackup?.length)) return "";
  if (!r.zone) return "a backup needs the rhythm's zone, so the handover is the same hour on every Mac: name the zone too";
  if (!handoverFits({ review: r.review, until: r.until, handover: r.handover ?? HANDOVER })) return `the handover (${r.handover ?? HANDOVER}) must fall between the review hour (${r.review}) and the end of the night (${r.until})`;
  return "";
}

/** the file as written (pure): one shape, the parts in one order, so a write that changes nothing is never a commit */
export function serializeProject(f: ProjectFile): string {
  const sortOwners = (o?: Owners) => (o ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])) : undefined);
  const patchOut = (p: Patch) => ({ ...(p.rhythm ? { rhythm: p.rhythm } : {}), ...(p.agents ? { agents: p.agents } : {}), ...(p.owners ? { owners: sortOwners(p.owners) } : {}), ...(p.blocks ? { blocks: sortBlocks(p.blocks) } : {}), ...(p.onboarding ? { onboarding: p.onboarding } : {}) });
  return JSON.stringify({
    v: versionOf(f),
    ...(f.rhythm ? { rhythm: f.rhythm } : {}), ...(f.agents ? { agents: f.agents } : {}), ...(f.owners ? { owners: sortOwners(f.owners) } : {}),
    ...(f.blocks ? { blocks: sortBlocks(f.blocks) } : {}),
    onboarding: f.onboarding ?? {}, set: f.set,
    proposals: f.proposals.map((p) => ({ id: p.id, by: p.by, at: p.at, ...(p.why ? { why: p.why } : {}), patch: patchOut(p.patch), was: patchOut(p.was), needs: p.needs, poll: p.poll, state: p.state, ...(p.agent ? { agent: true } : {}), ...(p.done ? { done: p.done } : {}) })),
  }, null, 2) + "\n";
}

// ---- what is in force (pure) ----

/** the rhythm in force: the record's own, else the starting values (the committed rhythm file, the night job's file),
 *  else the defaults */
export function rhythmIn(f: Pick<ProjectFile, "rhythm"> | null, start: Start = {}): ProjectRhythm {
  if (f?.rhythm) return f.rhythm;
  const r = start.rhythm;
  return { ...RHYTHM_DEFAULT, ...(r ? { handIn: r.handIn, review: r.review, release: r.release, until: r.until, zone: r.zone, dev: [...r.dev], beta: [...r.beta], handover: r.handover ?? HANDOVER, devBackup: [...(r.devBackup ?? [])], betaBackup: [...(r.betaBackup ?? [])] } : {}), night: start.night ? { ...start.night } : { ...NIGHT_DEFAULT } };
}
export const agentsIn = (f: Pick<ProjectFile, "agents"> | null): AgentRules => f?.agents ?? { ...AGENTS_DEFAULT };
export const ownersIn = (f: Pick<ProjectFile, "owners"> | null, start: Start = {}): Owners => f?.owners ?? (start.owners ? { ...start.owners } : {});
export const onboardingIn = (f: Pick<ProjectFile, "onboarding"> | null): Onboarding => f?.onboarding ?? onboardingDefault();
/** the project's word on its blocks (empty: every block as it starts) */
export const blocksPartIn = (f: Pick<ProjectFile, "blocks"> | null): BlocksPart => f?.blocks ?? {};
/** every block of the project, with whether it is live (blocks.ts) */
export const blockViewsIn = (f: Pick<ProjectFile, "blocks"> | null): BlockView[] => blocksIn(blocksPartIn(f));
/** where each part comes from, for the page: the record, the starting file, or the defaults */
export function fromWhere(f: ProjectFile | null, start: Start = {}): { rhythm: "record" | "file" | "default"; night: "record" | "carried" | "default"; agents: "record" | "default"; owners: "record" | "file" | "default"; blocks: "record" | "default"; onboarding: "record" | "default" } {
  return {
    rhythm: f?.rhythm ? "record" : start.rhythm ? "file" : "default",
    night: f?.rhythm ? "record" : start.night ? "carried" : "default",
    agents: f?.agents ? "record" : "default", owners: f?.owners ? "record" : start.owners && Object.keys(start.owners).length ? "file" : "default",
    blocks: f?.blocks ? "record" : "default",
    onboarding: f?.onboarding ? "record" : "default",
  };
}
const partIn = (f: ProjectFile, p: Part, start: Start): ProjectRhythm | AgentRules | Owners | BlocksPart | Onboarding => (p === "rhythm" ? rhythmIn(f, start) : p === "agents" ? agentsIn(f) : p === "blocks" ? blocksPartIn(f) : p === "onboarding" ? onboardingIn(f) : ownersIn(f, start));

/** the same value (pure): JSON of a canonical form, so key order and login case never count as a change */
export function same(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : typeof v === "string" ? v.toLowerCase() : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** who a change names, so who must agree (pure, lowercased): a rhythm change, its reviewers and backups before and after; an owners
 *  change, the leads of every area it changes, before and after; an agents or onboarding change, everyone the settings name. None
 *  named: the one who asks */
export function needsFor(patch: Patch, was: Patch, now: { rhythm: ProjectRhythm; owners: Owners }, by: string): string[] {
  const out = new Set<string>();
  const add = (l: string[]) => l.forEach((x) => out.add(x.toLowerCase()));
  if (patch.rhythm) {
    add(patch.rhythm.dev); add(patch.rhythm.beta); add(was.rhythm?.dev ?? []); add(was.rhythm?.beta ?? []);
    // each night's backup (#478): named in, or named out, they agree too
    add(patch.rhythm.devBackup ?? []); add(patch.rhythm.betaBackup ?? []); add(was.rhythm?.devBackup ?? []); add(was.rhythm?.betaBackup ?? []);
  }
  if (patch.owners) {
    const before = was.owners ?? {}, after = patch.owners;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (!same(before[k] ?? [], after[k] ?? [])) { add(before[k] ?? []); add(after[k] ?? []); }
  }
  // agents, blocks and onboarding: the whole team the settings name (a block goes live once the team agrees, #429)
  if (patch.agents || patch.blocks || patch.onboarding) { add(now.rhythm.dev); add(now.rhythm.beta); Object.values(now.owners).forEach(add); }
  if (!out.size && LOGIN.test(by)) out.add(by.toLowerCase());
  return [...out].sort();
}

/** the change in a few words (pure): the poll's question and the page's line */
export function summary(patch: Patch, was: Patch): string {
  const bits: string[] = [];
  if (patch.rhythm) {
    const a = patch.rhythm, b = was.rhythm;
    const ch: string[] = [];
    for (const k of ["handIn", "review", "release", "until"] as const) if (!b || a[k] !== b[k]) ch.push(`${{ handIn: "hand in", review: "review", release: "release", until: "until" }[k]} ${a[k]}`);
    if (!b || a.zone !== b.zone) ch.push(`zone ${a.zone || "each Mac's clock"}`);
    if (!b || !same(a.dev, b.dev)) ch.push(`dev ${a.dev.join(", ") || "nobody"}`);
    if (!b || !same(a.beta, b.beta)) ch.push(`beta ${a.beta.join(", ") || "nobody"}`);
    if (!b || !same(a.devBackup ?? [], b.devBackup ?? [])) ch.push(`dev backup ${(a.devBackup ?? []).join(", ") || "nobody"}`);
    if (!b || !same(a.betaBackup ?? [], b.betaBackup ?? [])) ch.push(`beta backup ${(a.betaBackup ?? []).join(", ") || "nobody"}`);
    if (!b || (a.handover ?? HANDOVER) !== (b.handover ?? HANDOVER)) ch.push(`handover ${a.handover ?? HANDOVER}`);
    if (!b || a.night.hour !== b.night.hour) ch.push(`night job ${String(a.night.hour).padStart(2, "0")}:00`);
    if (!b || a.night.staleDays !== b.night.staleDays) ch.push(`claims drop after ${a.night.staleDays} days`);
    bits.push(`rhythm: ${ch.join(", ") || "as it is"}`);
  }
  if (patch.agents) bits.push(`agents share ${patch.agents.share === "more" ? "more than facts" : "facts only"}${!was.agents || patch.agents.pick !== was.agents.pick ? `, ${patch.agents.pick ? "may" : "may not"} take a change back to draft` : ""}`);
  if (patch.owners) {
    const before = was.owners ?? {}, after = patch.owners, ch: string[] = [];
    for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) if (!same(before[k] ?? [], after[k] ?? [])) ch.push(after[k] ? `${k} → ${after[k].join(" + ")}` : `${k} no lead`);
    bits.push(`owners: ${ch.join(", ") || "as they are"}`);
  }
  if (patch.blocks) bits.push(`blocks: ${blocksSummary(patch.blocks, was.blocks)}`);
  if (patch.onboarding) {
    const a = patch.onboarding, b = was.onboarding, ch: string[] = [];
    if (!b || a.welcome !== b.welcome) ch.push(a.welcome ? "the welcome" : "no welcome");
    for (const k of STEPS) {
      const x = a.steps[k], y = b?.steps[k];
      if (!y || x.on !== y.on) ch.push(`${STEP_WORD[k]} ${x.on ? "shown" : "left out"}`);
      if (!y || x.note !== y.note) ch.push(`${STEP_WORD[k]}'s note`);
    }
    bits.push(`onboarding: ${ch.join(", ") || "as it is"}`);
  }
  return bits.join("; ");
}
/** a step's name in a change's few words */
export const STEP_WORD: Record<StepId, string> = { night: "the night", owners: "who owns what", handin: "handing in", agents: "what agents may do" };
export const proposalId = (by: string, at: string, patch: Patch) => createHash("sha256").update(`${by}|${at}|${JSON.stringify(patch)}`).digest("hex").slice(0, 8);
/** the poll's question (pure): the change, and the proposal's id so the two are found together */
export const questionOf = (id: string, patch: Patch, was: Patch) => {
  const tail = ` (${id})`, head = "Project settings: ";
  const s = summary(patch, was);
  return head + (s.length > 120 - head.length - tail.length ? s.slice(0, 120 - head.length - tail.length - 1) + "…" : s) + tail;
};

// ---- the changes (pure) ----

export type ProjectOp =
  | { propose: { id: string; patch: Patch; was: Patch; needs: string[]; poll: string; by: string; at: string; why?: string; agent?: boolean } }
  | { settle: { polls: Poll[]; at: string } }
  | { withdraw: { id: unknown; by: string; at: string } };
export type ProjectResult = { proposal?: Proposal; settled?: Proposal[] };

/** whether a proposal has passed, failed, or waits (pure): passed when every login it needs voted agree; failed when its
 *  poll is closed (or gone) without that */
export function verdict(p: Pick<Proposal, "needs">, poll: Poll | undefined): "passed" | "failed" | "waits" {
  if (!poll) return "failed";
  // a login's votes under every case it was written in: agree only when each of them says agree
  const agrees = (l: string) => { const v = Object.entries(poll.votes).filter(([k]) => k.toLowerCase() === l); return v.length > 0 && v.every(([, n]) => n === AGREE); };
  if (p.needs.length && p.needs.every(agrees)) return "passed";
  return poll.closed ? "failed" : "waits";
}

export function applyProject(f: ProjectFile, op: ProjectOp): Applied<ProjectFile, ProjectResult> {
  if ("propose" in op) {
    const a = op.propose;
    if (!LOGIN.test(a.by)) return { file: f, changed: false, error: "who asks? sign in first" };
    const parts = PARTS.filter((p) => a.patch[p]);
    if (!parts.length) return { file: f, changed: false, error: "nothing to change" };
    const busy = parts.find((p) => f.proposals.some((x) => x.state === "open" && x.patch[p]));
    if (busy) return { file: f, changed: false, error: `a change to the ${busy === "agents" ? "agent rules" : busy} is waiting for agreement already: agree to it, or withdraw it, first` };
    if (f.proposals.some((x) => x.id === a.id)) return { file: f, changed: false, result: { proposal: f.proposals.find((x) => x.id === a.id) } };
    const p: Proposal = { id: a.id, by: a.by, at: a.at, ...(a.why ? { why: oneLine(a.why, 200) } : {}), patch: a.patch, was: a.was, needs: a.needs, poll: a.poll, state: "open", ...(a.agent ? { agent: true as const } : {}) };
    let proposals = [...f.proposals, p];
    while (proposals.length > PROPOSALS_MAX) { const i = proposals.findIndex((x) => x.state !== "open"); if (i < 0) break; proposals.splice(i, 1); }
    return { file: { ...f, proposals }, changed: true, result: { proposal: p }, message: `project: ${a.by} proposed ${summary(a.patch, a.was).slice(0, 60)}` };
  }
  if ("withdraw" in op) {
    const p = f.proposals.find((x) => x.id === op.withdraw.id);
    if (!p) return { file: f, changed: false, error: "no such proposal" };
    if (p.state !== "open") return { file: f, changed: false, error: `this proposal is ${p.state} already` };
    if (p.by.toLowerCase() !== op.withdraw.by.toLowerCase()) return { file: f, changed: false, error: "only the one who proposed it can withdraw it" };
    const next: Proposal = { ...p, state: "withdrawn", done: { at: op.withdraw.at, by: op.withdraw.by } };
    return { file: { ...f, proposals: f.proposals.map((x) => (x === p ? next : x)) }, changed: true, result: { proposal: next }, message: `project: ${op.withdraw.by} withdrew a proposal` };
  }
  // settle: every open proposal looked at against its poll, oldest first, so two that pass apply in the order asked
  const { polls: list, at } = op.settle;
  let file: ProjectFile = { ...f, set: { ...f.set }, proposals: [...f.proposals] };
  const settled: Proposal[] = [];
  for (let i = 0; i < file.proposals.length; i++) {
    const p = file.proposals[i];
    if (p.state !== "open") continue;
    const poll = list.find((x) => x.id === p.poll);
    const v = verdict(p, poll);
    if (v === "waits") continue;
    let next: Proposal;
    if (v === "failed") next = { ...p, state: "refused", done: { at } };
    else {
      const parts = PARTS.filter((x) => p.patch[x]);
      // a part the record holds that moved since the proposal was made (another change applied first) is never
      // overwritten. A part the record does not hold yet has not moved: its starting value is read on each Sol (one
      // may not see the committed rhythm file), so it is never compared
      const moved = parts.some((x) => file[x] !== undefined && p.was[x] !== undefined && !same(file[x], p.was[x]));
      const agreed = [...p.needs];   // passed: every one of them agreed
      if (moved) next = { ...p, state: "outdated", done: { at, agreed } };
      else {
        for (const x of parts) {
          (file as Record<Part, unknown>)[x] = p.patch[x];
          file.set[x] = { by: p.by, at, proposal: p.id, agreed };
        }
        next = { ...p, state: "applied", done: { at, agreed } };
      }
    }
    file.proposals[i] = next;
    settled.push(next);
  }
  if (!settled.length) return { file: f, changed: false, result: { settled } };
  return { file, changed: true, result: { settled }, message: `project: ${settled.map((p) => `${p.state} ${summary(p.patch, p.was).slice(0, 40)}`).join("; ").slice(0, 100)}` };
}

export const project = new Store<ProjectFile, ProjectOp, ProjectResult>(PROJECT_PATH, parseProject, serializeProject, applyProject, "project settings");

// ---- the flow, through the stores ----

/** a proposal: its poll asked (the asker's vote in it, agree), then the proposal written with the poll's id, then
 *  settled at once (a change that names nobody but the asker applies now). A proposal that could not be written closes
 *  its poll again */
export async function propose(d: ThingsDeps, repo: string, a: { patch: unknown; by: string; why?: unknown; start: Start; at?: string; agent?: boolean }): Promise<{ proposal: Proposal } | { error: string }> {
  if (!repo) return { error: "this project has no record yet" };
  if (!LOGIN.test(a.by)) return { error: "who asks? sign in first" };
  let f: ProjectFile;
  try { f = await project.get(d, repo, true); } catch (e) { return { error: `couldn't read the project's settings: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200)}` }; }
  if (f.newer) return { error: "this project's settings were written by a newer Sol; update Sol first" };
  // who must agree is read from the rhythm in force: when that is the repository's file and it could not be read, a
  // rhythm or agents change would be asked of nobody but the asker. Refused instead, never guessed
  if (a.start.unsure && !f.rhythm && isObj(a.patch) && ("rhythm" in a.patch || "agents" in a.patch || "blocks" in a.patch || "onboarding" in a.patch)) return { error: "couldn't read the repository's .sol/rhythm.json, so who must agree is not known: try again in a moment" };
  // the same for owners: until the record has a table, the leads CODEOWNERS names are who a change moves
  if (a.start.ownersUnsure && !f.owners && isObj(a.patch) && ("owners" in a.patch || "agents" in a.patch || "blocks" in a.patch || "onboarding" in a.patch)) return { error: "couldn't read the repository's CODEOWNERS, so who leads now is not known: try again in a moment" };
  const now = rhythmIn(f, a.start);
  // blocks (#429): the change names only the blocks it changes, laid over the part as it is, so the proposal holds the
  // part whole as every other part's does
  let given = a.patch;
  if (isObj(given) && "blocks" in given) {
    const m = mergeBlocks(blocksPartIn(f), given.blocks);
    if ("error" in m) return { error: m.error };
    if (sameBlocks(m.part, blocksPartIn(f))) return { error: "nothing changes: that is how it is already" };
    given = { ...given, blocks: m.part };
  }
  const patch = cleanPatch(given, now);
  const was: Patch = {};
  for (const p of PARTS) if (patch[p]) (was as Record<Part, unknown>)[p] = partIn(f, p, a.start);
  for (const p of PARTS) if (patch[p] && same(patch[p], was[p])) { delete patch[p]; delete was[p]; }
  if (!Object.keys(patch).length) return { error: "nothing changes: that is how it is already" };
  const refused = patch.rhythm ? rhythmRefusal(patch.rhythm) : "";
  if (refused) return { error: refused };
  const at = a.at ?? new Date().toISOString();
  const id = proposalId(a.by, at, patch);
  // an agent's proposal (#429) is never agreed for its person: they are among who must agree, and vote themselves
  const needs = needsFor(patch, was, { rhythm: now, owners: ownersIn(f, a.start) }, a.by);
  if (a.agent && !needs.includes(a.by.toLowerCase())) { needs.push(a.by.toLowerCase()); needs.sort(); }
  const asked = await polls.change(d, repo, { add: { question: questionOf(id, patch, was), options: POLL_OPTIONS, by: a.by, at, ...(a.agent ? { agent: true } : {}) } });
  if ("error" in asked) return { error: `the agreement could not be asked: ${asked.error}` };
  const poll = asked.result!.poll;
  if (!a.agent) await polls.change(d, repo, { vote: { id: poll.id, option: AGREE, by: a.by } }).catch(() => null);
  const why = oneLine(a.why, 200);
  const r = await project.change(d, repo, { propose: { id, patch, was, needs, poll: poll.id, by: a.by, at, ...(why ? { why } : {}), ...(a.agent ? { agent: true } : {}) } });
  if ("error" in r) { await polls.change(d, repo, { close: { id: poll.id, by: a.by, at } }).catch(() => null); return { error: r.error }; }
  await settle(d, repo).catch(() => null);
  const after = (await project.get(d, repo).catch(() => null))?.proposals.find((x) => x.id === id) ?? r.result!.proposal!;
  return { proposal: after };
}

/** every open proposal of the project against its poll: what passed applies, what failed is refused, and their polls
 *  close. Any Sol may run it; it changes nothing when nothing is decided */
export async function settle(d: ThingsDeps, repo: string, at = new Date().toISOString()): Promise<Proposal[]> {
  if (!repo) return [];
  const f = await project.get(d, repo);
  if (!f.proposals.some((p) => p.state === "open")) return [];
  const pf = await polls.get(d, repo, true);
  const r = await project.change(d, repo, { settle: { polls: pf.polls, at } });
  if ("error" in r) return [];
  const done = r.result?.settled ?? [];
  for (const p of done) {
    const poll = pf.polls.find((x) => x.id === p.poll);
    if (poll && !poll.closed) await polls.change(d, repo, { close: { id: poll.id, by: p.by, at } }).catch(() => null);
  }
  return done;
}

/** withdraw my own open proposal; its poll closes */
export async function withdraw(d: ThingsDeps, repo: string, a: { id: unknown; by: string; at?: string }): Promise<{ proposal: Proposal } | { error: string }> {
  const at = a.at ?? new Date().toISOString();
  const r = await project.change(d, repo, { withdraw: { id: a.id, by: a.by, at } });
  if ("error" in r) return { error: r.error };
  const p = r.result!.proposal!;
  await polls.change(d, repo, { close: { id: p.poll, by: a.by, at } }).catch(() => null);
  return { proposal: p };
}

// ---- the reads for everyone else (wired once by wire.ts) ----

export type ProjectDeps = {
  things: () => ThingsDeps;
  /** the project a repository (a code repo or a record) belongs to here: its record, and its first code repository;
   *  none named: the project in use */
  where: (repo?: string) => { record: string; code: string };
  gh?: (args: string[]) => Promise<string>;
  now?: () => Date;
  /** the night job's file (nightfile.ts); the tests point it elsewhere */
  nightFile?: string;
};
let deps: ProjectDeps | null = null;

/** wire the reads (wire.ts, once): tonight's rhythm loader reads the record first from now on */
export function useProject(d: ProjectDeps | null) {
  deps = d;
  setRhythmSource(d ? async (repo) => {
    const { record } = d.where(repo);
    if (!record) return undefined;
    const f = await project.get(d.things(), record);
    return f.rhythm ?? undefined;
  } : null);
  // the hand-in's "may agents pick" (#420, handin.ts) reads the record's agent rules first, as the rhythm does
  setPickSource(d ? async (repo) => {
    const { record } = d.where(repo);
    if (!record) return undefined;
    const f = await project.get(d.things(), record);
    return f.agents ? f.agents.pick : undefined;
  } : null);
}
project.on(() => { forgetRhythms(); forgetPicks(); });

/** what a project starts from: the committed rhythm file of its code repo (tonight.ts's loader, so one read and one
 *  cache), the night job's file, and the leads its CODEOWNERS names (#438). Never throws */
export async function startOf(code: string): Promise<Start> {
  const night = deps?.nightFile ? carriedNight(deps.nightFile, join(dirname(deps.nightFile), "team.json")) : carriedNight();
  let rhythm: Rhythm | null = null;
  if (!code) return { rhythm, night };   // a project with no code repository has no rhythm file
  if (!deps?.gh || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(code)) return { rhythm, night, unsure: true, owners: null, ownersUnsure: true };
  const own = await startOwners(code);
  rhythm = await rhythmOf({ gh: deps.gh, now: deps.now ?? (() => new Date()) }, code).catch(() => null);
  if (rhythm) return { rhythm, night, ...own };
  // none: told apart, a repository without the file (404) from one that could not be asked (then who must agree is unknown)
  try { rhythm = parseRhythm(await deps.gh(["api", `repos/${code}/contents/${RHYTHM_PATH}`, "-H", "Accept: application/vnd.github.raw"])); return { rhythm, night, ...own }; }
  catch (e) { return /404|not found/i.test(String((e as Error)?.message ?? e)) ? { rhythm: null, night, ...own } : { rhythm: null, night, unsure: true, ...own }; }
}

// the leads CODEOWNERS names, read once a minute a repository (the page reads the start on every open)
const OWNERS_TTL = 60_000;
const startOwnersSeen = new Map<string, { at: number; v: Pick<Start, "owners" | "ownersUnsure"> }>();
async function startOwners(code: string): Promise<Pick<Start, "owners" | "ownersUnsure">> {
  const had = startOwnersSeen.get(code.toLowerCase()), now = Date.now();
  if (had && now - had.at < OWNERS_TTL) return had.v;
  let v: Pick<Start, "owners" | "ownersUnsure">;
  try { v = { owners: cleanOwners(tableOf(await deps!.gh!(["api", `repos/${code}/contents/${CODEOWNERS}`, "-H", "Accept: application/vnd.github.raw"]))) ?? {} }; }
  catch (e) { v = /404|not found/i.test(String((e as Error)?.message ?? e)) ? { owners: null } : { owners: null, ownersUnsure: true }; }
  if (!v.ownersUnsure) startOwnersSeen.set(code.toLowerCase(), { at: now, v });
  return v;
}
/** CODEOWNERS changed (a settings PR folded, the relay said so): the next start reads it again */
export const forgetStartOwners = () => startOwnersSeen.clear();

async function fileOf(repo?: string): Promise<{ f: ProjectFile | null; record: string; code: string }> {
  if (!deps) return { f: null, record: "", code: repo ?? "" };
  const { record, code } = deps.where(repo);
  const f = record ? await project.get(deps.things(), record).catch(() => null) : null;
  return { f, record, code };
}

/** the night job's numbers kept as the record says (nightfile.ts), for the project in use */
export function keepNight(f: ProjectFile | null, path = deps?.nightFile ?? nightFilePath()): boolean {
  if (!f?.rhythm) return false;
  try { return writeNightFile(path, f.rhythm.night, "record"); } catch { return false; }
}

/** the project's rhythm in force (the record's, else the starting values, else the defaults) */
export async function projectRhythm(repo?: string): Promise<ProjectRhythm> {
  const { f, code } = await fileOf(repo);
  return f?.rhythm ?? rhythmIn(f, await startOf(code));
}
/** what agents may share with each other: facts (the default) or more */
export async function agentRules(repo?: string): Promise<AgentRules> { return agentsIn((await fileOf(repo)).f); }
/** the ownership table: area label → one or two leads (empty by default) */
export async function owners(repo?: string): Promise<Owners> {
  const { f, code } = await fileOf(repo);
  return f?.owners ? ownersIn(f) : ownersIn(f, await startOf(code));
}
/** the record a repository belongs to here and the store's deps (#430's facts-only-until-walked reads it); none wired: empty */
export function recordFor(repo?: string): { record: string; things: (() => ThingsDeps) | null } {
  return deps ? { record: deps.where(repo).record, things: deps.things } : { record: "", things: null };
}
/** whether an agent may take a change back to draft (off by default; handing one in is the person's press, #476) */
export async function mayAgentsPick(repo?: string): Promise<boolean> { return agentsIn((await fileOf(repo)).f).pick; }
/** the blocks of the project in use (#429), each with whether it is live; a record that cannot be read is every block
 *  as it starts */
export async function blocksHere(repo?: string): Promise<BlockView[]> { return blockViewsIn((await fileOf(repo)).f); }
/** the open blocks proposal of the project in use, in a few words (room_blocks says it) */
export async function blocksWaiting(repo?: string): Promise<string> {
  const p = (await fileOf(repo)).f?.proposals.find((x) => x.state === "open" && x.patch.blocks);
  return p ? `${summary(p.patch, p.was)}, asked by ${p.by}${p.agent ? "'s agent" : ""}; ${p.needs.join(", ")} agree` : "";
}
/** a block turned on or off in the project in use, asked by a person's agent (room_block_propose): a proposal its person
 *  and the team agree to in the project's polls */
export async function proposeBlockHere(a: { id: string; on: boolean; why?: string; by: string }): Promise<{ proposal: Proposal } | { error: string }> {
  if (!deps) return { error: "project settings are not ready" };
  const { record, code } = deps.where();
  if (!record) return { error: "this project has no record yet" };
  return propose(deps.things(), record, { patch: { blocks: { [a.id]: { on: a.on } } }, by: a.by, why: a.why, start: await startOf(code), agent: true });
}

/** the page's view (pure): the settings in force, where each comes from, the proposals newest first with their votes */
export function viewOf(f: ProjectFile | null, start: Start, pollList: Poll[], repo: string, code: string) {
  const votesOf = (p: Proposal) => {
    const poll = pollList.find((x) => x.id === p.poll);
    return poll ? Object.fromEntries(Object.entries(poll.votes).map(([k, n]) => [k.toLowerCase(), n === AGREE ? "agree" : "not yet"])) : {};
  };
  return {
    repo, code,
    rhythm: rhythmIn(f, start), agents: agentsIn(f), owners: ownersIn(f, start), blocks: blockViewsIn(f), onboarding: onboardingIn(f),
    from: fromWhere(f, start), set: f?.set ?? {},
    proposals: [...(f?.proposals ?? [])].reverse().slice(0, 30).map((p) => ({ ...p, summary: summary(p.patch, p.was), votes: votesOf(p) })),
    ...(f?.newer ? { newer: true } : {}),
  };
}
export type ProjectView = ReturnType<typeof viewOf>;
