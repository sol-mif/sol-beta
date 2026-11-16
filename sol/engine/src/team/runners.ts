// Our own machines as CI runners (#638, after #276 and #399): which second-machine checks run now. A machine registers
// itself with `bash sol/runner install <name>` (labels sol and its name; GitHub adds its system, Linux or Windows).
// `.github/workflows/runners.yml` asks this file on every push to main and once a day: a check runs when a runner wearing its
// labels is online; on a push with none online it waits for the daily run; on the daily run with none online it is
// said and skipped, never left queued for a machine that is away. Listing runners needs a token with the repository's
// administration read (secret SOL_RUNNERS_TOKEN); without it nothing is seen, so nothing runs, and that is said.
// Pure but for the run at the end; no imports beyond node's own, so plain node runs it without the engine's packages.
import { appendFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Runner = { name?: string; status?: string; labels?: { name?: string }[] };
/** a check that runs on a second machine: its name in the workflow's outputs, and the labels its runner must wear */
export type Check = { id: string; labels: string[] };
export type Plan = { id: string; run: boolean; why: string };

/** the runners online that wear every label of a check (pure; labels compared in any case, as GitHub does) */
export function onlineFor(runners: Runner[], labels: string[]): string[] {
  const want = labels.map((l) => l.toLowerCase());
  return runners.filter((r) => r.status === "online")
    .filter((r) => { const has = new Set((r.labels ?? []).map((l) => String(l.name ?? "").toLowerCase())); return want.every((l) => has.has(l)); })
    .map((r) => String(r.name ?? "?"));
}

/** which checks run (pure): `runners` null when GitHub could not be asked; `event` the workflow's (push, schedule,
 *  workflow_dispatch). Online: it runs, on any event. None online: a push leaves it to the daily run, the daily run
 *  says so and skips */
export function plan(event: string, runners: Runner[] | null, checks: Check[]): Plan[] {
  const daily = event === "schedule" || event === "workflow_dispatch";
  return checks.map((c) => {
    const want = c.labels.join(", ");
    if (!runners) return { id: c.id, run: false, why: `${c.id}: the runners could not be listed (SOL_RUNNERS_TOKEN), so nothing runs on them` };
    const on = onlineFor(runners, c.labels);
    if (on.length) return { id: c.id, run: true, why: `${c.id}: runs on ${on.join(" or ")} (${want})` };
    return daily
      ? { id: c.id, run: false, why: `${c.id}: no runner wearing ${want} is online; skipped today` }
      : { id: c.id, run: false, why: `${c.id}: no runner wearing ${want} is online; the daily run checks it` };
  });
}

/** the checks as the workflow names them (pure): `linux` on the second Linux machine (its name, default legion), and
 *  `windows` on any of our runners on Windows */
export const checksOf = (second = ""): Check[] => [
  { id: "linux", labels: ["self-hosted", "sol", "linux", second.trim() || "legion"] },
  { id: "windows", labels: ["self-hosted", "sol", "windows"] },
];

async function listRunners(repo: string, token: string): Promise<Runner[] | null> {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runners?per_page=100`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    });
    if (!r.ok) { console.log(`runners: GitHub said ${r.status} to the runners list`); return null; }
    const j = await r.json() as { runners?: Runner[] };
    return Array.isArray(j.runners) ? j.runners : null;
  } catch (e) { console.log(`runners: GitHub could not be asked: ${e instanceof Error ? e.message : String(e)}`); return null; }
}

// node sol/engine/src/team/runners.ts, with EVENT, REPO, SECOND (the Linux machine's name), GH_TOKEN and, in a run,
// GITHUB_OUTPUT (one `<id>=true|false` line each) in its env. Never fails the run: a check that cannot run is said.
const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const env = process.env;
  const runners = await listRunners(String(env.REPO ?? ""), String(env.GH_TOKEN ?? ""));
  const out = plan(String(env.EVENT ?? "push"), runners, checksOf(env.SECOND));
  for (const p of out) {
    console.log(p.why);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${p.id}=${p.run}\n`);
  }
}
