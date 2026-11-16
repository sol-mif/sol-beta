// The Features page and "your area" (#480, dev cycle step 2), for Sol developers only. Who they are is the project's
// settings (project.ts): the leads of its ownership table and the dev and beta reviewers of its rhythm (`devsIn`).
//   The Features page is a team tool (teamtool.ts) with the gate "devs": the engine opens it only for a member of the
//   project who is one of its Sol developers. Its reader sends the map of the checkout this engine runs from
//   (specs/features.json, features.ts), each feature with its evals (approved, draft, none), the ownership table, and
//   the last nightly re-sort's line, read from the project's record (resort.ts, `.sol/resorts.json`). The face draws two views of it: "as a Sol user sees it" (by `where`)
//   and "as it's built" (by label, lead and support).
//   "Your area" is the line a lead's Work session opens with: "your area: 3 of 7 features have evals", counting the
//   features they lead whose eval.md the Sol developer's press approved. Work's sessions read it at their start
//   (work/runs.ts), and it must not wait there, so the people are read in the background and kept ten minutes; the map
//   and the evals are read from the session's own checkout each time. Nobody else's session gets a word of it: no line
//   for a checkout with no map (a Sol tester's copy, any other repo), nor for a person the settings do not name.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineTool } from "./teamtool.js";
import { readFeatures, evalsOf, devsIn, FEATURES_PATH, type Feature } from "./features.js";
import { lastResort, resortLine, undoCommand, type Resort } from "./resort.js";
import { REPO_ROOT } from "./worktype.js";
import { owners as projectOwners, projectRhythm, recordFor, type Owners } from "./project.js";

export { devsIn };

/** the features a person leads (pure): the map names them its lead, or the ownership table names them the first lead
 *  of the feature's label */
export function areaOf(features: Feature[], owners: Owners, me: string): Feature[] {
  const who = me.toLowerCase();
  return who ? features.filter((f) => f.lead.toLowerCase() === who || (owners[f.label]?.[0] ?? "").toLowerCase() === who) : [];
}
/** the line (pure): "your area: 3 of 7 features have evals"; "" when the person leads none */
export function areaLine(area: { id: string; name: string; evals: string }[]): string {
  if (!area.length) return "";
  const done = area.filter((f) => f.evals === "approved").length, left = area.filter((f) => f.evals !== "approved");
  return `your area: ${done} of ${area.length} feature${area.length === 1 ? "" : "s"} ${area.length === 1 ? "has" : "have"} evals${left.length ? ` (still without: ${left.slice(0, 4).map((f) => `${f.id} ${f.name}`).join(", ")}${left.length > 4 ? `, and ${left.length - 4} more` : ""})` : ""}`;
}

/** the checkout a folder is in that holds a feature map: the folder or one above it, at most eight up; "" when none */
export function mapRoot(cwd: string): string {
  let d = cwd;
  for (let i = 0; i < 9 && d; i++) {
    if (existsSync(join(d, FEATURES_PATH))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return "";
}

// ---- who: read in the background, kept ten minutes ----

type Who = { me: string; owners: Owners; devs: string[] };
let meOf: () => string = () => "";
let read: () => Promise<Who | null> = async () => {
  const me = meOf();
  if (!me) return null;
  const [o, r] = await Promise.all([projectOwners(), projectRhythm()]);
  return { me, owners: o, devs: devsIn(o, r) };
};
let who: Who | null = null, at = 0, reading: Promise<void> | null = null;
const TTL = 10 * 60_000;
function refresh() {
  if (reading || Date.now() - at < TTL) return;
  reading = read().then((w) => { who = w; at = Date.now(); }, () => { at = Date.now() - TTL + 60_000; }).finally(() => { reading = null; });
}
/** wire it (wire.ts, once): who this Sol's person is; tests also hand in the read */
export function useArea(d: { me: () => string; read?: () => Promise<Who | null> }) {
  meOf = d.me;
  if (d.read) read = d.read;
  who = null; at = 0; reading = null;
  refresh();
}
/** for tests: wait for the read in flight */
export const areaSettled = () => reading ?? Promise.resolve();

/** the line a Sol developer's Work session opens with, for a session in `cwd` (sync: the people as last read) */
export function areaLineFor(cwd: string): string {
  refresh();
  const root = cwd ? mapRoot(cwd) : "";
  if (!root || !who || !who.devs.some((d) => d.toLowerCase() === who!.me.toLowerCase())) return "";
  return areaLine(areaOf(readFeatures(root), who.owners, who.me).map((f) => ({ id: f.id, name: f.name, evals: evalsOf(root, f) })));
}
/** what Work's system prompt says about it: the line, and to open the first answer with it */
export function areaParagraph(cwd: string): string {
  const l = areaLineFor(cwd);
  return l ? ` You work for a Sol developer who leads part of Sol (#480). Open your first answer in this session with this one line, as it is, then go on: "${l}".` : "";
}

// ---- the Features page: the team tool's reader ----

export type FeaturesData = {
  features: (Feature & { evals: "approved" | "draft" | "none" })[]; owners: Owners;
  resort: { line: string; at: string; undo: string } | null;   // undo: the command, "" once undone or when nothing moved
  read: string;
};
/** the page's data (pure but for the reads of the checkout): the map with each feature's evals, the ownership table,
 *  the last run's line from the project's record */
export function featuresData(root: string, owners: Owners, last: { run: Resort; record: string } | null = null): FeaturesData {
  const r = last?.run;
  return {
    features: readFeatures(root).map((f) => ({ ...f, evals: evalsOf(root, f) })),
    owners,
    resort: r ? { line: resortLine(r, last!.record), at: r.at, undo: r.moves.length && !r.undone?.back ? undoCommand(r.id, last!.record) : "" } : null,
    read: new Date().toISOString(),
  };
}
let ownersFor: () => Promise<Owners> = () => projectOwners();
/** the project in use's last re-sort: its record, read through the kit's store (kept a minute) */
let lastFor: () => Promise<{ run: Resort; record: string } | null> = async () => {
  const { record, things } = recordFor();
  const run = await lastResort(things?.() ?? null, record);
  return run ? { run, record } : null;
};
export function useFeaturesTool(d: { root?: string; owners?: () => Promise<Owners>; last?: () => Promise<{ run: Resort; record: string } | null> } = {}) {
  if (d.owners) ownersFor = d.owners;
  if (d.last) lastFor = d.last;
  const root = d.root ?? REPO_ROOT;
  defineTool("features", async () => featuresData(root, await ownersFor().catch(() => ({})), await lastFor().catch(() => null)));
}
