// The whole of Jelly as one map (#1193; the decision: ours/design-jelly-system.md, 2026-11-14): every system grouped as
// a cluster (the first word of its id, a child of `jelly`), only the wires between clusters, who is in which cluster
// now, and what the last changes reached. Each cluster names its role, the drawing a press on it opens: design keeps
// the five lanes (the System kind), the engine and the clusters that ship reads in → inside → out, the machines as
// columns, the rest as their parts. Read live from the registry (systems.ts readRegistry), the work under way
// (systemsLive.ts liveOnce) and git's last days; nothing is typed in.
//
//   work.systems.whole  {}  → { whole }   the map as it stands now; the face asks again when a record changes (it is
//                                         held like the area "jelly", so work.systems.changed { area: "jelly" } comes)
//                                         or the work under way moves (work.systems.live)
//   GET /systems/whole      → whole       the same, read once (parts/systems-whole.ts)
import { execFile } from "node:child_process";
import { readRegistry, recordsDir, wiresOf, holdArea, type Rec } from "./systems.js";
import { liveOnce, pathIndex, systemsOf, type Live, type PathIndex } from "./systemsLive.js";

/** how a cluster is drawn when it is opened (the decision's "each cluster drawn its own way, by its role") */
export type Role = "lanes" | "flow" | "machines" | "parts";
export const ROLES: Record<string, Role> = {
  design: "lanes",
  engine: "flow", build: "flow", releases: "flow", nights: "flow", day: "flow",
  machines: "machines",
};
export const roleOf = (cluster: string): Role => ROLES[cluster] ?? "parts";

export type Cluster = { id: string; name: string; about: string; role: Role; count: number; states: Record<string, number> };
export type ClusterWire = { from: string; to: string; n: number };
/** one system, as small as the drawings of a cluster need it */
export type Sys = { id: string; name: string; kind: string; state: string; parent: string | null; cluster: string; machines: string[]; units: string[] };
/** a session working in a cluster now: an agent of a person (systemsLive.ts Work) */
export type Here = { cluster: string; systems: string[]; person: string; session: string; title: string; branch: string; at: number };
/** a commit, by the clusters its files belong to, and the clusters its systems feed (what it reaches) */
export type Change = { sha: string; at: number; subject: string; author: string; agent: boolean; clusters: string[]; systems: string[]; reaches: string[] };
export type Whole = {
  at: number; name: string; about: string;
  clusters: Cluster[]; wires: ClusterWire[];
  systems: Sys[]; links: [string, string][];
  who: Here[];
  /** the newest change of each cluster, by cluster id; `last` the newest of all */
  changes: Record<string, Change>; last: Change | null;
};

export const ROOT = "jelly";
/** a system's cluster: the first word of its id ("" for the root) */
export const clusterOf = (id: string) => (id === ROOT ? "" : id.split("/")[0]);

// ---- the pure parts ----
/** the clusters, the wires between them (feeds and fed_by alike, counted once per pair of systems) and every system
 *  small; legacy counts in its own cluster's states (pure) */
export function wholeOf(recs: Map<string, Rec>): Pick<Whole, "name" | "about" | "clusters" | "wires" | "systems" | "links"> {
  const root = recs.get(ROOT);
  const cl = new Map<string, Cluster>();
  const systems: Sys[] = [];
  for (const r of recs.values()) {
    const c = clusterOf(r.id);
    if (!c) continue;
    const k = cl.get(c) ?? { id: c, name: c, about: "", role: roleOf(c), count: 0, states: {} };
    if (r.id === c) { k.name = r.name; k.about = r.about; }
    else { k.count++; k.states[r.state] = (k.states[r.state] ?? 0) + 1; }
    cl.set(c, k);
    const units = (r.where as { units?: unknown } | undefined)?.units;
    systems.push({ id: r.id, name: r.name, kind: r.kind, state: r.state, parent: r.parent, cluster: c, machines: r.where?.machines ?? [],
      units: Array.isArray(units) ? units.filter((u): u is string => typeof u === "string") : [] });
  }
  const links = wiresOf(recs, (id) => id !== ROOT);
  const by = new Map<string, ClusterWire>();
  for (const [a, b] of links) {
    const x = clusterOf(a), y = clusterOf(b);
    if (!x || !y || x === y || !cl.has(x) || !cl.has(y)) continue;
    const k = `${x}>${y}`, w = by.get(k) ?? { from: x, to: y, n: 0 };
    w.n++; by.set(k, w);
  }
  const clusters = [...cl.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const wires = [...by.values()].sort((a, b) => b.n - a.n || (a.from + a.to < b.from + b.to ? -1 : 1));
  systems.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { name: root?.name ?? "Jelly", about: root?.about ?? "", clusters, wires, systems, links };
}

/** who is in which cluster now: one row per session and cluster, its systems there, newest first (pure) */
export function whoOf(live: Pick<Live, "work"> | null): Here[] {
  const by = new Map<string, Here>();
  for (const w of live?.work ?? []) {
    const c = clusterOf(w.system);
    if (!c) continue;
    const k = `${c}\n${w.session}`;
    const h = by.get(k) ?? { cluster: c, systems: [], person: w.person, session: w.session, title: w.title, branch: w.branch, at: 0 };
    if (!h.systems.includes(w.system)) h.systems.push(w.system);
    h.at = Math.max(h.at, w.at);
    by.set(k, h);
  }
  return [...by.values()].sort((a, b) => b.at - a.at || (a.cluster < b.cluster ? -1 : 1));
}

export type Commit = { sha: string; at: number; subject: string; author: string; body: string; files: string[] };
const AGENT = /Co-Authored-By: Claude|Generated with \[Claude Code\]|— \S+'s agent/i;
/** each commit as a change: its systems (each file's, by the registry's paths), their clusters, and the clusters its
 *  systems feed outside its own (pure); a commit no record holds a file of is left out */
export function changesOf(commits: Commit[], idx: PathIndex, links: [string, string][]): Change[] {
  const down = new Map<string, string[]>();
  for (const [a, b] of links) down.set(a, [...(down.get(a) ?? []), b]);
  const out: Change[] = [];
  for (const c of commits) {
    const count = new Map<string, number>();
    for (const f of c.files) for (const id of systemsOf(f, idx)) count.set(id, (count.get(id) ?? 0) + 1);
    if (!count.size) continue;
    const systems = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
    const clusters = [...new Set(systems.map(clusterOf).filter(Boolean))];
    const reaches = [...new Set(systems.flatMap((s) => down.get(s) ?? []).map(clusterOf))].filter((x) => x && !clusters.includes(x)).sort();
    out.push({ sha: c.sha, at: c.at, subject: c.subject, author: c.author, agent: AGENT.test(c.body), clusters, systems: systems.slice(0, 6), reaches });
  }
  return out.sort((a, b) => b.at - a.at);
}
/** the newest change of each cluster it touched (pure) */
export function newestBy(changes: Change[]): Record<string, Change> {
  const out: Record<string, Change> = {};
  for (const c of changes) for (const k of c.clusters) if (!out[k] || out[k].at < c.at) out[k] = c;
  return out;
}

// ---- git's last days ----
export const HOURS = 72;
const git = (cwd: string, args: string[]) => new Promise<string>((ok, no) => {
  execFile("git", ["-C", cwd, ...args], { timeout: 8000, maxBuffer: 64 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }, (e, out) => (e ? no(e) : ok(out)));
});
/** "%x1e" starts a commit, "%x1d" ends its head; its files follow, one a line (pure) */
export function parseLog(log: string): Commit[] {
  const out: Commit[] = [], seen = new Set<string>();
  for (const chunk of log.split("\x1e").slice(1)) {
    const [head, rest = ""] = chunk.split("\x1d");
    const [sha, author, at, subject, body = ""] = head.split("\x1f");
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    out.push({ sha: sha.slice(0, 9), author, at: Date.parse(at), subject: subject.slice(0, 160), body, files: rest.split("\n").map((x) => x.trim()).filter(Boolean) });
  }
  return out;
}
let kept: { key: string; commits: Commit[] } | null = null;
/** the commits of the last HOURS on every branch of the registry's checkout, kept while no branch moved */
export async function commitsOf(dir: string): Promise<Commit[]> {
  const top = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
  const key = `${top}\n${(await git(top, ["for-each-ref", "--format=%(objectname)", "--sort=-committerdate", "--count=40"]).catch(() => "")).trim()}`;
  if (kept?.key === key) return kept.commits;
  const log = await git(top, ["-c", "core.quotePath=false", "log", "--all", `--since=${HOURS} hours ago`, "--no-merges", "-n", "400", "--format=%x1e%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1d", "--name-only"]);
  kept = { key, commits: parseLog(log) };
  return kept.commits;
}

/** the whole as it stands: the registry, the work under way (a reading kept under 5 s, else one read, never waited on
 *  longer than WAIT_MS) and the last days' changes; never throws for the live part or git */
export const WAIT_MS = 2500;
export async function readWhole(dir = recordsDir()): Promise<Whole> {
  const { recs } = readRegistry(dir);
  const base = wholeOf(recs);
  const live = await Promise.race([liveOnce().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), WAIT_MS))]);
  let changes: Change[] = [];
  try { changes = changesOf(await commitsOf(dir), pathIndex(recs), base.links); } catch { /* no git here: no changes */ }
  return { at: Date.now(), ...base, who: whoOf(live), changes: newestBy(changes), last: changes[0] ?? null };
}

type Face = { send: (m: object) => void };
/** the wire's question (wire.ts): the whole, to the face that asked; the face is held like the area "jelly", so a record
 *  that changes on disk tells it (work.systems.changed) and it asks again */
export async function wholeMsg(w: Face, m: { type: string; rid?: unknown }) {
  try {
    const whole = await readWhole();
    holdArea(ROOT, w);
    w.send({ type: m.type, rid: m.rid, whole });
  } catch (err) { w.send({ type: m.type, rid: m.rid, error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
}
