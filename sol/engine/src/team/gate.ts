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
};

export const RESULT_DIR = ".sol-gate";
export const resultPath = (root: string, sha: string) => join(root, RESULT_DIR, `${sha}.json`);

const STEPS = ["lint", "build", "e2e", "evals"];
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
const stepOfId = (id: string) => ({ lint: "lint", build: "build", e2e: "e2e", eval: "evals" } as Record<string, string>)[id.split(":")[0]] ?? "";

// ---- running things ----
type Ran = { ok: boolean; out: string; ms: number };
function sh(cmd: string, args: string[], cwd: string, timeoutMs = 600_000, env: NodeJS.ProcessEnv = process.env): Promise<Ran> {
  const t0 = Date.now();
  return new Promise((ok) => {
    let out = "";
    let p: ReturnType<typeof spawn>;
    try { p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { ok({ ok: false, out: String(e), ms: 0 }); return; }
    const keep = (b: Buffer) => { out += b.toString(); if (out.length > 200_000) out = out.slice(-100_000); };
    p.stdout?.on("data", keep); p.stderr?.on("data", keep);
    const timer = setTimeout(() => { out += `\n(stopped after ${Math.round(timeoutMs / 1000)} s)`; p.kill("SIGKILL"); }, timeoutMs);
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
export const LAYOUT_FILES = /^sol\/mac\/src\/home\/[^/]+\.css$/;
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
export const LOOK_FILES = /^sol\/mac\/src\/home\/[^/]+\.(?:css|tsx?)$/;
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

/** the lint's findings on a set of files (pure on its inputs): ids `lint:<rule>:<file>` with a line to show */
export function lintFiles(files: string[], read: (f: string) => Buffer | null, betaKept: (f: string) => boolean, offence: (f: string, b: Buffer) => string | null): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [];
  for (const f of files) {
    if (/(^|\/)node_modules\//.test(f)) { out.push({ id: `lint:node-modules:${f.split("/node_modules/")[0] || f}`, line: `${f}: node_modules is committed` }); continue; }
    const isTest = TEST_FILE.test(f), kept = betaKept(f), laid = LAYOUT_FILES.test(f), looked = LOOK_FILES.test(f) && !isTest;
    if (!isTest && !kept && !laid && !looked) continue;
    const b = read(f);
    if (!b) continue;
    if (laid) {
      const v = layoutValues(b.toString("utf8"));
      if (v.length) out.push({ id: `lint:layout-value:${f}`, line: `${f}:${v[0].line}: a typed number where the scale goes (${v[0].decl})${v.length > 1 ? `, and ${v.length - 1} more` : ""}; the layout skill, .claude/skills/layout` });
    }
    if (looked) {
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
  "sol/mac/src/firstrun/FirstRun.tsx", "sol/mac/src/firstrun/goo.tsx",
  "sol/mac/src/home/Side.tsx", "sol/mac/src/work/LeashWheel.tsx",
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

async function lintStep(root: string, base: string | null, say: (s: string) => void): Promise<Step> {
  const t0 = Date.now();
  const files = git(root, "ls-files", "-z").split("\0").filter(Boolean);
  const { BETA_KEEP, exportOffence } = await import("./ship.js");
  const kept = (p: string) => BETA_KEEP.some((k) => p === k || p.startsWith(k + "/"));
  const read = (f: string) => { try { return readFileSync(join(root, f)); } catch { return null; } };
  const found = [...lintFiles(files, read, kept, exportOffence), ...sameNameTwice(files), ...gooFindings(files, read)];
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
    let tree = "";
    try { tree = readFileSync(join(root, BASELINE), "utf8"); } catch { /* none */ }
    for (const id of baselineAdded(baselineAt(root, base), tree))
      found.push({ id: `lint:baseline-added:${id}`, line: `${BASELINE}: this change adds "${id}"; a new red is the change's to fix, never listed` });
  }
  for (const x of found) say(`  lint: ${x.line}`);
  return { name: "lint", ok: !found.length, ms: Date.now() - t0, failed: found.map((x) => x.id) };
}

// ---- build ----
async function buildStep(root: string, say: (s: string) => void): Promise<Step> {
  const t0 = Date.now(), failed: string[] = [];
  const eng = join(root, "sol/engine"), face = join(root, "sol/mac");
  const parts: [string, string, string[], string][] = [
    ["engine-typecheck", join(eng, "node_modules/.bin/tsc"), ["--noEmit", "-p", "."], eng],
    ["face-typecheck", join(face, "node_modules/.bin/tsc"), ["-p", "."], face],
    // the production build, beside the result files: sol/mac/dist may be what a running Sol.app serves
    ["face-build", join(face, "node_modules/.bin/vite"), ["build", "--outDir", join(root, RESULT_DIR, "face"), "--emptyOutDir", "--logLevel", "warn"], face],
  ];
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
async function e2eStep(root: string, say: (s: string) => void): Promise<Step> {
  const t0 = Date.now();
  const dist = join(root, RESULT_DIR, "face");
  if (!existsSync(join(dist, "index.html"))) { say("  e2e: no production build of the face to open (the build step failed)"); return { name: "e2e", ok: false, ms: 0, failed: ["e2e:face-build-missing"] }; }
  // 15 minutes: the break paths (#603) are 48 of the paths, 6 to 10 s each; the gate's CI runs on GitHub's machines
  const r = await sh(process.execPath, [join(root, "sol/test/e2e/run.mjs"), "--dist", dist, "--json"], root, 900_000);
  let paths: { name: string; ok: boolean; ms: number; error?: string }[] = [];
  try { paths = JSON.parse(r.out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "").paths; } catch { /* below */ }
  if (!Array.isArray(paths) || !paths.length) { say("  e2e: the paths did not run:\n" + tail(r.out).replace(/^/gm, "    ")); return { name: "e2e", ok: false, ms: Date.now() - t0, failed: ["e2e:did-not-run"] }; }
  for (const p of paths) say(`  e2e: ${p.name} ${p.ok ? "ok" : `FAILED: ${p.error ?? ""}`} (${(p.ms / 1000).toFixed(1)} s)`);
  // a path's failure is keyed by where it failed, so a listed one never hides a new failure of the same path
  const failed = paths.filter((p) => !p.ok).map((p) => `e2e:${p.name}:${slug(p.error ?? "failed")}`);
  if (!r.ok && !failed.length) { failed.push("e2e:exit-code"); say("  e2e: the paths passed but run.mjs did not exit 0:\n" + tail(r.out).replace(/^/gm, "    ")); }
  return { name: "e2e", ok: !failed.length, ms: Date.now() - t0, failed };
}

// ---- evals ----
const CHECK_MS = Number(process.env.SOL_GATE_CHECK_TIMEOUT ?? 300) * 1000;
export async function evalStep(root: string, feature: string | null, say: (s: string) => void): Promise<{ step: Step; evals: EvalRun[]; drafts: string[]; manual: string[] }> {
  const t0 = Date.now(), evals: EvalRun[] = [], drafts: string[] = [], manual: string[] = [], failed: string[] = [];
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
      const r = await sh("bash", ["-c", l.check], root, CHECK_MS);
      evals.push({ feature: f.feature, id: l.id, ok: r.ok });
      say(`  evals: ${f.feature} ${l.id} ${r.ok ? "pass" : "FAIL"}: ${l.what.slice(0, 80)}`);
      if (!r.ok) { failed.push(id); say(tail(r.out, 6).replace(/^/gm, "    ")); }
    }
  }
  return { step: { name: "evals", ok: !failed.length, ms: Date.now() - t0, failed }, evals, drafts, manual };
}

// ---- the run ----
export async function runGate(root: string, opts: { feature?: string | null; say?: (s: string) => void } = {}): Promise<GateResult> {
  const say = opts.say ?? (() => {});
  const sha = git(root, "rev-parse", "HEAD");
  // uncommitted changes, or new files not yet added (ignored ones aside): the run is not the commit's
  const status0 = git(root, "status", "--porcelain");
  const base = baseOf(root);
  say(base ? `baseline: ${BASELINE} as of ${base.slice(0, 8)} (where this commit leaves main)` : `baseline: no main to read ${BASELINE} from, so nothing is excused`);
  const steps: Step[] = [];
  say("lint…"); steps.push(await lintStep(root, base, say));
  say("build…"); steps.push(await buildStep(root, say));
  say("e2e…"); steps.push(await e2eStep(root, say));
  say("evals…");
  const ev = await evalStep(root, opts.feature ?? null, say);
  steps.push(ev.step);
  const listed = base ? baselineIds(baselineAt(root, base)) : new Set<string>();
  for (const id of listed) if (!excusable(id)) say(`  baseline: "${id}" is listed but never excused (only an e2e path's failure point or an eval line can be)`);
  const j = judge(steps, listed);
  // the commit or the tree moved while it ran: the result is not that commit's
  let moved = true;
  try { moved = git(root, "rev-parse", "HEAD") !== sha || git(root, "status", "--porcelain") !== status0; } catch { /* moved */ }
  if (moved) say("  the commit or the files changed during the run: this result does not count for the commit");
  const r: GateResult = { sha, green: j.green, steps: j.steps, evals: ev.evals, dirty: status0 !== "" || moved, feature: opts.feature ?? null, at: new Date().toISOString(),
    known: j.known, fixed: j.fixed, drafts: ev.drafts, manual: ev.manual, base };
  // only a full run is the commit's result; a run narrowed to one feature is printed, never written
  if (!r.feature) {
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
  const ran = r.evals.length, passed = r.evals.filter((e) => e.ok).length;
  out.push(`  evals: ${ran ? `${passed}/${ran} pass` : "none approved yet"}${r.drafts.length ? ` · not run (draft): ${r.drafts.join(", ")}` : ""}${r.manual.length ? ` · manual (the first-timer's): ${r.manual.join(", ")}` : ""}`);
  if (r.known.length) out.push(`  already broken before this change (specs/baseline.md), not counted: ${r.known.join(", ")}`);
  if (r.fixed.length) out.push(`  fixed since the baseline, its line can go from specs/baseline.md: ${r.fixed.join(", ")}`);
  out.push(r.feature ? "  result: not written (a run narrowed to one feature is never the commit's result)" : `  result: ${RESULT_DIR}/${r.sha}.json`);
  return out.join("\n");
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  let feature: string | null = null, json = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--json") json = true;
    else if (a[i] === "--feature" && /^fr-\d{2,}$/.test(a[i + 1] ?? "")) feature = a[++i];
    else { console.error("gate: bash sol/gate [--feature fr-NN] [--json]"); process.exit(2); }
  }
  let root: string;
  try { root = git(process.cwd(), "rev-parse", "--show-toplevel"); } catch { console.error("gate: not inside the repository"); process.exit(2); }
  const say = (s: string) => (json ? process.stderr : process.stdout).write(s + "\n");
  runGate(root, { feature, say }).then((r) => {
    if (json) process.stdout.write(JSON.stringify({ sha: r.sha, green: r.green, steps: r.steps, evals: r.evals, dirty: r.dirty, feature: r.feature, known: r.known, fixed: r.fixed, drafts: r.drafts, manual: r.manual, base: r.base }) + "\n");
    else console.log("\n" + summary(r));
    process.exit(r.green ? 0 : 1);
  }, (e) => { console.error(`gate: could not run: ${(e as Error)?.stack ?? e}`); process.exit(2); });
}
