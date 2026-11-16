// The first-timer (#485, dev cycle step 6): a fresh agent that uses Sol the way a first-time Sol user would, reads no
// code, and writes down what confused it. Sol developers run it (`bash sol/first-timer`); the morning run (morning.ts)
// runs it over the features the 9am release touched. It is a team tool: Sol testers and Sol users never meet it.
//
// What it does, one run:
//   1. the personas: specs/personas/<name>.md, a first-time Sol user each (a student, a designer, someone who is not
//      technical). `--persona <name>` picks one; otherwise each feature gets the persona its eval names (below), else
//      the personas take turns.
//   2. the feature's "Ways to use it" from its eval.md (specs/features/fr-NN-slug/eval.md, CONTRACTS): every line. A line
//      whose check is `manual` names its persona there: `· check: manual (student)`; that line is tried by that persona
//      only, and this is the only way an eval line may say `manual` (the gate, #481, leaves such lines to this run).
//   3. a stage of its own: the production build (sol/engine/dist, sol/mac/dist) on two free ports, a fresh home from
//      the tracked templates, its own work state and team file, no counting, no update check, so nothing it does
//      touches the Sol it runs beside. The page is opened in the test browser (Playwright's Chromium) pointed at that
//      engine and nothing else.
//   4. the agent: a fresh Claude Code session, the role `first-timer` (SOL_ROLE for the guard, #484), the agent file
//      .claude/agents/sol-first-timer.md (#482) when there is one, in an empty folder, with one tool: the test browser,
//      `bash sol/first-timer browse <look|click|type|press|go|back|wait|shot>`. It cannot read code ("first-timer
//      sealed", #484). It answers with TRIED / FOUND / SUMMARY lines.
//   5. the report: .sol-gate/<sha>.first-timer.json, beside the gate's result (gitignored), and a line a run on stdout.
//      It writes nowhere else: a write whose real place (realpathSync.native, compared without case, as macOS's disk
//      is) is not under .sol-gate/, or onto a file with a second hard link, is refused (writeInGate).
//   6. the seal, judged by its effect, not by words: every file under specs/features/ is hashed before the run and
//      after it; any change (an "Approved" or "Scoped" written by a script, base64, a copy from /tmp, whatever the
//      command looked like) fails the run, names the files, and the morning run posts nothing (sealBroken).
// The agent and the stage are deps, so the tests run it with neither a model nor a browser (test/first-timer.test.ts);
// SOL_FIRST_TIMER_AGENT names a command that stands in for the model from the shell (the prompt on its stdin, the
// report on its stdout).
import { execFile, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { closeSync, createReadStream, existsSync, lstatSync, openSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as netServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
// TO BE REPLACED by ./features.js (#480) once it lands: the same names
import { readFeatures, folderOf, type Feature } from "./featuremap.js";

// ---- the shapes ----
export type Persona = { name: string; title: string; body: string };
/** one line of an eval's "Ways to use it": its id (E1), what a Sol user does and sees, its check, and the persona a
 *  `manual` check names */
export type Way = { id: string; text: string; check: string; persona?: string };
export type Tried = { way: string; result: "ok" | "stuck" | "skipped"; line: string };
export type Finding = { way: string; what: string };
export type Run = {
  feature: string; name: string; persona: string; ways: string[];
  tried: Tried[]; findings: Finding[]; summary: string; ok: boolean; error?: string;
};
export type Report = { sha: string; at: string; url: string; runs: Run[]; findings: number; file?: string; sealBroken?: string[] };

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (s: string, max: number) => s.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ---- the personas (pure over the files) ----

/** the personas in specs/personas (a file a persona, its name the file's; README.md is not one), sorted by name */
export function readPersonas(root: string): Persona[] {
  const dir = join(root, "specs", "personas");
  let names: string[] = [];
  try { names = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort(); } catch { return []; }
  return names.flatMap((f) => {
    const name = basename(f, ".md").toLowerCase();
    if (!NAME.test(name)) return [];
    try { return [personaOf(name, readFileSync(join(dir, f), "utf8"))]; } catch { return []; }
  });
}
/** a persona from its file (pure): the first heading is its title, the rest is who they are */
export function personaOf(name: string, md: string): Persona {
  const lines = md.replace(/\r/g, "").split("\n");
  const h = lines.findIndex((l) => /^#\s+\S/.test(l));
  const title = h >= 0 ? oneLine(lines[h].replace(/^#\s+/, ""), 120) : name;
  const body = (h >= 0 ? lines.slice(h + 1) : lines).join("\n").trim().slice(0, 4000);
  return { name, title, body };
}

// ---- the evals (pure) ----

/** the persona a `manual` check names (pure): "manual (student)", "manual: student", "manual · persona: student";
 *  null when the check is not manual or names none */
export function manualPersona(check: string): string | null {
  const m = /^\s*`?manual`?\s*(?:[:(·,-]\s*)?(?:persona\s*[:=]?\s*)?`?([a-z][a-z0-9-]{0,39})`?\s*\)?\s*$/i.exec(check);
  return m && m[1].toLowerCase() !== "persona" ? m[1].toLowerCase() : null;
}
/** is this check `manual` at all (pure) */
export const isManual = (check: string) => /^\s*`?manual\b/i.test(check);

/** the lines under "## Ways to use it" of an eval.md (pure): `- [E1] what a Sol user does · check: <command>` */
export function waysOf(evalMd: string): Way[] {
  const out: Way[] = [];
  let inside = false;
  for (const raw of evalMd.replace(/\r/g, "").split("\n")) {
    if (/^##\s/.test(raw)) { inside = /^##\s+ways to use it\b/i.test(raw); continue; }
    if (!inside) continue;
    const m = /^\s*[-*]\s*\[([A-Z]\d+)\]\s*(.+)$/.exec(raw);
    if (!m) continue;
    const at = m[2].lastIndexOf("· check:");
    const text = oneLine(at >= 0 ? m[2].slice(0, at) : m[2], 400).replace(/\s*·\s*$/, "");
    const check = at >= 0 ? m[2].slice(at + "· check:".length).trim().replace(/^`(.*)`$/, "$1") : "";
    const persona = isManual(check) ? manualPersona(check) ?? undefined : undefined;
    out.push({ id: m[1], text, check, ...(persona ? { persona } : {}) });
  }
  return out;
}

/** a feature's ways, read from its folder's eval.md; [] when it has none yet */
export function readWays(root: string, f: Pick<Feature, "id" | "slug">): Way[] {
  try { return waysOf(readFileSync(join(root, folderOf(f), "eval.md"), "utf8")); } catch { return []; }
}

// ---- the plan (pure) ----

export type Planned = { feature: Pick<Feature, "id" | "name">; persona: Persona; ways: Way[] };
/**
 * Who tries what (pure). A feature's manual lines go to the persona they name (a name with no persona file is
 * skipped, said in `skipped`). The other lines go to `pick` when given, else to the persona whose turn it is (they
 * take turns over the features, in order), so a morning with three features meets three people. A feature with no
 * ways is skipped.
 */
export function planOf(features: Pick<Feature, "id" | "name">[], ways: Record<string, Way[]>, personas: Persona[], pick?: string): { plan: Planned[]; skipped: string[] } {
  const plan: Planned[] = [], skipped: string[] = [];
  if (!personas.length) return { plan, skipped: ["no personas in specs/personas"] };
  const chosen = pick ? personas.find((p) => p.name === pick) : undefined;
  if (pick && !chosen) return { plan, skipped: [`no persona called ${pick} (specs/personas: ${personas.map((p) => p.name).join(", ")})`] };
  let turn = 0;
  for (const f of features) {
    const w = ways[f.id] ?? [];
    if (!w.length) { skipped.push(`${f.id} has no "Ways to use it" yet (its eval.md)`); continue; }
    const named = new Map<string, Way[]>();
    const rest: Way[] = [];
    for (const x of w) {
      if (x.persona) { const l = named.get(x.persona) ?? []; l.push(x); named.set(x.persona, l); }
      else if (isManual(x.check)) skipped.push(`${f.id} ${x.id} says manual but names no persona`);
      else rest.push(x);
    }
    for (const [name, list] of named) {
      if (pick && name !== pick) continue;
      const p = personas.find((q) => q.name === name);
      if (!p) { skipped.push(`${f.id} ${list.map((x) => x.id).join(", ")}: no persona called ${name}`); continue; }
      const same = plan.find((x) => x.feature.id === f.id && x.persona.name === name);
      if (same) same.ways.push(...list); else plan.push({ feature: f, persona: p, ways: [...list] });
    }
    if (rest.length) {
      const p = chosen ?? personas[turn++ % personas.length];
      const same = plan.find((x) => x.feature.id === f.id && x.persona.name === p.name);
      if (same) same.ways.push(...rest); else plan.push({ feature: f, persona: p, ways: rest });
    }
  }
  return { plan, skipped };
}

// ---- the prompt and the answer (pure) ----

export const BROWSE_VERBS = "look · click <n or words> · type <n or words> <text> · press <key> · go </path> · back · wait <seconds> · shot <name>";

/** what the agent is told (pure): who it is, that it is new to Sol, its one tool, what to try, how to answer */
export function promptOf(p: Persona, feature: Pick<Feature, "id" | "name">, ways: Way[], browse: string): string {
  return [
    `You are ${p.title}.`,
    p.body,
    "",
    "You have never used Sol before. Nobody explains it to you. Sol is open in a browser in front of you.",
    `Your only way to touch it is this command: \`${browse} <verb>\`, one verb at a time:`,
    `  ${BROWSE_VERBS}`,
    "Start with `look`. It tells you what is on the screen and numbers what you can press.",
    "You cannot read Sol's code, its files or its help pages, and you do not try: you only use what is on the screen.",
    "",
    `Try these, the way you would as yourself (they are part of "${feature.name}"):`,
    ...ways.map((w) => `- [${w.id}] ${w.text}`),
    "",
    "Notice everything that confused you, made you hesitate, or that you could not find, in your own words.",
    "When you are done, answer with these lines and nothing else:",
    "TRIED <id>: ok | stuck | skipped — one line on what happened",
    "FOUND <id>: what confused you (one line each; as many as there were; none is fine)",
    "SUMMARY: one or two sentences, as you would tell a friend",
  ].join("\n");
}

/** the agent's answer as tried, found and a summary (pure); lines that are neither are ignored */
export function parseAnswer(text: string, ways: string[]): { tried: Tried[]; findings: Finding[]; summary: string } {
  const tried: Tried[] = [], findings: Finding[] = [];
  let summary = "";
  const known = new Set(ways);
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const l = raw.replace(/^\s*[-*]\s*/, "").replace(/\*\*/g, "").trim();
    let m = /^TRIED\s*\[?([A-Z]\d+)\]?\s*[:—-]\s*(ok|stuck|skipped)\b[\s—:,.-]*(.*)$/i.exec(l);
    if (m) { const way = m[1].toUpperCase(); if (known.has(way) && tried.length < 40) tried.push({ way, result: m[2].toLowerCase() as Tried["result"], line: oneLine(m[3], 300) }); continue; }
    m = /^FOUND\s*\[?([A-Z]\d+|-)\]?\s*[:—-]\s*(.+)$/i.exec(l);
    if (m) { const what = oneLine(m[2], 300); if (what && !/^none\.?$/i.test(what) && findings.length < 20) findings.push({ way: known.has(m[1].toUpperCase()) ? m[1].toUpperCase() : "-", what }); continue; }
    m = /^SUMMARY\s*:\s*(.+)$/i.exec(l);
    if (m) summary = oneLine(m[1], 500);
  }
  return { tried, findings, summary };
}

/** a run in one line (pure): "fr-02 Open Sol · student · 2/3 ok · 2 findings" */
export function runLine(r: Run): string {
  if (r.error) return `${r.feature} ${r.name} · ${r.persona} · not run: ${r.error}`;
  const ok = r.tried.filter((t) => t.result === "ok").length;
  return `${r.feature} ${r.name} · ${r.persona} · ${ok}/${r.ways.length} ok · ${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}`;
}

// ---- the run ----

export type Stage = { url: string; env: Record<string, string>; stop: () => Promise<void> };
export type FirstTimerDeps = {
  root: string;
  sha: () => Promise<string>;
  /** a stage of its own, the page open in the test browser; null when it could not be made (`why` says) */
  stage: () => Promise<Stage | { error: string }>;
  /** one fresh agent session: the prompt in, its answer out */
  agent: (a: { prompt: string; persona: string; env: Record<string, string> }) => Promise<string>;
  /** the command the agent uses for the browser, as it types it */
  browse: string;
  now?: () => Date;
  say?: (line: string) => void;
  write?: (file: string, text: string) => void;
};
export type FirstTimerOpts = { features?: string[]; persona?: string };

// ---- the seal, by its effect ----

const realN = (p: string) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
const low = (p: string) => p.toLowerCase();
/** every file under specs/features/ by its path from the root as it is on disk, and its SHA-256 (a link by where it
 *  points, never followed). The canonical folder the readers use, join(root, "specs", "features"), and every sibling
 *  spelled another way at either level (Specs/, specs/Features/: one folder on a Mac's disk, two on Linux's), each
 *  folder also a line of its own, so a variant or an empty folder that appears during the run breaks the seal too */
export function featuresSnapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const variants = (dir: string, name: string) => { try { return readdirSync(dir).filter((x) => low(x) === name).sort(); } catch { return []; } };
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > 6 || out.size > 5000) return;
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names.sort()) {
      const abs = join(dir, n), r = `${rel}/${n}`;
      let st; try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) { let to = ""; try { to = readlinkSync(abs); } catch { /* gone */ } out.set(r, `link:${to}`); }
      else if (st.isDirectory()) { out.set(`${r}/`, "folder"); walk(abs, r, depth + 1); }
      else if (st.isFile()) { try { out.set(r, createHash("sha256").update(readFileSync(abs)).digest("hex")); } catch { out.set(r, "unreadable"); } }
      else out.set(r, "other");
    }
  };
  for (const sp of variants(root, "specs")) {
    // the map and the personas too: what the first-timer is told to try and as whom
    for (const name of ["features.json", "personas"]) for (const v of variants(join(root, sp), name)) {
      const abs = join(root, sp, v);
      let st; try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) out.set(`${sp}/${v}`, `link:${(() => { try { return readlinkSync(abs); } catch { return ""; } })()}`);
      else if (st.isDirectory()) { out.set(`${sp}/${v}/`, "folder"); walk(abs, `${sp}/${v}`, 0); }
      else if (st.isFile()) { try { out.set(`${sp}/${v}`, createHash("sha256").update(readFileSync(abs)).digest("hex")); } catch { out.set(`${sp}/${v}`, "unreadable"); } }
    }
  }
  for (const sp of variants(root, "specs")) for (const fe of variants(join(root, sp), "features")) {
    let st; try { st = lstatSync(join(root, sp, fe)); } catch { continue; }
    out.set(`${sp}/${fe}/`, st.isSymbolicLink() ? `link:${(() => { try { return readlinkSync(join(root, sp, fe)); } catch { return ""; } })()}` : "folder");
    if (!st.isSymbolicLink()) walk(join(root, sp, fe), `${sp}/${fe}`, 0);
  }
  return out;
}
/** the files under specs/features/ that a run added, changed or took away (pure over two snapshots) */
export function sealBroken(before: Map<string, string>, after: Map<string, string>): string[] {
  const out = new Set<string>();
  for (const [k, v] of after) if (before.get(k) !== v) out.add(k);
  for (const k of before.keys()) if (!after.has(k)) out.add(k);
  return [...out].sort();
}
/** the one place the first-timer and the morning run write: under <root>/.sol-gate/, judged where the folder really
 *  is (realpathSync.native, compared without case). Never onto a link (a dangling one too) or a file with a second
 *  hard link (it could be an eval.md): refused. The text goes to a new temp file in the checked folder (created with
 *  O_EXCL, so never through a link) and is renamed into place, which replaces a name and never writes through it */
export function writeInGate(root: string, file: string, text: string) {
  const gate = low(join(realN(root), ".sol-gate")) + "/";
  // each folder from the root down, made one at a time and never through a link, so nothing is made outside first
  const rel = relative(root, dirname(file));
  if (rel.startsWith("..") || isAbsolute(rel) || low(rel.split(sep)[0] ?? "") !== ".sol-gate") throw new Error(`refused: ${file} is not under .sol-gate/`);
  let at = root;
  for (const part of rel.split(sep)) {
    at = join(at, part);
    let st = null;
    try { st = lstatSync(at); } catch { /* not there yet */ }
    if (st?.isSymbolicLink()) throw new Error(`refused: ${at} is a link`);
    if (!st) mkdirSync(at); else if (!st.isDirectory()) throw new Error(`refused: ${at} is not a folder`);
  }
  const dir = realN(dirname(file));
  if (!(low(dir) + "/").startsWith(gate)) throw new Error(`refused: ${file} is not under .sol-gate/`);
  const target = join(dir, basename(file));
  let st = null;
  try { st = lstatSync(target); } catch { /* not there yet */ }
  if (st && (st.isSymbolicLink() || !st.isFile() || st.nlink > 1)) throw new Error(`refused: ${file} is linked elsewhere`);
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, text, { flag: "wx" });
  try { renameSync(tmp, target); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

/** where a run's report goes (pure): beside the gate's result for the same commit */
export const reportPath = (root: string, sha: string) => join(root, ".sol-gate", `${sha || "unknown"}.first-timer.json`);

/** the first-timer over these features (all with ways when none are named); never throws */
export async function firstTimer(d: FirstTimerDeps, o: FirstTimerOpts = {}): Promise<Report & { skipped: string[] }> {
  const say = d.say ?? (() => {});
  const now = d.now ?? (() => new Date());
  const sha = await d.sha().catch(() => "");
  const all = readFeatures(d.root);
  const want = o.features?.length ? o.features : null;
  const features = want ? all.filter((f) => want.includes(f.id)) : all;
  const missing = want ? want.filter((id) => !all.some((f) => f.id === id)) : [];
  const ways: Record<string, Way[]> = {};
  for (const f of features) ways[f.id] = readWays(d.root, f);
  const { plan, skipped } = planOf(features, ways, readPersonas(d.root), o.persona);
  skipped.unshift(...missing.map((id) => `${id} is not in specs/features.json`));
  const report: Report & { skipped: string[] } = { sha, at: now().toISOString(), url: "", runs: [], findings: 0, skipped };
  const sealed = featuresSnapshot(d.root);
  for (const s of skipped) say(`first-timer: skipped: ${s}`);
  if (plan.length) {
    const st = await d.stage().catch((e) => ({ error: String(e instanceof Error ? e.message : e).split("\n")[0] }));
    if ("error" in st) {
      for (const p of plan) report.runs.push({ feature: p.feature.id, name: p.feature.name, persona: p.persona.name, ways: p.ways.map((w) => w.id), tried: [], findings: [], summary: "", ok: false, error: `no stage: ${st.error}` });
    } else {
      report.url = st.url;
      try {
        for (const p of plan) {
          const ids = p.ways.map((w) => w.id);
          const base: Run = { feature: p.feature.id, name: p.feature.name, persona: p.persona.name, ways: ids, tried: [], findings: [], summary: "", ok: false };
          say(`first-timer: ${p.persona.name} tries ${p.feature.id} (${ids.join(", ")})`);
          try {
            const answer = await d.agent({ prompt: promptOf(p.persona, p.feature, p.ways, d.browse), persona: p.persona.name, env: st.env });
            const a = parseAnswer(answer, ids);
            const run: Run = { ...base, ...a, ok: a.tried.length > 0 || !!a.summary };
            if (!run.ok) run.error = "the agent's answer had no TRIED or SUMMARY line";
            report.runs.push(run);
          } catch (e) {
            report.runs.push({ ...base, error: oneLine(String(e instanceof Error ? e.message : e), 200) });
          }
          say(`first-timer: ${runLine(report.runs[report.runs.length - 1])}`);
        }
      } finally { await st.stop().catch(() => {}); }
    }
  }
  report.findings = report.runs.reduce((n, r) => n + r.findings.length, 0);
  const file = reportPath(d.root, sha);
  const write = d.write ?? ((f: string, t: string) => writeInGate(d.root, f, t));
  try { write(file, JSON.stringify(report, null, 2) + "\n"); report.file = file; } catch (e) { say(`first-timer: the report was not written: ${String(e)}`); }
  // the seal, after every write of the run (the agents' process groups are gone by now): any change and the run fails
  const broken = sealBroken(sealed, featuresSnapshot(d.root));
  if (broken.length) {
    report.sealBroken = broken;
    for (const r of report.runs) { r.ok = false; r.error = r.error ?? "the run changed specs/features/"; }
    say(`first-timer: REFUSED: the run changed ${broken.join(", ")} (the first-timer may not touch the features' files: put them back by hand)`);
    try { write(file, JSON.stringify(report, null, 2) + "\n"); } catch { /* said above: the run is refused either way */ }
  }
  return report;
}

/** a report read back (the morning run, the live block); null when there is none or it is not one */
export function readReport(file: string): Report | null {
  try {
    const r = JSON.parse(readFileSync(file, "utf8"));
    return isObj(r) && Array.isArray(r.runs) && typeof r.sha === "string" ? (r as Report) : null;
  } catch { return null; }
}

// ---- the agent file (#482) and the real agent ----

/** the agent file as Claude Code's --agents JSON (pure): its frontmatter's description and its body as the prompt;
 *  null when there is no such file. Its `tools` are never taken: the runner decides the one tool */
export function agentJson(md: string | null): Record<string, { description: string; prompt: string }> | null {
  if (!md) return null;
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md.replace(/\r/g, ""));
  const front = m ? m[1] : "", body = (m ? m[2] : md).trim();
  const desc = /^description:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "A first-time Sol user";
  return body ? { "sol-first-timer": { description: desc, prompt: body } } : null;
}
export const FALLBACK_AGENT = "You play a first-time Sol user in a test. You only use Sol through the test browser command you are given. You never read code or files, and you never try another command. You report what confused you, plainly, in the lines asked for.";

/** Claude Code's arguments for one first-timer session (pure): one tool, the browser command, nothing asked */
export function claudeArgs(browse: string, agents: Record<string, { description: string; prompt: string }>): string[] {
  return [
    "-p", "--output-format", "text",
    "--agents", JSON.stringify(agents), "--agent", "sol-first-timer",
    "--tools", "Bash", "--allowedTools", `Bash(${browse}:*)`,
    "--permission-mode", "dontAsk", "--strict-mcp-config",
    // only the project's settings, and the project is an empty folder: never the person's own ~/.claude allow rules or
    // CLAUDE.md (their Bash(*) would let it read anything)
    "--setting-sources", "project",
  ];
}

/** the folders a command may come from, trimmed (pure): a bin folder of the run's own that holds node and nothing else,
 *  /usr/bin and /bin; never node's own folder or the person's own bins. This does not hide gh from code that looks for
 *  it by full path (ghPlaces finds /opt/homebrew/bin/gh): the scratch HOME, with no gh sign-in in it, is what makes it
 *  harmless */
export const trimmedPath = (bin: string) => [bin, "/usr/bin", "/bin"].join(":");
/** the run's bin folder: node, linked, and nothing else */
export function nodeBin(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  try { symlinkSync(process.execPath, join(bin, "node")); } catch { /* there already */ }
  return bin;
}
/** what the agent session is given (pure): a scratch HOME and Claude config inside its own folder (so nothing of the
 *  person's ~/.claude loads, and its session files go away with the folder), a trimmed PATH, and one sign-in only:
 *  CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) when the runner has one, never gh's or any other key */
export function agentEnv(base: NodeJS.ProcessEnv, cwd: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { PATH: trimmedPath(join(cwd, "bin")), HOME: join(cwd, "home"), CLAUDE_CONFIG_DIR: join(cwd, "claude"), SOL_ROLE: "first-timer" };
  for (const k of ["TMPDIR", "LANG", "TERM"]) { const v = base[k]; if (v !== undefined) env[k] = v; }
  for (const k of ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]) { const v = base[k]; if (v) env[k] = v; }
  return { ...env, ...extra };
}

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = resolve(ENGINE, "..", "..");

/** an agent's whole process group, killed: it runs in a group of its own (spawn's `detached`), so a background process
 *  it started cannot go on writing after the run; one that left the group by itself (setsid) is not reached */
export function killGroup(pid: number | undefined) {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* the group is gone already */ }
}

/** the real agent: `claude` in an empty folder of its own, SOL_ROLE=first-timer, the prompt on stdin, 15 minutes at most */
export function claudeAgent(root: string, browse: string): FirstTimerDeps["agent"] {
  return ({ prompt, env }) => new Promise((ok, no) => {
    let file: string | null = null;
    try { file = readFileSync(join(root, ".claude", "agents", "sol-first-timer.md"), "utf8"); } catch { /* #482's not here yet */ }
    const agents = agentJson(file) ?? { "sol-first-timer": { description: "A first-time Sol user", prompt: FALLBACK_AGENT } };
    const cwd = mkdtempSync(join(tmpdir(), "sol-first-timer-"));
    const work = join(cwd, "work");
    for (const d of [work, join(cwd, "home"), join(cwd, "claude")]) mkdirSync(d, { recursive: true });
    nodeBin(cwd);
    const claude = [process.env.SOL_CLAUDE, join(process.env.HOME ?? "", ".local", "bin", "claude")].find((c) => c && existsSync(c));
    if (!claude) { rmSync(cwd, { recursive: true, force: true }); no(new Error("no claude here (SOL_CLAUDE, ~/.local/bin/claude)")); return; }
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) { rmSync(cwd, { recursive: true, force: true }); no(new Error("the first-timer signs in with CLAUDE_CODE_OAUTH_TOKEN only (claude setup-token), never the person's own Claude: set it for the run")); return; }
    const p = spawn(claude, claudeArgs(browse, agents), { cwd: work, env: agentEnv(process.env, cwd, env), stdio: ["pipe", "pipe", "pipe"], detached: true });
    let out = "", err = "";
    p.stdout.on("data", (b) => { out += b; }); p.stderr.on("data", (b) => { err = (err + b).slice(-2000); });
    p.on("exit", () => killGroup(p.pid));   // whatever it left running goes with it, before the seal is looked at
    const t = setTimeout(() => killGroup(p.pid), 15 * 60_000);
    p.on("error", (e) => { clearTimeout(t); rmSync(cwd, { recursive: true, force: true }); no(e); });
    p.on("close", (code) => {
      clearTimeout(t); rmSync(cwd, { recursive: true, force: true });
      if (code === 0) ok(out); else no(new Error(`claude ended with ${code}: ${oneLine(err, 200)}`));
    });
    p.stdin.on("error", () => { /* it ended before reading the prompt: its answer says so */ });
    p.stdin.end(prompt);
  });
}

/** a stand-in for the model from the shell: `sh -c <cmd>`, the prompt on stdin, the answer on stdout */
export function commandAgent(cmd: string): FirstTimerDeps["agent"] {
  return ({ prompt, persona, env }) => new Promise((ok, no) => {
    const p = spawn("sh", ["-c", cmd], { env: { ...process.env, ...env, SOL_ROLE: "first-timer", SOL_PERSONA: persona }, stdio: ["pipe", "pipe", "inherit"], detached: true });
    let out = "";
    p.stdout.on("data", (b) => { out += b; });
    p.on("exit", () => killGroup(p.pid));
    p.stdin.on("error", () => { /* it ended before reading the prompt */ });
    p.on("error", no);
    p.on("close", (code) => (code === 0 ? ok(out) : no(new Error(`the stand-in agent ended with ${code}`))));
    p.stdin.end(prompt);
  });
}

// ---- the stage: the production build on two free ports, the page in the test browser ----

const freePort = () => new Promise<number>((ok, no) => {
  const s = netServer();
  s.once("error", no);
  s.listen(0, "127.0.0.1", () => { const a = s.address(); const port = typeof a === "object" && a ? a.port : 0; s.close(() => ok(port)); });
});
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".wasm": "application/wasm",
  ".ico": "image/x-icon", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ttf": "font/ttf",
};
/** the face's production build, served read-only: "/" is index.html, nothing outside the folder */
function serveFace(dist: string, port: number): Promise<Server> {
  const top = realpathSync(dist);
  const s = createServer((req, res) => {
    let rel = "index.html";
    try { const p = decodeURIComponent((req.url ?? "/").split("?")[0]); if (p !== "/") rel = p.replace(/^\/+/, ""); } catch { /* the index */ }
    const full = resolve(top, rel);
    try {
      const real = realpathSync(full);
      if (!real.startsWith(top + "/") || !statSync(real).isFile()) throw new Error("no");
      res.writeHead(200, { "content-type": TYPES[extname(real)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(real).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok, no) => { s.once("error", no); s.listen(port, "127.0.0.1", () => ok(s)); });
}

/** the engine's environment for the stage (pure): an allowlist of mine, everything it writes under `run`, nothing that
 *  reaches the team, the cloud or GitHub's releases; the face's origin let through its door */
export function stageEnv(base: NodeJS.ProcessEnv, run: string, port: number, face: string, dist: string): Record<string, string> {
  // HOME an empty folder of the run's (no ~/.claude, ~/.codex, gh or keys of the person's: the stage has no seat, so a
  // turn there says it cannot answer), PATH trimmed (Sol's own gh finder still finds /opt/homebrew/bin/gh by its full
  // path: what makes that harmless is the empty HOME, with no gh sign-in in it), and SOL_STAGE: the engine refuses going back, Update,
  // pinning, carrying and running commands (src/stage.ts). SOL_STAGE_CLAUDE_TOKEN, when the runner sets it, is the one
  // sign-in the stage gets, as CLAUDE_CODE_OAUTH_TOKEN
  const env: Record<string, string> = { PATH: trimmedPath(join(run, "bin")), HOME: join(run, "os-home") };
  for (const k of ["TMPDIR", "LANG", "TERM"]) { const v = base[k]; if (v !== undefined) env[k] = v; }
  if (base.SOL_STAGE_CLAUDE_TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = base.SOL_STAGE_CLAUDE_TOKEN;
  return {
    ...env, SOL_STAGE: "1", PORT: String(port), SOL_PORT: String(port),
    SOL_HOME: join(run, "home"), SOL_STATE: join(run, "state", "work.json"), SOL_TEAM: join(run, "team.json"), SOL_PROFILE: join(run, "profile"),
    SOL_DIST: dist, SOL_FACE: face, SOL_LOG: join(run, "engine.log"), SOL_ROOMS: join(run, "rooms"),
    SOL_HUB: "off", SOL_TRACK: "off", SOL_TRACK_URL: "off", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

/** the real stage (impure; tried by hand, never in `npm test`) */
export async function makeStage(root: string, sha: string): Promise<Stage | { error: string }> {
  const engine = join(root, "sol", "engine"), dist = join(root, "sol", "mac", "dist");
  if (!existsSync(join(engine, "dist", "index.js"))) return { error: "the engine is not built: cd sol/engine && npm run build" };
  if (!existsSync(join(dist, "index.html"))) return { error: "the face is not built: cd sol/mac && npm run build" };
  const run = join(root, ".sol-gate", "first-timer", `${sha.slice(0, 12) || "here"}-${Date.now()}`);
  mkdirSync(join(run, "home"), { recursive: true });
  mkdirSync(join(run, "state"), { recursive: true });
  mkdirSync(join(run, "shots"), { recursive: true });
  mkdirSync(join(run, "os-home"), { recursive: true });
  nodeBin(run);
  // a fresh home from the tracked templates: never a person's memory, life or desk
  const homed = await new Promise<boolean>((ok) => execFile("sh", ["-c", `git -C "$1" archive HEAD sol/home | tar -x -C "$2" --strip-components 2`, "sh", root, join(run, "home")], { timeout: 60_000 }, (e) => ok(!e)));
  if (!homed) return { error: "a fresh home could not be made from the templates (git archive)" };
  writeInGate(root, join(run, "team.json"), "{}\n");
  const [ep, fp, cp] = [await freePort(), await freePort(), await freePort()];
  const face = `http://127.0.0.1:${fp}`;
  const server = await serveFace(dist, fp);
  const log = openSync(join(run, "engine.log"), "a");
  const eng = spawn(process.execPath, ["dist/index.js"], { cwd: engine, env: stageEnv(process.env, run, ep, face, dist), stdio: ["ignore", log, log] });
  closeSync(log);
  const stopAll: (() => Promise<void>)[] = [async () => { eng.kill("SIGTERM"); }, () => new Promise<void>((ok) => server.close(() => ok()))];
  const stop = async () => { for (const s of stopAll.reverse()) await s().catch(() => {}); };
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    up = await fetch(`http://127.0.0.1:${ep}/health`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false);
    if (!up) await new Promise((ok) => setTimeout(ok, 500));
  }
  if (!up) { await stop(); return { error: `the stage's engine did not answer on ${ep}` }; }
  const { chromium } = await import("playwright");
  const ctx = await chromium.launchPersistentContext(join(run, "profile", "browser"), { headless: true, viewport: { width: 1280, height: 820 }, args: [`--remote-debugging-port=${cp}`] });
  stopAll.push(() => ctx.close());
  // the page dials the stage's engine and only it: the window's own pick says so before Sol's code runs, and any
  // request to another port on this machine (the Sol it runs beside) is refused
  await ctx.addInitScript((ws: string) => { try { localStorage.setItem("sol.engine.one", "1"); localStorage.setItem("sol.engine", `at:${ws}`); } catch { /* storage off */ } }, `ws://127.0.0.1:${ep}`);
  await ctx.route(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//, (r) => {
    const port = new URL(r.request().url()).port;
    return port === String(fp) || port === String(ep) ? r.continue() : r.abort();
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(`${face}/`, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
  const state = join(run, "browser.json");
  writeInGate(root, state, JSON.stringify({ cdp: `http://127.0.0.1:${cp}`, origin: face, shots: join(run, "shots") }) + "\n");
  writeInGate(root, join(root, ".sol-gate", "first-timer", "browser.json"), JSON.stringify({ cdp: `http://127.0.0.1:${cp}`, origin: face, shots: join(run, "shots") }) + "\n");
  return { url: face, env: { SOL_FT_STATE: state }, stop };
}

// ---- the test browser: the agent's one tool ----

type BrowserState = { cdp: string; origin: string; shots: string };
/** a `go` target (pure): a path on the stage's face only, never another place */
export function goTarget(origin: string, arg: string): string | null {
  const a = arg.trim();
  if (!/^[/?#]/.test(a) || a.startsWith("//")) return null;
  try { const u = new URL(a, origin); return u.origin === origin ? u.href : null; } catch { return null; }
}

export async function browse(verb: string, args: string[], root = ROOT): Promise<string> {
  const file = process.env.SOL_FT_STATE || join(root, ".sol-gate", "first-timer", "browser.json");
  let st: BrowserState;
  try { st = JSON.parse(readFileSync(file, "utf8")); } catch { return "no test browser is open (the first-timer opens it)"; }
  const { chromium } = await import("playwright");
  const b = await chromium.connectOverCDP(st.cdp, { timeout: 10_000 });
  try {
    const page = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(st.origin)) ?? b.contexts()[0]?.pages()[0];
    if (!page) return "the test browser has no page open";
    const settle = () => page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {}).then(() => page.waitForTimeout(600));
    const target = (t: string) => /^\d+$/.test(t) ? page.locator(`[data-ft="${t}"]`).first()
      : page.getByText(t, { exact: false }).or(page.getByLabel(t)).or(page.getByPlaceholder(t)).first();
    switch (verb) {
      case "look": {
        const r = await page.evaluate(() => {
          document.querySelectorAll("[data-ft]").forEach((e) => e.removeAttribute("data-ft"));
          const sel = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="menuitem"],[role="option"],[contenteditable="true"]';
          const items: string[] = [];
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            const box = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (box.width < 2 || box.height < 2 || cs.visibility === "hidden" || cs.display === "none") continue;
            const tag = el.tagName.toLowerCase();
            const name = (el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).placeholder || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80);
            el.setAttribute("data-ft", String(items.length + 1));
            items.push(`${items.length + 1}. ${el.getAttribute("role") ?? (tag === "input" || tag === "textarea" ? "a box to type in" : tag)}: ${name || "(no words)"}`);
            if (items.length >= 80) break;
          }
          return { title: document.title, text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, 4000), items };
        });
        return [`On screen (${r.title || "Sol"}):`, r.text || "(nothing written)", "", "What you can press or type in:", ...(r.items.length ? r.items : ["(nothing)"])].join("\n");
      }
      case "click": { const t = args.join(" "); if (!t) return "click what? a number from look, or the words on it"; await target(t).click({ timeout: 8000 }); await settle(); return `clicked "${t}"`; }
      case "type": {
        const [t, ...rest] = args;
        if (!t || !rest.length) return "type <number or words> <text>";
        await target(t).fill(rest.join(" "), { timeout: 8000 }); return `typed into "${t}"`;
      }
      case "press": { const k = args[0]; if (!k || !/^[A-Za-z0-9+]{1,30}$/.test(k)) return "press <key>, like Enter, Escape or Meta+K"; await page.keyboard.press(k); await settle(); return `pressed ${k}`; }
      case "go": { const u = goTarget(st.origin, args[0] ?? ""); if (!u) return "go takes a path on this page only, like /"; await page.goto(u, { timeout: 20_000 }); await settle(); return "went there"; }
      case "back": await page.goBack({ timeout: 10_000 }).catch(() => null); await settle(); return "went back";
      case "wait": { const s = Math.max(1, Math.min(30, Number(args[0]) || 2)); await page.waitForTimeout(s * 1000); return `waited ${s} s`; }
      case "shot": {
        const name = (args[0] ?? "shot").replace(/[^a-z0-9-]/gi, "-").slice(0, 40) || "shot";
        const f = join(st.shots, `${Date.now()}-${name}.png`);
        await page.screenshot({ path: f }); return `kept a picture for the Sol developers (${basename(f)})`;
      }
      default: return `the test browser knows: ${BROWSE_VERBS}`;
    }
  } catch (e) {
    return `that did not work: ${oneLine(String(e instanceof Error ? e.message : e), 200)}`;
  } finally { await b.close().catch(() => {}); }
}

/** the real deps at a checkout: its commit, the stage, Claude Code (or SOL_FIRST_TIMER_AGENT's stand-in); the morning
 *  run (morning.ts) uses the same */
export function realDeps(root: string, say: (l: string) => void): FirstTimerDeps {
  const browseCmd = `bash ${join(root, "sol", "first-timer")} browse`;
  const sha = () => new Promise<string>((ok) => execFile("git", ["rev-parse", "HEAD"], { cwd: root }, (_e, out) => ok(String(out ?? "").trim())));
  const stand = (process.env.SOL_FIRST_TIMER_AGENT ?? "").trim();
  return {
    root, sha, browse: browseCmd, say,
    stage: async () => makeStage(root, await sha()),
    agent: stand ? commandAgent(stand) : claudeAgent(root, browseCmd),
  };
}

// ---- run as a program: node dist/team/firsttimer.js [--persona <name>] [--feature fr-NN]... | browse <verb> [args] ----

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "browse") { console.log(await browse(argv[1] ?? "", argv.slice(2))); return 0; }
  const features: string[] = [];
  let persona: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--feature") { const f = argv[++i] ?? ""; if (!/^fr-\d{2,}$/.test(f)) { console.error("first-timer: --feature takes an id like fr-07"); return 2; } features.push(f); }
    else if (argv[i] === "--persona") { persona = (argv[++i] ?? "").toLowerCase(); if (!NAME.test(persona)) { console.error("first-timer: --persona takes a name from specs/personas"); return 2; } }
    else { console.error(`first-timer: unknown option ${argv[i]} (--persona <name>, --feature fr-NN)`); return 2; }
  }
  const r = await firstTimer(realDeps(ROOT, (l) => console.log(l)), { features, persona });
  console.log(`first-timer: ${r.runs.length} run${r.runs.length === 1 ? "" : "s"}, ${r.findings} finding${r.findings === 1 ? "" : "s"}${r.file ? ` · ${r.file}` : ""}`);
  return r.runs.some((x) => x.error) || r.sealBroken?.length ? 1 : 0;
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`first-timer: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
