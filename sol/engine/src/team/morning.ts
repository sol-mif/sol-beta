// The morning run (#485, dev cycle step 6): after the 9am release (release.ts) on the NucBox, the release is tried as
// Sol developers would want it tried before they start: the gate on it (bash sol/gate, #481, which it needs first:
// without the gate it stops with one line, nothing tried or posted), and the first-timer (firsttimer.ts) over the features the release touched. Then a short summary for Sol developers:
//   on disk    .sol-gate/morning/<tag>.json and .md, beside the gate's results (gitignored), on the machine it ran on
//   on GitHub  one comment on the open "Night digest" issue, "**Morning run**, <tag>: ...", counts and feature ids only,
//              never what the first-timer wrote (its words stay in the report on the machine): the live block in Cowork
//              (live.ts) reads the newest one
// Which features the release touched: the files changed since the release before it, each mapped to a feature by the
// map's `paths` (featuremap.ts until #480 lands). Once a release: a release that has its summary already is said and
// left (--again runs it anew). Started by sol-morning.timer (systemd/user), the release hour + 30 minutes, which is a
// "To turn on" step for the NucBox, by hand (sol/morning --install-timer); nothing here installs it.
// The comment on the Night digest is the only thing it writes anywhere but this machine.
// git, gh, the gate and the first-timer are deps, so the tests run it with none of them.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_TAG, firstLine, fetchAll, runnerOf } from "./release.js";
import { DIGEST_TITLE, type Rhythm } from "./tonight.js";
import type { Run } from "./night.js";
// TO BE REPLACED by ./features.js (#480) once it lands: the same names
import { featureIn, readFeatures } from "./featuremap.js";
import { firstTimer, realDeps, writeInGate, featuresSnapshot, sealBroken, type Report } from "./firsttimer.js";

/** what the gate said, kept to what the summary needs (CONTRACTS: `bash sol/gate --json`) */
export type Gate = { here: false } | { here: true; green: boolean; failed: string[]; evalsFailed: { feature: string; id: string }[]; error?: string };
export type Morning = {
  tag: string; sha: string; prev: string; ran: string; at: string;
  features: { id: string; name: string; files: number }[]; unmapped: number;
  gate: Gate;
  firstTimer: { runs: number; findings: number; stuck: number; byFeature: { id: string; runs: number; findings: number; stuck: number }[]; skipped: string[]; file?: string } | null;
  note?: string;
};
export type MorningDeps = {
  root: string;
  git: (args: string[]) => Promise<Run>;
  gh: (args: string[]) => Promise<string>;
  now: () => Date;
  dryRun: boolean;
  say: (line: string) => void;
  gate: () => Promise<Gate>;
  /** is the gate here (sol/gate, #481)? Asked first: without it the run stops before it tries or posts anything */
  gateHere?: () => boolean;
  firstTimer: (features: string[]) => Promise<Report & { skipped: string[] }>;
  write?: (file: string, text: string) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

// ---- pure ----

/** the timer's OnCalendar (pure): the release hour + `after` minutes, in the rhythm's zone; a release at 23:45 runs
 *  its morning just after midnight */
export function morningCalendar(r: Pick<Rhythm, "release" | "zone">, after = 30): string {
  const [h, m] = r.release.split(":").map(Number);
  const t = ((h * 60 + m + after) % 1440 + 1440) % 1440;
  return `*-*-* ${pad(Math.floor(t / 60))}:${pad(t % 60)}:00${r.zone ? ` ${r.zone}` : ""}`;
}

/** the gate's --json answer kept to what the summary needs (pure); a broken answer is a red gate that says so */
export function gateOf(code: number, out: string): Gate {
  const at = out.lastIndexOf("\n{");
  let j: any = null;
  try { j = JSON.parse(at >= 0 ? out.slice(at + 1) : out.trim()); } catch { /* below */ }
  if (!j || typeof j !== "object") return { here: true, green: false, failed: [], evalsFailed: [], error: `the gate gave no result (exit ${code})` };
  const steps = Array.isArray(j.steps) ? j.steps : [], evals = Array.isArray(j.evals) ? j.evals : [];
  const word = (x: unknown) => (typeof x === "string" ? x.replace(/[^\w .:/-]/g, "").slice(0, 60) : "");
  return {
    here: true, green: j.green === true && code === 0,
    failed: steps.filter((s: any) => s && s.ok === false).map((s: any) => word(s.name)).filter(Boolean).slice(0, 20),
    evalsFailed: evals.filter((e: any) => e && e.ok === false && /^fr-\d{2,}$/.test(e.feature) && /^[A-Z]\d+$/.test(e.id)).map((e: any) => ({ feature: e.feature, id: e.id })).slice(0, 50),
  };
}

/** the features a list of changed files touches (pure over the map): each once, with how many of its files changed;
 *  the files no feature claims, counted */
export function touched(features: ReturnType<typeof readFeatures>, files: string[]): { features: Morning["features"]; unmapped: number } {
  const by = new Map<string, Morning["features"][number]>();
  let unmapped = 0;
  for (const f of files) {
    const x = featureIn(features, f);
    if (!x) { unmapped++; continue; }
    const t = by.get(x.id) ?? { id: x.id, name: x.name, files: 0 };
    t.files++;
    by.set(x.id, t);
  }
  return { features: [...by.values()].sort((a, b) => a.id.localeCompare(b.id)), unmapped };
}

/** what the run says and does when the gate is not here (#481 brings bash sol/gate): it stops, nothing tried or posted */
export const NO_GATE = "the gate (bash sol/gate) is not here yet: it comes with #481 (branch marco/product-dev-cycle-3-481), and the morning run needs it first; nothing was tried or posted";

const gateWords = (g: Gate) => !g.here ? "gate not here yet (#481)"
  : g.error ? `gate red: ${g.error}`
  : g.green ? "gate green" : `gate red${g.failed.length ? ` (${g.failed.join(", ")})` : ""}${g.evalsFailed.length ? `, ${g.evalsFailed.length} eval${g.evalsFailed.length === 1 ? "" : "s"} failing` : ""}`;
const ftWords = (f: Morning["firstTimer"]) => !f ? "first-timer: nothing to try"
  : `first-timer ${f.runs} run${f.runs === 1 ? "" : "s"}, ${f.findings} finding${f.findings === 1 ? "" : "s"}${f.stuck ? `, stuck ${f.stuck} time${f.stuck === 1 ? "" : "s"}` : ""}`;

/** the summary's first line (pure): what the live block shows */
export const headOf = (m: Morning) => `**Morning run**, ${m.tag}: ${gateWords(m.gate)} · ${ftWords(m.firstTimer)} · ${m.features.length} feature${m.features.length === 1 ? "" : "s"} touched`;

/** the comment for the Night digest (pure): counts and feature ids only, never the first-timer's words */
export function commentOf(m: Morning, host: string): string {
  const lines = [headOf(m), ""];
  if (m.features.length) {
    lines.push("| feature | files | first-timer | evals failing |", "|---|---|---|---|");
    for (const f of m.features) {
      const ft = m.firstTimer?.byFeature.find((x) => x.id === f.id);
      const ev = m.gate.here ? m.gate.evalsFailed.filter((e) => e.feature === f.id).map((e) => e.id).join(" ") : "";
      lines.push(`| ${f.id} ${f.name.replace(/[|\n]/g, " ").slice(0, 60)} | ${f.files} | ${ft ? `${ft.runs} run${ft.runs === 1 ? "" : "s"}, ${ft.findings} finding${ft.findings === 1 ? "" : "s"}${ft.stuck ? `, ${ft.stuck} stuck` : ""}` : "not tried"} | ${ev || "none"} |`);
    }
    lines.push("");
  }
  if (m.unmapped) lines.push(`${m.unmapped} changed file${m.unmapped === 1 ? "" : "s"} belong to no feature yet (specs/features.json).`);
  if (m.note) lines.push(m.note);
  lines.push(`Since ${m.prev || "the start"}; ran on ${m.ran.slice(0, 7)}. What the first-timer wrote stays on ${host} in .sol-gate/morning/${m.tag}.md.`, "", "— the morning run (sol/morning)");
  return lines.join("\n");
}

/** the summary for Sol developers on the machine (pure): the comment's counts and the first-timer's own words */
export function summaryOf(m: Morning, report: Report | null): string {
  const out = [`# Morning run, ${m.tag}`, "", headOf(m).replace(/\*\*/g, ""), ""];
  if (m.note) out.push(m.note, "");
  out.push("## Features the release touched", "");
  out.push(...(m.features.length ? m.features.map((f) => `- ${f.id} ${f.name}: ${f.files} file${f.files === 1 ? "" : "s"}`) : ["- none the map knows"]));
  if (m.unmapped) out.push(`- ${m.unmapped} file${m.unmapped === 1 ? "" : "s"} no feature claims`);
  out.push("", "## The gate", "", gateWords(m.gate));
  if (m.gate.here) for (const e of m.gate.evalsFailed) out.push(`- ${e.feature} ${e.id} fails`);
  out.push("", "## The first-timer", "");
  if (!report || !report.runs.length) out.push("Nothing was tried.");
  for (const r of report?.runs ?? []) {
    out.push(`### ${r.feature} ${r.name}, as ${r.persona}`, "");
    if (r.error) out.push(`Not run: ${r.error}`, "");
    for (const t of r.tried) out.push(`- ${t.way} ${t.result}: ${t.line}`);
    for (const f of r.findings) out.push(`- found (${f.way}): ${f.what}`);
    if (r.summary) out.push("", `> ${r.summary}`);
    out.push("");
  }
  for (const s of m.firstTimer?.skipped ?? []) out.push(`- skipped: ${s}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export const morningFile = (root: string, tag: string, ext: "json" | "md") => join(root, ".sol-gate", "morning", `${tag}.${ext}`);

// ---- the run ----

export type MorningOpts = { repo: string; tag?: string; again?: boolean };

/** the morning run over a release (the newest dev release when none is named); never throws */
export async function morning(d: MorningDeps, o: MorningOpts): Promise<{ ok: true; morning: Morning; posted?: number; already?: true } | { error: string }> {
  if (d.gateHere && !d.gateHere()) return { error: NO_GATE };
  // the seal's first look, before anything runs (the fetch, the gate, the first-timer): any change after it fails the run
  const sealed = featuresSnapshot(d.root);
  const fetched = await fetchAll(d, o.repo);
  if (fetched) d.say(`morning: ${fetched} (going on with what is here)`);
  const list = await d.git(["for-each-ref", "--sort=-creatordate", "--format=%(refname:short)%09%(*objectname)%09%(objectname)", "refs/tags/dev-*"]);
  const tags = (list.code === 0 ? list.out : "").split("\n").map((l) => l.trim().split("\t")).filter((x) => x.length === 3 && DEV_TAG.test(x[0])).map(([tag, p, obj]) => ({ tag, sha: p || obj }));
  if (o.tag && !DEV_TAG.test(o.tag)) return { error: `${o.tag} is not a dev release (a dev-* tag)` };
  const i = o.tag ? tags.findIndex((t) => t.tag === o.tag) : 0;
  if (!tags.length || i < 0) return { error: o.tag ? `${o.tag} is not a dev release here` : "there is no dev release yet" };
  const rel = tags[i], prev = tags[i + 1];
  const json = morningFile(d.root, rel.tag, "json");
  if (!o.again && existsSync(json)) { d.say(`morning: ${rel.tag} has its morning run already (${json}); --again runs it anew`); return { ok: true, already: true, morning: JSON.parse(readFileSync(json, "utf8")) as Morning }; }

  const head = await d.git(["rev-parse", "HEAD"]);
  const ran = head.code === 0 ? head.out.trim() : "";
  const note = ran && ran !== rel.sha ? `This checkout is at ${ran.slice(0, 7)}, not at the release (${rel.sha.slice(0, 7)}): the gate and the first-timer tried ${ran.slice(0, 7)}.` : undefined;
  const diff = prev ? await d.git(["diff", "--name-only", `${prev.sha}..${rel.sha}`]) : { code: 0, out: "" };
  const files = diff.code === 0 ? diff.out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const { features, unmapped } = touched(readFeatures(d.root), files);
  d.say(`morning: ${rel.tag} (${rel.sha.slice(0, 7)}), since ${prev?.tag ?? "the start"}: ${files.length} file${files.length === 1 ? "" : "s"}, ${features.length} feature${features.length === 1 ? "" : "s"} (${features.map((f) => f.id).join(", ") || "none"})`);

  const gate = await d.gate().catch((e): Gate => ({ here: true, green: false, failed: [], evalsFailed: [], error: firstLine(String(e)) }));
  if (!gate.here) return { error: NO_GATE };
  d.say(`morning: ${gateWords(gate)}`);
  let report: (Report & { skipped: string[] }) | null = null;
  if (features.length) report = await d.firstTimer(features.map((f) => f.id)).catch((e) => { d.say(`morning: the first-timer did not run: ${firstLine(String(e))}`); return null; });
  const ft: Morning["firstTimer"] = report ? {
    runs: report.runs.length, findings: report.findings,
    stuck: report.runs.reduce((n, r) => n + r.tried.filter((t) => t.result === "stuck").length, 0),
    byFeature: features.map((f) => {
      const rs = report!.runs.filter((r) => r.feature === f.id);
      return { id: f.id, runs: rs.length, findings: rs.reduce((n, r) => n + r.findings.length, 0), stuck: rs.reduce((n, r) => n + r.tried.filter((t) => t.result === "stuck").length, 0) };
    }).filter((x) => x.runs),
    skipped: report.skipped, ...(report.file ? { file: report.file } : {}),
  } : null;
  const m: Morning = { tag: rel.tag, sha: rel.sha, prev: prev?.tag ?? "", ran, at: d.now().toISOString(), features, unmapped, gate, firstTimer: ft, ...(note ? { note } : {}) };

  const write = d.write ?? ((f: string, t: string) => writeInGate(d.root, f, t));
  if (!d.dryRun) {
    try { write(json, JSON.stringify(m, null, 2) + "\n"); write(morningFile(d.root, rel.tag, "md"), summaryOf(m, report)); }
    catch (e) { d.say(`morning: the summary was not written: ${firstLine(String(e))}`); }
  }
  // the seal, after every write of the run: any change under specs/features/ (or the first-timer saying so) and
  // nothing is posted; the summary kept here is taken back, so the next run does not say "already"
  const broken = [...new Set([...(report?.sealBroken ?? []), ...sealBroken(sealed, featuresSnapshot(d.root))])].sort();
  if (broken.length) {
    if (!d.dryRun) try { rmSync(json, { force: true }); } catch { /* the error below says what to do */ }
    return { error: `the run changed ${broken.join(", ")}: the features' files are sealed, so nothing was posted (put them back by hand, then run it again)` };
  }
  const body = commentOf(m, hostname().replace(/\.local$/, ""));
  let posted: number | undefined;
  try {
    const found = JSON.parse(await d.gh(["issue", "list", "--repo", o.repo, "--state", "open", "--search", `"${DIGEST_TITLE}" in:title`, "--json", "number,title", "--limit", "5"]) || "[]") as { number: number; title?: string }[];
    const n = found.find((x) => String(x.title ?? "").trim() === DIGEST_TITLE)?.number;
    if (!n) d.say(`morning: no open "${DIGEST_TITLE}" issue to post on (the night job opens it); the summary is on this machine`);
    else if (d.dryRun) d.say(`morning: would post on #${n}:\n${body.replace(/^/gm, "    ")}`);
    else { await d.gh(["issue", "comment", String(n), "--repo", o.repo, "--body", body]); posted = n; d.say(`morning: posted on #${n}`); }
  } catch (e) { d.say(`morning: not posted: ${firstLine(String(e))}`); }
  return { ok: true, morning: m, ...(posted ? { posted } : {}) };
}

// ---- reading it back: the newest "**Morning run**" comment, in live.ts (the live block reads it in the engine, which
// never loads this file or the first-timer) ----
export { morningOf, type MorningSeen } from "./live.js";

// ---- run as a program: node dist/team/morning.js [--dry-run] [--tag dev-YYYYMMDD] [--again] [--calendar] [--repo owner/name] ----

/** the gate as a program: `bash sol/gate --json` at the checkout, an hour at most; not here yet is said, not an error */
export function runGate(root: string): () => Promise<Gate> {
  return () => new Promise((ok) => {
    const gate = join(root, "sol", "gate");
    if (!existsSync(gate)) { ok({ here: false }); return; }
    execFile("bash", [gate, "--json"], { cwd: root, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, out) => ok(gateOf(err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0, String(out ?? ""))));
  });
}

async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "morning");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { root, git, gh, repo, rhythm, stop } = r0;
  try {
    if (argv.includes("--calendar")) { process.stdout.write(`${morningCalendar(rhythm)}\n`); return 0; }
    const t = argv.indexOf("--tag");
    const tag = t >= 0 ? argv[t + 1] ?? "" : undefined;
    const dryRun = argv.includes("--dry-run");
    const say = (l: string) => console.log(l);
    console.log(`morning${dryRun ? " (dry run: nothing is posted, and no summary kept; the first-timer still runs and keeps its report in .sol-gate/)" : ""}, ${new Date().toISOString()}, ${repo}`);
    const r = await morning({
      root, git, gh, now: () => new Date(), dryRun, say,
      gate: runGate(root),
      gateHere: () => existsSync(join(root, "sol", "gate")),
      firstTimer: (features) => firstTimer(realDeps(root, say), { features }),
    }, { repo, ...(tag !== undefined ? { tag } : {}), again: argv.includes("--again") });
    if ("error" in r) { console.error(`morning: ${r.error}`); return 1; }
    console.log(headOf(r.morning).replace(/\*\*/g, ""));
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`morning: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
