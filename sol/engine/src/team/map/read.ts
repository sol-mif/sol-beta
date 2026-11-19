// The map's live records (#1433): the registry, git's last 72 h, the room's open PRs with their files, its open calls
// and its newest notes, read for build.ts. The setup is the project's own file, .sol/cowork-map.json; with none, the map
// says so and draws nothing (a team's setup is written for it, never guessed here). One read is kept five minutes.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { remoteOf } from "../letin.js";
import { runners } from "../record.js";
import { readRegistry, recordsDir } from "../../work/systems.js";
import { pathIndex, systemsOf } from "../../work/systemsLive.js";
import { changesOf, commitsOf, wholeOf } from "../../work/systemsWhole.js";
import { buildSpec } from "./build.js";
import type { MapInput, MapSpec, Setup } from "./spec.js";

export const KEEP_MS = 5 * 60_000;
/** the hours the map counts back (build.ts window) */
const WINDOW = 72;
/** the setup sits beside the project's rhythm (.sol/rhythm.json), at the top of the registry's checkout */
const topOf = (dir: string) => dirname(dirname(dirname(dir)));
export const setupPath = (dir = recordsDir()) => join(topOf(dir), ".sol", "cowork-map.json");
/** me: the login of the person this engine reads as (their seat on the map), "" when gh cannot say */
export type MapRead = { spec?: MapSpec; me?: string; error?: string; at: number };

const gh = async (args: string[]) => JSON.parse(await runners.board(args));
/** a list read in full up to `cap` (#1464): the window's comments page by page until a short page, the open PRs and calls
 *  with a limit far over a team's; a cap reached sets the spec's `cut`, so a short count is never read as the whole */
export const CAP = { pages: 30, prs: 1000, calls: 1000 };
async function allComments(repo: string, since: string): Promise<{ list: any[]; cut: boolean }> {
  const list: any[] = [];
  for (let page = 1; page <= CAP.pages; page++) {
    const got = await gh(["api", `repos/${repo}/issues/comments?sort=created&direction=desc&since=${since}&per_page=100&page=${page}`]).catch(() => []);
    const rows = Array.isArray(got) ? got : [];
    list.push(...rows);
    if (rows.length < 100) return { list, cut: false };
  }
  return { list, cut: true };
}
let kept: MapRead | null = null, reading: Promise<MapRead> | null = null;

export function readMap(refresh = false, dir = recordsDir()): Promise<MapRead> {
  if (!refresh && kept && Date.now() - kept.at < KEEP_MS) return Promise.resolve(kept);
  return (reading ??= once(dir).then((r) => { if (r.spec) kept = r; return r; }).finally(() => { reading = null; }));
}

async function once(dir: string): Promise<MapRead> {
  const at = Date.now(), file = setupPath(dir);
  if (!existsSync(file)) return { at, error: "this project has no map setup yet (.sol/cowork-map.json)" };
  let setup: Setup;
  try { setup = JSON.parse(readFileSync(file, "utf8")); } catch (e) { return { at, error: `the map setup does not read: ${(e as Error).message}` }; }
  const { recs } = readRegistry(dir), idx = pathIndex(recs);
  const parts = [...recs.values()].map((r) => ({ id: r.id, name: r.name, state: r.state, ...(r.owner ? { owner: r.owner } : {}), ...(r.about ? { about: r.about } : {}) }));
  let changes: MapInput["changes"] = [];
  try { changes = changesOf(await commitsOf(dir), idx, wholeOf(recs).links).map((c) => ({ sha: c.sha, at: c.at, author: c.author, agent: c.agent, subject: c.subject, systems: c.systems })); } catch { /* no git here */ }
  const repo = await remoteOf(topOf(dir)).catch(() => "");
  const me = await runners.board(["api", "user", "-q", ".login"]).then((x) => x.trim()).catch(() => "");
  let prs: MapInput["prs"] = [], issues: MapInput["issues"] = [], notes: MapInput["notes"] = [];
  const cut: NonNullable<MapSpec["cut"]> = {};
  if (repo) {
    const since = new Date(at - WINDOW * 3_600_000).toISOString();
    const [p, i, c] = await Promise.all([
      gh(["pr", "list", "-R", repo, "--state", "open", "--limit", String(CAP.prs), "--json", "number,title,body,isDraft,author,createdAt,updatedAt,files"]).catch(() => []),
      gh(["issue", "list", "-R", repo, "--state", "open", "--label", "decision", "--limit", String(CAP.calls), "--json", "number,title,labels,assignees,createdAt,updatedAt"]).catch(() => []),
      allComments(repo, since),
    ]);
    const n = c.list;
    if (c.cut) cut.notes = true;
    if ((p as any[]).length >= CAP.prs) cut.prs = true;
    if ((i as any[]).length >= CAP.calls) cut.calls = true;
    prs = (p as any[]).map((x) => {
      const files = (x.files ?? []).map((f: any) => String(f.path ?? "")).filter(Boolean) as string[];
      return { number: x.number, title: String(x.title ?? ""), author: String(x.author?.login ?? ""), draft: !!x.isDraft, updated: x.updatedAt, created: x.createdAt, body: String(x.body ?? "").slice(0, 4000),
        files, parts: [...new Set(files.flatMap((f) => systemsOf(f, idx)))] };
    });
    issues = (i as any[]).map((x) => ({ number: x.number, title: String(x.title ?? ""), labels: (x.labels ?? []).map((l: any) => String(l.name)), assignees: (x.assignees ?? []).map((a: any) => String(a.login)), created: x.createdAt, updated: x.updatedAt }));
    notes = (n as any[]).map((x) => ({ number: Number(String(x.issue_url ?? "").split("/").pop()), at: String(x.created_at ?? ""), author: String(x.user?.login ?? ""), body: String(x.body ?? "") }));
  }
  let rhythm: Record<string, unknown> | undefined;
  try { rhythm = JSON.parse(readFileSync(join(topOf(dir), ".sol", "rhythm.json"), "utf8")); } catch { /* no hours: the clock says "?" */ }
  return { at, spec: { ...buildSpec(setup, { now: at, parts, changes, prs, issues, notes, rhythm }, WINDOW), ...(repo ? { repo } : {}), ...(Object.keys(cut).length ? { cut } : {}) }, me };
}
