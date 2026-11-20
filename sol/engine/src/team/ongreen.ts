// On green (#1561, part of #1559, the update system): a commit on main whose five required checks are green becomes
// the dev release at once, not at 9am. GitHub's machines run it (.github/workflows/dev-on-green.yml) each time ci or
// apart ends on main: the commit's check runs are read, and when every one of the four that run on main (REQUIRED) has ended
// green, the commit is tagged `dev-YYYYMMDD-HHMM` (the minute, in the rhythm's zone) and `dev` moves to it in one
// atomic push (release.ts publish), forward only. The 9am `dev-YYYYMMDD` stays the day's anchor (iteration.ts,
// drift.ts, the catch-up test and Cowork › Releases read it as before): the NucBox's timer makes it, and this program's
// `--anchor` (the workflow at 09:20 New York) makes it only when it is missing and dev has moved since the last one.
//   modes     DEV_ON_GREEN (a repository variable, read by the workflow into this process's environment): `on` pushes;
//             anything else is report mode, which says what it would do and moves nothing (#1559's order: not switched
//             on for the team before the Sol-side install, #1341, lands). --dry-run is report mode from the command line.
//   the word  GitHub's machines have no voice on the relay, so each Sol asks GitHub itself every ten minutes (ship.ts
//             ASK_EVERY_MS); the NucBox's hourly timer and `sol/release` are untouched.
//   refused   a commit not on main (main moved on without it: a force is not a thing here, but a rerun of an old run
//             is), a commit dev is already on or past (dev never moves back or sideways), a tag that stands already
//             (two greens in one minute: the next green gets the next minute), checks missing, running or red.
// git and gh are deps, so the tests run it in a temp repo with a stand-in GitHub.
//   bash: cd sol/engine && npx tsx src/team/ongreen.ts --sha <commit> --repo owner/name [--dry-run]
//         cd sol/engine && npx tsx src/team/ongreen.ts --anchor --repo owner/name [--dry-run]
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clockIn, type Rhythm } from "./tonight.js";
import { devTag, DEV_TAG, dueDay as dueDayOf, fetchAll, publish, requiredGreen, rev, runnerOf, type NamedRun, type ReleaseDeps } from "./release.js";

export { REQUIRED, ACTIONS_APP, requiredGreen, type NamedRun } from "./release.js";

export type Mode = "report" | "on";
/** the mode from the environment (pure): only the word `on` pushes */
export const modeOf = (env: Record<string, string | undefined>) => (env.DEV_ON_GREEN === "on" ? "on" : "report") as Mode;

const pad = (n: number) => String(n).padStart(2, "0");
const short = (s: string) => s.slice(0, 7);

export type Plan = { act: "move"; tag: string } | { act: "skip"; why: string };
/** what to do with a green commit (pure): the tag it gets, or why not */
export function planOnGreen(a: { sha: string; onMain: boolean; dev: string; devReaches: boolean; tags: string[]; now: Date; zone: string }): Plan {
  if (!a.onMain) return { act: "skip", why: `${short(a.sha)} is not on main` };
  if (a.dev === a.sha) return { act: "skip", why: `dev is on ${short(a.sha)} already` };
  if (!a.devReaches) return { act: "skip", why: `dev (${short(a.dev)}) is past ${short(a.sha)} or beside it: dev moves forward only` };
  const c = clockIn(a.now, a.zone);
  const tag = devTag(c.day, `${pad(Math.floor(c.minutes / 60))}${pad(c.minutes % 60)}`);
  if (a.tags.includes(tag)) return { act: "skip", why: `${tag} stands already; the next green push gets the next minute` };
  return { act: "move", tag };
}

export type OnGreenDeps = Pick<ReleaseDeps, "git" | "gh" | "now" | "say"> & { mode: Mode };
export type OnGreen = { ok: true; sha: string; tag?: string; moved?: true; skipped?: string; dry?: true } | { ok?: false; error: string };

/** one green commit: read, planned, and in `on` mode released */
export async function onGreen(d: OnGreenDeps, o: { repo: string; rhythm: Pick<Rhythm, "zone">; sha: string; required?: string[] }): Promise<OnGreen> {
  if (!/^[0-9a-f]{40}$/.test(o.sha)) return { error: `not a commit: ${o.sha}` };
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  const main = await rev(d, "refs/remotes/origin/main");
  if (!main) return { error: "GitHub's main is not known here" };
  const onMain = (await d.git(["merge-base", "--is-ancestor", o.sha, main])).code === 0;
  let runs: NamedRun[], total = 0;
  try {
    const j = JSON.parse(await d.gh(["api", `repos/${o.repo}/commits/${o.sha}/check-runs?per_page=100`]) || "{}");
    runs = (j.check_runs ?? []) as NamedRun[]; total = Number(j.total_count ?? runs.length);
  } catch (e) { return { error: `GitHub did not say how the checks on ${short(o.sha)} went (${firstLine(e)})` }; }
  if (total > runs.length) return { error: `GitHub has ${total} check runs on ${short(o.sha)} and gave ${runs.length}` };
  const green = requiredGreen(runs, o.required);
  if (!green.green) { d.say(`${short(o.sha)} is not green: ${green.why}`); return { ok: true, sha: o.sha, skipped: green.why }; }
  const dev = await rev(d, "refs/remotes/origin/dev");
  const devReaches = !dev || (await d.git(["merge-base", "--is-ancestor", dev, o.sha])).code === 0;
  const tags = (await d.git(["tag", "-l", "dev-*"])).out.split("\n").map((t) => t.trim()).filter((t) => DEV_TAG.test(t));
  const plan = planOnGreen({ sha: o.sha, onMain, dev, devReaches, tags, now: d.now(), zone: o.rhythm.zone });
  if (plan.act === "skip") { d.say(`nothing to do: ${plan.why}`); return { ok: true, sha: o.sha, skipped: plan.why }; }
  const from = dev ? short(dev) : "nowhere";
  if (d.mode !== "on") { d.say(`would tag ${plan.tag} at ${short(o.sha)} and move dev from ${from} to it (report mode: DEV_ON_GREEN is not "on")`); return { ok: true, sha: o.sha, tag: plan.tag, dry: true }; }
  const no = await publish(d, plan.tag, o.sha, `dev release ${plan.tag}, on green (#1559)`);
  if (no) return { error: no };
  d.say(`released ${plan.tag} at ${short(o.sha)}; dev moved from ${from} to it`);
  return { ok: true, sha: o.sha, tag: plan.tag, moved: true };
}

/** the day's anchor as a backup: once the release hour has come and `dev-YYYYMMDD` is missing, the commit dev is on
 *  gets it, unless that commit already carries a day's anchor (nothing went out since); the NucBox's timer makes it
 *  as a rule while it runs */
export async function anchor(d: OnGreenDeps, o: { repo: string; rhythm: Pick<Rhythm, "release" | "zone"> }): Promise<OnGreen> {
  const fetched = await fetchAll(d, o.repo);
  if (fetched) return { error: fetched };
  const day = dueDayOf(o.rhythm, d.now());
  if (!day) { d.say(`not yet: the release hour is ${o.rhythm.release}${o.rhythm.zone ? ` (${o.rhythm.zone})` : ""}`); return { ok: true, sha: "", skipped: "not yet" }; }
  const tag = devTag(day);
  const had = await rev(d, `refs/tags/${tag}^{commit}`);
  if (had) { d.say(`${tag} stands at ${short(had)}: the anchor is made`); return { ok: true, sha: had, tag, skipped: "already" }; }
  const dev = await rev(d, "refs/remotes/origin/dev");
  if (!dev) return { error: "there is no dev branch on GitHub yet" };
  // a day's anchor already on the commit dev is on (dev-YYYYMMDD, never the minute tags on green leaves): nothing went
  // out since that day, so no anchor for this one, as release.ts makes none with nothing merged
  const anchored = (await d.git(["tag", "-l", "--points-at", dev, "dev-*"])).out.split("\n").some((t) => /^dev-\d{8}$/.test(t.trim()));
  if (anchored) { d.say(`dev has not moved since the last day's anchor: no anchor today`); return { ok: true, sha: dev, skipped: "nothing new" }; }
  if (d.mode !== "on") { d.say(`would tag ${tag} at ${short(dev)}, where dev is (report mode: DEV_ON_GREEN is not "on")`); return { ok: true, sha: dev, tag, dry: true }; }
  const no = await publish(d, tag, dev, `dev release ${tag} (the day's anchor; on green's backup, #1561)`);
  if (no) return { error: no };
  d.say(`anchored ${tag} at ${short(dev)}`);
  return { ok: true, sha: dev, tag, moved: true };
}

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0];

// ---- run as a program ----
async function main(argv: string[]): Promise<number> {
  const r0 = await runnerOf(argv, "on-green");
  if (typeof r0 === "string") { console.error(r0); return 2; }
  const { git, gh, repo, rhythm, stop } = r0;
  const mode: Mode = argv.includes("--dry-run") ? "report" : modeOf(process.env);
  const say = (l: string) => console.log(`on green: ${l}`);
  const i = argv.indexOf("--sha");
  const sha = i >= 0 ? (argv[i + 1] ?? "") : "";
  console.log(`on green (${mode} mode), ${new Date().toISOString()}, ${repo}${sha ? `, ${sha}` : ", the anchor"}`);
  try {
    const r = argv.includes("--anchor") ? await anchor({ git, gh, now: () => new Date(), say, mode }, { repo, rhythm }) : await onGreen({ git, gh, now: () => new Date(), say, mode }, { repo, rhythm, sha });
    if (!r.ok) { console.error(`on green: ${r.error}`); return 1; }
    return 0;
  } finally { await stop(); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`on green: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
