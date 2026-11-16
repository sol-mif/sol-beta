// CODEOWNERS written from the project's ownership table (#438, F1 of #413). The table, `owners` in the project's
// settings (`.sol/project.json` in its record, project.ts, #428), is the one home of who leads each area: an area's
// label → one or two leads. `.github/CODEOWNERS` in the code repository is written from it and never edited by hand
// for people: a change of leads is a proposal in Cowork's project settings, agreed by the leads it moves.
//   paths    the table holds no paths. CODEOWNERS keeps them, as it always has: a `# label x:` line opens area x's
//            section, its path lines are what x holds, and paths change only by a PR (how Sol works). Writing the file
//            from the table replaces the owners on a section's lines and nothing else; a write that would move a path
//            is refused. An area of the table with no section yet gets one at the end with a `# leads:` line (no paths
//            until a PR gives it some); a section whose area the table leaves out keeps its paths with no owner.
//   landing  never on main straight: the Sol that applied the agreed change writes the file on the branch
//            `sol-settings/codeowners` and opens (or refreshes) one PR, "Sol-Setting: owners"; the release runner
//            (sol/release, the NucBox) merges it before the morning's release once its checks are green and it still
//            says what the table says. It replaces the owner's press that wrote straight to main (press.ts, #117).
//            That merge is an ordinary one under main's ruleset (#439/#460: a PR, the required checks green, no bypass
//            for anyone): it merges only when every check on the PR passed, so it never needs a bypass. In the
//            morning's run it comes first, then the dev release, then the beta pass (#419).
//   the check  `differ`: the areas whose leads in CODEOWNERS are not the table's. The board and the routing read the
//            leads off CODEOWNERS (leads.ts), so the two must agree; ci.yml runs `--check` on every PR.
// CODEOWNERS only routes and informs here: GitHub asks the leads for a review, nothing requires their approval (#413,
// no required approvals). A second read of the core is .github/CORE's rule (#259), not this file's.
// Pure but for landOwners and mergeOwners, whose GitHub is a dep (the tests fake it).
import { realpathSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CODEOWNERS = ".github/CODEOWNERS";
export const SETTINGS_BRANCH = "sol-settings/codeowners";
export const SETTING_TRAILER = "Sol-Setting: owners";
export type Table = Record<string, string[]>;

const HEAD = /^#\s*label\s+([a-z0-9][a-z0-9._-]*)\s*:/i;
const LEADS_LINE = /^(\s*#\s*leads\s*:)(.*)$/i;
const AREA_WORD = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const COLUMN = 29;   // the file's owners start at column 30
const at = (l: string[]) => l.map((x) => `@${x}`).join(" ");
const low = (s: string) => s.toLowerCase();

type Line = { kind: "head"; area: string } | { kind: "leads"; area: string } | { kind: "path"; area: string; paths: string; gap: string; owners: string[] } | { kind: "other" };

/** each line of CODEOWNERS, told apart (pure): a section's head, its `# leads:` line, its path lines (the paths as
 *  written, the gap, the owners); everything else as it is */
function linesOf(text: string): { raw: string; line: Line }[] {
  let area = "";
  return String(text ?? "").split("\n").map((raw) => {
    const t = raw.trim();
    const head = HEAD.exec(t);
    if (head) { area = head[1].toLowerCase(); return { raw, line: { kind: "head", area } }; }
    if (!area || !t) return { raw, line: { kind: "other" } };
    if (LEADS_LINE.test(raw)) return { raw, line: { kind: "leads", area } };
    if (t.startsWith("#")) return { raw, line: { kind: "other" } };
    const m = /^(.*?\S)(?:(\s+)(@\S+(?:\s+@\S+)*))?\s*$/.exec(raw);   // the paths, then only owners to the end
    if (!m) return { raw, line: { kind: "other" } };
    if (/(^|\s)@/.test(m[1])) return { raw, line: { kind: "other" } };   // an owner between paths: not a line this writes
    return { raw, line: { kind: "path", area, paths: m[1], gap: m[2] ?? "", owners: m[3] ? m[3].split(/\s+/) : [] } };
  });
}

/** who leads each area as CODEOWNERS says it (pure): the @owners on its path lines and its `# leads:` line, in order,
 *  once each, without the @, people only (a team, @org/x, never), two at most. Every section is in it, even one with
 *  no lead */
export function tableOf(text: string): Table {
  const out: Table = {};
  for (const { raw, line } of linesOf(text)) {
    if (line.kind === "other") continue;
    const l = (out[line.area] ??= []);
    const toks = line.kind === "leads" ? raw.replace(/^\s*#\s*leads\s*:/i, "").trim().split(/\s+/) : line.kind === "path" ? line.owners : [];
    for (const tok of toks) {
      const who = tok.replace(/^@/, "");
      if (tok.startsWith("@") && LOGIN.test(who) && l.length < 2 && !l.some((x) => low(x) === low(who))) l.push(who);
    }
  }
  return out;
}

/** what each area holds (pure): its path lines' paths, in order */
export function pathsOf(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { line } of linesOf(text)) if (line.kind === "path") (out[line.area] ??= []).push(...line.paths.split(/\s+/));
  return out;
}

/** CODEOWNERS as the table says it (pure): every section's owners are the table's leads for its area (none when the
 *  table leaves it out), on each path line and its `# leads:` line; a section with neither gets a `# leads:` line
 *  under its head; an area with no section gets one at the end. Paths and every other line stay as they are. Areas
 *  whose name cannot be a label (a space in it) are `skipped`. Throws if a path would move (it never should) */
export function writeCodeowners(text: string, table: Table): { text: string; added: string[]; skipped: string[] } {
  const want: Table = {}, skipped: string[] = [];
  for (const [k, v] of Object.entries(table ?? {})) {
    const area = low(String(k).trim());
    if (!AREA_WORD.test(area)) { skipped.push(k); continue; }
    want[area] = (Array.isArray(v) ? v : []).map((x) => String(x).trim().replace(/^@/, "")).filter((x) => LOGIN.test(x)).slice(0, 2);
  }
  const lines = linesOf(text);
  const carries = new Set(lines.flatMap(({ line }) => (line.kind === "leads" || line.kind === "path" ? [line.area] : [])));
  const out: string[] = [];
  for (const { raw, line } of lines) {
    if (line.kind === "head") {
      out.push(raw);
      if (!carries.has(line.area) && want[line.area]?.length) { out.push(`# leads: ${at(want[line.area])}`); carries.add(line.area); }
      continue;
    }
    if (line.kind === "leads") { const l = want[line.area] ?? []; out.push(raw.replace(LEADS_LINE, (_, h: string) => (l.length ? `${h} ${at(l)}` : h))); continue; }
    if (line.kind === "path") {
      const l = want[line.area] ?? [];
      out.push(l.length ? `${line.paths}${line.gap || " ".repeat(Math.max(2, COLUMN - line.paths.length))}${at(l)}` : line.paths);
      continue;
    }
    out.push(raw);
  }
  const have = new Set(lines.flatMap(({ line }) => (line.kind === "head" ? [line.area] : [])));
  const added = Object.keys(want).filter((a) => !have.has(a) && want[a].length).sort();
  if (added.length) {
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    for (const a of added) out.push("", `# label ${a}: from the project's settings; no paths yet (paths come by a PR).`, `# leads: ${at(want[a])}`);
    out.push("");
  }
  const next = out.join("\n");
  // a setting moves people, never paths: what each area held must read exactly as before
  if (JSON.stringify(pathsOf(next)) !== JSON.stringify(pathsOf(text))) throw new Error("the paths would move; only a PR changes what an area holds");
  return { text: next, added, skipped };
}

export type Differ = { area: string; codeowners: string[]; table: string[] };
/** the areas whose leads in CODEOWNERS are not the table's (pure), as sets of logins (case and order do not count).
 *  Areas whose name cannot be a label are left out (writeCodeowners skips them too) */
export function differ(text: string, table: Table): Differ[] {
  const have = tableOf(text), out: Differ[] = [];
  const want: Table = {};
  for (const [k, v] of Object.entries(table ?? {})) if (AREA_WORD.test(low(k.trim()))) want[low(k.trim())] = Array.isArray(v) ? v.map(String) : [];
  for (const area of [...new Set([...Object.keys(have), ...Object.keys(want)])].sort()) {
    const a = have[area] ?? [], b = want[area] ?? [];
    const key = (l: string[]) => [...new Set(l.map(low))].sort().join(" ");
    if (key(a) !== key(b)) out.push({ area, codeowners: a, table: b });
  }
  return out;
}

/** the check's words (pure): one line an area, or none */
export const differLines = (d: Differ[]) => d.map((x) => `${x.area}: CODEOWNERS says ${x.codeowners.length ? at(x.codeowners) : "nobody"}, the project's owners say ${x.table.length ? at(x.table) : "nobody"}`);

// ---- landing it: a PR, never main ----

export type LandDeps = { gh: (args: string[]) => Promise<string> };
export type Landed =
  | { ok: true; unchanged: true; closed?: number }
  | { ok: true; pr: number; url: string; opened: boolean; same?: true }
  | { error: string };
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const why = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200);
const b64 = (s: string) => Buffer.from(s).toString("base64");
const unb64 = (s: string) => Buffer.from(String(s ?? ""), "base64").toString("utf8");

async function defaultBranch(d: LandDeps, repo: string) { return (await d.gh(["api", `repos/${repo}`, "--jq", ".default_branch"])).trim() || "main"; }
async function fileAt(d: LandDeps, repo: string, ref: string): Promise<{ text: string; sha: string } | null> {
  try {
    const j = JSON.parse(await d.gh(["api", `repos/${repo}/contents/${CODEOWNERS}?ref=${encodeURIComponent(ref)}`, "--jq", "{sha: .sha, content: .content}"]));
    return { text: unb64(j.content), sha: String(j.sha ?? "") };
  } catch (e) { if (/404|not found/i.test(why(e))) return null; throw e; }
}
/** the open settings PR, if there is one: its number and link */
async function openPr(d: LandDeps, repo: string, base: string): Promise<{ number: number; url: string } | null> {
  const owner = repo.split("/")[0];
  const list = JSON.parse(await d.gh(["api", `repos/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&head=${encodeURIComponent(`${owner}:${SETTINGS_BRANCH}`)}`, "--jq", "[.[] | {number, url: .html_url}]"]) || "[]");
  return Array.isArray(list) && list[0] ? { number: Number(list[0].number), url: String(list[0].url ?? "") } : null;
}

export function prBody(table: Table, d: Differ[], note?: { proposal?: string; by?: string }): string {
  return [
    "The project's owners, as agreed in Cowork's project settings (`.sol/project.json` in the project's record), written into `.github/CODEOWNERS` (#438). Only owners change; the paths stay as they are.",
    "",
    ...(d.length ? differLines(d).map((l) => `- ${l}`) : ["- nothing differs any more"]),
    "",
    note?.proposal ? `Agreed as proposal ${note.proposal}${note.by ? `, asked by ${note.by}` : ""}.` : "Written from the table as it stands.",
    "The release runner merges this into main before the morning's release once its checks are green. Nothing to review by hand: the leads it names agreed already.",
    "",
    SETTING_TRAILER,
  ].join("\n");
}

/** CODEOWNERS written from the table on the settings branch, and its one PR opened or refreshed. Main is never written:
 *  the branch starts from main's head each time. When main already says what the table says, an open settings PR is
 *  closed and nothing else happens */
export async function landOwners(d: LandDeps, repo: string, table: Table, note?: { proposal?: string; by?: string }): Promise<Landed> {
  if (!REPO.test(repo)) return { error: `${repo || "that"} is not a GitHub repository` };
  try {
    const base = await defaultBranch(d, repo);
    const main = await fileAt(d, repo, base);
    if (!main) return { error: `${repo} has no ${CODEOWNERS} on ${base}; its sections (the areas and their paths) come by a PR first` };
    const next = writeCodeowners(main.text, table).text;
    const pr = await openPr(d, repo, base);
    if (next === main.text) {
      if (pr) await d.gh(["api", "-X", "PATCH", `repos/${repo}/pulls/${pr.number}`, "-f", "state=closed"]).catch(() => "");
      return { ok: true, unchanged: true, ...(pr ? { closed: pr.number } : {}) };
    }
    if (pr) {   // the PR says it already: nothing to write
      const there = await fileAt(d, repo, SETTINGS_BRANCH).catch(() => null);
      if (there?.text === next) return { ok: true, pr: pr.number, url: pr.url, opened: false, same: true };
    }
    const head = (await d.gh(["api", `repos/${repo}/git/ref/heads/${base}`, "--jq", ".object.sha"])).trim();
    if (!/^[0-9a-f]{40}$/.test(head)) return { error: `couldn't read ${base}'s head` };
    try { await d.gh(["api", "-X", "PATCH", `repos/${repo}/git/refs/heads/${SETTINGS_BRANCH}`, "-f", `sha=${head}`, "-F", "force=true"]); }
    catch { await d.gh(["api", "-X", "POST", `repos/${repo}/git/refs`, "-f", `ref=refs/heads/${SETTINGS_BRANCH}`, "-f", `sha=${head}`]); }
    const diff = differ(main.text, table);
    const message = [`settings: CODEOWNERS from the project's owners`, "", ...differLines(diff), "", SETTING_TRAILER].join("\n");
    await d.gh(["api", "-X", "PUT", `repos/${repo}/contents/${CODEOWNERS}`, "-f", `message=${message}`, "-f", `content=${b64(next)}`, "-f", `sha=${main.sha}`, "-f", `branch=${SETTINGS_BRANCH}`]);
    if (pr) {
      await d.gh(["api", "-X", "PATCH", `repos/${repo}/pulls/${pr.number}`, "-f", `body=${prBody(table, diff, note)}`]).catch(() => "");
      return { ok: true, pr: pr.number, url: pr.url, opened: false };
    }
    const made = JSON.parse(await d.gh(["api", "-X", "POST", `repos/${repo}/pulls`, "-f", "title=settings: CODEOWNERS from the project's owners", "-f", `head=${SETTINGS_BRANCH}`, "-f", `base=${base}`, "-f", `body=${prBody(table, diff, note)}`, "--jq", "{number, url: .html_url}"]));
    return { ok: true, pr: Number(made.number), url: String(made.url ?? ""), opened: true };
  } catch (e) { return { error: why(e) }; }
}

// ---- merging it: the release runner, before the morning's release ----

export type MergeDeps = LandDeps & { dryRun: boolean; say: (line: string) => void };
export type Merged = { ok: true; state: "same" | "opened" | "refreshed" | "waits" | "merged" | "would" } | { error: string };
type Rollup = { status?: string; conclusion?: string; state?: string }[];

/** the checks of a PR as one word (pure; handin.ts's checksOf, kept here so the runner reads no hand-in code) */
export function checksWord(rollup: Rollup | undefined): "passing" | "failing" | "pending" | "none" {
  const xs = Array.isArray(rollup) ? rollup : [];
  if (!xs.length) return "none";
  const word = (x: Rollup[number]) => String(x.conclusion || x.state || "").toUpperCase();
  if (xs.some((x) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(word(x)))) return "failing";
  if (xs.some((x) => (x.status && String(x.status).toUpperCase() !== "COMPLETED") || ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"].includes(word(x)))) return "pending";
  return "passing";
}

/** the settings PR, brought to what the table says and merged when it is whole: it changes CODEOWNERS alone, says
 *  exactly what the table says over main as it is now, and its checks are green. Anything else is written again (and
 *  merged on a later run) or waits; a dry run says what it would do */
export async function mergeOwners(d: MergeDeps, repo: string, table: Table): Promise<Merged> {
  try {
    const base = await defaultBranch(d, repo);
    const main = await fileAt(d, repo, base);
    if (!main) { d.say(`owners: ${repo} has no ${CODEOWNERS}; nothing to write`); return { ok: true, state: "same" }; }
    const next = writeCodeowners(main.text, table).text;
    const pr = await openPr(d, repo, base);
    if (next === main.text) {
      d.say("owners: CODEOWNERS says what the project's owners say");
      if (pr && !d.dryRun) await landOwners(d, repo, table);   // closes the PR that is not needed any more
      return { ok: true, state: "same" };
    }
    if (d.dryRun) { d.say(pr ? `owners: would merge #${pr.number} if it is whole and green` : "owners: would open the CODEOWNERS PR from the project's owners"); return { ok: true, state: "would" }; }
    const fresh = async (state: "opened" | "refreshed") => {
      const r = await landOwners(d, repo, table);
      if ("error" in r) return { error: r.error } as Merged;
      d.say(`owners: ${state === "opened" ? "opened" : "wrote again"} ${"pr" in r ? `#${r.pr}` : "the PR"}; it is merged on a later run once its checks are green`);
      return { ok: true, state } as Merged;
    };
    if (!pr) return fresh("opened");
    // the head first, and everything checked at that one commit: a write to the branch meanwhile makes the merge refuse
    // (--match-head-commit), never merge what was not looked at
    const v = JSON.parse(await d.gh(["pr", "view", String(pr.number), "--repo", repo, "--json", "statusCheckRollup,headRefOid"]) || "{}") as { statusCheckRollup?: Rollup; headRefOid?: string };
    if (!/^[0-9a-f]{40}$/.test(String(v.headRefOid ?? ""))) return fresh("refreshed");
    const files = JSON.parse(await d.gh(["api", `repos/${repo}/compare/${encodeURIComponent(base)}...${v.headRefOid}`, "--jq", "[.files[].filename]"]) || "[]") as string[];
    const there = await fileAt(d, repo, v.headRefOid!).catch(() => null);
    if (files.length !== 1 || files[0] !== CODEOWNERS || there?.text !== next) return fresh("refreshed");
    const c = checksWord(v.statusCheckRollup);
    if (c !== "passing") { d.say(`owners: #${pr.number} waits, its checks are ${c}`); return { ok: true, state: "waits" }; }
    await d.gh(["pr", "merge", String(pr.number), "--repo", repo, "--squash", "--delete-branch", "--match-head-commit", v.headRefOid!]);
    d.say(`owners: merged #${pr.number}, CODEOWNERS now says what the project's owners say`);
    return { ok: true, state: "merged" };
  } catch (e) { return { error: why(e) }; }
}

// ---- run as a program: the check (ci.yml) ----
//   node codeowners.js --check [--file .github/CODEOWNERS] [--table owners.json] [--warn]
// Without a table the check reads the file alone: it parses, no area has more than two leads, and writing it from its
// own leads changes nothing (the shape this file writes). With a table (the owners part of the record's
// .sol/project.json, or the whole file) it fails on every area that differs; with --warn (every PR but the settings
// PR, and main: the table may have moved while its PR waits to be merged) it says them and passes.

export function check(text: string, tableText?: string, warn = false): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const own = tableOf(text);
  if (!Object.keys(own).length) return { ok: false, lines: ["CODEOWNERS has no `# label x:` section"] };
  let self: string;
  try { self = writeCodeowners(text, own).text; } catch (e) { return { ok: false, lines: [why(e)] }; }
  if (self !== text) lines.push("CODEOWNERS is not in the shape Sol writes (an area's lines name different owners, or an owner sits between paths): write it again from the project's owners");
  if (tableText === undefined) return { ok: !lines.length, lines: lines.length ? lines : ["CODEOWNERS reads well; no owners table given, so it is not compared"] };
  let table: unknown;
  try { table = JSON.parse(tableText); } catch { return { ok: false, lines: [...lines, "the owners table is not JSON"] }; }
  // the record's whole file (it has `v`) or the owners part alone
  const t = table && typeof table === "object" && !Array.isArray(table) && ("v" in table || "owners" in table) ? (table as { owners?: unknown }).owners : table;
  if (!t || typeof t !== "object" || Array.isArray(t)) return { ok: !lines.length, lines: [...lines, "the record holds no owners yet: CODEOWNERS is the starting value"] };
  const d = differ(text, t as Table);
  // warn: a PR other than the settings PR. The table may have moved while its PR waits to be merged, which is no fault
  // of theirs: said, never failed
  return { ok: !lines.length && (warn || !d.length), lines: [...lines, ...(d.length ? differLines(d).map((l) => (warn ? `${l} (the settings PR brings it)` : l)) : ["CODEOWNERS says what the project's owners say"])] };
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv.includes("--check")) { console.error("codeowners: --check [--file path] [--table path]"); process.exit(2); }
  const file = arg("--file") ?? CODEOWNERS, tablePath = arg("--table");
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { console.error(`codeowners: no ${file}`); process.exit(1); }
  const r = check(text, tablePath ? readFileSync(tablePath, "utf8") : undefined, argv.includes("--warn"));
  for (const l of r.lines) (r.ok ? console.log : console.error)(`codeowners: ${l}`);
  process.exit(r.ok ? 0 : 1);
}
