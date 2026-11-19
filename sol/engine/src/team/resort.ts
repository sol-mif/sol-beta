// The nightly re-sort (#480, the dev cycle PRD §3.10): an agent pass over the day's PRs that sets each one's type of
// work (worktype.ts) and proposes where the files no feature claims belong. Sol developers only undo a wrong move:
// every run leaves one line, "6 PRs moved · undo: bash sol/features --undo <id>", and the undo puts back exactly what
// that run changed. A PR whose move was undone is never moved again by a later run: the person's word stands (an undo
// that keeps happening is a finding for fix-at-source, #482). The proposals are never applied: the leads correct
// specs/features.json by a PR.
//
// Where the record is (#488's review, B2): `.sol/resorts.json` in the project's record, the same shared state Cowork
// keeps the onboarding, the calendar, the decisions and the polls in (kit.ts Store: compare-and-swap on the file's sha,
// three tries, nothing lost). So every Sol developer's Sol reads it (the Features page shows the last line), and any of
// them can undo a run made on the NucBox. It is written FIRST: the run's every planned move goes in before the first
// PR is touched, then each move that landed is marked. A run cut off halfway leaves a record that still lists every
// move it might have made, and the undo checks each PR on GitHub before it puts anything back: a PR that still says
// what the run set goes back, one that already says what it was is left, one somebody changed since is left and named.
// No record that can be read and written, no move: the re-sort refuses rather than move what nobody could undo.
// The record is shared, so it is read as untrusted: only `type:` labels are ever added or taken off, a move's new title
// must be exactly its old one with the type put first, a PR goes back only while its title is still that, and only a
// run whose `by` is one of the project's Sol developers is put back. Only a Sol developer runs the re-sort or an undo:
// the CLI reads who they are from GitHub's main (the record's settings, else CODEOWNERS and the rhythm), never the
// checkout. And the `by` a run says is only the record's word: before an undo, GitHub's commits on the file must show
// the run added by a Sol developer and every write since by one too (untrustedRun). Who can write the record at all is
// GitHub's (the record repository's collaborators).
//   bash sol/features                       the map: each feature, its type, label, lead and evals
//   bash sol/features --resort [--days N] [--agent] [--dry-run]
//   bash sol/features --undo <id|last>
// The CLI finds the record in SOL_RECORD (owner/name of the project's record repository, the same variable ci.yml's codeowners check reads);
// the engine finds it from the project in use (project.ts recordFor). The timer that runs it each night is "To turn on"
// in #480's PR. Pure but for the CLI and the record's reads and writes, which are handed in.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { readFeatures, globRe, evalsOf, devsIn, typeLabel, typeOfLabel, TYPES, type Feature } from "./features.js";
import { typeOfWork, moveOf, applyType, prFacts, typeLabelsOf, titled, runGh, REPO_ROOT, SHARED, type Gh, type PrFacts, type WorkType } from "./worktype.js";
import { tableOf } from "./codeowners.js";
import { Store, type Applied } from "./kit.js";
import type { ThingsDeps } from "./things.js";
import type { RoomRecord } from "./record.js";
import { quietGh } from "../quiet.js";

export const RESORTS_PATH = ".sol/resorts.json";
/** the runs the file keeps, newest last; the PRs a person put back are kept apart and never dropped (up to KEPT_MAX) */
export const RUNS_MAX = 60, KEPT_MAX = 2000;
/** a run still "moving" this long after it began has stopped (cut off): from then on it may be undone */
export const MOVING_MS = 15 * 60_000;

export type Move = {
  pr: number;
  was: { title: string; labels: string[] };                                   // the PR's title and type labels before
  to: { title: string; type: WorkType; add: string; remove: string[] };       // what the run set
  why: string;
  done?: true;                                                                // the run said it landed
};
export type Proposal = { path: string; feature: string; name: string; by: "paths" | "agent" } | { path: string; feature: ""; name: ""; by: "none" };
/** one run: `moving` from the moment it is written (before any PR is touched) until it says which moves landed */
export type Resort = {
  id: string; at: string; by: string; state: "moving" | "moved"; moves: Move[]; proposals: Proposal[];
  undone?: { at: string; by: string; back?: number[]; left?: number[] };
};
export type ResortsFile = { v: 1; runs: Resort[]; kept: number[]; newer?: true };

/** the day's moves and proposals (pure): a type for each PR not put back before, and a feature for each file none claims */
export function planResort(features: Feature[], prs: PrFacts[], kept: Set<number>): { moves: Move[]; unclaimed: string[] } {
  const moves: Move[] = [], unclaimed = new Set<string>();
  for (const pr of prs) {
    for (const p of pr.files) if (!SHARED.some((re) => re.test(p)) && !features.some((f) => f.paths.some((g) => globRe(g).test(p)))) unclaimed.add(p);
    if (kept.has(pr.number)) continue;
    const t = typeOfWork(features, pr.files);
    const m = moveOf(pr, t.type);
    if (m) moves.push({ pr: pr.number, was: { title: pr.title, labels: typeLabelsOf(pr.labels) }, to: m, why: t.why });
  }
  return { moves, unclaimed: [...unclaimed].sort() };
}

/** the literal head of a glob, up to its last folder (pure): "sol/engine/src/team/" for "sol/engine/src/team/**" */
const headOf = (g: string) => { const h = g.split(/[*?]/)[0]; return h.slice(0, h.lastIndexOf("/") + 1); };
/** where a file no feature claims probably belongs (pure): the one feature whose paths share the deepest folder with
 *  it; two at that depth, or none deeper than the top folder, and it is left for a lead */
export function proposeFor(features: Feature[], path: string): Proposal {
  const depth = (h: string) => (path.startsWith(h) ? h.split("/").length - 1 : -1);
  let best = 0, who: Feature[] = [];
  for (const f of features) {
    const d = Math.max(...f.paths.map((g) => depth(headOf(g))));
    if (d > best) { best = d; who = [f]; } else if (d === best && d > 0 && !who.includes(f)) who.push(f);
  }
  return best >= 2 && who.length === 1 ? { path, feature: who[0].id, name: who[0].name, by: "paths" } : { path, feature: "", name: "", by: "none" };
}

/** the agent's lines read (pure): "<path> -> fr-NN", one a line, only paths asked about and features that exist */
export function agentProposals(text: string, asked: string[], features: Feature[]): Proposal[] {
  const out: Proposal[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*[-*]?\s*`?([^`\s]+)`?\s*->\s*(fr-\d{2,3})\b/.exec(line);
    const f = m ? features.find((x) => x.id === m[2]) : undefined;
    if (m && f && asked.includes(m[1]) && !out.some((p) => p.path === m[1])) out.push({ path: m[1], feature: f.id, name: f.name, by: "agent" });
  }
  return out;
}
export const agentPrompt = (features: Feature[], paths: string[]) => [
  "You sort files into the features of Sol's feature map (specs/features.json). For each file below, answer one line",
  "`<path> -> fr-NN` naming the one feature it belongs to, or `<path> -> none` when none fits. Answer the lines only.",
  "", "Features:", ...features.map((f) => `- ${f.id} ${f.name} (${f.where}): ${f.paths.slice(0, 6).join(", ")}`),
  "", "Files:", ...paths.map((p) => `- ${p}`),
].join("\n");

/** the undo command for a run (pure): with the record named when it is known, so it can be pasted as it is */
export const undoCommand = (id: string, record = "") => `${record ? `SOL_RECORD=${record} ` : ""}bash sol/features --undo ${id}`;
/** the line a run leaves (pure) */
export function resortLine(r: Pick<Resort, "id" | "moves" | "proposals" | "undone" | "state">, record = ""): string {
  // once a run says which landed, only those count: a move GitHub refused (a type label not made yet) moved nothing
  const n = r.state === "moved" ? r.moves.filter((m) => m.done).length : r.moves.length, sure = r.proposals.filter((p) => p.feature).length;
  const failed = r.state === "moved" ? r.moves.length - n : 0;
  const moved = `${n ? `${n} PR${n === 1 ? "" : "s"} moved${r.state === "moving" ? " (the run stopped before it said which landed)" : ""}` : "no PR moved"}${failed ? ` (${failed} not: GitHub refused)` : ""}`;
  const prop = r.proposals.length ? ` · ${r.proposals.length} file${r.proposals.length === 1 ? "" : "s"} no feature claims${sure ? ` (${sure} with a proposal)` : ""}` : "";
  if (r.undone) return `${moved}${prop} · undone${r.undone.by ? ` by ${r.undone.by}` : ""}${r.undone.back ? "" : " (not finished: run the undo again)"}`;
  return `${moved}${prop}${n ? ` · undo: ${undoCommand(r.id, record)}` : ""}`;
}

// ---- the record: .sol/resorts.json in the project's record (kit.ts Store) ----

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
const nums = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))].slice(-max) : []);
const RUN_ID = /^\d{8}-\d{4}(-\d+)?$/;
const empty = (): ResortsFile => ({ v: 1, runs: [], kept: [] });

// The record is shared, so it is read as untrusted (the security review of #488): the undo turns it into `gh pr edit`,
// and whoever can write the record must not be able to set any label or any title through it. A move keeps only
// `type:` labels, its label to add is its type's, and its new title is exactly the old one with the type put first:
// anything else is no move and is never put back.
const typeLabels = (v: unknown) => [...new Set(strs(v).filter((l) => !!typeOfLabel(l)))];
function cleanMove(v: unknown): Move | null {
  if (!isObj(v) || !Number.isInteger(v.pr) || (v.pr as number) <= 0 || !isObj(v.was) || !isObj(v.to)) return null;
  const type = str(v.to.type) as WorkType;
  if (!(TYPES as readonly string[]).includes(type) || v.to.add !== typeLabel(type)) return null;
  const was = { title: str(v.was.title), labels: typeLabels(v.was.labels) };
  if (!was.title || v.to.title !== titled(was.title, type)) return null;
  return { pr: v.pr as number, was, to: { title: titled(was.title, type), type, add: typeLabel(type), remove: typeLabels(v.to.remove).filter((l) => l !== typeLabel(type)) }, why: str(v.why), ...(v.done === true ? { done: true as const } : {}) };
}
function cleanProposal(v: unknown): Proposal | null {
  if (!isObj(v) || !str(v.path)) return null;
  return v.by === "paths" || v.by === "agent" ? { path: str(v.path), feature: str(v.feature, 8), name: str(v.name, 80), by: v.by } : { path: str(v.path), feature: "", name: "", by: "none" };
}
/** the file as read, made valid (pure): what is not a run is dropped */
export function parseResorts(text: string): ResortsFile {
  let raw: unknown;
  try { raw = JSON.parse(text || "{}"); } catch { return empty(); }
  if (!isObj(raw)) return empty();
  const runs: Resort[] = [];
  for (const r of Array.isArray(raw.runs) ? raw.runs : []) {
    if (!isObj(r) || !RUN_ID.test(str(r.id)) || runs.some((x) => x.id === r.id)) continue;
    const u = isObj(r.undone) ? r.undone : null;
    runs.push({
      id: str(r.id), at: str(r.at, 40), by: LOGIN.test(str(r.by, 39)) ? str(r.by, 39) : "", state: r.state === "moving" ? "moving" : "moved",
      moves: (Array.isArray(r.moves) ? r.moves : []).map(cleanMove).filter((m): m is Move => !!m),
      proposals: (Array.isArray(r.proposals) ? r.proposals : []).map(cleanProposal).filter((p): p is Proposal => !!p).slice(0, 500),
      ...(u ? { undone: { at: str(u.at, 40), by: str(u.by, 39), ...(Array.isArray(u.back) ? { back: nums(u.back, 500) } : {}), ...(Array.isArray(u.left) ? { left: nums(u.left, 500) } : {}) } } : {}),
    });
  }
  return { v: 1, runs: runs.slice(-RUNS_MAX), kept: nums(raw.kept, KEPT_MAX), ...(typeof raw.v === "number" && raw.v > 1 ? { newer: true as const } : {}) };
}
export const serializeResorts = (f: ResortsFile) => `${JSON.stringify({ v: 1, runs: f.runs, kept: f.kept }, null, 2)}\n`;

export type ResortOp =
  | { start: Resort }                                          // a run written before it touches any PR
  | { landed: { id: string; done: number[] } }                 // which of its moves landed
  | { undo: { id: string; by: string; at: string } }           // a person undoes it: its PRs are never moved again
  | { back: { id: string; back: number[]; left: number[] } };  // what the undo put back, and what it left as it was
/** one change to the record (pure) */
export function applyResorts(f: ResortsFile, op: ResortOp): Applied<ResortsFile, Resort> {
  if ("start" in op) {
    const r = op.start;
    if (f.runs.some((x) => x.id === r.id)) return { file: f, changed: false, error: `a run ${r.id} is in the record already` };
    return { file: { ...f, runs: [...f.runs, r].slice(-RUNS_MAX) }, changed: true, result: r, message: `features: the re-sort ${r.id} by ${r.by || "?"}, ${r.moves.length} PR${r.moves.length === 1 ? "" : "s"} to move` };
  }
  const id = "landed" in op ? op.landed.id : "undo" in op ? op.undo.id : op.back.id;
  const i = f.runs.findIndex((x) => x.id === id);
  if (i < 0) return { file: f, changed: false, error: `no run ${id} in the record` };
  const was = f.runs[i];
  let r: Resort, kept = f.kept, message: string;
  if ("landed" in op) {
    const done = new Set(op.landed.done);
    r = { ...was, state: "moved", moves: was.moves.map((m) => (done.has(m.pr) ? { ...m, done: true as const } : m)) };
    message = `features: the re-sort ${id}, ${done.size} PR${done.size === 1 ? "" : "s"} moved`;
  } else if ("undo" in op) {
    if (was.undone) return { file: f, changed: false, result: was };
    r = { ...was, undone: { at: op.undo.at, by: op.undo.by } };
    kept = [...new Set([...f.kept, ...was.moves.map((m) => m.pr)])].slice(-KEPT_MAX);
    message = `features: ${op.undo.by || "?"} undoes the re-sort ${id}`;
  } else {
    r = { ...was, undone: { ...(was.undone ?? { at: "", by: "" }), back: op.back.back, left: op.back.left } };
    message = `features: the re-sort ${id} undone, ${op.back.back.length} PR${op.back.back.length === 1 ? "" : "s"} put back`;
  }
  const runs = [...f.runs];
  runs[i] = r;
  return { file: { ...f, runs, kept }, changed: true, result: r, message };
}

export const resortsStore = new Store<ResortsFile, ResortOp, Resort>(RESORTS_PATH, parseResorts, serializeResorts, applyResorts, "re-sort record");

/** the newest run in a project's record, or null (none, no record, or a read that failed) */
export async function lastResort(things: ThingsDeps | null, record: string): Promise<Resort | null> {
  if (!things || !record) return null;
  const f = await resortsStore.get(things, record).catch(() => null);
  return f?.runs.at(-1) ?? null;
}

// ---- a run, and its undo ----

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0];
/** a record's name the CLI can write through gh (pure): owner/name, never a cloud's or a Drive's */
export const isRepoName = (s: string) => /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(s);

export type ResortDeps = {
  gh: Gh; root: string;
  record: string; things: ThingsDeps | null;   // the project's record and the store's deps; "" and null: a dry run only
  by?: string;                                 // who runs it (gh's login), for the record
  devs?: () => Promise<string[] | null>;       // the project's Sol developers (devsOnGithub); none known: no run, no undo
  writers?: () => Promise<Writer[] | null>;    // the commits on the record's file, newest first (writersOnGithub)
  now?: () => Date; agent?: (prompt: string) => Promise<string>;
};
/** one run: read the day's PRs and the record, write the run's plan to the record, then move, then say which landed.
 *  Throws when the record cannot be read or written first (nothing is moved then); a dry run writes and moves nothing */
export async function resort(d: ResortDeps, o: { days?: number; dryRun?: boolean } = {}): Promise<Resort> {
  if (!o.dryRun && (!d.record || !d.things)) throw new Error("no record to write the re-sort to, so nothing is moved: set SOL_RECORD to the project's record (owner/name)");
  if (!o.dryRun) { const no = await notADev(d, d.by ?? "", "run the re-sort"); if (no) throw new Error(no); }
  const now = d.now?.() ?? new Date();
  const since = new Date(now.getTime() - Math.max(1, o.days ?? 1) * 86_400_000).toISOString().slice(0, 10);
  const prs: PrFacts[] = (JSON.parse(await d.gh(["pr", "list", "--state", "all", "--search", `updated:>=${since}`, "--limit", "100", "--json", "number,title,labels,files"])) as { number: number; title: string; labels: { name: string }[]; files: { path: string }[] }[])
    .map((p) => ({ number: p.number, title: p.title, labels: p.labels.map((l) => l.name), files: p.files.map((f) => f.path) }));
  const features = readFeatures(d.root);
  let file = empty();
  if (d.record && d.things) {
    try { file = (await resortsStore.read(d.things, d.record)).file; }
    catch (e) { if (!o.dryRun) throw new Error(`couldn't read the re-sort's record in ${d.record}, so nothing is moved: ${firstLine(e)}`); }
  }
  const plan = planResort(features, prs, new Set(file.kept));
  let proposals = plan.unclaimed.map((p) => proposeFor(features, p));
  if (d.agent && plan.unclaimed.length) {
    const said = agentProposals(await d.agent(agentPrompt(features, plan.unclaimed)).catch(() => ""), plan.unclaimed, features);
    proposals = proposals.map((p) => said.find((s) => s.path === p.path) ?? p);
  }
  let id = stamp(now);
  for (let k = 2; file.runs.some((x) => x.id === id); k++) id = `${stamp(now)}-${k}`;
  const r: Resort = { id, at: now.toISOString(), by: d.by ?? "", state: "moving", moves: plan.moves, proposals };
  if (o.dryRun) return { ...r, state: "moved" };
  if (!r.moves.length && !r.proposals.length) return { ...r, state: "moved" };   // nothing to say: no commit
  // the record first: every planned move, before any PR is touched
  const w = await resortsStore.change(d.things!, d.record, { start: r });
  if ("error" in w) throw new Error(`couldn't write the re-sort's record in ${d.record} first, so nothing is moved: ${w.error}`);
  const done: number[] = [];
  for (const m of r.moves) {
    // read again right before the edit: a PR a person changed since the list (the agent pass can take minutes), or
    // whose run was undone meanwhile, is left as it is
    let cur: PrFacts;
    try { cur = await prFacts(d.gh, m.pr); } catch (e) { console.error(`resort: #${m.pr} not moved: ${firstLine(e)}`); continue; }
    if (stateOf(cur, m) !== "as-was") { console.error(`resort: #${m.pr} not moved: it changed since it was read`); continue; }
    const now2 = await resortsStore.get(d.things!, d.record, true).catch(() => null);
    if (now2?.runs.find((x) => x.id === id)?.undone) { console.error(`resort: run ${id} was undone while it ran: the rest is not moved`); break; }
    try { await applyType(d.gh, m.pr, m.to); done.push(m.pr); }
    catch (e) { console.error(`resort: #${m.pr} not moved: ${firstLine(e)}`); }
  }
  const l = await resortsStore.change(d.things!, d.record, { landed: { id, done } });
  if ("error" in l) {
    console.error(`resort: the record still lists all ${r.moves.length} planned moves, not which landed (${l.error}); the undo checks each PR`);
    const landed = new Set(done);
    return { ...r, moves: r.moves.map((m) => (landed.has(m.pr) ? { ...m, done: true as const } : m)) };
  }
  return l.result ?? r;
}

/** why a person may not write the re-sort's record or act on it, or "" (they are one of the project's Sol developers) */
async function notADev(d: Pick<ResortDeps, "devs">, who: string, what: string): Promise<string> {
  const devs = d.devs ? await d.devs().catch(() => null) : null;
  if (!devs?.length) return `couldn't tell who the project's Sol developers are, so no one may ${what}`;
  return who && devs.some((x) => x.toLowerCase() === who.toLowerCase()) ? "" : `only the project's Sol developers may ${what}, and ${who || "this gh login"} is not one (${devs.join(", ")})`;
}
/** one commit on the record's file, as GitHub says it: its first line and the GitHub login of its author */
export type Writer = { sha: string; message: string; author: string };
/** whether GitHub says only Sol developers wrote a run (pure): the commit that added it ("features: the re-sort <id> by
 *  ...", the store's own message) and every commit on the file after it are authored by one of `devs`. The `by` a run
 *  says is the record's word; who pushed the commit is GitHub's. "" when trusted, else why not */
export function untrustedRun(writers: Writer[] | null, id: string, devs: string[]): string {
  if (!writers) return "GitHub did not say who wrote the record";
  const i = writers.findIndex((w) => w.message.split("\n")[0].startsWith(`features: the re-sort ${id} by `));
  if (i < 0) return `GitHub shows no commit that added run ${id} to the record (it may be older than the last 100)`;
  const dev = (l: string) => !!l && devs.some((x) => x.toLowerCase() === l.toLowerCase());
  const other = writers.slice(0, i + 1).find((w) => !dev(w.author));
  return other ? `the record was written since by ${other.author || "an account GitHub could not name"} (${other.sha.slice(0, 7)}), who is not one of the project's Sol developers` : "";
}

/** whether a PR still says what a move set, or already says what it was (pure) */
export function stateOf(cur: { title: string; labels: string[] }, m: Move): "as-moved" | "as-was" | "changed" {
  const types = typeLabelsOf(cur.labels);
  if (cur.title === m.was.title && types.length === m.was.labels.length && m.was.labels.every((l) => types.includes(l))) return "as-was";
  if (cur.title === titled(m.was.title, m.to.type) && cur.labels.includes(typeLabel(m.to.type)) && !m.to.remove.some((l) => cur.labels.includes(l))) return "as-moved";
  return "changed";
}

export type Undone = { resort: Resort; back: number[]; already: number[]; left: number[] };
/** put back what one run moved. The record says "undone" first (so no later run moves those PRs again), then each PR
 *  that still says what the run set gets its title and type labels back; one changed since is left and named. An undo
 *  cut off halfway can be run again */
export async function undo(d: Pick<ResortDeps, "gh" | "record" | "things" | "by" | "now" | "devs" | "writers">, id: string): Promise<Undone | { error: string }> {
  if (!d.record || !d.things) return { error: "no record to read the run from: set SOL_RECORD to the project's record (owner/name)" };
  const no = await notADev(d, d.by ?? "", "undo a re-sort");
  if (no) return { error: no };
  let file: ResortsFile;
  try { file = (await resortsStore.read(d.things, d.record)).file; } catch (e) { return { error: `couldn't read the re-sort's record in ${d.record}: ${firstLine(e)}` }; }
  const runs = [...file.runs].reverse();
  const r = id === "last" ? runs.find((x) => x.moves.length && !x.undone?.back) : runs.find((x) => x.id === id);
  if (!r) return { error: id === "last" ? "no run to undo" : `no run ${id} in ${d.record}'s ${RESORTS_PATH}` };
  if (r.undone?.back) return { error: `run ${r.id} was undone already` };
  // a run still moving PRs is not undone under it: it could move one after the undo looked at it
  const age = (d.now?.() ?? new Date()).getTime() - Date.parse(r.at);
  if (r.state === "moving" && !(age > MOVING_MS)) return { error: `run ${r.id} is still moving PRs: undo it once it is done, or in ${Math.ceil(((MOVING_MS - (Number.isFinite(age) ? age : 0)) / 60_000))} minutes` };
  // a run some other login wrote is not put back: the record is shared, and only a Sol developer's run is trusted
  if (await notADev(d, r.by, "write a re-sort")) return { error: `run ${r.id} is not undone: the record says ${r.by || "nobody"} made it, and only a run by one of the project's Sol developers is put back` };
  // the record's `by` is only its word: GitHub's commits say who really wrote the run and everything on the file since
  const why = untrustedRun(d.writers ? await d.writers().catch(() => null) : null, r.id, (await d.devs?.().catch(() => null)) ?? []);
  if (why) return { error: `run ${r.id} is not undone: ${why}. Put the PRs back by hand, or ask a Sol developer to look at ${RESORTS_PATH}` };
  if (!r.undone) {
    const u = await resortsStore.change(d.things, d.record, { undo: { id: r.id, by: d.by ?? "", at: (d.now?.() ?? new Date()).toISOString() } });
    if ("error" in u) return { error: `couldn't write the undo to the record, so nothing is put back: ${u.error}` };
  }
  const back: number[] = [], already: number[] = [], left: number[] = [];
  for (const m of r.moves) {
    let cur: PrFacts;
    try { cur = await prFacts(d.gh, m.pr); } catch (e) { console.error(`undo: #${m.pr} not read: ${firstLine(e)}`); left.push(m.pr); continue; }
    const s = stateOf(cur, m);
    if (s === "as-was") { already.push(m.pr); continue; }
    if (s === "changed") { left.push(m.pr); continue; }
    // only type: labels are ever added or taken off, whatever the record says
    const add = m.was.labels.filter((l) => !!typeOfLabel(l) && !cur.labels.includes(l)), remove = [typeLabel(m.to.type)].filter((l) => !m.was.labels.includes(l));
    try { await d.gh(["pr", "edit", String(m.pr), "--title", m.was.title, ...add.flatMap((l) => ["--add-label", l]), ...remove.flatMap((l) => ["--remove-label", l])]); back.push(m.pr); }
    catch (e) { console.error(`undo: #${m.pr} not put back: ${firstLine(e)}`); left.push(m.pr); }
  }
  const b = await resortsStore.change(d.things, d.record, { back: { id: r.id, back: [...back, ...already], left } });
  if ("error" in b) console.error(`undo: the PRs are back, but the record could not say so: ${b.error}`);
  return { resort: ("error" in b ? r : b.result) ?? r, back, already, left };
}

// ---- the CLI ----

/** the last 100 commits on the record's file, newest first, with their authors' GitHub logins */
export async function writersOnGithub(gh: Gh, record: string): Promise<Writer[] | null> {
  try {
    const j = JSON.parse(await gh(["api", `repos/${record}/commits?path=${encodeURIComponent(RESORTS_PATH)}&per_page=100`]));
    return Array.isArray(j) ? j.map((c) => ({ sha: String(c?.sha ?? ""), message: String(c?.commit?.message ?? ""), author: String(c?.author?.login ?? "") })) : null;
  } catch { return null; }
}

/** the project's Sol developers as GitHub's main says them, never this checkout (a local edit widens nothing): the
 *  record's `.sol/project.json` owners and rhythm when it has them, else the code repository's CODEOWNERS leads and its
 *  `.sol/rhythm.json` reviewers, as project.ts starts from. null when they could not be read */
export async function devsOnGithub(gh: Gh, record: string, code: string): Promise<string[] | null> {
  const raw = async (repo: string, path: string): Promise<string | null> => {
    try { return await gh(["api", `repos/${repo}/contents/${path}`, "-H", "Accept: application/vnd.github.raw"]); }
    catch (e) { if (/404|not found/i.test(firstLine(e))) return null; throw e; }
  };
  try {
    let owners: Record<string, string[]> | null = null, rhythm: { dev?: string[]; beta?: string[] } | null = null;
    const pj = record ? await raw(record, ".sol/project.json") : null;
    if (pj) { const j = JSON.parse(pj); if (isObj(j.owners)) owners = j.owners as Record<string, string[]>; if (isObj(j.rhythm)) rhythm = j.rhythm as typeof rhythm; }
    if (!owners && code) { const t = await raw(code, ".github/CODEOWNERS"); owners = t ? tableOf(t) : {}; }
    if (!rhythm && code) { const t = await raw(code, ".sol/rhythm.json"); rhythm = t ? JSON.parse(t) : {}; }
    const devs = devsIn(owners ?? {}, { dev: Array.isArray(rhythm?.dev) ? rhythm!.dev : [], beta: Array.isArray(rhythm?.beta) ? rhythm!.beta : [] });
    return devs.length ? devs : null;
  } catch { return null; }
}

const claude = (prompt: string) => new Promise<string>((ok) => execFile("claude", ["-p", prompt], { timeout: 180_000, maxBuffer: 4 << 20 }, (e, out) => ok(e ? "" : out)));
/** gh with a body on stdin (a record's file is too big for an argument) */
const ghStdin = (args: string[], body: string) => new Promise<string>((ok, no) => {
  quietGh(args);
  const c = execFile("gh", args, { maxBuffer: 16 << 20, timeout: 60_000 }, (e, out, err) => (e ? no(Object.assign(new Error(String(err || e.message).trim()), { full: String(err || e.message).trim() })) : ok(out)));
  c.stdin?.end(body);
});
/** the record's file verbs through this machine's gh (the three the store uses) */
export const ghRecord = (gh: Gh): ThingsDeps => ({ record: () => ({ files: {
  branch: (repo: string) => gh(["api", `repos/${repo}`, "--jq", ".default_branch"]).then((t) => t.trim()),
  readSha: (repo: string, path: string, ref: string) => gh(["api", `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, "--jq", "{sha: .sha, content: .content}"]),
  putBody: (repo: string, path: string, body: object) => ghStdin(["api", "-X", "PUT", `repos/${repo}/contents/${path}`, "--input", "-"], JSON.stringify(body)),
} as unknown as RoomRecord["files"] }) });

async function main(argv: string[]): Promise<number> {
  const root = REPO_ROOT, at = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const record = (process.env.SOL_RECORD ?? "").trim();
  if (record && !isRepoName(record)) { console.error(`features: SOL_RECORD is "${record}": the re-sort writes its record through GitHub, so it must be owner/name`); return 2; }
  const things = record ? ghRecord(runGh) : null;
  const by = async () => (await runGh(["api", "user", "--jq", ".login"]).catch(() => "")).trim();
  const code = async () => (await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).catch(() => "")).trim();
  const devs = async () => devsOnGithub(runGh, record, await code());
  if (argv.includes("--undo")) {
    const id = at("--undo") && !at("--undo")!.startsWith("--") ? at("--undo")! : "last";
    if (argv.includes("--dry-run")) { console.error("features: an undo has no dry run; bash sol/features --undo <id|last>"); return 2; }
    const r = await undo({ gh: runGh, record, things, by: await by(), devs, writers: () => writersOnGithub(runGh, record) }, id);
    if ("error" in r) { console.error(`features: ${r.error}`); return 1; }
    const n = r.resort.moves.length;
    console.log(`${r.back.length + r.already.length} of ${n} PR${n === 1 ? "" : "s"} as they were before run ${r.resort.id}${r.left.length ? `; left as they are, changed since: ${r.left.map((p) => `#${p}`).join(", ")}` : ""}`);
    return 0;
  }
  if (argv.includes("--resort")) {
    const dryRun = argv.includes("--dry-run");
    const r = await resort({ gh: runGh, root, record, things, by: dryRun ? "" : await by(), devs, agent: argv.includes("--agent") ? claude : undefined }, { days: Number(at("--days") ?? 1) || 1, dryRun });
    for (const m of r.moves) console.log(`#${m.pr} → ${m.to.type}${dryRun || m.done ? "" : " (not moved)"}: ${m.why}`);
    for (const p of r.proposals) console.log(p.feature ? `${p.path} → ${p.feature} ${p.name} (proposed, by ${p.by})` : `${p.path} → no feature claims it; a lead decides`);
    console.log(dryRun ? `(dry run) ${resortLine(r).replace(/ · undo:.*$/, "")}` : resortLine(r, record));
    return 0;
  }
  const fs = readFeatures(root);
  if (!fs.length) { console.error("features: no specs/features.json in this checkout"); return 1; }
  for (const f of fs) console.log(`${f.id}  ${f.name.padEnd(32)} ${f.type.padEnd(9)} ${(f.label || "-").padEnd(7)} ${f.lead}${f.support.length ? ` + ${f.support.join(", ")}` : ""} · evals ${evalsOf(root, f)}`);
  return 0;
}
const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`features: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
