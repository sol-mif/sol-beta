// "How builds run" (#906): every choice the runs view and its plan make, as one typed table a person can read and
// change. Pure: nothing here draws, fetches or reads a clock or storage; the stored text, the board and "now" come in.
//
// Where each default comes from: rules.ts as #889 left it and the board's judge (/mnt/c/sol/n10/judge.py): a builder
// per 2.5 cores (cap = cores / 2.5), 20 silent minutes with nothing running is stuck, work split at "and", "then" and
// commas into at most six parts, the review on a machine no builder uses, never a builder on the MacBook while another
// machine reports. A value left at its default changes nothing: the plans and the judgement are exactly #889's.
//
// Stubbed until the engine half lands: the engine keeps the sheet and sends it to the board's planner as
// `POST <board>/sheet` with the rules as `{ id: value }` (only the changed ones); until then it lives in this window,
// localStorage "runs.sheet".

export type Value = number | string | boolean;
export type Kind =
  | { kind: "number"; min: number; max: number }
  | { kind: "pick"; options: { value: string; label: string }[] }
  | { kind: "yesno"; yes: string; no: string };
export interface Rule {
  id: string;
  /** the sentence around its value: `before` + the control + `after` */
  before: string; after: string;
  /** the rule named in a plan's why ("at most {v} builders at once on the Legion") */
  name: string;
  def: Value; why: string; spec: Kind;
}

export const RULES: Rule[] = [
  {
    id: "builders.nucbox", before: "At most", after: "builders at once on the NucBox.", name: "at most {v} builders at once on the NucBox",
    def: 3, spec: { kind: "number", min: 1, max: 6 },
    why: "One builder for every 2.5 cores keeps its tests on time; at 7 the NucBox ran out of room in /tmp, at 10 it froze.",
  },
  {
    id: "builders.legion", before: "At most", after: "builders at once on the Legion.", name: "at most {v} builders at once on the Legion",
    def: 6, spec: { kind: "number", min: 1, max: 12 },
    why: "16 cores at 2.5 a builder; more and the shots and the heavy checks that run there wait.",
  },
  {
    id: "split", before: "Work you ask for in one sentence is", after: "", name: "work is {v}",
    def: "parts", spec: { kind: "pick", options: [{ value: "parts", label: "split at each “and”, “then” or comma" }, { value: "whole", label: "built whole by one builder" }] },
    why: "Small parts are built side by side and each is easy to review; one big change is slow to read and hard to take back.",
  },
  {
    id: "split.max", before: "One sentence becomes at most", after: "parts; the rest join the last one.", name: "at most {v} parts from one sentence",
    def: 6, spec: { kind: "number", min: 1, max: 6 },
    why: "Past six, the line waiting to merge costs more time than building side by side saves.",
  },
  {
    id: "review.where", before: "The review runs", after: "", name: "the review runs {v}",
    def: "other", spec: { kind: "pick", options: [{ value: "other", label: "on another machine than the builders" }, { value: "same", label: "on the machine that built most of it" }] },
    why: "A reviewer that did not watch the work being made reads it fresh, the way a second person would.",
  },
  {
    id: "review.eye", before: "When the work changes the screen, the review", after: "", name: "the review {v}",
    def: true, spec: { kind: "yesno", yes: "also looks at pictures of it", no: "reads the code only" },
    why: "Code can pass every test while text sits over text or a box is cut off; only a look at the screen catches that.",
  },
  {
    id: "stuck.after", before: "A builder silent for", after: "minutes with nothing running is called stuck.", name: "stuck after {v} silent minutes",
    def: 20, spec: { kind: "number", min: 20, max: 240 },
    why: "A builder that is thinking writes something every few minutes; one sat silent for four hours on 2026-11-09. Under 20, a long think looks stuck.",
  },
  {
    id: "run.who", before: "A plan starts when", after: "presses Run.", name: "{v} presses Run",
    def: "you", spec: { kind: "pick", options: [{ value: "you", label: "you" }, { value: "agents", label: "you or one of your agents" }] },
    why: "Builders hold the machines for hours; a careful team has one person say go.",
  },
];

/** a rule about his own safety: shown on the sheet as a fixed line, never a control */
export const FIXED = [
  { id: "mac.never", line: "Builders never run on the MacBook unless no other machine reports.", why: "The MacBook is where you work; a builder there slows the window you are using." },
];

export type Sheet = Record<string, Value>;
export const DEFAULTS: Sheet = Object.fromEntries(RULES.map((r) => [r.id, r.def]));
export const ruleOf = (id: string) => RULES.find((r) => r.id === id);
export const changed = (s: Sheet, id: string) => { const r = ruleOf(id); return !!r && s[id] !== undefined && s[id] !== r.def; };
export const changedIds = (s: Sheet) => RULES.filter((r) => changed(s, r.id)).map((r) => r.id);

/** a value in words, as the sentence says it */
export function valueWord(r: Rule, v: Value): string {
  if (r.spec.kind === "pick") return r.spec.options.find((o) => o.value === v)?.label ?? String(v);
  if (r.spec.kind === "yesno") return v ? r.spec.yes : r.spec.no;
  return String(v);
}
/** the rule as a plan names it: "your rule ‘at most 3 builders at once on the Legion’" when it is his, else "the rule ‘…’" */
export function ruleWords(s: Sheet, id: string): string {
  const r = ruleOf(id); if (!r) return id;
  const v = s[id] ?? r.def;
  return `${changed(s, id) ? "your rule" : "the rule"} ‘${r.name.replace("{v}", valueWord(r, v))}’`;
}

/** one value checked against its rule: the value, or why it is refused in one line that says the range */
export function check(r: Rule, raw: unknown): { ok: true; value: Value } | { ok: false; why: string } {
  if (r.spec.kind === "number") {
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    const { min, max } = r.spec;
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, why: `A whole number from ${min} to ${max}.` };
    return { ok: true, value: n };
  }
  if (r.spec.kind === "yesno") return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, why: "Yes or no." };
  const opts = r.spec.options;
  return opts.some((o) => o.value === raw) ? { ok: true, value: raw as string } : { ok: false, why: `One of: ${opts.map((o) => o.label).join("; ")}.` };
}

/** a change to one rule: the new sheet, or the line that refuses it (the sheet is left as it was) */
export function setRule(s: Sheet, id: string, raw: unknown): { ok: true; sheet: Sheet } | { ok: false; why: string } {
  const r = ruleOf(id);
  if (!r) return { ok: false, why: "There is no such rule." };
  const c = check(r, raw);
  return c.ok ? { ok: true, sheet: { ...s, [id]: c.value } } : c;
}
/** "Back to the default" */
export const resetRule = (s: Sheet, id: string): Sheet => { const n = { ...s }; const r = ruleOf(id); if (r) n[id] = r.def; return n; };

/** the stored sheet read back: every rule's value, his where it is good, the default where it is not; `note` says what
 *  was not used, in one line, or is null. Unknown ids (an older or newer sheet) are left out quietly */
export function readSheet(text: string | null): { sheet: Sheet; note: string | null } {
  if (text == null || text === "") return { sheet: { ...DEFAULTS }, note: null };
  let got: unknown;
  try { got = JSON.parse(text); } catch { got = undefined; }
  if (!got || typeof got !== "object" || Array.isArray(got)) return { sheet: { ...DEFAULTS }, note: "Your saved rules could not be read, so every rule is at its default." };
  const sheet: Sheet = { ...DEFAULTS }, bad: string[] = [];
  for (const r of RULES) {
    if (!(r.id in (got as object))) continue;
    const c = check(r, (got as Record<string, unknown>)[r.id]);
    if (c.ok) sheet[r.id] = c.value; else bad.push(r.name.replace("{v}", "…"));
  }
  return { sheet, note: bad.length ? `${bad.length === 1 ? "One saved rule was" : `${bad.length} saved rules were`} out of range and went back to the default: ${bad.join("; ")}.` : null };
}
/** what is stored: only the rules he changed (a sheet at its defaults stores "{}") */
export const writeSheet = (s: Sheet) => JSON.stringify(Object.fromEntries(changedIds(s).map((id) => [id, s[id]])));
/** the body the engine half will send to the board's planner, POST <board>/sheet */
export const sheetBody = (s: Sheet) => Object.fromEntries(changedIds(s).map((id) => [id, s[id]]));

// ---- what the rules decide ----

/** the cap a machine's rule sets: the NucBox and the Legion have a rule; any other machine cores / 2.5 (judge.py) */
export function capOf(s: Sheet, id: string, cores?: number): number {
  const v = s[`builders.${id.toLowerCase()}`];
  return typeof v === "number" ? v : Math.max(1, Math.floor((cores ?? 2.5) / 2.5));
}
/** the board's own cap for a machine (judge.py: cores / 2.5, never under 1) */
export const boardCap = (cores?: number) => Math.max(1, Math.floor((cores ?? 2.5) / 2.5));

export interface MachineFacts { cores?: number; load?: number[]; mem_free_gb?: number; builders?: number; room?: number; room_why?: string; tmp_bytes_pc?: number; tmp_inodes_pc?: number }
/** a machine's room under the sheet: the board's own when its cap is the board's (nothing changes), else judge.py's
 *  rule worked again with his cap: /tmp past 85% stops all, then the least of the cap, the memory (2 GB a builder) and
 *  the load (over 1.5 a core none, over 1 a core one) */
export function roomUnder(s: Sheet, id: string, m: MachineFacts): { room: number; why: string; cap: number; his: boolean } {
  const cap = capOf(s, id, m.cores), his = changed(s, `builders.${id.toLowerCase()}`);
  if (!his || cap === boardCap(m.cores)) return { room: m.room ?? 0, why: m.room_why ?? "", cap, his: false };
  for (const [pc, what] of [[m.tmp_inodes_pc, "inodes"], [m.tmp_bytes_pc, "bytes"]] as const)
    if (pc != null && pc >= 85) return { room: 0, why: `/tmp is at ${pc}% ${what}: nothing can start until it is cleaned`, cap, his };
  const b = m.builders ?? 0, cores = m.cores ?? 1, load1 = m.load?.[0] ?? 0;
  const byMem = m.mem_free_gb == null ? cap : Math.floor(m.mem_free_gb / 2);
  const byLoad = load1 > cores * 1.5 ? 0 : load1 > cores ? 1 : cap;
  const n = Math.max(0, Math.min(cap - b, byMem, byLoad));
  // the rule itself is named once, in the plan's builders line; here only the number he set
  if (n > 0) return { room: n, why: `room for ${n}: ${b} of the ${cap} you allow`, cap, his };
  if (cap - b <= 0) return { room: 0, why: `full: ${b} builder${b === 1 ? "" : "s"}, the ${cap} you allow`, cap, his };
  if (byMem <= 0) return { room: 0, why: `no memory: ${m.mem_free_gb} GB free, a builder needs 2`, cap, his };
  return { room: 0, why: `too loaded: load ${load1} on ${cores} cores`, cap, his };
}

/** a builder the board called stuck, judged again by his minutes: under them it is only waiting, and says so. At the
 *  default (20, the board's own) the board's word stands as given. The board can only tell silence from work after 20
 *  minutes, so the rule can raise the bar, never lower it */
export function stuckUnder(s: Sheet, state: string, quietSec: number | null): { state: "waiting"; why: string } | null {
  if (state !== "quiet" || !changed(s, "stuck.after") || quietSec == null) return null;
  const mins = Number(s["stuck.after"]);
  if (quietSec >= mins * 60) return null;
  return { state: "waiting", why: `silent ${Math.floor(quietSec / 60)} min with nothing running; ${ruleWords(s, "stuck.after")} waits until ${mins}` };
}

/** does a sentence ask for something on the screen (the review then looks at pictures of it, by the rule) */
export const touchesScreen = (sentence: string) =>
  /\b(screen|view|tab|tabs|button|page|card|sheet|window|look|looks|shot|shots|layout|menu|dot|colou?r|spacing|design|icon|panel|row|rows|ui|face|stage|home)\b/i.test(sentence);

// ---- which project a session belongs to: by its folder ----

/** folders to projects, read top to bottom, the longest match wins: a folder at or under `…/<under>` belongs to the
 *  project. The board's projects add their own `path` to this; a session that fits none is "Elsewhere" */
export const FOLDERS: { under: string; project: string; name: string }[] = [
  { under: "projects/sol", project: "jelly", name: "Jelly" },
  { under: "sol-dev", project: "jelly", name: "Jelly" },
  { under: "projects/my-sol", project: "my-jelly", name: "My Jelly" },
  { under: "projects/school", project: "school", name: "School" },
  { under: "projects/jobpilot", project: "jobs", name: "Jobs" },
  { under: "projects/kaat", project: "kaat", name: "Kaat" },
];
export const ELSEWHERE = "elsewhere";

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
/** the project a folder belongs to: the longest `under` that is a whole run of the folder's path, else Elsewhere */
export function projectOfFolder(folder: string, table: { under: string; project: string }[] = FOLDERS): string {
  const f = "/" + norm(folder).replace(/^\/+/, "") + "/";
  let best: { len: number; project: string } | null = null;
  for (const t of table) {
    const u = norm(t.under).replace(/^\/+/, "");
    if (!u) continue;
    if (f.includes("/" + u + "/") && (!best || u.length > best.len)) best = { len: u.length, project: t.project };
  }
  return best?.project ?? ELSEWHERE;
}
/** the table with the board's projects' own paths added (personal/projects/sol → jelly) */
export function folderTable(projects: { id: string; path?: string }[] = []): { under: string; project: string }[] {
  return [...FOLDERS, ...projects.filter((p) => p.path).map((p) => ({ under: p.path!.replace(/^.*?(projects\/)/, "$1"), project: p.id }))];
}
