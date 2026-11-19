// Releases (#1299, team/releases.ts): each release, who ran it, what joined and its knots, who is behind, and the
// decisions relayed on the issues. Read-only.
//   GET /team/releases[?refresh=1]          → { at, me, releases, decisions, error? }
//   team.releases { rid, refresh? }         → the same type and rid, with the read
// Read on the first ask, never at start; kept in releases.json beside Work's state, read again behind an answer older
// than five minutes (team/releases.ts releasesRead). A pause or a comment wake marks it stale (releasesStale).
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parts } from "../parts.js";
import { keepReleasesIn, releasesRead, type ReleasesDeps } from "../team/releases.js";
import { peopleOf, runsNow } from "../team/runs.js";
import { rhythmOf, backupsOf } from "../team/tonight.js";
import { runGh } from "../team/record.js";
import { remoteOf } from "../team/letin.js";
import { hubLogin } from "../team/relay.js";
import { STATE_DIR } from "../work/state.js";

// the repository: four up from src/parts/ under tsx, dist/parts/ when built
const TOP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const deps = (): ReleasesDeps => ({
  dir: TOP,
  gh: (args) => runGh(args),
  repo: () => remoteOf(TOP),
  people: () => peopleOf(TOP),
  words: () => runsNow(),
  me: () => hubLogin(),
  night: async (repo) => {
    const r = await rhythmOf({ gh: (a) => runGh(a), now: () => new Date() }, repo).catch(() => null);
    return r ? { handIn: r.handIn, review: r.review, until: r.until, release: r.release, zone: r.zone, dev: r.dev, beta: r.beta, devBackup: backupsOf(r, "dev"), betaBackup: backupsOf(r, "beta"), handover: r.handover } : null;
  },
});
const said = (err: unknown) => (err instanceof Error ? err.message.split("\n")[0] : String(err));
const read = (fresh: boolean) => releasesRead(deps(), fresh).catch((err) => ({ error: said(err) }));

export default function (p: Parts) {
  p.atStart(() => keepReleasesIn(join(STATE_DIR, "releases.json")));
  p.on("team.releases", async (m, h) => { h.send(h.ws, { type: "team.releases", rid: m.rid, ...(await read(m.refresh === true)) }); });
  p.route("GET", "/team/releases", async ({ res, req }) => {
    const r = await read(/[?&]refresh=1\b/.test(req.url ?? ""));
    res.writeHead("releases" in r ? 200 : 502, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
  });
}
