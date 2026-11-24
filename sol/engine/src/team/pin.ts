// Pin, and go back to any release within thirty days (#426, B3 of #413). Separate from goback.ts / sol/back (#18),
// which take one step back when Sol is broken; this is a person choosing which release their Sol runs.
//
//   pin            the Sol stays on the release it runs and takes no new one (no offer, no dev release installing
//                  itself, Update refused) until "back to latest". Stored per Mac: in this checkout's own git folder
//                  (`sol-pin.json`, beside carry.ts's sol-carry.json), never committed.
//   go back        to any `dev-*` or `stable-*` release tagged in the last thirty days. The Sol is pinned there.
//                  A plain Sol (main, dev, stable) moves onto a branch of its own, `pinned`, at the release, so main is
//                  never moved backwards, and a release from before pinning existed cannot install a newer one by
//                  itself either (its Update refuses a branch that is not main, dev or stable).
//                  A `<you>/mine` Sol takes its own changes along by #425's ladder: they go onto the older release by
//                  themselves, else a side copy and a session carry them over and "Use it" moves it, else stay.
//   saved data     decided on #413: a release from before a conversion step cannot read what the step wrote, so going
//                  back over a step puts back the copy taken before it (convert/back.ts), and what was saved in those
//                  files since is lost. The plan says so first, in plain words, and going back needs the plan's `sure`:
//                  what the person was warned of is what happens, or nothing happens.
//   back to latest the pin goes; a plain Sol goes back to the branch it came from, then Update as usual (a dev release,
//                  the beta offer, a <you>/mine ladder). Newer code runs the conversion steps again at its start.
//
// Never half-moved: the move waits for a quiet moment, holds the busy count, and builds the release's engine before
// anything else changes. A build that fails puts the folder back. With data to put back, the files as they are are
// copied first and restored if anything after fails; once the data is back the engine ends itself at once, so the code
// that wrote the newer data never runs on the older data, and its keeper starts the release's build. A crash between
// the move and the data (the build's half a minute) leaves the older engine with newer data: #422's "ahead" case, which
// changes nothing and which /health shows, and back to latest makes it whole again.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { join as joinBusy, idle, whenIdle, letGo } from "../busy.js";
import { carryNow } from "./carry.js";
import { backTo, latestIn, lostOf, planBack, type BackPlan } from "../convert/back.js";
import type { Ctx } from "../convert/run.js";
import type { Carry } from "./carry.js";

const run = promisify(execFile);
const ENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" });
const git = (cwd: string, args: string[], timeout = 60_000) =>
  run("git", args, { cwd, env: ENV(), timeout, maxBuffer: 16 << 20 }).then((r) => r.stdout.trim());
const tryGit = (cwd: string, args: string[], timeout?: number) => git(cwd, args, timeout).catch(() => null);
const QUIET = ["-c", "core.hooksPath=/dev/null", "-c", "advice.mergeConflict=false"];
const firstLine = (e: unknown) => String((e as { stderr?: unknown })?.stderr || (e as Error)?.message || e).trim().split("\n")
  .map((l) => l.replace(/^(fatal|error|hint): /, "").trim()).filter(Boolean)[0] ?? "it failed";

export const DAYS = 30;
export const PINNED_BRANCH = "pinned";
const TAGS = ["refs/tags/dev-*", "refs/tags/stable-*"];
const DAY = 86_400_000;
const PIN_FILE = "sol/engine/src/team/pin.ts";

export type Pin = { tag: string; sha: string; at: string; back?: true; was?: string };   // was: the branch a plain Sol came from
export type ReleaseRef = { tag: string; sha: string; at: string; data: number; pins: boolean };   // pins: its build knows the pin (this file is in it)
export type PinView = {
  pin: Pin | null;
  here: { tag: string; sha: string } | null;   // the release this Sol runs (its own changes on top, for a <you>/mine Sol)
  releases: ReleaseRef[];                      // the last thirty days', newest first
  data: number;                                // this home's data-version
  mine: boolean;
  going?: string;                              // what a go back under way is doing, in words
};
export type Plan = {
  tag: string; sha: string; at: string;
  data: { from: number; to: number; steps: { step: string; at: string | null; files: string[] }[] };
  lost: { file: string; since: string | null }[];
  own: number;          // a <you>/mine Sol: its own changes, carried along
  pins: boolean;        // the release knows the pin; an older one has no back to latest (the warning says the way back)
  said: string;         // the warning, in plain words
  sure: string;         // given back to go: what was said is what happens
};

export type Deps = {
  root: string;                                  // sol/ in the Sol's checkout
  ctx: Ctx;                                      // where the saved data is (convert/start.ts)
  now: () => Date;
  /** the engine built from the folder as it is now: null when it built, else what went wrong */
  build: () => Promise<string | null>;
  /** the engine ends itself, for its keeper to start the release's build (only after data was put back) */
  exit: () => void;
  tell: (m: object) => void;                     // every face
  /** whether step `id` would copy anything on this home now (convert/steps.ts): a missing copy is then a gap */
  touched: (id: number) => boolean;
  /** a <you>/mine Sol whose own changes do not go onto the release by themselves: #425's carry, with base and back */
  carry?: (a: { onto: string; tag: string; base: string; back: { tag: string; version: number; data?: string } }) => Promise<Carry>;
  /** after the pin changed: the standing offer withdrawn or asked again (ship.ts) */
  pinned?: (p: Pin | null) => void;
  /** after the Sol moved without ending the engine: what it runs is said again */
  moved?: () => void;
  quietMs?: number;                              // a quiet moment: nothing live this long (default 5 s)
};

// ---- the one, kept on disk ----
let D: Deps | null = null;
let P: Pin | null = null;
let going = "";
let file = "";

async function stateFile(root: string) { return join(await git(root, ["rev-parse", "--absolute-git-dir"]), "sol-pin.json"); }
function save() {
  if (!file) return;
  try { writeFileSync(file + ".tmp", JSON.stringify({ pin: P }, null, 2) + "\n"); renameSync(file + ".tmp", file); } catch { /* read-only: in memory */ }
}
function setPin(p: Pin | null) { P = p; save(); D?.pinned?.(p); void view().then((v) => D?.tell({ type: "team.pin", ...v })).catch(() => {}); }
function say(words: string) { going = words; void view().then((v) => D?.tell({ type: "team.pin", ...v })).catch(() => {}); }

/** the pin this Sol is on, or null (ship.ts: no offer, no install, Update refused) */
export const pinNow = () => P;
/** what a go back under way is doing, in words, "" when none (J4 of #1824: Sol.app does not relaunch meanwhile, team/shell.ts) */
export const goingNow = () => going;

export async function startPin(d: Deps) {
  D = d; P = null; going = "";
  file = await stateFile(d.root).catch(() => "");
  try { const s = JSON.parse(readFileSync(file, "utf8")) as { pin?: Pin | null }; P = s.pin && typeof s.pin.sha === "string" ? s.pin : null; } catch { P = null; }
  // a plain Sol on `pinned` with no pin read (the file lost): it stays pinned where it is, never moved by itself
  if (!P && (await tryGit(d.root, ["branch", "--show-current"])) === PINNED_BRANCH) {
    const sha = (await tryGit(d.root, ["rev-parse", "HEAD"])) ?? "";
    if (sha) P = { tag: (await tagsAt(d.root, sha))[0] ?? "", sha, at: d.now().toISOString() };
  }
  // a pin whose Sol moved by other means (an older release has no pin: its Update, or a switch by hand) is dropped
  if (P) {
    const b = await branchOf(d.root);
    const at = b === PINNED_BRANCH ? await tryGit(d.root, ["rev-parse", "HEAD"]) : isMine(b) ? await baseOf(d.root, true).catch(() => null) : null;
    if (at !== P.sha) { P = null; save(); }
  }
}
/** test hook */
export function resetPin() { D = null; P = null; going = ""; file = ""; }

// ---- where things are ----
const branchOf = (root: string) => tryGit(root, ["branch", "--show-current"]).then((b) => b ?? "");
const isMine = (b: string) => /\/mine$/.test(b);
async function tagsAt(root: string, sha: string): Promise<string[]> {
  return ((await tryGit(root, ["tag", "-l", "--points-at", sha, "dev-*", "stable-*"])) ?? "").split("\n").filter(Boolean).sort().reverse();
}
/** the release under this Sol: HEAD for a plain Sol; for a <you>/mine Sol, where its own changes leave main's line */
async function baseOf(root: string, mine: boolean): Promise<string> {
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (!mine) return head;
  for (const ref of ["refs/remotes/origin/main", "refs/heads/main", "refs/remotes/origin/dev", "refs/remotes/origin/stable"]) {
    const at = await tryGit(root, ["merge-base", "HEAD", ref]);
    if (at) return at;
  }
  return head;
}

/** the releases of the last thirty days, newest first, each with the newest conversion step its build knows */
export async function releases(root: string, now: Date, fetch = true): Promise<ReleaseRef[]> {
  if (fetch) await tryGit(root, ["fetch", "-q", "origin", ...TAGS.map((t) => `+${t}:${t}`)], 30_000);
  const out = (await tryGit(root, ["for-each-ref", "--sort=-creatordate", "--format=%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:iso-strict)", ...TAGS])) ?? "";
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  const since = now.getTime() - DAYS * DAY;
  const list: ReleaseRef[] = [];
  for (const l of out.split("\n").filter(Boolean)) {
    const [tag, peeled, obj, at] = l.split("\t");
    const t = Date.parse(at);
    if (!tag || Number.isNaN(t) || t < since || t > now.getTime() + DAY) continue;
    const sha = peeled || obj;
    const names = ((await tryGit(top, ["ls-tree", "-r", "--name-only", sha, "--", "sol/engine/src/convert", PIN_FILE])) ?? "").split("\n");
    list.push({ tag, sha, at: new Date(t).toISOString(), data: latestIn(names), pins: names.includes(PIN_FILE) });
    if (list.length >= 60) break;
  }
  return list;
}

export async function view(fetch = false): Promise<PinView> {
  const d = D;
  if (!d) return { pin: null, here: null, releases: [], data: 0, mine: false };
  const mine = isMine(await branchOf(d.root));
  const base = await baseOf(d.root, mine).catch(() => "");
  const tag = base ? (await tagsAt(d.root, base))[0] ?? "" : "";
  let data = 0;
  try { data = Number(readFileSync(join(d.ctx.dotSol, "data-version"), "utf8").trim()) || 0; } catch { /* none yet */ }
  return { pin: P, here: base ? { tag, sha: base } : null, releases: await releases(d.root, d.now(), fetch).catch(() => []), data, mine, ...(going ? { going } : {}) };
}

// ---- pin here, and back to latest ----

/** pin: the Sol stays on what it runs now. A plain Sol moves onto `pinned` at the same commit (nothing in it changes) */
export async function pinHere(): Promise<{ ok: true; pin: Pin } | { ok?: false; error: string }> {
  const d = D;
  if (!d) return { error: "pinning is not set up here" };
  if (going) return { error: "your Sol is going back already" };
  if (carryNow()) return { error: "your own changes are being carried over; finish that first" };
  const b = await branchOf(d.root);
  if (b === "live") return { error: "the live Sol moves by the release runner only" };
  const mine = isMine(b);
  if (!mine && !b) return { error: "your Sol is on no branch; it cannot be pinned" };
  const base = await baseOf(d.root, mine);
  if (!mine && b !== PINNED_BRANCH) {
    try { await git(d.root, ["switch", "-q", "-C", PINNED_BRANCH, "HEAD"]); }
    catch (e) { return { error: `could not pin: ${firstLine(e)}` }; }
  }
  const p: Pin = { tag: (await tagsAt(d.root, base))[0] ?? "", sha: base, at: d.now().toISOString(), ...(!mine && b !== PINNED_BRANCH ? { was: b } : P?.was ? { was: P.was } : {}) };
  setPin(p);
  return { ok: true, pin: p };
}

/** back to latest: the pin goes; a plain Sol back on the branch it came from (main, dev or stable). The caller then
 *  updates as usual (wire.ts) */
export async function unpin(): Promise<{ ok: true } | { ok?: false; error: string }> {
  const d = D;
  if (!d) return { error: "pinning is not set up here" };
  if (going) return { error: "your Sol is going back right now" };
  const b = await branchOf(d.root);
  if (b === PINNED_BRANCH) {
    const to = P?.was || (await tryGit(d.root, ["rev-parse", "-q", "--verify", "refs/heads/main"]) ? "main" : "dev");
    try { await git(d.root, ["switch", "-q", to]); }
    catch (e) { return { error: `could not leave the pin: ${firstLine(e)}` }; }
    await tryGit(d.root, ["branch", "-D", PINNED_BRANCH]);
  }
  setPin(null);
  d.moved?.();
  return { ok: true };
}

// ---- go back ----

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
/** the warning (pure): what moves, what is lost, what comes along, and that it stays there */
export function wordsOf(p: Omit<Plan, "said" | "sure">, mine: boolean, top = "your Sol folder"): string {
  const parts = [`Your Sol goes back to ${p.tag} (${fmt(p.at)}) and stays there until you press back to latest.`];
  if (p.lost.length) {
    const files = p.lost.map((l) => `${basename(l.file)}${l.since ? ` since ${fmt(l.since)}` : ""}`);
    parts.push(`That release cannot read some of what Sol saves now, so ${p.lost.length === 1 ? "this file goes" : "these files go"} back to the copy kept before it changed: anything saved in ${files.join(", ")} is lost.`);
  } else if (p.data.to < p.data.from) parts.push("Its saved data needs nothing put back; nothing is lost.");
  else parts.push("It reads your saved data as it is; nothing is lost.");
  if (mine) parts.push(p.own ? `Your own ${p.own === 1 ? "change comes" : `${p.own} changes come`} along, as with an update.` : "You have no own changes to bring along.");
  if (!p.pins) parts.push(mine
    ? "That release is older than pinning, so it will offer new releases again; its Update brings you back to the latest."
    : `That release is older than pinning, so it has no back to latest: to come back, type \`git -C "${top}" switch main\` in a Terminal, then press Update.`);
  if (p.lost.length) parts.push("Sol starts again on it once it is ready.");
  return parts.join(" ");
}

async function planOf(tag: string): Promise<{ plan: Plan; back: BackPlan; base: string; mine: boolean; branch: string; head: string } | { error: string }> {
  const d = D;
  if (!d) return { error: "going back is not set up here" };
  const branch = await branchOf(d.root);
  if (branch === "live") return { error: "the live Sol moves by the release runner only" };
  if (!branch) return { error: "your Sol is on no branch; it cannot go back" };
  const mine = isMine(branch);
  if (!mine && !["main", "dev", "stable", PINNED_BRANCH].includes(branch)) return { error: `your Sol is on ${branch}, not main, dev or stable; it cannot go back from there` };
  const list = await releases(d.root, d.now());
  const r = list.find((x) => x.tag === tag);
  if (!r) return { error: `${tag} is not a release of the last ${DAYS} days` };
  const head = await git(d.root, ["rev-parse", "HEAD"]);
  const base = await baseOf(d.root, mine);
  if (base === r.sha) return { error: `your Sol runs ${tag} already` };
  if (!mine) {
    // a plain Sol's own commits would be left on the branch it leaves, out of sight: it goes back only from a release
    await tryGit(d.root, ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main"], 30_000);
    const onMain = (await tryGit(d.root, ["merge-base", "--is-ancestor", head, "refs/remotes/origin/main"])) !== null;
    if (!onMain) return { error: "your Sol has changes of its own that are in no release; it can go back only from a release" };
  }
  const own = mine ? Number(await tryGit(d.root, ["rev-list", "--count", "--no-merges", `${base}..HEAD`])) || 0 : 0;
  const back = planBack(d.ctx, r.data, d.touched);
  if (back.error) return { error: back.error };
  const lost = lostOf(back).map((l) => ({ file: l.path, since: l.since }));
  const p0 = { tag: r.tag, sha: r.sha, at: r.at, pins: r.pins, data: { from: back.from, to: back.to, steps: back.steps.map((s) => ({ step: s.step, at: s.at, files: s.files.map((f) => basename(f.path)) })) }, lost, own };
  const sure = createHash("sha1").update(JSON.stringify({ sha: r.sha, head, from: back.from, to: back.to, steps: back.steps.map((s) => [s.id, s.at]) })).digest("hex").slice(0, 16);
  const top = (await tryGit(d.root, ["rev-parse", "--show-toplevel"])) ?? undefined;
  return { plan: { ...p0, said: wordsOf(p0, mine, top), sure }, back, base, mine, branch, head };
}

/** what going back to `tag` would do and lose, in plain words; changes nothing */
export async function plan(tag: string): Promise<Plan | { error: string }> {
  const r = await planOf(tag);
  return "error" in r ? r : r.plan;
}

let last: Promise<void> = Promise.resolve();
/** the move under way (or the last one), settled: for the tests */
export const goSettled = () => last;

/** go back to `tag`, given the plan's `sure`: at the next quiet moment; the faces hear how it goes (team.pin `going`,
 *  then the pin, or `error` on team.pin.failed). Refused at once when the plan changed since it was read */
export async function goBack(tag: string, sure: string): Promise<{ ok: true; waiting: boolean } | { ok?: false; error: string }> {
  const d = D;
  if (!d) return { error: "going back is not set up here" };
  if (going) return { error: "your Sol is going back already" };
  if (carryNow()) return { error: "your own changes are being carried over; finish that first" };
  going = `looking at ${tag}…`;   // claimed before the first wait: a second press is refused, never run alongside
  const refuse = (error: string) => { going = ""; return { error }; };
  const r = await planOf(tag).catch((e) => ({ error: firstLine(e) }));
  if ("error" in r) return refuse(r.error);
  if (r.plan.sure !== sure) return refuse("something changed since Sol said what going back loses; look again before you go");
  const dirty = ((await tryGit(d.root, ["status", "--porcelain", "--untracked-files=no"])) ?? "x") !== "";
  if (dirty) return refuse(r.mine ? "you have changes not kept yet in your Sol; keep them first" : "you have changes not kept yet in your Sol; keep them or put them away first");
  const waiting = !idle();
  say(`going back to ${tag} at the next quiet moment…`);
  last = (async () => {
    try {
      const quiet = d.quietMs ?? 5_000;
      for (;;) {
        await whenIdle();
        if (quiet) await new Promise((ok) => setTimeout(ok, quiet).unref?.());
        if (idle()) break;
      }
      letGo();   // nothing new starts for a moment: the engine may end itself at the end of this
      const leave = joinBusy("pin", tag, `going back to ${tag}`);
      try {
        const again = await planOf(tag);   // the plan once more, now that it is quiet: the same, or nothing happens
        if ("error" in again) throw new Error(again.error);
        if (again.plan.sure !== sure) throw new Error("something changed while Sol waited; look again before you go");
        await move(d, again);
      } finally { leave(); }
    } catch (e) {
      going = "";
      d.tell({ type: "team.pin.failed", tag, error: String((e as Error)?.message ?? e).slice(0, 300) });
      void view().then((v) => d.tell({ type: "team.pin", ...v })).catch(() => {});
    }
  })();
  return { ok: true, waiting };
}

type Ready = Exclude<Awaited<ReturnType<typeof planOf>>, { error: string }>;
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");

async function move(d: Deps, r: Ready) {
  const { plan: p, mine, branch, head, base } = r;
  const was = P;
  await git(d.root, ["update-ref", `refs/sol/went-back-from/${stamp(d.now())}`, head]);   // where it stood, kept
  if (!mine) {
    say(`moving to ${p.tag}…`);
    await git(d.root, ["switch", "-q", "-C", PINNED_BRANCH, p.sha]);
    const from = branch === PINNED_BRANCH ? (P?.was ?? "main") : branch;
    const undo = async () => {
      if (branch === PINNED_BRANCH) { await git(d.root, ["switch", "-q", "-C", PINNED_BRANCH, head]); return; }
      await git(d.root, ["switch", "-q", branch]);   // the branch it left never moved: back on it, as it was
      await tryGit(d.root, ["branch", "-D", PINNED_BRANCH]);
    };
    await finish(d, { tag: p.tag, sha: p.sha, version: p.data.to, from: head, undo, was, plain: from, data: dataSig(r.back) });
    return;
  }
  // a <you>/mine Sol: its own changes go onto the release by themselves, or #425's carry takes them in a side copy
  say(`putting your own changes onto ${p.tag}…`);
  // a merge of the person's own would be flattened by the move (what was settled in it lost): the carry asks instead
  const merges = ((await tryGit(d.root, ["rev-list", "--merges", `${base}..HEAD`])) ?? "x") !== "";
  const reb = merges ? new Error("a merge of your own")
    : await run("git", [...QUIET, "rebase", "-q", "--onto", p.sha, base], { cwd: d.root, env: ENV(), timeout: 120_000 }).then(() => null, (e) => e);
  if (reb) {
    if (!merges) await tryGit(d.root, [...QUIET, "rebase", "--abort"]);
    const now = await tryGit(d.root, ["rev-parse", "HEAD"]);
    if (now !== head) { await tryGit(d.root, ["reset", "-q", "--keep", head]); }
    if (!d.carry) throw new Error(`your own changes do not go onto ${p.tag} by themselves; nothing changed`);
    const c = await d.carry({ onto: p.sha, tag: p.tag, base, back: { tag: p.tag, version: p.data.to, data: dataSig(r.back) } });
    say("");   // the carry says how it goes from here (team.carry); the pin comes when it lands
    d.tell({ type: "team.pin.carry", tag: p.tag, said: c.said, stage: c.stage });
    return;
  }
  await finish(d, { tag: p.tag, sha: p.sha, version: p.data.to, from: head, undo: () => git(d.root, ["reset", "-q", "--keep", head]).then(() => {}), was, data: dataSig(r.back) });
}

/** the folder is on the release: build it, put the data back, pin, and (with data put back) end the engine. On any
 *  failure the folder goes back (`undo`), the data as it was, the pin as it was, and it throws */
async function finish(d: Deps, a: { tag: string; sha: string; version: number; from: string; undo: () => Promise<void>; was: Pin | null; plain?: string; data?: string }) {
  const back = planBack(d.ctx, a.version, d.touched);
  const fail = async (why: string) => {
    await a.undo().catch(() => {});
    P = a.was; save();
    void d.build().catch(() => null);   // the engine's build as it was, again (the watcher does it too): a failed build may have half-written it
    throw new Error(why);
  };
  if (back.error) return fail(back.error);
  // what the warning said goes back is what goes back (a carry can land hours after it was said)
  if (a.data !== undefined && dataSig(back) !== a.data) return fail("your saved data changed since Sol said what going back loses; nothing moved, look again before you go");
  say(`building ${a.tag}…`);
  const built = await d.build().catch((e) => String(e?.message ?? e));
  if (built) return fail(`${a.tag} did not build here (${built.split("\n")[0].slice(0, 160)}); your Sol is as it was`);
  const putBack = back.to < back.from;
  // nothing may start from here to the end (the build took a while): only this move's own jobs may be live
  if (putBack && !letGo(Date.now(), ["pin", "carry"])) return fail("something started while Sol got ready; nothing moved, go back again when it ends");
  const pin: Pin = { tag: a.tag, sha: a.sha, at: d.now().toISOString(), back: true, ...(a.plain ? { was: a.plain } : a.was?.was ? { was: a.was.was } : {}) };
  if (putBack) {
    d.tell({ type: "team.pin", pin, here: { tag: a.tag, sha: a.sha }, releases: [], data: back.to, mine: false, going: `Sol starts again on ${a.tag}…` });
    const r = backTo(d.ctx, back);
    if (!r.ok) return fail(`the saved data could not be put back (${r.error}); your Sol is as it was`);
    P = pin; save();
    going = "";
    d.exit();   // at once: the code that wrote the newer data never runs on the older data; the keeper starts the release's build
    return;
  }
  P = pin; save();
  going = "";
  d.pinned?.(P);
  d.moved?.();
  d.tell({ type: "team.pin", ...(await view().catch(() => ({}))) });
}

/** what goes back (pure): the data levels and each step's copy, for "what was said is what happens" */
const dataSig = (b: BackPlan) => JSON.stringify([b.from, b.to, b.steps.map((s) => [s.id, s.at])]);

/** #425's carry moved the <you>/mine Sol onto the older release ("Use it", set aside): the data, the pin, the end (carry.ts
 *  Deps.wentBack). The folder is put back to where the carry began when it cannot finish */
export async function wentBack(c: Carry): Promise<void> {
  const d = D;
  if (!d || !c.back) throw new Error("going back is not set up here");
  await finish(d, { tag: c.back.tag, sha: c.onto, version: c.back.version, from: c.from, undo: () => git(d.root, ["reset", "-q", "--keep", c.from]).then(() => {}), was: P, ...(c.back.data !== undefined ? { data: c.back.data } : {}) });
}
