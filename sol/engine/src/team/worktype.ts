// Types of work (#480, dev cycle step 2, the dev cycle PRD §3.10): every sol-dev PR is one of three, set by an agent:
//   internal   how Sol developers build Sol (the nights, the locks, CI, the team files)
//   product    the app, what Sol users get
//   marketing  getting Sol to people (the site, posts, Sol tester outreach)
// It is the title's first word ("internal: ...") and a label, `type:internal`, `type:product` or `type:marketing`: never
// the bare word, which would clash with the area label `product` (features.ts TYPE_PREFIX). Area labels (base, life,
// work, cowork, social) are never touched here, and neither are the issue types (bug, task, decision).
// The type comes from the files the PR changes: each file is its feature's type (specs/features.json, features.ts),
// else a path rule below, else product under sol/ and internal outside it. Files that every kind of PR touches (now.md,
// the README, PROTOCOL, the glossary, tests, lock files) count only when nothing else does. The most files win; a tie
// goes product, then marketing, then internal. `bash sol/worktype <pr>` sets it on one PR (label, title); the nightly
// re-sort (resort.ts, `bash sol/features --resort`) sets it on every PR of the day and leaves an undo line.
// Pure but for the CLI at the end, which asks GitHub through gh.
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { featureIn, readFeatures, TYPES, typeLabel, typeOfLabel, type Feature, type WorkType } from "./features.js";
import { quietGh } from "../quiet.js";

export { TYPES, typeLabel, typeOfLabel, type WorkType };
const RULES: [RegExp, WorkType][] = [
  [/^site\//, "marketing"], [/^sol\/design\/website\//, "marketing"], [/^docs\/(marketing|beta\/launch)/, "marketing"],
  [/^(\.github|\.claude|specs|docs)\//, "internal"], [/^(CONTRIBUTING|CLAUDE|AGENTS|README)\.md$/, "internal"],
  [/^sol\/(take|brief|harness|release|night|catchup|features|worktype|gate|rulesets|reviews|buttons|mine|promote|live-setup)(\/|$)/, "internal"],
];
export const SHARED = [/^now\.md$/, /^sol\/(README|PROTOCOL|HELP)\.md$/, /^GLOSSARY\.md$/, /(^|\/)package-lock\.json$/, /(^|\/)test\//, /\.test\.tsx?$/];

/** one file's type of work (pure), and the feature that said so when one did */
export function typeOfFile(features: Feature[], path: string): { type: WorkType; feature?: Feature } {
  const f = featureIn(features, path);
  if (f) return { type: f.type, feature: f };
  for (const [re, t] of RULES) if (re.test(path)) return { type: t };
  return { type: path.startsWith("sol/") ? "product" : "internal" };
}

/** a PR's type of work from its files (pure): the type most of its files are, and why in a few words */
export function typeOfWork(features: Feature[], files: string[]): { type: WorkType; why: string; features: string[] } {
  const own = files.filter((p) => !SHARED.some((re) => re.test(p)));
  const counted = (own.length ? own : files).map((p) => typeOfFile(features, p));
  if (!counted.length) return { type: "internal", why: "no files", features: [] };
  const n: Record<WorkType, number> = { product: 0, marketing: 0, internal: 0 };
  for (const c of counted) n[c.type]++;
  const type = (["product", "marketing", "internal"] as WorkType[]).reduce((a, b) => (n[b] > n[a] ? b : a));
  const ids = [...new Set(counted.flatMap((c) => (c.feature ? [c.feature.id] : [])))];
  const names = [...new Set(counted.flatMap((c) => (c.feature && c.type === type ? [c.feature.name] : [])))].slice(0, 3);
  return { type, why: `${n[type]} of ${counted.length} file${counted.length === 1 ? "" : "s"} ${type}${names.length ? ` (${names.join(", ")})` : ""}`, features: ids };
}

const PREFIX = new RegExp(`^(${TYPES.join("|")})\\s*:\\s*`, "i");
/** a title with the type as its first word, any old type word taken off first (pure) */
export const titled = (title: string, type: WorkType) => `${type}: ${title.replace(PREFIX, "").trim()}`;
/** the type labels a PR wears (pure), `type:` and all */
export const typeLabelsOf = (labels: string[]) => labels.filter((l) => !!typeOfLabel(l));
/** the type a PR says it is now (pure): its one type label, else its title's first word, else none */
export function typeSaid(pr: { title: string; labels: string[] }): WorkType | "" {
  const l = typeLabelsOf(pr.labels);
  if (l.length === 1) return typeOfLabel(l[0]);
  const m = PREFIX.exec(pr.title);
  return m ? (m[1].toLowerCase() as WorkType) : "";
}

/** what one PR becomes (pure): its type, the type label to add, the other type labels to take off, its new title; null
 *  when its label and title already say the type. Only `type:` labels are ever added or taken off */
export function moveOf(pr: { number: number; title: string; labels: string[] }, type: WorkType): { type: WorkType; add: string; remove: string[]; title: string } | null {
  const add = typeLabel(type), remove = typeLabelsOf(pr.labels).filter((l) => l !== add);
  const title = titled(pr.title, type);
  if (!remove.length && pr.labels.includes(add) && title === pr.title) return null;
  return { type, add, remove, title };
}

export type Gh = (args: string[]) => Promise<string>;
export type PrFacts = { number: number; title: string; labels: string[]; files: string[] };
/** a PR's title, labels and files, as gh says them */
export async function prFacts(gh: Gh, pr: number, repo?: string): Promise<PrFacts> {
  const j = JSON.parse(await gh(["pr", "view", String(pr), ...(repo ? ["-R", repo] : []), "--json", "number,title,labels,files"]));
  return { number: j.number, title: String(j.title ?? ""), labels: (j.labels ?? []).map((l: { name: string }) => l.name), files: (j.files ?? []).map((f: { path: string }) => f.path) };
}
/** set a PR's label and title to a type (one gh call); the `type:` labels must exist on GitHub ("To turn on" in #480's PR) */
export async function applyType(gh: Gh, pr: number, move: { add: string; remove: string[]; title: string }, repo?: string) {
  try { await gh(["pr", "edit", String(pr), ...(repo ? ["-R", repo] : []), "--title", move.title, "--add-label", move.add, ...move.remove.flatMap((l) => ["--remove-label", l])]); }
  catch (e) { throw new Error(missingLabel(e, move.add)); }
}
/** gh's refusal in words: a type label not on GitHub yet says how to make it (pure) */
export function missingLabel(e: unknown, label: string): string {
  const w = String((e as Error)?.message ?? e).split("\n")[0];
  return /not found/i.test(w) && w.includes(label) ? `the label ${label} is not on GitHub yet: make the three type labels first ("To turn on" in #480's PR)` : w;
}

export const runGh: Gh = (args) => new Promise((ok, no) => {
  quietGh(args);   // a quiet Sol writes nothing to GitHub (#1293); a read goes
  execFile("gh", args, { maxBuffer: 16 << 20, timeout: 60_000 }, (e, out, err) => (e ? no(new Error(String(err || e.message).trim())) : ok(out)));
});
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// `bash sol/worktype <pr> [--dry-run]`: one PR's type of work, set on GitHub, and why
async function main(argv: string[]): Promise<number> {
  const n = Number((argv.find((a) => /^#?\d+$/.test(a)) ?? "").replace("#", ""));
  if (!n) { console.error("worktype: which PR? bash sol/worktype <pr-number> [--dry-run]"); return 2; }
  const pr = await prFacts(runGh, n);
  const t = typeOfWork(readFeatures(REPO_ROOT), pr.files);
  const move = moveOf(pr, t.type);
  if (!move) { console.log(`#${n} is ${t.type} already (${t.why})`); return 0; }
  if (!argv.includes("--dry-run")) await applyType(runGh, n, move);
  console.log(`#${n} ${argv.includes("--dry-run") ? "would be" : "is now"} ${t.type}: ${t.why}${move.title !== pr.title ? ` · title "${move.title}"` : ""}`);
  return 0;
}
const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`worktype: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
