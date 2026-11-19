// The iteration (#1153): the one definitive version the team anchors against. Every release is one named iteration:
// main at that release's `dev-*` tag. The current iteration is the newest `dev-*` tag (releaseTag's pick, version.ts,
// the same the release and #1150's count make), its commit and when the tag was made, read from this checkout's own
// tags (a Sol fetches them with its releases; the drift runner fetches them first). Each developer's work either reaches
// the next iteration or shows as drift against it (drift.ts).
//   who reads it  the engine (GET /iteration, parts/drift.ts), the release word (#1150's count line names it, runs.ts
//                 countMsg `iteration`), the drift runner (drift.ts), and by hand: `bash sol/drift --iteration`
//   the times     every `dev-*` tag's creation time too: a change's age is the number of iterations made after it
import { execFile } from "node:child_process";
import { releaseTag } from "../version.js";

export type Iteration = { name: string; sha: string; at: number };
/** one dev-* tag: its name, the commit it names, and when it was made (unix ms; a lightweight tag's commit's time) */
export type DevTag = Iteration;

const DEV = /^dev-\d{8}(-\d{4})?$/;
/** for-each-ref's format for the tags (name, peeled commit, object, creation time) */
export const TAG_FORMAT = "%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:unix)";

/** the dev-* tags in for-each-ref's output (pure) */
export function devTagsOf(out: string): DevTag[] {
  return out.split("\n").map((l) => l.split("\t")).filter(([t]) => t && DEV.test(t))
    .map(([name, peeled, obj, at]) => ({ name, sha: peeled || obj, at: Number(at) * 1000 }))
    .filter((t) => /^[0-9a-f]{40}$/.test(t.sha) && Number.isFinite(t.at));
}

/** the current iteration among the tags (pure): the newest by releaseTag's pick, or null when there is none */
export function iterationOf(tags: DevTag[]): Iteration | null {
  const name = releaseTag(tags.map((t) => t.name));
  const t = tags.find((x) => x.name === name);
  return t ? { name: t.name, sha: t.sha, at: t.at } : null;
}

/** the dev-* tags of the checkout at `cwd`, from its own refs ([] when git says nothing) */
export function devTagsIn(cwd: string): Promise<DevTag[]> {
  return new Promise((ok) => execFile("git", ["for-each-ref", `--format=${TAG_FORMAT}`, "refs/tags/dev-*"], { cwd, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 },
    (e, out) => ok(e ? [] : devTagsOf(String(out)))));
}

let known: Iteration | null = null;
/** the current iteration of the checkout at `cwd`, read now (and kept for iterationKnown) */
export async function iterationNow(cwd: string): Promise<Iteration | null> {
  known = iterationOf(await devTagsIn(cwd));
  return known;
}
/** the iteration last read here, for a line that cannot wait on git (runs.ts countMsg) */
export const iterationKnown = (): Iteration | null => known;
