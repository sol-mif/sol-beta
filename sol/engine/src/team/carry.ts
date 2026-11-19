// Carrying your own layer over (#425, B2 of #413). A Sol on a `*/mine` branch is the release plus the person's own
// changes on top. Update carries those changes onto the new release in three steps, and the Sol is never left half-way:
//
//   1. by itself: sol/mine/rebase, as before (ship.ts update). It aborts on the first clash, so nothing moved.
//   2. a session: Sol works out which of the person's changes clash with which of the release's (merge-tree, one
//      change at a time, nothing written), cuts a side copy of the repo on `<prefix>/carry-<stamp>` (never the live
//      folder), leaves out what the release already has, and puts the rest on the release there. When that goes by
//      itself the copy is ready at once; when it stops on a clash, a Work session opens in the copy with each clash
//      named and carries them over. Sol watches the copy: once the release is under it and nothing is left half-way,
//      the person is offered "Use it", and the live folder moves to the copy's result when nothing is at work there.
//   3. failing that, the person chooses:
//      set aside: the Sol as it stands is kept as `<prefix>/aside-YYYYMMDD` (pushed to origin when it can be, listed in
//                 Settings with "bring back"), and the Sol moves onto the release plus only those of its `mine:`
//                 changes that still go on by themselves.
//      stay:      nothing moves; this release is not offered again, the next one is, with "N behind".
//   bring back: an aside's changes carried onto the Sol as it is now, by the same steps 2 and 3.
//   by itself (#1150): a dev release a */mine Sol installs by itself (ship.ts installDev) carries `auto`: once the copy
//                 is ready the live folder moves to it at a quiet moment with no "Use it", so the person sees one line
//                 and presses nothing. Step 3 still asks them: a change that cannot be carried is theirs to choose.
//
// The words people see never say commits, rebase or conflict: "3 of your own changes clash with today's release".
// What is going on is kept in the repo's git folder (sol-carry.json, beside git's own working files, never committed),
// so a renew in the middle forgets nothing. The engine's side (opening the session, who is busy, telling the faces,
// what an update does after) comes in as Deps from team/wire.ts, so this file never imports the Work side.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { join as joinBusy } from "../busy.js";   // a move holds the renew off until the folder and the state agree

const run = promisify(execFile);
import { isQuiet } from "../quiet.js";
const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" });
type Out = { code: number; out: string };
/** git, answered with its exit code: a clash is an answer here, not an error */
const gitRun = (cwd: string, args: string[], env: Record<string, string> = {}): Promise<Out> =>
  run("git", args, { cwd, env: { ...ENV(), ...env }, timeout: 120_000, maxBuffer: 32 << 20 })
    .then((r) => ({ code: 0, out: r.stdout.trim() }), (e: any) => ({ code: typeof e?.code === "number" ? e.code : 2, out: `${e?.stdout ?? ""}${e?.stderr ?? ""}`.trim() }));
const git = async (cwd: string, args: string[]) => { const r = await gitRun(cwd, args); if (r.code) throw new Error(r.out.split("\n")[0] || `git ${args[0]} failed`); return r.out; };
const tryGit = (cwd: string, args: string[]) => git(cwd, args).catch(() => null);
// automation in a copy runs no hooks (a commit-msg hook would rename the person's changes; a guard is for sessions)
const QUIET = ["-c", "core.hooksPath=/dev/null", "-c", "rebase.missingCommitsCheck=ignore", "-c", "advice.mergeConflict=false"];

export type ChangeState = "clean" | "clash" | "in-release";
/** one of the person's own changes: what it says (its first line, `mine: ` left off), and how it meets the release */
export type Change = { sha: string; what: string; state: ChangeState; files?: string[]; against?: string[] };
export type Stage = "session" | "ready" | "failed" | "moving";
export type Carry = {
  kind: "update" | "back";   // update: onto a release; back: an aside brought back onto the Sol as it is
  stage: Stage;
  onto: string;              // the release (update), the Sol's own tip when it began (back)
  tag?: string;
  follow?: string;           // the branch that follows the release here once it is used: dev or stable (#418)
  auto?: true;               // #1150: the release came by itself; ready moves the Sol with no press
  from: string;              // the live folder's tip when it began: "Use it" is refused if it moved since
  source: string;            // what is carried: the live tip (update), the aside's tip (back)
  aside?: string;            // back: which aside
  // going back to an older release (#426, pin.ts): `base` is the release the person's changes sit on now (they are
  // base..source, not onto..source, since onto is older), and `back` what the move does once it lands: the saved data
  // put back over `version`'s steps and the Sol pinned there. A move with `back` sets no channel branch.
  base?: string;
  back?: { tag: string; version: number; data?: string };   // data: what the warning said goes back (pin.ts dataSig)
  changes: Change[];
  copy?: string; branch?: string; session?: string;
  said: string;              // the words the faces show
  at: number;
};
export type Aside = { name: string; at: string; left: number; pushed: boolean };
// brought: an aside brought back whole, by name, with the tip it had then (a change reshaped on the way is not the same
// change to git any more, so "what is left in it" is remembered rather than worked out)
type Saved = { carry: Carry | null; stayed?: string; brought?: Record<string, string> };

export type Deps = {
  root: string;                                                                  // sol/ in the Sol's checkout
  open: (a: { cwd: string; title: string; text: string }) => Promise<string>;   // a Work session in that folder: its id
  working: (sessionId: string) => boolean;                                       // its run is in a turn
  quiet: (top: string, copy?: string) => boolean;                                // nothing at work in the live folder
  tell: (m: object) => void;                                                     // every face
  updated: (release: string) => void | Promise<void>;                            // after an update moved the folder
  now: () => Date;
  // #426: a move that goes back to an older release, once the folder is on it: the data and the pin (pin.ts). It puts
  // the folder back where it was (`c.from`) itself when it cannot finish, then throws
  wentBack?: (c: Carry) => Promise<void>;
};

// ---- plain words ----
const changes = (n: number) => `${n} of your own change${n === 1 ? "" : "s"}`;
const whatOf = (subject: string) => subject.replace(/^mine:\s*/i, "").trim() || "(no description)";
const day = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const stampOf = (d: Date) => `${day(d)}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
const releaseWord = (c: Pick<Carry, "kind" | "tag">) => c.kind === "back" ? "your Sol as it is now" : "today's release";
export function saidOf(c: Pick<Carry, "kind" | "stage" | "changes" | "tag" | "aside" | "auto">): string {
  const clash = c.changes.filter((x) => x.state === "clash").length, gone = c.changes.filter((x) => x.state === "in-release").length;
  const whose = c.kind === "back" ? `of the changes you set aside` : "of your own changes";
  const n = (k: number) => `${k} ${whose}`;
  const left = gone && c.kind === "update" ? `; ${gone} ${gone === 1 ? "is" : "are"} in the release already and left out` : "";
  if (c.stage === "ready") return `${c.kind === "back" ? "the changes you set aside are" : "your own changes are"} carried over onto ${releaseWord(c)}${left}. ${c.auto ? "Your Sol moves over to it as soon as nothing is at work in it" : "Use it when you like"}`;
  if (c.stage === "moving") return `moving your Sol over as soon as nothing is at work in it…`;
  if (c.stage === "session") return `${n(clash || 1)} clash${clash === 1 || !clash ? "es" : ""} with ${releaseWord(c)}; a session is carrying ${clash === 1 || !clash ? "it" : "them"} over`;
  return `${n(clash || 1)} could not be carried over onto ${releaseWord(c)}. Set ${clash === 1 || !clash ? "it" : "them"} aside and update, or stay as you are`;
}

// ---- where things are ----
async function top(root: string) { return git(root, ["rev-parse", "--show-toplevel"]); }
/** the main checkout of the repo (MY SOL may itself be a worktree of it): side copies sit under its .claude/worktrees */
async function mainRepo(root: string) {
  const common = await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return common.endsWith("/.git") ? dirname(common) : await top(root);
}
// this worktree's own git folder: the checkout of main, MY SOL and every side copy each run an engine of their own
async function stateFile(root: string) { return join(await git(root, ["rev-parse", "--absolute-git-dir"]), "sol-carry.json"); }
async function prefixOf(root: string) {
  const b = (await tryGit(root, ["symbolic-ref", "--short", "-q", "HEAD"])) ?? "";
  return /^(.+)\/mine$/.exec(b)?.[1] ?? null;
}
const busyGit = async (cwd: string) => {
  for (const p of ["rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "MERGE_HEAD"]) {
    const at = await tryGit(cwd, ["rev-parse", "--git-path", p]);
    if (at && existsSync(resolve(cwd, at))) return true;
  }
  return false;
};
const dirty = async (cwd: string) => ((await tryGit(cwd, ["status", "--porcelain", "--untracked-files=no"])) ?? "x") !== "";

/** the release has had this change: at its tip, or at one of its own changes since the fork, the files this change
 * touched read exactly as this change left them (taken in, then maybe changed further: there is nothing left to carry) */
async function hadIt(root: string, sha: string, fork: string, onto: string, files: string[]): Promise<boolean> {
  files = files.map(fromTop);
  if ((await gitRun(root, ["diff", "--quiet", sha, onto, "--", ...files])).code === 0) return true;
  const theirs = ((await tryGit(root, ["rev-list", "-50", `${fork}..${onto}`, "--", ...files])) ?? "").split("\n").filter(Boolean);
  for (const r of theirs) if ((await gitRun(root, ["diff", "--quiet", sha, r, "--", ...files])).code === 0) return true;
  return false;
}

/** a file named from the repo's top, as a pathspec: git runs in sol/, where a bare "sol/x" would mean sol/sol/x */
const fromTop = (file: string) => `:(top)${file}`;

// ---- step 2's first half: what clashes with what, nothing written but loose objects ----
/** the person's own changes in `source` that `onto` lacks, oldest first, each tried on `onto` after the ones before it
 * (git merge-tree, so no folder moves): goes on by itself, clashes (in which files, against which of the release's own
 * changes), or is in the release already (git cherry says so, or the release has exactly what it left in its files) */
export async function analyse(sol: string, onto: string, source: string, base?: string): Promise<Change[]> {
  const root = await top(sol);   // from the top, so the names git gives back are the repo's own
  // base (#426, going back): the person's changes are what source has over the release under it, not over the older onto
  const list = (await git(root, ["rev-list", "--reverse", "--no-merges", `${base ?? onto}..${source}`])).split("\n").filter(Boolean);
  if (!list.length) return [];
  const same = new Set((await git(root, ["cherry", onto, source, ...(base ? [base] : [])])).split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()));
  const fork = base ?? (await tryGit(root, ["merge-base", onto, source])) ?? onto;
  let at = await git(root, ["rev-parse", `${onto}^{commit}`]);
  const out: Change[] = [];
  for (const sha of list) {
    const what = whatOf(await git(root, ["log", "-1", "--format=%s", sha]));
    const files = (await git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", sha])).split("\n").filter(Boolean);
    if (same.has(sha) || (files.length && (await hadIt(root, sha, fork, onto, files)))) {
      out.push({ sha, what, state: "in-release" });
      continue;
    }
    const parent = await tryGit(root, ["rev-parse", "-q", "--verify", `${sha}^`]);
    const m = await gitRun(root, ["merge-tree", "--write-tree", "--name-only", "--no-messages", ...(parent ? [`--merge-base=${parent}`] : []), at, sha]);
    if (m.code === 0) {
      const tree = m.out.split("\n")[0];
      at = await git(root, ["commit-tree", tree, "-p", at, "-m", "carry trial"]);   // the next change is tried on this one
      out.push({ sha, what, state: "clean" });
    } else {
      const lines = m.out.split("\n");
      const clashFiles = m.code === 1 ? [...new Set(lines.slice(1).map((l) => l.trim()).filter(Boolean))] : [];
      const named = clashFiles.length ? clashFiles : files;
      const against = named.length ? (await tryGit(root, ["log", "--no-merges", "-3", "--format=%s", `${fork}..${onto}`, "--", ...named.map(fromTop)]))?.split("\n").filter(Boolean).map(whatOf) ?? [] : [];
      out.push({ sha, what, state: "clash", files: named, against });
    }
  }
  return out;
}

// ---- the one carry, kept on disk ----
let D: Deps | null = null;
let S: Saved = { carry: null };
let watching: NodeJS.Timeout | null = null;
let moving = false;
let waitingMove = false;   // the move is still waiting for a quiet moment: Stay may call it off
let callOff = false;
let lastMove: Promise<void> = Promise.resolve();
/** the move under way (or the last one), settled: for the tests */
export const moveSettled = () => lastMove;

async function load(root: string): Promise<Saved> {
  try {
    const s = JSON.parse(readFileSync(await stateFile(root), "utf8")) as Saved;
    const head = await tryGit(root, ["rev-parse", "HEAD"]);
    if (s.carry && head !== s.carry.from) {
      // the folder moved since it began: a move a renew cut short after the reset (HEAD is the copy's result) is done;
      // anything else is stale, and the offer stands, so Update starts afresh
      s.carry = null;
    } else if (s.carry?.stage === "moving") s.carry = { ...s.carry, stage: "ready", said: saidOf({ ...s.carry, stage: "ready" }) };   // a move cut short before it began is offered again
    return { carry: s.carry ?? null, ...(s.stayed ? { stayed: s.stayed } : {}), ...(s.brought ? { brought: s.brought } : {}) };
  } catch { return { carry: null }; }
}
async function save(): Promise<void> {
  if (!D) return;
  try { writeFileSync(await stateFile(D.root), JSON.stringify(S, null, 2) + "\n"); } catch { /* a read-only checkout: kept in memory */ }
}
function set(carry: Carry | null): Promise<void> {
  S = { ...S, carry };
  const saved = save();
  D?.tell(msgOf());
  return saved;
}
/** a write that was waiting on git: only if the carry it was about is still the one under way */
const current = (c: Carry) => S.carry === c || (!!S.carry && S.carry.branch === c.branch && S.carry.at === c.at);
/** what the faces are told: team.carry with the carry, or `stage: null` when there is none */
export const msgOf = () => ({ type: "team.carry", ...(S.carry ? { ...S.carry } : { stage: null }) });
export const carryNow = () => S.carry;
/** the release this Sol chose to stay behind (ship.ts heardStable: not offered again; the next one is) */
export const stayedOn = () => S.stayed ?? null;

/** team/wire.ts, at the engine's start */
export async function startCarry(d: Deps) {
  D = d;
  S = await load(d.root).catch(() => ({ carry: null }));
  if (watching) clearInterval(watching);
  watching = setInterval(() => void check().catch(() => {}), 15_000);
  watching.unref?.();
}

// ---- step 2's second half: the side copy, and the session when it does not go by itself ----
/** a carry branch's name, free here: <prefix>/carry-<stamp>, -2, -3 when two begin in one second */
async function freeBranch(root: string, prefix: string, now: Date): Promise<string> {
  const stem = `${prefix}/carry-${stampOf(now)}`;
  for (let i = 1; ; i++) {
    const name = i === 1 ? stem : `${stem}-${i}`;
    if (!(await tryGit(root, ["rev-parse", "-q", "--verify", `refs/heads/${name}`]))) return name;
  }
}
/** a copy that is done with: its folder goes (the branch stays), unless its session is still in a turn there */
async function dropCopy(c: Carry | null) {
  if (!D || !c?.copy || !existsSync(c.copy) || (c.session && D.working(c.session))) return;
  await gitRun(c.copy, [...QUIET, "rebase", "--abort"]);
  await gitRun(D.root, ["worktree", "remove", "--force", c.copy]);
}
async function makeCopy(root: string, branch: string, from: string): Promise<string> {
  const repo = await mainRepo(root);
  const at = join(repo, ".claude", "worktrees", branch.replace(/[^A-Za-z0-9._-]+/g, "-"));
  mkdirSync(dirname(at), { recursive: true });
  await git(root, ["worktree", "add", "-q", "-b", branch, at, from]);
  return at;
}

/** the copy is done: nothing half-way, nothing uncommitted, the release under it */
async function doneIn(c: Carry): Promise<boolean> {
  if (!c.copy || !existsSync(c.copy)) return false;
  if (await busyGit(c.copy)) return false;
  if (await dirty(c.copy)) return false;
  return (await gitRun(c.copy, ["merge-base", "--is-ancestor", c.onto, "HEAD"])).code === 0;
}

function prompt(c: Carry, live: string): string {
  const rel = c.kind === "back" ? "your Sol as it is now" : `the release ${c.tag || c.onto.slice(0, 8)}`;
  const rows = c.changes.map((x, i) => `${i + 1}. ${x.what}: ${x.state === "in-release" ? "the release has this already; left out"
    : x.state === "clean" ? "goes on by itself"
    : `clashes${x.against?.length ? ` with the release's "${x.against.join("\", \"")}"` : ""}${x.files?.length ? ` in ${x.files.join(", ")}` : ""}`}`);
  return [
    `Sol could not carry ${c.kind === "back" ? "the changes set aside in " + c.aside : "this person's own changes"} over onto ${rel} by itself, so this session does it here, in a side copy. The Sol they live in (${live}) is not touched.`,
    ``,
    `Their changes, oldest first:`,
    ...rows,
    ``,
    `This copy is part-way: git is putting the changes on one at a time and stopped at the first clash. At each stop: read both sides, keep what each meant, resolve the files, \`git add\` them, then \`git rebase --continue\` (GIT_EDITOR=true is set for you). If the release already does what the change did, \`git rebase --skip\`. If node_modules are there, type-check what you touched (sol/engine: npx tsc --noEmit; sol/mac: npx tsc).`,
    `When every change is on, say in plain words, one line each, what each change is and what you did with it. Do not push, do not touch the live folder, do not move stable or main. Sol sees when this copy is done and offers them "Use it".`,
    `If a change cannot be carried over honestly, run \`git rebase --abort\` and say which one and why; Sol then offers to set the changes aside or to stay.`,
    `When you write to them, never say commit, rebase or conflict: say change, carry over, clash.`,
  ].join("\n");
}

/** steps 2 and 3 begin: called by ship.ts update when sol/mine/rebase stopped on a clash, and by bring back */
export async function carryOver(a: { kind: "update" | "back"; onto: string; source: string; tag?: string; follow?: string; aside?: string; base?: string; back?: { tag: string; version: number; data?: string }; auto?: boolean }): Promise<Carry> {
  if (!D) throw new Error("carrying over is not set up here");
  if (moving) throw new Error("your Sol is moving over already");
  const d = D, root = d.root;
  const prefix = await prefixOf(root);
  if (!prefix) throw new Error("only a Sol on its own */mine branch carries its changes over");
  const from = await git(root, ["rev-parse", "HEAD"]);
  const onto = await git(root, ["rev-parse", `${a.onto}^{commit}`]);
  const source = await git(root, ["rev-parse", `${a.source}^{commit}`]);
  const base0 = a.base ? await git(root, ["rev-parse", `${a.base}^{commit}`]) : undefined;
  const list = await analyse(root, onto, source, base0);
  // a merge of the person's own carries what was settled in it, which putting changes on one by one would lose: that
  // goes straight to their choice (set aside keeps everything as it stands)
  const merges = ((await tryGit(root, ["rev-list", "--merges", `${base0 ?? onto}..${source}`])) ?? "").trim();
  const was = S.carry;
  if (was) await dropCopy(was);   // a new carry replaces the last one
  const branch = await freeBranch(root, prefix, d.now());
  const copy = await makeCopy(root, branch, source);
  const base: Omit<Carry, "stage" | "said"> = { kind: a.kind, onto, ...(a.tag ? { tag: a.tag } : {}), ...(a.follow ? { follow: a.follow } : {}), from, source, ...(a.aside ? { aside: a.aside } : {}), ...(base0 ? { base: base0 } : {}), ...(a.back ? { back: a.back } : {}), ...(a.auto ? { auto: true as const } : {}), changes: list, copy, branch, at: d.now().getTime() };
  // the order of picks: every change but the ones the release has; git leaves out the ones that end up empty
  const todo = list.filter((x) => x.state !== "in-release").map((x) => `pick ${x.sha}`).join("\n") + "\n";
  const tmp = mkdtempSync(join(tmpdir(), "sol-carry-"));
  const file = join(tmp, "todo");
  writeFileSync(file, list.some((x) => x.state !== "in-release") ? todo : "noop\n");
  const fork = base0 ?? (await tryGit(root, ["merge-base", onto, source])) ?? onto;
  if (merges) {
    rmSync(tmp, { recursive: true, force: true });
    const c: Carry = { ...base, stage: "failed", said: "" };
    c.said = saidOf(c);
    await set(c);
    return c;
  }
  const r = await gitRun(copy, [...QUIET, "rebase", "-i", "--empty=drop", "--onto", onto, fork], { GIT_SEQUENCE_EDITOR: `cp '${file}'` });
  rmSync(tmp, { recursive: true, force: true });
  if (r.code === 0 && (await doneIn({ ...base, stage: "session", said: "" }))) {
    const c: Carry = { ...base, stage: "ready", said: "" };
    c.said = saidOf(c);
    set(c);
    if (c.auto) void useIt();   // #1150: no press; it moves at a quiet moment
    return c;
  }
  if (!(await busyGit(copy))) {   // git would not even start: nothing for a session to do
    const c: Carry = { ...base, stage: "failed", said: "" };
    c.said = saidOf(c);
    set(c);
    return c;
  }
  const c: Carry = { ...base, stage: "session", said: "" };
  c.said = saidOf(c);
  try {
    const live = await top(root);
    const n = list.filter((x) => x.state === "clash").length || 1;
    c.session = await d.open({ cwd: copy, title: `Carrying ${n === 1 ? "1 change" : `${n} changes`} over onto ${a.kind === "back" ? "my Sol" : a.tag || "the release"}`, text: prompt(c, live) });
  } catch {
    await gitRun(copy, [...QUIET, "rebase", "--abort"]);   // no session: the copy is left clean, and the person chooses
    c.stage = "failed";
    c.said = saidOf(c);
  }
  set(c);
  return c;
}

/** every 15 s and on every ask: has the session finished the copy, or stopped without finishing it */
export async function check(): Promise<Carry | null> {
  const c = S.carry;
  if (!D || !c || c.stage === "moving") return c;
  // the Sol moved since this began (a change kept there, an update by other means): this carry no longer fits it
  if ((await tryGit(D.root, ["rev-parse", "HEAD"])) !== c.from) {
    if (current(c) && !moving) { await set(null); await dropCopy(c); }
    return S.carry;
  }
  if (c.stage === "ready") { if (c.auto && !moving) void useIt(); return c; }   // #1150: a move that did not happen (a renew, a refusal) is tried again
  if (!c.copy || !existsSync(c.copy)) { if (c.stage !== "failed") await set({ ...c, stage: "failed", said: saidOf({ ...c, stage: "failed" }) }); return S.carry; }
  if (await doneIn(c)) {
    if (!current(c)) return S.carry;   // a choice was made while git was asked
    const done: Carry = { ...c, stage: "ready", said: "" };
    done.said = saidOf(done);
    await set(done);
    if (done.auto && !moving) void useIt();   // #1150: the session finished it; no press
    return done;
  }
  if (!current(c)) return S.carry;
  // the session ended its turn with the copy unfinished (a minute's grace for it to start): the person chooses
  const still = c.session ? D.working(c.session) : false;
  if (c.stage === "session" && !still && D.now().getTime() - c.at > 60_000) await set({ ...c, stage: "failed", said: saidOf({ ...c, stage: "failed" }) });
  else if (c.stage === "failed" && still) await set({ ...c, stage: "session", said: saidOf({ ...c, stage: "session" }) });
  return S.carry;
}

// ---- moving the live folder, at a quiet moment ----
class CalledOff extends Error {}
async function moveTo(expect: string, sha: string, copy: string | undefined, then: () => Promise<void>): Promise<void> {
  if (!D) return;
  waitingMove = true; callOff = false;   // before the first await: Stay may call it off from the moment it is asked
  const d = D, root = d.root;
  try {
    const t = await top(root);
    for (let i = 0; ; i++) {
      if (callOff) throw new CalledOff();
      if (d.quiet(t, copy)) break;
      await new Promise((r) => setTimeout(r, i < 12 ? 5_000 : 30_000).unref?.());
    }
  } finally { waitingMove = false; }
  if (callOff) throw new CalledOff();
  const leave = joinBusy("carry", "move", "moving your Sol over");   // no renew between the reset and the state saying so
  try {
    const was = await git(root, ["rev-parse", "HEAD"]);
    if (was !== expect) throw new Error("your Sol changed while it waited; press Update again");
    await git(root, ["update-ref", `refs/sol/carried-from/${stampOf(d.now())}`, was]);   // where it stood, kept: nothing is lost
    await git(root, ["reset", "-q", "--keep", sha]);   // --keep: refuses rather than lose anything uncommitted
    await then();
  } finally { leave(); }
}
/** after a move: the faces and the version learn it; a failure here is not a failed move */
const afterMove = async (f: () => void | Promise<void>) => { try { await f(); } catch { /* the folder moved; the next ask catches up */ } };

/** "Use it": the live folder moves to the copy's result once nothing is at work in it. Refused if the Sol moved since. */
export async function useIt(): Promise<{ ok: true; waiting: boolean } | { ok?: false; error: string }> {
  if (!D) return { error: "carrying over is not set up here" };
  if (moving) return { error: "already moving" };
  moving = true;   // claimed before the first await: a second press is refused, not raced
  let started = false;
  try {
    const c = await check();
    if (!c || c.stage !== "ready" || !c.copy) return { error: "there is nothing carried over to use yet" };
    const root = D.root;
    if ((await git(root, ["rev-parse", "HEAD"])) !== c.from) return { error: "your Sol changed since this began; press Update again" };
    if (await dirty(root)) return { error: "you have changes not kept yet in your Sol; keep them first" };
    const to = await git(c.copy, ["rev-parse", "HEAD"]);
    const m: Carry = { ...c, stage: "moving", said: saidOf({ ...c, stage: "moving" }) };
    set(m);
    const waiting = !D.quiet(await top(root), c.copy);
    const d = D;
    started = true;
    lastMove = moveTo(c.from, to, c.copy, async () => {
      if (c.back) { if (!d.wentBack) throw new Error("going back is not set up here"); await d.wentBack(c); }   // #426: the data and the pin
      else if (c.kind === "update") await tryGit(root, ["branch", "-f", c.follow ?? "stable", c.onto]);   // my dev (or stable) is the team's now
      if (c.kind === "back" && c.aside) S = { ...S, brought: { ...S.brought, [c.aside]: c.source } };
      await set(null);
      await dropCopy(c);
      if (c.kind === "update" && !c.back) await afterMove(() => d.updated(c.onto));
    }).catch((e) => {
      if (e instanceof CalledOff || !current(m)) return;
      set({ ...c, stage: "ready", said: `could not move over: ${String(e?.message ?? e).slice(0, 200)}` });
    }).finally(() => { moving = false; });
    return { ok: true, waiting };
  } finally { if (!started) moving = false; }
}

// ---- step 3: set aside, or stay ----
async function asideName(root: string, prefix: string, now: Date): Promise<string> {
  const stem = `${prefix}/aside-${day(now)}`;
  for (let i = 1; ; i++) {
    const name = i === 1 ? stem : `${stem}-${i}`;
    const here = await tryGit(root, ["rev-parse", "-q", "--verify", `refs/heads/${name}`]);
    const there = await tryGit(root, ["rev-parse", "-q", "--verify", `refs/remotes/origin/${name}`]);
    if (!here && !there) return name;
  }
}

/** Update and set aside: the Sol as it stands kept as <prefix>/aside-YYYYMMDD (pushed when it can be), then the Sol
 * moves onto the release plus those of its `mine:` changes that still go on by themselves */
export async function setAside(release?: { onto: string; tag?: string; follow?: string }): Promise<{ ok: true; aside: string; pushed: boolean; kept: number; left: number; waiting: boolean } | { ok?: false; error: string }> {
  if (!D) return { error: "carrying over is not set up here" };
  if (moving) return { error: "already moving" };
  moving = true;   // claimed before the first await (the push is slow): a second press is refused
  let started = false;
  try { return await asideNow(release, () => { started = true; }); }
  finally { if (!started) moving = false; }
}
async function asideNow(release: { onto: string; tag?: string; follow?: string } | undefined, start: () => void): Promise<{ ok: true; aside: string; pushed: boolean; kept: number; left: number; waiting: boolean } | { ok?: false; error: string }> {
  const d = D!, root = d.root;
  const c = S.carry;
  const onto = c?.kind === "update" ? c.onto : release?.onto;
  if (!onto) return { error: "there is no release to update to" };
  const follow = (c?.kind === "update" ? c.follow : undefined) ?? release?.follow ?? "stable";
  const prefix = await prefixOf(root);
  if (!prefix) return { error: "only a Sol on its own */mine branch sets its changes aside" };
  if (await dirty(root)) return { error: "you have changes not kept yet in your Sol; keep them first" };
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (c && c.kind === "update" && c.from !== head) return { error: "your Sol changed since this began; press Update again" };
  const aside = await asideName(root, prefix, d.now());
  await git(root, ["branch", aside, head]);
  const pushed = !isQuiet() && (await gitRun(root, ["push", "-q", "origin", `refs/heads/${aside}:refs/heads/${aside}`])).code === 0;
  // the release plus the `mine:` changes that go on by themselves, built in a copy of its own
  const branch = await freeBranch(root, prefix, d.now());
  const copy = await makeCopy(root, branch, onto);
  const back: Pick<Carry, "back" | "base"> = c?.kind === "update" && c.back ? { back: c.back, ...(c.base ? { base: c.base } : {}) } : {};   // #426: going back
  const own = (await git(root, ["rev-list", "--reverse", "--no-merges", `${back.base ?? onto}..${head}`])).split("\n").filter(Boolean);
  let kept = 0, left = 0;
  for (const sha of own) {
    if (!/^mine:/i.test(await git(root, ["log", "-1", "--format=%s", sha]))) { left++; continue; }
    const r = await gitRun(copy, [...QUIET, "cherry-pick", "--allow-empty", "--keep-redundant-commits", sha]);
    if (r.code === 0) {
      // one the release already has ends up empty: left out, not counted as kept
      if ((await gitRun(copy, ["diff", "--quiet", "HEAD~1", "HEAD"])).code === 0) await git(copy, ["reset", "-q", "--hard", "HEAD~1"]);
      else kept++;
    } else { await gitRun(copy, ["cherry-pick", "--abort"]); left++; }
  }
  const to = await git(copy, ["rev-parse", "HEAD"]);
  await dropCopy(c);   // the session's copy, if one was carrying: this choice replaces it
  const next: Carry = { kind: "update", stage: "moving", onto, follow, ...back, ...(c?.tag ? { tag: c.tag } : release?.tag ? { tag: release.tag } : {}), from: head, source: head, changes: c?.changes ?? [], copy, branch, at: d.now().getTime(), said: "" };
  next.said = saidOf(next);
  set(next);
  const waiting = !d.quiet(await top(root), copy);
  start();
  lastMove = moveTo(head, to, copy, async () => {
    if (next.back) { if (!d.wentBack) throw new Error("going back is not set up here"); await d.wentBack(next); }
    else await tryGit(root, ["branch", "-f", follow, onto]);
    await set(null);
    await dropCopy(next);
    if (!next.back) await afterMove(() => d.updated(onto));
  }).catch(async (e) => {
    if (!current(next)) return;
    if (e instanceof CalledOff) { await set(null); await dropCopy(next); return; }   // the aside stays kept; nothing moved
    set({ ...next, stage: "failed", said: `could not move over: ${String(e?.message ?? e).slice(0, 200)}` });
  }).finally(() => { moving = false; });
  return { ok: true, aside, pushed, kept, left, waiting };
}

/** Stay: nothing moves; this release is not offered again, the next one is */
export function stay(release?: string): { ok: true } | { ok?: false; error: string } {
  if (moving && !waitingMove) return { error: "your Sol is moving over right now" };
  if (moving) callOff = true;   // still waiting for a quiet moment: called off, nothing has moved
  if (S.carry?.kind === "back") { const was = S.carry; set(null); void dropCopy(was); return { ok: true }; }   // the aside stays aside
  if (S.carry?.back) { const was = S.carry; set(null); void dropCopy(was); return { ok: true }; }   // #426: not going back after all; nothing moved
  const onto = S.carry?.kind === "update" ? S.carry.onto : release;
  if (!onto) return { error: "there is no release to stay behind" };
  const was = S.carry;
  S = { ...S, stayed: onto };
  set(null);
  void dropCopy(was);
  return { ok: true };
}
/** a release offered after a stay is a newer one: the stay is spent */
export function clearStay() { if (S.stayed) { S = { ...S, stayed: undefined }; void save(); } }

// ---- the asides, and bring back ----
export async function asides(): Promise<Aside[]> {
  if (!D) return [];
  const root = D.root, prefix = await prefixOf(root);
  if (!prefix) return [];
  const out = (await tryGit(root, ["for-each-ref", "--format=%(refname)%09%(committerdate:iso-strict)%09%(objectname)", `refs/heads/${prefix}/`, `refs/remotes/origin/${prefix}/`])) ?? "";
  const seen = new Map<string, Aside>();
  for (const l of out.split("\n").filter(Boolean)) {
    const [ref, at, tip] = l.split("\t");
    const name = ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/origin\//, "");
    if (!new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/aside-\\d{8}(-\\d+)?$`).test(name)) continue;
    const remote = ref.startsWith("refs/remotes/");
    const was = seen.get(name);
    if (was) { if (remote) was.pushed = true; continue; }
    const left = S.brought?.[name] === tip ? 0 : ((await tryGit(root, ["cherry", "HEAD", ref])) ?? "").split("\n").filter((x) => x.startsWith("+ ")).length;
    seen.set(name, { name, at, left, pushed: remote });
  }
  return [...seen.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** bring back: an aside's changes carried onto the Sol as it is now, by the same session and the same choices */
export async function bringBack(name: string): Promise<Carry | { error: string }> {
  if (!D) return { error: "carrying over is not set up here" };
  if (S.carry && S.carry.stage !== "failed") return { error: "a carry over is already under way" };
  const list = await asides();
  const a = list.find((x) => x.name === name);
  if (!a) return { error: `there is no ${name} set aside` };
  if (!a.left) return { error: "everything in it is in your Sol already" };
  if (await dirty(D.root)) return { error: "you have changes not kept yet in your Sol; keep them first" };
  const ref = (await tryGit(D.root, ["rev-parse", "-q", "--verify", `refs/heads/${name}`])) ? name : `origin/${name}`;
  try { return await carryOver({ kind: "back", onto: "HEAD", source: ref, aside: name }); }
  catch (e: any) { return { error: String(e?.message ?? e) }; }
}

/** test hook: forget the instance */
export function resetCarry() { D = null; S = { carry: null }; moving = false; waitingMove = false; callOff = false; if (watching) { clearInterval(watching); watching = null; } }
