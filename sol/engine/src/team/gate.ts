// The gate (#481, dev cycle step 3; the PRD's §3.7 "done = green"): one command that says whether the current commit
// is green, for Sol developers and their agents. `bash sol/gate [--feature fr-NN] [--json]` runs, in order:
//   lint    the checks we already trust, as one step (no new package): no `.only` or a fixed `.skip` left in a test, no
//           node_modules committed, no typed number where the layout scale goes (layoutValues), and nothing private (a tailnet address, a key, a person's address, a private file)
//           in what the beta export gives Sol testers (ship.ts exportOffence, the export's own check), and no two
//           files under sol/mac/src or sol/engine/src a Mac's disk cannot tell apart (sameNameTwice, #641)
//   build   the engine's typecheck, the face's typecheck, the face's production build (into .sol-gate/face, never over
//           sol/mac/dist, which a running Sol.app may be serving)
//   e2e     the end-to-end paths (sol/test/e2e/run.mjs): that production build in a real chromium, on a stub engine
//   evals   every approved eval's checks (specs/features/*/eval.md with the press's line
//           "Status: Approved by <login> on <YYYY-MM-DD>", #480's approvedIn); a draft is listed, never run;
//           `· check: manual` is the first-timer's (#485), listed, never run here
// Each failure has an id (`lint:<rule>:<file>`, `build:<part>`, `e2e:<path>`, `eval:<fr-NN>:<id>`). An id listed in
// specs/baseline.md was already broken on the first run over main: it is said, and it does not block a change that
// did not cause it. The baseline is read from where the commit leaves main (baseOf), never from the tree being judged,
// a change that adds a line to it is red, and only narrow failures can be excused (excusable). Green = nothing failed
// that is not excused. Exit 0 = green, 1 = not, 2 = could not run.
// A full run's result goes to .sol-gate/<sha>.json at the repo root (gitignored); `gateGreen(root, sha)` reads it, for
// a Sol developer's own "done" and the morning run. The hand-in card (#476) reads CI's "the gate" check instead, beside
// GitHub's other checks: the gate runs no unit tests, and a local file is not something a press trusts.
// --feature fr-NN runs that feature's evals only (lint, build and e2e always run) and writes no result file. The JSON
// shape is CONTRACTS.md's, plus `dirty`, `feature`, `known`, `fixed`, `drafts`, `manual`, `base` and `at`.
// --body-file <path> hands in a PR's body (#837), and only then a fifth step runs, after the evals:
//   checks  the lines under the body's "**Checks**" (the PR template's three): a line with a command in backticks is
//           run with bash from the repo root; a line with none is a step in a person's own Sol, listed, never run;
//           fewer than three lines is red. Ids `check:<n>` (the line's place in the section) and `check:missing`,
//           never excused. The result then has `checks` too. With no body the run is the four steps it always was.
// Two settings, for CI (#1862). SOL_GATE_PART=k/n runs the k-th of n shares of the e2e paths (run.mjs --part), so n
// runners side by side run every path once between them: part 1 runs every step on its share, the other parts only
// the face's build and their share. A part's result is never written (it is not the commit's whole run). And
// SOL_GATE_COVERED=1 (ci.yml sets it on a pull request) skips an eval line whose check is only slices of the engine's
// or the face's unit tests (their `npm test`, which the engine and face jobs run on the same commit) or e2e paths
// (this gate's own e2e step), unless the baseline excuses one of those paths (the line would not have been). Such a
// line is listed under `covered`, never run. The typechecks still run: the face job typechecks after regenerating its
// tokens, not the committed files. A push to main, the morning run and `bash sol/gate` on a person's own machine set
// neither, so there every eval line runs, and one whose test or name pattern matches nothing is red (#1540); on a PR
// that is no longer caught.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Step = { name: string; ok: boolean; ms: number; failed: string[] };
export type EvalRun = { feature: string; id: string; ok: boolean };
export type GateResult = {
  sha: string; green: boolean; steps: Step[]; evals: EvalRun[];
  dirty: boolean; feature: string | null; at: string;
  known: string[];      // failed, but listed in specs/baseline.md as already broken
  fixed: string[];      // listed as already broken, and it passed this time: its line can go
  drafts: string[];     // features whose evals are still a draft: listed, not run
  manual: string[];     // eval lines whose check is manual (the first-timer's): listed, not run
  base: string | null;  // the commit whose specs/baseline.md was read (null: none found, nothing was excused)
  checks?: { ran: CheckRun[]; manual: number[] };   // only when a PR body was handed in (#837): its check lines, by number
  covered?: string[];   // SOL_GATE_COVERED (#1862): eval lines another job of the same CI run already ran, listed, not run
  part?: string;        // SOL_GATE_PART (#1862): the share of the e2e paths this run took, "k/n"
  partial?: true;       // a part, or SOL_GATE_COVERED: not the commit's whole run, so no result file was written
};

export const RESULT_DIR = ".sol-gate";
export const resultPath = (root: string, sha: string) => join(root, RESULT_DIR, `${sha}.json`);

const STEPS = ["lint", "build", "e2e", "evals"];
// a PR's check lines (#837): the names this file picked, in one place. Beside them: the result's key `checks` and
// runGate's option `body`.
export const CHECKS = {
  head: "**Checks**",    // the line of the PR template that opens the section
  step: "checks",        // the step's name in the result
  id: "check",           // a failing line is `check:<n>`
  missing: "missing",    // `check:missing`: fewer lines than `min`, or no section at all
  min: 3,                // the lines a PR owes
  flag: "--body-file",   // the program's flag for the file that holds the body
} as const;
/** true when this checkout's last full gate run of `sha` was green on a clean tree. For a Sol developer's own "done =
 * green" and the morning run (#485). It is a file anyone on this machine can write, so it is never what a press
 * trusts: the hand-in card (#476) reads CI's "the gate" check on the PR's head instead. */
export function gateGreen(root: string, sha: string): boolean {
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) return false;
  try {
    const r = JSON.parse(readFileSync(resultPath(root, sha), "utf8")) as Partial<GateResult>;
    // a run narrowed to one feature (--feature) is never the commit's result
    return r.sha === sha && r.green === true && r.dirty === false && r.feature === null
      && Array.isArray(r.steps) && STEPS.every((n) => r.steps!.some((x) => x?.name === n));
  } catch { return false; }
}

// ---- the feature map: a local copy of #480's reader (team/features.ts on marco/product-dev-cycle-2-480) ----
// Same names, file and signatures as #480's `readFeatures`, `folderOf` and `approvedIn`, and the same rule for what
// counts as a feature (an id fr-NN, a slug, a type of work, at least one path). Approved is anchored to the file's
// first Status line (the rule #480 is asked to take too). Once #480 is on main, this whole block is replaced by one line:
//   import { readFeatures, folderOf, approvedIn } from "./features.js";
const FEATURES_PATH = "specs/features.json";
type Feature = { id: string; slug: string };
function readFeatures(root: string): Feature[] {
  const ID = /^fr-\d{2}$/, SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/, TYPES = ["internal", "product", "marketing"];
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: Feature[] = [];
  try {
    const j = JSON.parse(readFileSync(join(root, FEATURES_PATH), "utf8"));
    for (const x of Array.isArray(j?.features) ? j.features : []) {
      const paths = Array.isArray(x?.paths) ? x.paths.map(s).filter((p: string) => !!p && !p.startsWith("/") && !p.split("/").includes("..")) : [];
      const f = { id: s(x?.id), slug: s(x?.slug) };
      if (ID.test(f.id) && SLUG.test(f.slug) && TYPES.includes(s(x?.type)) && paths.length && !out.some((y) => y.id === f.id)) out.push(f);
    }
  } catch { /* no map (a Sol tester's copy) or not readable: none */ }
  return out;
}
const folderOf = (f: Pick<Feature, "id" | "slug">) => `specs/features/${f.id}-${f.slug}`;
/** approved = the file's FIRST line that starts with "Status:" is the press's own line (#482),
 * "Status: Approved by <login> on YYYY-MM-DD", nothing else on it; the same line anywhere further down does not count */
const approvedIn = (evalMd: string) => /^Status:\s*Approved by [A-Za-z0-9-]{1,39} on \d{4}-\d{2}-\d{2}\s*$/.test(/^Status:.*$/m.exec(evalMd)?.[0] ?? "");

// ---- eval.md ----
export type EvalLine = { id: string; what: string; check: string | null; manual: boolean };
export type EvalDoc = { approved: boolean; status: string; lines: EvalLine[]; bad: string[] };
const SECTIONS = /^##\s+(Ways to use it|Ways it can fail|Must not break)\s*$/i;

/** an eval.md read (pure): its Status line, and each [ID] line of the three check sections with its check. `bad` is
 * what looks meant as a check but cannot be read: a heading that is almost a section's ("## Ways to use it (2)"), or a
 * "- [..]" line in a section whose id is not letters then digits ("[N-1]") */
export function parseEval(text: string): EvalDoc {
  const status = /^Status:\s*(.*)$/m.exec(text)?.[1].trim() ?? "";
  const lines: EvalLine[] = [], bad: string[] = [];
  let inChecks = false;
  for (const raw of text.split("\n")) {
    if (/^##\s/.test(raw)) {
      inChecks = SECTIONS.test(raw.trim());
      if (!inChecks && /^##\s+(Ways to use it|Ways it can fail|Must not break)\b/i.test(raw.trim())) bad.push(`heading "${raw.trim()}"`);
      continue;
    }
    if (!inChecks) continue;
    const m = /^\s*[-*]\s*\[([A-Za-z]+\d+)\]\s*(.*)$/.exec(raw);
    if (!m) { if (/^\s*[-*]\s*\[/.test(raw)) bad.push(`line "${raw.trim().slice(0, 60)}"`); continue; }
    const rest = m[2], at = rest.lastIndexOf("· check:");
    if (at < 0) { lines.push({ id: m[1], what: rest.trim(), check: null, manual: false }); continue; }
    const tail = rest.slice(at + "· check:".length).trim();
    const what = rest.slice(0, at).trim();
    const tick = /^`(.*)`\s*$/.exec(tail);
    if (tick && tick[1].trim()) lines.push({ id: m[1], what, check: tick[1].trim(), manual: false });
    else if (/^manual\b/i.test(tail)) lines.push({ id: m[1], what, check: null, manual: true });
    else lines.push({ id: m[1], what, check: null, manual: false });
  }
  return { approved: approvedIn(text), status, lines, bad };
}

/** the eval files to read: every specs/features/<fr-NN-...>/eval.md, or the one feature's */
export function evalFiles(root: string, feature?: string | null): { feature: string; path: string }[] {
  const dir = join(root, "specs/features");
  let names: string[] = [];
  try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; }
  const out = names.map((n) => ({ feature: /^(fr-\d+)/.exec(n)?.[1] ?? n, path: join(dir, n, "eval.md") })).filter((e) => existsSync(e.path));
  if (!feature) return out;
  const mapped = readFeatures(root).find((f) => f.id === feature);
  if (mapped) return out.filter((e) => resolve(e.path) === resolve(root, folderOf(mapped), "eval.md"));
  return out.filter((e) => e.feature === feature);
}

// ---- the baseline: specs/baseline.md, the list of what was already broken ----
/** the failure ids specs/baseline.md lists (pure on the text): each list line that starts with an id in backticks,
 * outside a fenced block (the file shows the line's shape in one) */
export function baselineIds(text: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const l of text.split("\n")) {
    if (/^\s*```/.test(l)) { fenced = !fenced; continue; }
    const m = fenced ? null : /^\s*[-*]\s*`([a-z0-9-]+:[^`]+)`/.exec(l);
    if (m) out.add(m[1]);
  }
  return out;
}
export const BASELINE = "specs/baseline.md";
/** what a baseline line may excuse (pure): only a narrow failure, never a whole kind. An end-to-end path failing at one
 * named point (`e2e:<path>:<what it waited for>`) or one eval line (`eval:fr-NN:<ID>`). A lint finding (a private file,
 * a focused test, a baseline line added), a build part, a path that did not run, or an eval file that cannot be read is
 * never excused: those are fixed, not listed. */
export const excusable = (id: string) => /^e2e:[a-z0-9-]+:[a-z0-9-]+$/.test(id) || /^eval:fr-\d+:[A-Za-z]+\d+$/.test(id);

/** the commit whose baseline counts: SOL_GATE_BASE when set (CI: the PR's base, HEAD^1 of its merge commit), else
 * where this commit leaves main (merge-base with origin/HEAD, else origin/main). Never the tree being judged. */
export function baseOf(root: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const rev = (r: string) => { try { return quiet(root, "rev-parse", "--verify", "--quiet", `${r}^{commit}`) || null; } catch { return null; } };
  if (env.SOL_GATE_BASE) return rev(env.SOL_GATE_BASE);
  for (const ref of ["origin/HEAD", "origin/main"]) {
    const t = rev(ref);
    if (t) { try { return quiet(root, "merge-base", "HEAD", t) || null; } catch { /* unrelated */ } }
  }
  return null;
}
/** specs/baseline.md as it is in commit `base` ("" when that commit has none) */
const baselineAt = (root: string, base: string) => { try { return quiet(root, "show", `${base}:${BASELINE}`); } catch { return ""; } };

/** the baseline lines a change adds (pure): ids in the tree's file that its base does not list. A change may remove a
 * line (it fixed it), never add one: a new red is that change's to fix. */
export const baselineAdded = (baseText: string, treeText: string) => { const b = baselineIds(baseText); return [...baselineIds(treeText)].filter((id) => !b.has(id)); };

/** green or not (pure): every failed id must be on the baseline and excusable; the steps' ok follows the same rule */
export function judge(steps: Step[], baseline: Set<string>): { green: boolean; known: string[]; fixed: string[]; steps: Step[] } {
  const failed = new Set(steps.flatMap((s) => s.failed));
  const ok = (id: string) => excusable(id) && baseline.has(id);
  const known = [...failed].filter(ok);
  const ran = new Set(steps.map((s) => s.name));
  // a baseline line is "fixed" only when its step ran this time and the id did not fail
  const fixed = [...baseline].filter((id) => excusable(id) && ran.has(stepOfId(id)) && !failed.has(id));
  const judged = steps.map((s) => ({ ...s, ok: s.failed.every(ok) }));
  return { green: judged.every((s) => s.ok), known, fixed, steps: judged };
}
/** SOL_GATE_PART read (pure): "k/n" with 1 <= k <= n is that share; unset or empty is the whole run (null); anything
 * else throws, so a mistyped part is "could not run", never a whole run by accident */
export function partOf(v: string | undefined): { k: number; n: number } | null {
  if (v === undefined || v === "") return null;
  const m = /^(\d+)\/(\d+)$/.exec(v), k = Number(m?.[1]), n = Number(m?.[2]);
  if (!m || n < 1 || k < 1 || k > n) throw new Error(`SOL_GATE_PART is k/n with 1 <= k <= n, not "${v}"`);
  return { k, n };
}
// what the engine's and the face's `npm test` run (sol/engine/package.json: test/*.test.ts src/next/*.test.ts;
// sol/mac/package.json: src/*.test.ts), and the gate's own e2e paths. A pattern in quotes, a file name with no folder.
const QUOTED = String.raw`(?:'[^']*'|"[^"$\`\\]*")`;   // in double quotes the shell would still expand $, ` and \
const ENGINE_SLICE = new RegExp(String.raw`^npx tsx --test(?: --test-name-pattern ${QUOTED})? (?:test|src/next)/[\w.-]+\.test\.ts$`);
const FACE_SLICE = new RegExp(String.raw`^node --test(?: --test-name-pattern ${QUOTED})? src/[\w.-]+\.test\.ts$`);
const E2E_SLICE = /^node sol\/test\/e2e\/run\.mjs --dist \.sol-gate\/face --only [a-z0-9-]+(?:,[a-z0-9-]+)*$/;
const CD: Record<string, string> = { " cd sol/engine": "engine", " cd sol/mac": "face", "engine cd ../mac": "face", "face cd ../engine": "engine" };
/** an eval check that only runs what CI's other jobs run on the same commit (pure, #1862): commands joined by `&&`,
 * each a slice of the engine's unit tests (in sol/engine), of the face's (in sol/mac) or e2e paths (from the root),
 * with `cd` and `( … )` only to move between them. Anything else (a pipe, a `;`, a curl, a script, another folder) is
 * not covered and runs as before. */
export function coveredCheck(check: string): boolean {
  const stack: string[] = [];
  let dir = "";
  for (const seg of check.split("&&")) {
    let s = seg.trim(), close = 0;
    while (s.startsWith("(")) { stack.push(dir); s = s.slice(1).trim(); }
    while (s.endsWith(")")) { close++; s = s.slice(0, -1).trim(); }
    if (/[;|<>`$\n]/.test(s.replace(new RegExp(QUOTED, "g"), ""))) return false;
    const to = CD[`${dir} ${s}`];
    if (to) dir = to;
    else if (!((dir === "" && E2E_SLICE.test(s)) || (dir === "engine" && ENGINE_SLICE.test(s)) || (dir === "face" && FACE_SLICE.test(s)))) return false;
    for (; close > 0; close--) { if (!stack.length) return false; dir = stack.pop()!; }
  }
  return !stack.length;
}
/** the e2e paths a check names with run.mjs --only (pure) */
export const e2eOnly = (check: string): string[] => [...check.matchAll(/run\.mjs\b[^&|;]*--only ([a-z0-9,-]+)/g)].flatMap((m) => m[1].split(",").filter(Boolean));
const stepOfId = (id: string) => ({ lint: "lint", build: "build", e2e: "e2e", eval: "evals", [CHECKS.id]: CHECKS.step } as Record<string, string>)[id.split(":")[0]] ?? "";

// ---- running things ----
type Ran = { ok: boolean; out: string; ms: number };
// `letGo`: the command runs in a process group of its own, and when the time is up the whole group is stopped and the
// end does not wait for the pipes (a shell's own child keeps them open), so nothing it started goes on writing into the
// repo after the gate has moved on
function sh(cmd: string, args: string[], cwd: string, timeoutMs = 600_000, env: NodeJS.ProcessEnv = process.env, letGo = false): Promise<Ran> {
  const t0 = Date.now();
  return new Promise((ok) => {
    let out = "";
    let p: ReturnType<typeof spawn>;
    try { p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: letGo }); } catch (e) { ok({ ok: false, out: String(e), ms: 0 }); return; }
    const keep = (b: Buffer) => { out += b.toString(); if (out.length > 200_000) out = out.slice(-100_000); };
    p.stdout?.on("data", keep); p.stderr?.on("data", keep);
    const timer = setTimeout(() => {
      out += `\n(stopped after ${Math.round(timeoutMs / 1000)} s)`;
      if (!letGo) { p.kill("SIGKILL"); return; }
      try { process.kill(-p.pid!, "SIGKILL"); } catch { p.kill("SIGKILL"); }   // the command's whole group, its children too
      p.stdout?.destroy(); p.stderr?.destroy();
    }, timeoutMs);
    p.on("error", (e) => { clearTimeout(timer); ok({ ok: false, out: out + String(e), ms: Date.now() - t0 }); });
    p.on("close", (code) => { clearTimeout(timer); ok({ ok: code === 0, out, ms: Date.now() - t0 }); });
  });
}
const tail = (s: string, n = 12) => s.trimEnd().split("\n").slice(-n).join("\n");
const git = (root: string, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
// the same, for a question whose "no" is an answer (no such commit, no such file there): git's own message is not shown
const quiet = (root: string, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();

// ---- lint ----
// test files: the engine's, the face's, the hub's and the cloud's, and the gate's own paths
const TEST_FILE = /(^|\/)[^/]+\.test\.(ts|tsx|mts|mjs|js)$|^sol\/test\//;
// a test left focused, switched off or left to do: `.only(` / `.skip(` / `.todo(` on test, it, describe, suite,
// context or a test's own `t` (`t.skip()` inside a test), or `only` / `skip` / `todo` as an option set to a literal that
// is true (true, !0, a number, a non-empty string), on one line or on its own line of a multi-line options object.
// A skip computed at run time (`{ skip: devOnly(...) }`, `skip: !hasGit`) is a real condition and stays allowed.
// Not caught (yet): a test deleted, or an expectation lowered.
const ONLY_SKIP = /\b(?:test|it|describe|suite|context|t)\.(?:only|skip|todo)\s*\(|(?:^|[{,\s])(?:only|skip|todo)\s*:\s*(?:true\b|!0\b|[1-9]\d*\b|"[^"]+"|'[^']+'|`[^`]+`)/;

// the layout skill (.claude/skills/layout): in the face's rebuilt css, a space, a type size, a control height or a corner
// is a variable from the scale (sol/design/system/tokens.json, palette → palette.css), never a typed number. 0 and a 1px hairline stay
// allowed, and so does anything relative (%, fr, vw, vh). Widen LAYOUT_FILES as each area is rebuilt.
// The new face (#1604, sol/mac/src/next) is held by both, at any depth, from its first file (#1615).
// The frame's kit parts' style sheet (#1879, kit/parts.css) is held too: a part is tokens only.
export const LAYOUT_FILES = /^sol\/mac\/src\/(?:home\/[^/]+|next\/.+|kit\/parts)\.css$/;
const LAYOUT_PROPS = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|border-radius|border-[a-z]+-radius|font-size|line-height|height|min-height|max-height|font)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/;
/** the typed numbers in a css file's layout declarations, each with its line (pure) */
export function layoutValues(css: string): { line: number; decl: string }[] {
  const out: { line: number; decl: string }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));   // comments keep their lines
  const re = /([a-z-]+)\s*:\s*([^;{}]+)/g;
  for (let m; (m = re.exec(text)); ) {
    if (!LAYOUT_PROPS.test(m[1])) continue;
    const bare = m[2].replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");   // a variable, even with a fallback, is the scale's
    const typed = (bare.match(/-?\d*\.?\d+(?:px|rem|em)\b/g) ?? []).filter((v) => !/^-?0*\.?0+(?:px|rem|em)$/.test(v) && v !== "1px")
      .concat(m[1] === "line-height" ? (bare.match(/(?<![\w.-])\d*\.?\d+(?![\w.%])/g) ?? []).filter((v) => +v !== 1 && +v !== 0) : []);
    if (typed.length) out.push({ line: text.slice(0, m.index).split("\n").length, decl: `${m[1]}: ${m[2].trim()}` });
  }
  return out;
}

// the design root's one material system (sol/design/root.md, #597): in the rebuilt face a colour, a shadow, a duration
// or an easing is a token from sol/design/system/tokens.json (palette: material, motion → palette.css, creature/palette.ts), never a
// typed value; the corner is the layout lint's. In css: a colour (#hex, rgb(), hsl(), lch(), a named colour), a shadow
// with any number but 0 and a 1px hairline, a duration (160ms, .2s), a curve (ease, linear, cubic-bezier(), steps()).
// A mask's colour is only its alpha, so masks are left alone. In code: the same inside a string, a timer's typed delay
// (setTimeout(f, 160)), and a typed duration, delay or corner in an object (`duration: 200`, `borderRadius: 4`).
// Widen LOOK_FILES as each area is rebuilt.
// The frame's kit parts (#1879: KIT_PARTS and the icon module) are held too.
export const LOOK_FILES = /^sol\/mac\/src\/(?:home\/[^/]+|next\/.+)\.(?:css|tsx?)$|^sol\/mac\/src\/kit\/(?:parts\.css|icons\.tsx|Signs\.tsx|Group\.tsx|StickerCard\.tsx|BoxIcon\.tsx|Key\.tsx|FolderCard\.tsx|Tab\.tsx)$/;
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(?<![\w-])(?:black|white|red|green|blue|gray|grey|yellow|orange|purple|pink|silver)(?![\w-])/;
const DURATION = /(?<![\w.#-])\d*\.?\d+m?s(?![\w-])/;
const EASING = /(?<![\w-])(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end)(?![\w-])|\b(?:cubic-bezier|steps|linear)\(/;
const CODE_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const CODE_EASING = /\b(?:cubic-bezier|steps)\(|(?<![\w-])ease(?:-in-out|-in|-out)?(?![\w-])/;
const SHADOW_PROPS =/^(?:box-shadow|text-shadow|filter|-webkit-filter)$/;
const MOTION_PROPS = /^(?:transition|animation)(?:-[a-z-]+)?$/;
const MASK_PROPS = /^-?(?:webkit-)?mask(?:-[a-z-]+)?$/;
/** the typed look values in one file of the rebuilt face, each with its line (pure); `code` for tsx and ts */
export function lookValues(text: string, code = false): { line: number; decl: string }[] {
  const out: { line: number; decl: string }[] = [];
  const blank = (c: string) => c.replace(/[^\n]/g, " ");
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;
  const noVars = (v: string) => v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
  if (!code) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/"[^"\n]*"|'[^'\n]*'/g, blank);   // comments, strings
    const re = /(^|[{;])(\s*)(-{0,2}[a-z][a-z-]*)\s*:\s*([^;{}]+)/g;
    for (let m; (m = re.exec(css)); ) {
      const prop = m[3], val = noVars(m[4]);
      if (MASK_PROPS.test(prop)) continue;
      const shadowNums = SHADOW_PROPS.test(prop) ? (val.match(/-?\d*\.?\d+(?:px|rem|em)?\b/g) ?? []).filter((v) => !/^-?0*\.?0+(?:px|rem|em)?$/.test(v) && v !== "1px") : [];
      if (COLOUR.test(val) || shadowNums.length || DURATION.test(val) || (MOTION_PROPS.test(prop) || prop.startsWith("--")) && EASING.test(val))
        out.push({ line: lineOf(m.index + m[1].length + m[2].length), decl: `${prop}: ${m[4].trim()}` });
    }
    return out;
  }
  // code: comments blanked (a `//` after a colon is a link, kept), then strings, timers and object keys
  const src = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (c, pre) => pre + blank(c.slice(pre.length)));
  for (let re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, m; (m = re.exec(src)); ) {
    const s = noVars(m[0].slice(1, -1));   // in code a word like "red" is a word, so only a colour that looks like one
    if (CODE_COLOUR.test(s) || DURATION.test(s) || CODE_EASING.test(s))
      out.push({ line: lineOf(m.index), decl: m[0].slice(0, 80) });
  }
  for (let re = /\bset(?:Timeout|Interval)\s*\(/g, m; (m = re.exec(src)); ) {
    let depth = 1, i = re.lastIndex, last = i;
    for (; i < src.length && depth; i++) {
      const c = src[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === "," && depth === 1) last = i + 1;
    }
    const delay = src.slice(last, i - 1).trim();
    if (last > re.lastIndex && /^\d[\d_]*(?:\.\d+)?$/.test(delay) && +delay.replace(/_/g, "") > 0) out.push({ line: lineOf(last), decl: `${m[0]}…, ${delay})` });
  }
  for (let re = /\b(duration|delay|borderRadius|transitionDuration|animationDuration)\s*:\s*(\d[\d_.]*)/g, m; (m = re.exec(src)); )
    if (+m[2].replace(/_/g, "") > 0) out.push({ line: lineOf(m.index), decl: `${m[1]}: ${m[2]}` });
  return out.sort((a, b) => a.line - b.line);
}

// the new face's files that held typed values when BR1 joined main (#1615, 2026-11-24): its move-in and "what Sol knows"
// pages were drawn to Marco's stills pixel for pixel before the scale and the material held them. They are held apart
// from the layout and look lint as GOO_LEGACY is from the goo rule, and the list only shrinks: a listed file with no
// typed value left, or gone, fails until it is taken off, so a file made right never slips back. Every other file under
// next/ is held as before. Its own issue clears it, file by file (status: docs/br1-backend-sort-2026-11-22/status/F.md).
export const TOKENS_LEGACY: readonly string[] = [
  "sol/mac/src/next/Next.tsx",
  "sol/mac/src/next/atwork/atwork.css",
  "sol/mac/src/next/auto/auto.css",
  "sol/mac/src/next/auto/fixture.ts",
  "sol/mac/src/next/because/because.css",
  "sol/mac/src/next/because/dev.tsx",
  "sol/mac/src/next/cv/wire/social.ts",
  "sol/mac/src/next/cv/wire/stable.ts",
  "sol/mac/src/next/dev.tsx",
  "sol/mac/src/next/diary/diary.css",
  "sol/mac/src/next/fitmode/Customize.tsx",
  "sol/mac/src/next/fitmode/fitmode.css",
  "sol/mac/src/next/fits/fits.css",
  "sol/mac/src/next/folder/setup/setup.css",
  "sol/mac/src/next/markup/dev.ts",
  "sol/mac/src/next/movein/Startup.tsx",
  "sol/mac/src/next/movein/migration.css",
  "sol/mac/src/next/movein/movein.css",
  "sol/mac/src/next/movein/startup.css",
  "sol/mac/src/next/movein/you/Circle.tsx",
  "sol/mac/src/next/movein/you/Lens.tsx",
  "sol/mac/src/next/movein/you/You.tsx",
  "sol/mac/src/next/movein/you/circle-state.ts",
  "sol/mac/src/next/movein/you/dev.tsx",
  "sol/mac/src/next/movein/you/fixture.ts",
  "sol/mac/src/next/movein/you/icons.ts",
  "sol/mac/src/next/movein/you/known.css",
  "sol/mac/src/next/movein/you/model.ts",
  "sol/mac/src/next/movein/you/store.ts",
  "sol/mac/src/next/movein/you/you.css",
  "sol/mac/src/next/next.css",
  "sol/mac/src/next/plane/folder.css",
  "sol/mac/src/next/plane/landed.css",
  "sol/mac/src/next/plane/plane.css",
  "sol/mac/src/next/settings/settings.css",
  "sol/mac/src/next/slots.ts",
  "sol/mac/src/next/tips/tips.css",
];
/** the lint's findings on a set of files (pure on its inputs): ids `lint:<rule>:<file>` with a line to show */
export function lintFiles(files: string[], read: (f: string) => Buffer | null, betaKept: (f: string) => boolean, offence: (f: string, b: Buffer) => string | null, tokensLegacy: readonly string[] = []): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [];
  const held = new Set(tokensLegacy), have = new Set(files);
  for (const f of tokensLegacy) if (!have.has(f)) out.push({ id: `lint:tokens-legacy-gone:${f}`, line: `${f}: gone; take it off TOKENS_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
  for (const f of files) {
    if (/(^|\/)node_modules\//.test(f)) { out.push({ id: `lint:node-modules:${f.split("/node_modules/")[0] || f}`, line: `${f}: node_modules is committed` }); continue; }
    const isTest = TEST_FILE.test(f), kept = betaKept(f), laid = LAYOUT_FILES.test(f), looked = LOOK_FILES.test(f) && !isTest;
    if (!isTest && !kept && !laid && !looked && !held.has(f)) continue;
    const b = read(f);
    if (!b) continue;
    if (held.has(f)) {
      const text = b.toString("utf8");
      const any = (laid && layoutValues(text).length > 0) || (LOOK_FILES.test(f) && lookValues(text, !f.endsWith(".css")).length > 0);
      if (!any) out.push({ id: `lint:tokens-legacy-gone:${f}`, line: `${f}: no typed value left; take it off TOKENS_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
    }
    if (laid && !held.has(f)) {
      const v = layoutValues(b.toString("utf8"));
      if (v.length) out.push({ id: `lint:layout-value:${f}`, line: `${f}:${v[0].line}: a typed number where the scale goes (${v[0].decl})${v.length > 1 ? `, and ${v.length - 1} more` : ""}; the layout skill, .claude/skills/layout` });
    }
    if (looked && !held.has(f)) {
      const v = lookValues(b.toString("utf8"), !f.endsWith(".css"));
      if (v.length) out.push({ id: `lint:look-value:${f}`, line: `${f}:${v[0].line}: a typed colour, shadow, duration or curve where a token goes (${v[0].decl})${v.length > 1 ? `, and ${v.length - 1} more` : ""}; values only from sol/design/system/tokens.json (palette: material, motion), the root's one material system, sol/design/root.md` });
    }
    if (isTest && !b.includes(0)) {
      const ls = b.toString("utf8").split("\n"), i = ls.findIndex((l) => ONLY_SKIP.test(l));
      if (i >= 0) out.push({ id: `lint:only-skip:${f}`, line: `${f}:${i + 1}: a test left focused or switched off: ${ls[i].trim().slice(0, 100)}` });
    }
    if (kept) { const why = offence(f, b); if (why) out.push({ id: `lint:private:${f}`, line: `${why} (in what Sol testers get)` }); }
  }
  // one node_modules id per folder, however many files
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

// same name twice (#641): on a Mac's disk, which does not tell case apart, `./Side` can open side.ts beside Side.tsx and
// the face goes dark; Linux never sees it. Refused: two code files under the face's or the engine's src that a bare
// import cannot tell apart (the same path, extension off, under lowercase), or any two paths equal under lowercase.
// A .css beside a .tsx of the same name (home.css, Home.tsx) is never tried for a bare import, so it is let through.
export const SAME_NAME_DIRS = /^sol\/(mac|engine)\/src\//;
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
/** the pairs that collide on a disk blind to case (pure): ids `lint:same-name:<path>` */
export function sameNameTwice(files: string[]): { id: string; line: string }[] {
  const seen = new Map<string, string>(), out: { id: string; line: string }[] = [];
  for (const f of files.filter((x) => SAME_NAME_DIRS.test(x))) {
    const keys = [f.toLowerCase()];
    if (CODE_EXT.test(f)) keys.push(f.replace(CODE_EXT, "").toLowerCase() + ".<code>");
    for (const k of keys) {
      const was = seen.get(k);
      if (was === undefined) { seen.set(k, f); continue; }
      if (was !== f && !out.some((x) => x.id === `lint:same-name:${f}`)) out.push({ id: `lint:same-name:${f}`, line: `${f}: the same name as ${was} on a Mac's disk, which does not tell case apart; rename one` });
    }
  }
  return out;
}

// the meta beside each part (sol/mac/src/home/meta.ts, #599): every component of the clean Home says what it is, once,
// beside its code, as `export const meta = { Name: {…} } satisfies Metas;`. A component without its entry is refused.
// Widen META_FILES as each area is rebuilt. The atlas (sol/design/atlas/build.mjs) is drawn from these metas.
export const META_FILES = /^sol\/mac\/src\/home\/[^/]+\.tsx$/;
/** the components of a file that have no meta entry (pure): top-level `function Name(` or `const Name = (…) =>` */
export function metaMissing(src: string): string[] {
  const names = [...src.matchAll(/^(?:export\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|\w+)\s*=>)/gm)].map((m) => m[1] ?? m[2]);
  const lit = /export\s+const\s+meta\s*=\s*\{([\s\S]*?)\}\s*satisfies\s+Metas\s*;/.exec(src)?.[1] ?? "";
  // the meta's own top-level keys: a name at the start of a line, two spaces in, followed by a colon and a brace
  const keys = new Set([...lit.matchAll(/^\s{2}([A-Z]\w*)\s*:\s*\{/gm)].map((m) => m[1]));
  return names.filter((n) => !keys.has(n));
}

// the old goo kit (#674, the legacy map's piece goo-kit, #659): the face is drawn from the kit (sol/mac/src/kit, the
// look: sol/design/system/look.md), never from creature/goo.tsx. Refused in any face file but the legacy ones: an import
// of creature/goo, or a use of its banded palettes (JOBS), its Bands or its budPath. GOO_LEGACY is the old kit and every
// file that used it when the kit landed (2026-11-06); it only shrinks: a listed file that no longer uses it, or is gone,
// fails until it is taken off the list, so a rebuilt file can never slip back.
export const GOO = "sol/mac/src/creature/goo";
export const GOO_LEGACY = [
  "sol/mac/src/creature/goo.tsx",
  "sol/mac/src/SeatScene.tsx", "sol/mac/src/gallery.tsx",
  "sol/mac/src/cowork/CoworkApp.tsx", "sol/mac/src/cowork/Person.tsx", "sol/mac/src/cowork/StableLine.tsx", "sol/mac/src/cowork/bits.tsx", "sol/mac/src/cowork/v3/NeedsMe.tsx",
  "sol/mac/src/creature/Voice.tsx", "sol/mac/src/creature/indicators.tsx",
  "sol/mac/src/work/LeashWheel.tsx",
];
const FACE_CODE = /^sol\/mac\/src\/.+\.(?:tsx?|jsx?|mjs)$/;
const GOO_WORDS = /\b(?:JOBS|Bands|budPath)\b/;
/** where a face file uses the old goo kit (pure): the first line, or null. Comments and strings are words, not uses. */
export function gooUse(f: string, text: string): { line: number; what: string } | null {
  const blank = (c: string) => c.replace(/[^\n]/g, " ");
  const src = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (c, pre) => pre + blank(c.slice(pre.length)));
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;
  const dir = f.split("/").slice(0, -1);
  for (let re = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g, m; (m = re.exec(src)); ) {
    if (!m[1].startsWith(".")) continue;
    const parts = [...dir];
    for (const p of m[1].split("/")) p === ".." ? parts.pop() : p !== "." && parts.push(p);
    if (parts.join("/").replace(/\.(?:tsx?|jsx?)$/, "") === GOO) return { line: lineOf(m.index), what: `imports ${m[1]}` };
  }
  const code = src.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, blank);
  const w = GOO_WORDS.exec(code);
  return w ? { line: lineOf(w.index), what: `uses ${w[0]}` } : null;
}
/** the lint's goo findings over the tree (pure on its inputs): ids `lint:goo:<file>` and `lint:goo-legacy-gone:<file>` */
export function gooFindings(files: string[], read: (f: string) => Buffer | null, legacy: readonly string[] = GOO_LEGACY): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [], kept = new Set(legacy), have = new Set(files);
  for (const f of files.filter((x) => FACE_CODE.test(x))) {
    const b = read(f), use = b ? gooUse(f, b.toString("utf8")) : null;
    if (kept.has(f)) {
      if (!use && f !== `${GOO}.tsx`) out.push({ id: `lint:goo-legacy-gone:${f}`, line: `${f}: no longer uses the old goo kit; take it off GOO_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
    } else if (use) out.push({ id: `lint:goo:${f}`, line: `${f}:${use.line}: ${use.what}, the old goo kit (creature/goo.tsx), legacy; draw from the kit, sol/mac/src/kit, by sol/design/system/look.md` });
  }
  for (const f of legacy) if (!have.has(f)) out.push({ id: `lint:goo-legacy-gone:${f}`, line: `${f}: gone; take it off GOO_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
  return out;
}

// the kit enforced (#1879 step 0, sol/skills/kit): the new face draws from the kit's parts, its tokens and its one icon
// module, so the look a person sees is the one decided (sol/design/decisions.md). Refused under sol/mac/src/next (code
// and css, tests aside) and in the frame's kit parts (KIT_PARTS):
//   an inline <svg> outside the icon module (sol/mac/src/kit/icons.tsx): an icon is drawn once, there, and named;
//   a typed font family or weight: font-family, font-weight and the font shorthand take var(--family), var(--weight-ui) …
//   (tokens.json next.font), or inherit; in code fontFamily and fontWeight the same, as a "var(--…)" string.
// The files that broke a rule when it landed (2026-11-25) are SVG_LEGACY and FONT_LEGACY. Like TOKENS_LEGACY they only
// shrink: a listed file that no longer breaks it, or is gone, fails until it is taken off, and a name added to any of the
// three lists that main's gate.ts does not hold is refused (legacyGrown), so a list grows only by a change to main itself.
export const ICON_MODULE = "sol/mac/src/kit/icons.tsx";
export const KIT_PARTS = /^sol\/mac\/src\/kit\/(?:parts\.css|Signs\.tsx|Group\.tsx|StickerCard\.tsx|BoxIcon\.tsx|Key\.tsx|FolderCard\.tsx|Tab\.tsx)$/;
const KIT_HELD = /^sol\/mac\/src\/next\/.+\.(?:css|tsx?|jsx?)$/;
const kitHeld = (f: string) => (KIT_HELD.test(f) || KIT_PARTS.test(f)) && !TEST_FILE.test(f);
/** comments blanked, lines kept (pure): css's block comments, and in code the line comments too */
function uncomment(text: string, code: boolean): string {
  const blank = (c: string) => c.replace(/[^\n]/g, " ");
  const t = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  return code ? t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (c, pre) => pre + blank(c.slice(pre.length))) : t;
}
/** the first inline <svg in a file, its line, or 0 (pure) */
export function svgLine(text: string, code = true): number {
  const t = uncomment(text, code), i = t.search(/<svg\b/i);
  return i < 0 ? 0 : t.slice(0, i).split("\n").length;
}
const FONT_KEYWORD = /^(?:inherit|initial|unset|revert)$/;
const WEIGHT_WORD = /^(?:[1-9]00|bold|bolder|lighter|normal)$/;
const SIZE_WORD = /^(?:-?[\d.]+(?:px|em|rem|%)?)?(?:\/[\d.]+(?:px|em|rem|%)?)?$/;   // a size, a /line-height, or both
const noVar = (v: string) => v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ").trim();
/** the typed font families and weights in one file, each with its line (pure); `code` for tsx and ts */
export function fontValues(text: string, code = false): { line: number; decl: string }[] {
  const out: { line: number; decl: string }[] = [], t = uncomment(text, code);
  const lineOf = (i: number) => t.slice(0, i).split("\n").length;
  if (!code) {
    for (let re = /(^|[{;\s])(font-family|font-weight|font)\s*:\s*([^;{}]+)/g, m; (m = re.exec(t)); ) {
      const bare = noVar(m[3].replace(/!important/, "")), words = bare.split(/[\s,]+/).filter(Boolean);
      if (!bare || FONT_KEYWORD.test(bare)) continue;
      const typed = m[2] !== "font" ? true : words.some((w) => WEIGHT_WORD.test(w)) || !SIZE_WORD.test(words[words.length - 1]) && !/^(?:italic|normal|small-caps)$/.test(words[words.length - 1]);
      if (typed) out.push({ line: lineOf(m.index + m[1].length), decl: `${m[2]}: ${m[3].trim()}`.slice(0, 80) });
    }
    return out;
  }
  for (let re = /\b(fontFamily|fontWeight|font-family|font-weight)\s*[:=]\s*\{?\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\d+)/g, m; (m = re.exec(t)); ) {
    const v = /^\d/.test(m[2]) ? m[2] : m[2].slice(1, -1), bare = noVar(v);
    if (bare && !FONT_KEYWORD.test(bare)) out.push({ line: lineOf(m.index), decl: `${m[1]}: ${m[2]}`.slice(0, 80) });
  }
  // css written inside a string (a style sheet in code): its declarations too
  for (let re = /(font-family|font-weight)\s*:\s*([^;"'`}\n]+)/g, m; (m = re.exec(t)); ) {
    if (out.some((o) => o.line === lineOf(m!.index))) continue;
    const bare = noVar(m[2]);
    if (bare && !FONT_KEYWORD.test(bare) && !/^\$\{/.test(bare)) out.push({ line: lineOf(m.index), decl: `${m[1]}: ${m[2].trim()}`.slice(0, 80) });
  }
  return out.sort((a, b) => a.line - b.line);
}
// the files under next/ that held an inline <svg or a typed font when the kit was enforced (2026-11-25, #1879)
export const SVG_LEGACY: readonly string[] = [
  "sol/mac/src/next/add/Add.tsx",
  "sol/mac/src/next/auto/index.tsx",
  "sol/mac/src/next/bar/Bar.tsx",
  "sol/mac/src/next/because/Because.tsx",
  "sol/mac/src/next/cowork/Cowork.tsx",
  "sol/mac/src/next/diary/index.tsx",
  "sol/mac/src/next/fits/views.tsx",
  "sol/mac/src/next/markup/Attach.tsx",
  "sol/mac/src/next/markup/MarkBar.tsx",
  "sol/mac/src/next/movein/Lead.tsx",
  "sol/mac/src/next/movein/Startup.tsx",
  "sol/mac/src/next/movein/index.tsx",
  "sol/mac/src/next/movein/parts.tsx",
  "sol/mac/src/next/movein/you/Circle.tsx",
  "sol/mac/src/next/movein/you/You.tsx",
  "sol/mac/src/next/near/index.tsx",
  "sol/mac/src/next/needs/Row.tsx",
  "sol/mac/src/next/pieces/Page.tsx",
  "sol/mac/src/next/pieces/Seen.tsx",
  "sol/mac/src/next/plane/index.tsx",
  "sol/mac/src/next/session/Port.tsx",
  "sol/mac/src/next/social/Social.tsx",
  "sol/mac/src/next/tabs/Tabs.tsx",
];
export const FONT_LEGACY: readonly string[] = [
  "sol/mac/src/next/agent/agent.css",
  "sol/mac/src/next/ais/ais.css",
  "sol/mac/src/next/atwork/atwork.css",
  "sol/mac/src/next/auto/auto.css",
  "sol/mac/src/next/bar/bar.css",
  "sol/mac/src/next/because/because.css",
  "sol/mac/src/next/collection.css",
  "sol/mac/src/next/cowork/cowork.css",
  "sol/mac/src/next/diary/diary.css",
  "sol/mac/src/next/fitmode/fitmode.css",
  "sol/mac/src/next/fits/fits.css",
  "sol/mac/src/next/folder/parts/parts.css",
  "sol/mac/src/next/folder/setup/setup.css",
  "sol/mac/src/next/kept/kept.css",
  "sol/mac/src/next/lead/lead.css",
  "sol/mac/src/next/learn/learn.css",
  "sol/mac/src/next/life/life.css",
  "sol/mac/src/next/markup/markup.css",
  "sol/mac/src/next/movein/migration.css",
  "sol/mac/src/next/movein/movein.css",
  "sol/mac/src/next/movein/startup.css",
  "sol/mac/src/next/movein/you/known.css",
  "sol/mac/src/next/movein/you/you.css",
  "sol/mac/src/next/near/near.css",
  "sol/mac/src/next/needs/needs.css",
  "sol/mac/src/next/next.css",
  "sol/mac/src/next/notes/notes.css",
  "sol/mac/src/next/people/people.css",
  "sol/mac/src/next/pieces/pieces.css",
  "sol/mac/src/next/plane/folder.css",
  "sol/mac/src/next/plane/group.css",
  "sol/mac/src/next/plane/pieces.css",
  "sol/mac/src/next/plane/plane.css",
  "sol/mac/src/next/plane/raise.css",
  "sol/mac/src/next/session/port.css",
  "sol/mac/src/next/session/session.css",
  "sol/mac/src/next/settings/seats/seats.css",
  "sol/mac/src/next/settings/settings.css",
  "sol/mac/src/next/social/social.css",
  "sol/mac/src/next/tabs/tabs.css",
  "sol/mac/src/next/tips/tips.css",
  "sol/mac/src/next/work/work.css",
  "sol/mac/src/next/workspace/workspace.css",
];
/** the kit's findings over the tree (pure on its inputs): ids `lint:inline-svg:<file>`, `lint:font-value:<file>`, and
 *  `lint:svg-legacy-gone:<file>` / `lint:font-legacy-gone:<file>` for a listed file now clean or gone */
export function kitFindings(files: string[], read: (f: string) => Buffer | null, svgLegacy: readonly string[] = SVG_LEGACY, fontLegacy: readonly string[] = FONT_LEGACY): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [], svgKept = new Set(svgLegacy), fontKept = new Set(fontLegacy), have = new Set(files);
  for (const f of files) {
    if (!kitHeld(f) && !svgKept.has(f) && !fontKept.has(f)) continue;
    const b = read(f);
    if (!b) continue;
    const text = b.toString("utf8"), code = !f.endsWith(".css");
    const svg = f === ICON_MODULE ? 0 : svgLine(text, code), font = fontValues(text, code);
    if (svgKept.has(f)) { if (!svg) out.push({ id: `lint:svg-legacy-gone:${f}`, line: `${f}: no inline <svg> left; take it off SVG_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` }); }
    else if (svg) out.push({ id: `lint:inline-svg:${f}`, line: `${f}:${svg}: an inline <svg>; draw icons from the icon module, ${ICON_MODULE} (<Icon name="…" />), and add a new one there (sol/skills/kit)` });
    if (fontKept.has(f)) { if (!font.length) out.push({ id: `lint:font-legacy-gone:${f}`, line: `${f}: no typed font left; take it off FONT_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` }); }
    else if (font.length) out.push({ id: `lint:font-value:${f}`, line: `${f}:${font[0].line}: a typed font family or weight (${font[0].decl})${font.length > 1 ? `, and ${font.length - 1} more` : ""}; take var(--family), var(--weight-read), var(--weight-ui) or var(--weight-display) from tokens.json next.font (sol/skills/kit)` });
  }
  for (const f of svgLegacy) if (!have.has(f)) out.push({ id: `lint:svg-legacy-gone:${f}`, line: `${f}: gone; take it off SVG_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
  for (const f of fontLegacy) if (!have.has(f)) out.push({ id: `lint:font-legacy-gone:${f}`, line: `${f}: gone; take it off FONT_LEGACY (sol/engine/src/team/gate.ts), the list only shrinks` });
  return out;
}
/** the names of one exemption list as written in a gate.ts source (pure): `export const NAME…= [ "…", … ];` */
export function listIn(src: string, name: string): string[] | null {
  const m = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
}
export const SHRINK_ONLY = { TOKENS_LEGACY, SVG_LEGACY, FONT_LEGACY } as const;
/** the names this tree's shrink-only lists hold that main's gate.ts does not (pure): ids `lint:legacy-grown:<list>:<file>` */
export function legacyGrown(baseSrc: string, lists: Record<string, readonly string[]> = SHRINK_ONLY): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [];
  for (const [name, now] of Object.entries(lists)) {
    const was = listIn(baseSrc, name);
    if (!was) continue;   // main has no such list yet: the change that brings it sets it
    for (const f of now.filter((x) => !was.includes(x))) out.push({ id: `lint:legacy-grown:${name}:${f}`, line: `${name} gains ${f}, which main's does not hold; the list only shrinks: make the file keep the rule instead` });
  }
  return out;
}

async function lintStep(root: string, base: string | null, say: (s: string) => void): Promise<Step> {
  const t0 = Date.now();
  const files = git(root, "ls-files", "-z").split("\0").filter(Boolean);
  const { BETA_KEEP, exportOffence } = await import("./ship.js");
  const kept = (p: string) => BETA_KEEP.some((k) => p === k || p.startsWith(k + "/"));
  const read = (f: string) => { try { return readFileSync(join(root, f)); } catch { return null; } };
  const found = [...lintFiles(files, read, kept, exportOffence, TOKENS_LEGACY), ...sameNameTwice(files), ...gooFindings(files, read), ...kitFindings(files, read)];
  for (const f of files.filter((x) => META_FILES.test(x) && !TEST_FILE.test(x))) {
    const miss = metaMissing(read(f)?.toString("utf8") ?? "");
    if (miss.length) found.push({ id: `lint:no-meta:${f}`, line: `${f}: ${miss.join(", ")} ${miss.length > 1 ? "have" : "has"} no meta: say its job, flow, states, keys and what it listens to beside it (sol/mac/src/home/meta.ts)` });
  }
  // the atlas is drawn from the metas: the gate regenerates it, and a stale one is rewritten for the change to commit
  if (existsSync(join(root, "sol/design/atlas/build.mjs"))) {
    const r = await sh(process.execPath, [join(root, "sol/design/atlas/build.mjs"), "--check"], root, 60_000);
    if (!r.ok) found.push({ id: "lint:atlas-stale", line: `sol/design/atlas/graph.html: ${tail(r.out, 3).replace(/\n/g, "; ")}` });
  }
  if (base) {
    // the shrink-only lists against main's (#1879): a list grows only by a change to main itself
    try { found.push(...legacyGrown(quiet(root, "show", `${base}:sol/engine/src/team/gate.ts`))); } catch { /* main has no gate.ts: nothing to hold to */ }
    let tree = "";
    try { tree = readFileSync(join(root, BASELINE), "utf8"); } catch { /* none */ }
    for (const id of baselineAdded(baselineAt(root, base), tree))
      found.push({ id: `lint:baseline-added:${id}`, line: `${BASELINE}: this change adds "${id}"; a new red is the change's to fix, never listed` });
  }
  for (const x of found) say(`  lint: ${x.line}`);
  return { name: "lint", ok: !found.length, ms: Date.now() - t0, failed: found.map((x) => x.id) };
}

// ---- build ----
async function buildStep(root: string, say: (s: string) => void, typecheck = true): Promise<Step> {
  const t0 = Date.now(), failed: string[] = [];
  const eng = join(root, "sol/engine"), face = join(root, "sol/mac");
  const parts: [string, string, string[], string][] = [
    ...(typecheck ? [
      ["engine-typecheck", join(eng, "node_modules/.bin/tsc"), ["--noEmit", "-p", "."], eng],
      ["face-typecheck", join(face, "node_modules/.bin/tsc"), ["-p", "."], face],
    ] as [string, string, string[], string][] : []),
    // the production build, beside the result files: sol/mac/dist may be what a running Sol.app serves
    ["face-build", join(face, "node_modules/.bin/vite"), ["build", "--outDir", join(root, RESULT_DIR, "face"), "--emptyOutDir", "--logLevel", "warn"], face],
  ];
  if (!typecheck) say("  build: the typechecks are part 1's, not run here");
  // an old build never stands in for this one: a failed build leaves nothing for the paths to open
  rmSync(join(root, RESULT_DIR, "face"), { recursive: true, force: true });
  for (const [name, cmd, args, cwd] of parts) {
    if (!existsSync(cmd)) { failed.push(`build:${name}`); say(`  build: ${name}: ${cmd} is missing (npm ci in ${cwd.slice(root.length + 1)})`); continue; }
    const r = await sh(cmd, args, cwd);
    say(`  build: ${name} ${r.ok ? "ok" : "FAILED"} (${Math.round(r.ms / 1000)} s)`);
    if (!r.ok) { failed.push(`build:${name}`); say(tail(r.out).replace(/^/gm, "    ")); }
  }
  return { name: "build", ok: !failed.length, ms: Date.now() - t0, failed };
}

// ---- e2e ----
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "failed";
// The e2e step's time cap grows with the suite (#1583): 15 s a path, never under 15 minutes. A path takes 5 to 10 s
// (107 paths ran in 1064 s on the slowest runner, nucbox, and in 530 to 657 s on the Legions), so 15 s leaves half
// again for a loaded machine. A count that cannot be read falls back to 25 minutes, the flat cap this replaced.
export const E2E_MS_PER_PATH = 15_000, E2E_FLOOR_MS = 900_000, E2E_FALLBACK_MS = 1_500_000;
export const e2eCapMs = (paths: number | null) => paths && paths > 0 ? Math.max(E2E_FLOOR_MS, paths * E2E_MS_PER_PATH) : E2E_FALLBACK_MS;
async function e2eStep(root: string, say: (s: string) => void, part: { k: number; n: number } | null = null): Promise<{ step: Step; ran: string[] }> {
  const t0 = Date.now();
  const dist = join(root, RESULT_DIR, "face");
  if (!existsSync(join(dist, "index.html"))) { say("  e2e: no production build of the face to open (the build step failed)"); return { step: { name: "e2e", ok: false, ms: 0, failed: ["e2e:face-build-missing"] }, ran: [] }; }
  const run = join(root, "sol/test/e2e/run.mjs"), share = part ? ["--part", `${part.k}/${part.n}`] : [];
  let count: number | null = null;
  try { count = JSON.parse((await sh(process.execPath, [run, "--count", ...share], root, 60_000)).out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "").count ?? null; } catch { /* the fallback cap */ }
  if (part) say(`  e2e: part ${part.k} of ${part.n}, ${count ?? "an uncounted number of"} paths`);
  const cap = e2eCapMs(count);
  const r = await sh(process.execPath, [run, "--dist", dist, "--json", ...share], root, cap);
  let paths: { name: string; ok: boolean; ms: number; error?: string }[] = [];
  try { paths = JSON.parse(r.out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "").paths; } catch { /* below */ }
  if (!Array.isArray(paths) || !paths.length) {
    const why = r.ms >= cap ? `stopped at the cap, ${Math.round(cap / 1000)} s for ${count ?? "an uncounted number of"} paths` : "the paths did not run";
    say(`  e2e: ${why}:\n` + tail(r.out).replace(/^/gm, "    "));
    return { step: { name: "e2e", ok: false, ms: Date.now() - t0, failed: ["e2e:did-not-run"] }, ran: [] };
  }
  for (const p of paths) say(`  e2e: ${p.name} ${p.ok ? "ok" : `FAILED: ${p.error ?? ""}`} (${(p.ms / 1000).toFixed(1)} s)`);
  // a path's failure is keyed by where it failed, so a listed one never hides a new failure of the same path
  const failed = paths.filter((p) => !p.ok).map((p) => `e2e:${p.name}:${slug(p.error ?? "failed")}`);
  if (!r.ok && !failed.length) { failed.push("e2e:exit-code"); say("  e2e: the paths passed but run.mjs did not exit 0:\n" + tail(r.out).replace(/^/gm, "    ")); }
  return { step: { name: "e2e", ok: !failed.length, ms: Date.now() - t0, failed }, ran: paths.map((p) => p.name) };
}

// ---- evals ----
/** node's test runner ran no test (#1540): a name pattern that matches nothing, or a test renamed since, still exits 0.
 * Its summary then says "tests 0" (spec "ℹ", tap "#"), or, on the Node we run, counts each test file as the one test it
 * ran ("✔ test/x.test.ts (40ms)", "ℹ tests 1"). Either way, for any one run in the check's output, the check is red. */
export function ranNoTest(out: string): boolean {
  let from = 0;
  for (let re = /^\s*(?:ℹ|#)\s*tests (\d+)\s*$/gm, m; (m = re.exec(out)); from = re.lastIndex) {
    const files = out.slice(from, m.index).match(/^✔ \S+\.[cm]?[jt]sx? \(/gm)?.length ?? 0;
    if (Number(m[1]) <= files) return true;
  }
  return false;
}
const CHECK_MS = Number(process.env.SOL_GATE_CHECK_TIMEOUT ?? 300) * 1000;
export async function evalStep(root: string, feature: string | null, say: (s: string) => void, skipCovered = false, excusedPaths: ReadonlySet<string> = new Set()): Promise<{ step: Step; evals: EvalRun[]; drafts: string[]; manual: string[]; covered: string[] }> {
  const t0 = Date.now(), evals: EvalRun[] = [], drafts: string[] = [], manual: string[] = [], covered: string[] = [], failed: string[] = [];
  const files = evalFiles(root, feature);
  if (feature && !files.length) { failed.push(`eval:${feature}:no-eval`); say(`  evals: ${feature} has no eval.md under specs/features/`); }
  for (const f of files) {
    const doc = parseEval(readFileSync(f.path, "utf8"));
    if (!doc.approved) { drafts.push(f.feature); continue; }
    // approved, and so it must say something the gate can run or list: nothing readable is red, never "none approved"
    for (const b of doc.bad) say(`  evals: ${f.feature} has a ${b} that cannot be read as a check`);
    if (doc.bad.length) failed.push(`eval:${f.feature}:unreadable`);
    if (!doc.lines.some((l) => l.check || l.manual)) { failed.push(`eval:${f.feature}:no-checks`); say(`  evals: ${f.feature} is approved but has no check to run or list`); }
    const seen = new Set<string>();
    for (const l of doc.lines) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      const id = `eval:${f.feature}:${l.id}`;
      if (l.manual) { manual.push(`${f.feature}:${l.id}`); continue; }
      if (!l.check) { evals.push({ feature: f.feature, id: l.id, ok: false }); failed.push(id); say(`  evals: ${f.feature} ${l.id} has no check an agent can run`); continue; }
      if (skipCovered && coveredCheck(l.check) && !e2eOnly(l.check).some((p) => excusedPaths.has(p))) { covered.push(`${f.feature}:${l.id}`); continue; }
      const r = await sh("bash", ["-c", l.check], root, CHECK_MS);
      const empty = r.ok && ranNoTest(r.out), ok = r.ok && !empty;
      evals.push({ feature: f.feature, id: l.id, ok });
      say(`  evals: ${f.feature} ${l.id} ${ok ? "pass" : "FAIL"}: ${l.what.slice(0, 80)}`);
      if (empty) { failed.push(id); say("    the check ran no test"); }
      else if (!ok) { failed.push(id); say(tail(r.out, 6).replace(/^/gm, "    ")); }
    }
  }
  if (covered.length) say(`  evals: ${covered.length} line${covered.length > 1 ? "s" : ""} only run unit tests or e2e paths this CI run's other jobs ran (SOL_GATE_COVERED), not run again: ${covered.join(", ")}`);
  return { step: { name: "evals", ok: !failed.length, ms: Date.now() - t0, failed }, evals, drafts, manual, covered };
}

// ---- a PR's check lines (#837) ----
// The PR template's "Checks" are three lines a reviewer can run to see the change work, one each: a command in
// backticks, or a step in their own Sol, with what they should see. The gate runs the commands when the body is handed
// in. They are the PR author's own words and no press approved them, so they run as whoever runs the gate, with all
// that user can read: the gate under a user with no secrets is #818, and a PR's body is handed in by CI only after it.
export type CheckLine = { n: number; text: string; cmd: string | null };   // cmd null: a step in a person's own Sol
export type CheckRun = { n: number; ok: boolean };

/** the first text in backticks (pure), as a markdown reader shows it: ``a `b` `` is "a `b`"; null when there is none */
const firstCode = (text: string): string | null => {
  for (let re = /(?<!`)(`+)(?!`)(.*?[^`])\1(?!`)/g, m; (m = re.exec(text)); ) if (m[2].trim()) return m[2].trim();
  return null;
};

/** the Checks section of a PR body (pure): the list lines under the first line that starts with "**Checks**", up to
 * the next heading (a line that starts with "**" or "#") or the first blank line after its lines. `n` is a line's
 * place among them, an empty "- " counted and not kept, so the number is the one its author sees. A line indented
 * under another, or with no list mark, is words. Nothing in a fenced block is read (a body may show the template). */
export function parseChecks(body: string): { found: boolean; lines: CheckLine[] } {
  const lines: CheckLine[] = [];
  let found = false, fence = "", n = 0, indent = -1;
  for (const raw of body.split(/\r?\n/)) {   // a body written in GitHub's own box has \r\n
    // a fence is ``` or ~~~, and only one of the same kind, at least as long, ends it
    const f = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
    if (f && !fence) { fence = f; continue; }
    if (f && f[0] === fence[0] && f.length >= fence.length) { fence = ""; continue; }
    if (fence) continue;
    if (!found) { found = raw.startsWith(CHECKS.head); continue; }
    if (raw.startsWith("**") || /^#{1,6}\s/.test(raw)) break;
    if (!raw.trim()) { if (n) break; continue; }
    const m = /^(\s*)[-*](?:\s+(.*))?$/.exec(raw);
    if (!m) continue;
    if (indent < 0) indent = m[1].length;
    if (m[1].length > indent) continue;
    n++;
    const text = (m[2] ?? "").trim();
    if (text) lines.push({ n, text, cmd: firstCode(text) });
  }
  return { found, lines };
}

/** the checks step: each command line of the body's Checks run with bash from the repo root, one after the other, a
 * failing one named and the rest still run; a step in a person's own Sol listed, its words never run */
export async function checksStep(root: string, body: string, say: (s: string) => void): Promise<{ step: Step; ran: CheckRun[]; manual: number[] }> {
  const t0 = Date.now(), ran: CheckRun[] = [], manual: number[] = [], failed: string[] = [];
  const doc = parseChecks(body);
  // three lines are owed: a body with fewer, or with no section, is red, never "nothing to run"
  if (doc.lines.length < CHECKS.min) {
    failed.push(`${CHECKS.id}:${CHECKS.missing}`);
    say(doc.found ? `  checks: the PR body has ${doc.lines.length} of the ${CHECKS.min} check lines (under ${CHECKS.head}, each a line that starts with "- ": a command in backticks, or a step in a person's own Sol)`
      : `  checks: the PR body has no ${CHECKS.head} section`);
  }
  for (const l of doc.lines) {
    if (!l.cmd) { manual.push(l.n); say(`  checks: ${l.n} is a step in a person's own Sol, not run: ${l.text.slice(0, 80)}`); continue; }
    const r = await sh("bash", ["-c", l.cmd], root, CHECK_MS, process.env, true);
    ran.push({ n: l.n, ok: r.ok });
    say(`  checks: ${l.n} ${r.ok ? "pass" : "FAIL"}: \`${l.cmd.slice(0, 80)}\``);
    if (!r.ok) { failed.push(`${CHECKS.id}:${l.n}`); say(tail(r.out, 6).replace(/^/gm, "    ")); }
  }
  return { step: { name: CHECKS.step, ok: !failed.length, ms: Date.now() - t0, failed }, ran, manual };
}

// ---- the run ----
export async function runGate(root: string, opts: { feature?: string | null; body?: string | null; say?: (s: string) => void; env?: NodeJS.ProcessEnv } = {}): Promise<GateResult> {
  const say = opts.say ?? (() => {});
  const env = opts.env ?? process.env, part = partOf(env.SOL_GATE_PART), skip = env.SOL_GATE_COVERED === "1";
  // part 1 runs every step on its share of the paths; another part only builds the face and runs its share
  const whole = !part || part.k === 1;
  const sha = git(root, "rev-parse", "HEAD");
  // uncommitted changes, or new files not yet added (ignored ones aside): the run is not the commit's
  const status0 = git(root, "status", "--porcelain");
  const base = baseOf(root);
  say(base ? `baseline: ${BASELINE} as of ${base.slice(0, 8)} (where this commit leaves main)` : `baseline: no main to read ${BASELINE} from, so nothing is excused`);
  const steps: Step[] = [];
  if (whole) { say("lint…"); steps.push(await lintStep(root, base, say)); }
  say("build…"); steps.push(await buildStep(root, say, whole));
  say("e2e…");
  const e2e = await e2eStep(root, say, part);
  steps.push(e2e.step);
  const listed = base ? baselineIds(baselineAt(root, base)) : new Set<string>();
  // a path the baseline excuses still has its eval lines run: their failure was never excused
  const excusedPaths = new Set([...listed].filter((id) => excusable(id) && id.startsWith("e2e:")).map((id) => id.split(":")[1]));
  const ev = whole ? (say("evals…"), await evalStep(root, opts.feature ?? null, say, skip, excusedPaths)) : null;
  if (ev) steps.push(ev.step);
  // a PR's check lines, only when its body was handed in (#837): with none, the run is the four steps it always was
  let ck: Awaited<ReturnType<typeof checksStep>> | null = null;
  if (whole && typeof opts.body === "string") { say("checks…"); ck = await checksStep(root, opts.body, say); steps.push(ck.step); }
  for (const id of listed) if (!excusable(id)) say(`  baseline: "${id}" is listed but never excused (only an e2e path's failure point or an eval line can be)`);
  const j = judge(steps, listed);
  // a part ran only its share of the paths: a listed path another part runs is not "fixed" here
  if (part) { const ran = new Set(e2e.ran); j.fixed = j.fixed.filter((id) => stepOfId(id) !== "e2e" || ran.has(id.split(":")[1])); }
  // the commit or the tree moved while it ran: the result is not that commit's
  let moved = true;
  try { moved = git(root, "rev-parse", "HEAD") !== sha || git(root, "status", "--porcelain") !== status0; } catch { /* moved */ }
  if (moved) say("  the commit or the files changed during the run: this result does not count for the commit");
  const r: GateResult = { sha, green: j.green, steps: j.steps, evals: ev?.evals ?? [], dirty: status0 !== "" || moved, feature: opts.feature ?? null, at: new Date().toISOString(),
    known: j.known, fixed: j.fixed, drafts: ev?.drafts ?? [], manual: ev?.manual ?? [], base, ...(ck ? { checks: { ran: ck.ran, manual: ck.manual } } : {}),
    ...(ev?.covered.length ? { covered: ev.covered } : {}), ...(part ? { part: `${part.k}/${part.n}` } : {}), ...(part || skip ? { partial: true as const } : {}) };
  // only a full run is the commit's result; a run narrowed to one feature, a part or one that skipped what CI's other
  // jobs ran is printed, never written
  if (!r.feature && !part && !skip) {
    mkdirSync(join(root, RESULT_DIR), { recursive: true });
    writeFileSync(resultPath(root, sha), JSON.stringify(r, null, 2) + "\n");
  }
  return r;
}

/** the short plain summary (pure) */
export function summary(r: GateResult): string {
  const out: string[] = [];
  out.push(`${r.green ? "GREEN" : "RED"} on ${r.sha.slice(0, 8)}${r.dirty ? " (with uncommitted changes: this result does not count for the commit)" : ""}${r.feature ? `, evals of ${r.feature} only` : ""}`);
  for (const s of r.steps) {
    const fresh = s.failed.filter((id) => !r.known.includes(id)), old = s.failed.length - fresh.length;
    out.push(`  ${s.ok ? "ok  " : "RED "} ${s.name} (${(s.ms / 1000).toFixed(1)} s)${fresh.length ? `: ${fresh.join(", ")}` : ""}${old ? ` · ${old} already broken` : ""}`);
  }
  const ran = r.evals.length, passed = r.evals.filter((e) => e.ok).length, covered = r.covered?.length ?? 0;
  if (r.part && !r.part.startsWith("1/")) out.push(`  evals: part 1 runs them, not this part (${r.part})`);
  else out.push(`  evals: ${ran ? `${passed}/${ran} pass` : covered ? "none run here" : "none approved yet"}${covered ? ` · ${covered} covered by this CI run's other jobs, not run again` : ""}${r.drafts.length ? ` · not run (draft): ${r.drafts.join(", ")}` : ""}${r.manual.length ? ` · manual (the first-timer's): ${r.manual.join(", ")}` : ""}`);
  if (r.checks) {
    const n = r.checks.ran.length, ok = r.checks.ran.filter((c) => c.ok).length;
    out.push(`  checks: ${n ? `${ok}/${n} pass` : "no command to run"}${r.checks.manual.length ? ` · a step in a person's own Sol, not run: ${r.checks.manual.join(", ")}` : ""}`);
  }
  if (r.known.length) out.push(`  already broken before this change (specs/baseline.md), not counted: ${r.known.join(", ")}`);
  if (r.fixed.length) out.push(`  fixed since the baseline, its line can go from specs/baseline.md: ${r.fixed.join(", ")}`);
  out.push(r.feature ? "  result: not written (a run narrowed to one feature is never the commit's result)"
    : r.partial ? "  result: not written (a part of the gate, or a run that left to CI's other jobs what they ran, is never the commit's whole result)"
    : `  result: ${RESULT_DIR}/${r.sha}.json`);
  return out.join("\n");
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  let feature: string | null = null, json = false, bodyFile: string | null = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--json") json = true;
    else if (a[i] === "--feature" && /^fr-\d{2,}$/.test(a[i + 1] ?? "")) feature = a[++i];
    else if (a[i] === CHECKS.flag && a[i + 1]) bodyFile = a[++i];
    else { console.error(`gate: bash sol/gate [--feature fr-NN] [${CHECKS.flag} <path>] [--json]`); process.exit(2); }
  }
  // a body that was meant and cannot be read is "could not run": the run is never the old four steps by accident
  let body: string | null = null;
  if (bodyFile !== null) { try { body = readFileSync(resolve(bodyFile), "utf8"); } catch { console.error(`gate: the PR body ${bodyFile} cannot be read`); process.exit(2); } }
  let root: string;
  try { root = git(process.cwd(), "rev-parse", "--show-toplevel"); } catch { console.error("gate: not inside the repository"); process.exit(2); }
  const say = (s: string) => (json ? process.stderr : process.stdout).write(s + "\n");
  runGate(root, { feature, body, say }).then((r) => {
    if (json) process.stdout.write(JSON.stringify({ sha: r.sha, green: r.green, steps: r.steps, evals: r.evals, dirty: r.dirty, feature: r.feature, known: r.known, fixed: r.fixed, drafts: r.drafts, manual: r.manual, base: r.base, ...(r.checks ? { checks: r.checks } : {}) }) + "\n");
    else console.log("\n" + summary(r));
    process.exit(r.green ? 0 : 1);
  }, (e) => { console.error(`gate: could not run: ${(e as Error)?.stack ?? e}`); process.exit(2); });
}
